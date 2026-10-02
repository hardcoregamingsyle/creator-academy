import crypto from "node:crypto";
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  JOIN_CLOSES_MIN_AFTER_END,
  JOIN_OPENS_MIN_BEFORE,
  TICKET_TTL_SECONDS,
  signTicket,
  verifyTicket,
  type AdminLiveInfo,
  type LiveJoinInfo,
  type LiveStatus,
  type LiveTicketResponse,
  type TicketClaims,
} from "../../shared/live";
import { execute, nowIso, queryOne } from "../_lib/db";
import { listDueReminders, markRemindersSent } from "../_lib/data/registrations";
import { getWorkshop } from "../_lib/data/workshops";
import { sendEmailBatch } from "../_lib/email";
import { liveReminderEmail } from "../_lib/email-templates";
import { clientKey, hitRateLimit, TOO_MANY_REQUESTS_MESSAGE } from "../_lib/rate-limit";
import type { AppEnv } from "./types";
import { fail, notFound } from "./util";

/**
 * Live classes, Pages API half (see shared/live.ts for the contract): join info, tickets for the room Worker,
 * the Cloudflare Realtime SFU proxy, the host's start/end, and the 24h reminder cron. Everything under /admin
 * is already behind the admin guard in app.ts; /internal/* is called by the room Worker's cron with CRON_SECRET.
 */
export const routes = new Hono<AppEnv>();

const SFU_BASE = "https://rtc.live.cloudflare.com/v1/apps";
const SFU_SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;
const SFU_NOT_SET_UP = "Screen sharing is not set up yet.";
const LIVE_NOT_SET_UP = "Live classes are not set up yet.";
/** Students on one network (a college lab) share an IP, so this is modest but not tight. */
const TICKET_LIMIT = { scope: "live-ticket", max: 60, windowSeconds: 60 };
/** One Resend batch call per request. */
const REMINDER_BATCH = 100;

// ───────────────────────── helpers ─────────────────────────

/** Shared with the room Worker (its LIVE_SECRET). SESSION_SECRET only as a convenience fallback. */
function liveSecret(): string | null {
  return process.env.LIVE_SECRET || process.env.SESSION_SECRET || null;
}

/**
 * LIVE_WS_URL is the Worker's room socket base, e.g. "wss://createva-live.example.workers.dev/room" (a bare origin
 * works too). Gives the per-room socket URL and the Worker's https origin (uploads/downloads).
 */
function liveEndpoints(room: string): { wsUrl: string; httpBase: string } | null {
  const raw = process.env.LIVE_WS_URL?.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!["ws:", "wss:", "http:", "https:"].includes(u.protocol)) return null;
  const secure = u.protocol === "wss:" || u.protocol === "https:";
  const path = u.pathname.replace(/\/+$/, "");
  const base = path.endsWith("/room") ? path : `${path}/room`;
  return { wsUrl: `${secure ? "wss" : "ws"}://${u.host}${base}/${room}`, httpBase: `${secure ? "https" : "http"}://${u.host}` };
}

function sfuConfig(): { appId: string; secret: string } | null {
  const appId = process.env.CF_SFU_APP_ID;
  const secret = process.env.CF_SFU_APP_SECRET;
  return appId && secret ? { appId, secret } : null;
}

function bearer(header: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
}

/** Constant-time string compare (hashing first makes the lengths equal). */
function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

type TimedSession = {
  startsAt: string;
  durationMin: number;
  /** class_sessions.status */
  status: string;
  liveStartedAt: string | null;
  liveEndedAt: string | null;
};

function opensAtMs(startsAt: string): number {
  return new Date(startsAt).getTime() - JOIN_OPENS_MIN_BEFORE * 60_000;
}

/** upcoming -> open (30 min before) -> live (host pressed Start) -> ended (host pressed End, or the join window closed). */
function liveStatus(s: TimedSession, now = Date.now()): LiveStatus {
  if (s.status === "cancelled") return "cancelled";
  const closesAt = new Date(s.startsAt).getTime() + (s.durationMin + JOIN_CLOSES_MIN_AFTER_END) * 60_000;
  if (s.liveEndedAt || s.status === "completed" || now > closesAt) return "ended";
  if (s.liveStartedAt) return "live";
  return now >= opensAtMs(s.startsAt) ? "open" : "upcoming";
}

const NOT_JOINABLE: Record<Exclude<LiveStatus, "open" | "live">, string> = {
  upcoming: `The class room opens ${JOIN_OPENS_MIN_BEFORE} minutes before the start.`,
  ended: "This class has ended.",
  cancelled: "This class was cancelled.",
};

type StudentRow = {
  reg_id: string;
  name: string;
  session_id: string;
  workshop_slug: string;
  starts_at: string;
  duration_min: number;
  s_status: string;
  live_started_at: string | null;
  live_ended_at: string | null;
};

/** The paid booking behind a booking code, with its session's timing: ONE query. Null for unknown or unpaid codes. */
async function loadStudentRow(codeRaw: string): Promise<StudentRow | null> {
  const code = codeRaw.trim().toUpperCase();
  if (!code || code.length > 40) return null;
  return queryOne<StudentRow>(
    `SELECT r.id AS reg_id, r.name, s.id AS session_id, s.workshop_slug, s.starts_at, s.duration_min,
            s.status AS s_status, s.live_started_at, s.live_ended_at
     FROM registrations r JOIN class_sessions s ON s.id = r.session_id
     WHERE r.code = ? AND r.status = 'paid'`,
    [code],
  );
}

function timing(row: StudentRow): TimedSession {
  return {
    startsAt: row.starts_at,
    durationMin: Number(row.duration_min),
    status: row.s_status,
    liveStartedAt: row.live_started_at,
    liveEndedAt: row.live_ended_at,
  };
}

async function mintTicket(
  c: Context<AppEnv>,
  claims: Omit<TicketClaims, "exp">,
): Promise<Response> {
  const secret = liveSecret();
  const endpoints = liveEndpoints(claims.room);
  if (!secret || !endpoints) return c.json(fail(LIVE_NOT_SET_UP), 503);
  const ticket = await signTicket({ ...claims, exp: Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS }, secret);
  const body: LiveTicketResponse = {
    ticket,
    wsUrl: endpoints.wsUrl,
    httpBase: endpoints.httpBase,
    sfuEnabled: sfuConfig() !== null,
    role: claims.role,
  };
  return c.json(body);
}

// ───────────────────────── students ─────────────────────────

routes.get("/live/:code", async (c) => {
  const row = await loadStudentRow(c.req.param("code"));
  if (!row) return notFound(c);
  const workshop = await getWorkshop(row.workshop_slug);
  const info: LiveJoinInfo = {
    studentName: row.name,
    session: {
      id: row.session_id,
      title: workshop?.title ?? "Live class",
      startsAt: row.starts_at,
      durationMin: Number(row.duration_min),
    },
    status: liveStatus(timing(row)),
    opensAt: new Date(opensAtMs(row.starts_at)).toISOString(),
  };
  return c.json(info);
});

routes.post("/live/:code/ticket", async (c) => {
  const hit = await hitRateLimit(TICKET_LIMIT.scope, clientKey(c), TICKET_LIMIT.max, TICKET_LIMIT.windowSeconds);
  if (!hit.allowed) return c.json(fail(TOO_MANY_REQUESTS_MESSAGE), 429);

  const row = await loadStudentRow(c.req.param("code"));
  if (!row) return notFound(c);
  const status = liveStatus(timing(row));
  if (status !== "open" && status !== "live") return c.json(fail(NOT_JOINABLE[status]), 403);

  return mintTicket(c, { room: row.session_id, role: "student", pid: row.reg_id, name: row.name });
});

// ───────────────────────── host (admin) ─────────────────────────

routes.post("/admin/live/:sessionId/ticket", async (c) => {
  const id = c.req.param("sessionId");
  const exists = await queryOne<{ id: string }>(`SELECT id FROM class_sessions WHERE id = ?`, [id]);
  if (!exists) return notFound(c);
  return mintTicket(c, { room: id, role: "host", pid: "host", name: "Host" });
});

routes.get("/admin/live/:sessionId", async (c) => {
  const row = await queryOne<{
    id: string;
    workshop_slug: string;
    starts_at: string;
    duration_min: number;
    status: string;
    live_started_at: string | null;
    live_ended_at: string | null;
    registered: number;
  }>(
    `SELECT s.id, s.workshop_slug, s.starts_at, s.duration_min, s.status, s.live_started_at, s.live_ended_at,
            (SELECT COUNT(*) FROM registrations r WHERE r.session_id = s.id AND r.status = 'paid') AS registered
     FROM class_sessions s WHERE s.id = ?`,
    [c.req.param("sessionId")],
  );
  if (!row) return notFound(c);
  const workshop = await getWorkshop(row.workshop_slug);
  const info: AdminLiveInfo = {
    session: {
      id: row.id,
      title: workshop?.title ?? row.workshop_slug,
      startsAt: row.starts_at,
      durationMin: Number(row.duration_min),
      status: row.status,
    },
    liveStartedAt: row.live_started_at,
    liveEndedAt: row.live_ended_at,
    registered: Number(row.registered),
  };
  return c.json(info);
});

routes.post("/admin/live/:sessionId/start", async (c) => {
  // A fresh start (first time, or after an End) stamps a new start time; pressing Start again while live changes nothing.
  const changed = await execute(
    `UPDATE class_sessions
     SET live_started_at = CASE WHEN live_started_at IS NULL OR live_ended_at IS NOT NULL THEN ? ELSE live_started_at END,
         live_ended_at = NULL
     WHERE id = ?`,
    [nowIso(), c.req.param("sessionId")],
  );
  return changed ? c.json({ ok: true }) : notFound(c);
});

routes.post("/admin/live/:sessionId/end", async (c) => {
  const changed = await execute(`UPDATE class_sessions SET live_ended_at = ? WHERE id = ?`, [nowIso(), c.req.param("sessionId")]);
  return changed ? c.json({ ok: true }) : notFound(c);
});

// ───────────────────────── Cloudflare Realtime SFU proxy ─────────────────────────
// The SFU app secret stays here. Auth is the room ticket; only the host (or a student holding a share grant) may
// publish. Not covered by the per-IP booking limits (a class of students sits behind one NAT).

type SfuAuth = { claims: TicketClaims; appId: string; secret: string; canPublish: boolean };

async function authorizeSfu(c: Context<AppEnv>): Promise<SfuAuth | Response> {
  const secret = liveSecret();
  if (!secret) return c.json(fail(LIVE_NOT_SET_UP), 503);
  const claims = await verifyTicket(bearer(c.req.header("authorization")), secret);
  if (!claims) return c.json(fail("Your class ticket is missing or has expired. Please reload the page."), 401);
  const sfu = sfuConfig();
  if (!sfu) return c.json(fail(SFU_NOT_SET_UP), 503);
  return { claims, ...sfu, canPublish: claims.role === "host" || claims.share === true };
}

async function forwardSfu(c: Context<AppEnv>, sfu: SfuAuth, method: "POST" | "PUT", path: string, body?: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${SFU_BASE}/${encodeURIComponent(sfu.appId)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${sfu.secret}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error("[live] sfu request failed:", err);
    return c.json(fail("The video service is not reachable right now."), 502);
  }
  if (res.status === 204 || res.status === 205 || res.status === 304) return c.body(null, res.status as 204);
  return c.body(await res.text(), res.status as ContentfulStatusCode, {
    "Content-Type": res.headers.get("content-type") ?? "application/json",
  });
}

/** The :sessionId path segment is spliced into an upstream URL, so it must be a plain SFU session id. */
function sfuSessionParam(c: Context<AppEnv>): string | null {
  const id = c.req.param("sessionId") ?? "";
  return SFU_SESSION_ID.test(id) ? id : null;
}

routes.post("/live/sfu/session", async (c) => {
  const sfu = await authorizeSfu(c);
  if (sfu instanceof Response) return sfu;
  return forwardSfu(c, sfu, "POST", "/sessions/new");
});

routes.post("/live/sfu/:sessionId/tracks", async (c) => {
  const sfu = await authorizeSfu(c);
  if (sfu instanceof Response) return sfu;
  const id = sfuSessionParam(c);
  if (!id) return c.json(fail("Invalid session."), 400);

  const raw = await c.req.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return c.json(fail("Invalid request."), 400);
  }
  const tracks = (parsed as { tracks?: unknown } | null)?.tracks;
  if (!Array.isArray(tracks)) return c.json(fail("Invalid request."), 400);
  // Pulling someone else's tracks is open to every ticket; anything that is not clearly "remote" is publishing.
  const publishing = tracks.some((t) => (t as { location?: unknown } | null)?.location !== "remote");
  if (publishing && !sfu.canPublish) return c.json(fail("You are not allowed to share your screen or audio."), 403);
  return forwardSfu(c, sfu, "POST", `/sessions/${id}/tracks/new`, raw);
});

routes.put("/live/sfu/:sessionId/renegotiate", async (c) => {
  const sfu = await authorizeSfu(c);
  if (sfu instanceof Response) return sfu;
  const id = sfuSessionParam(c);
  if (!id) return c.json(fail("Invalid session."), 400);
  return forwardSfu(c, sfu, "PUT", `/sessions/${id}/renegotiate`, await c.req.text());
});

routes.put("/live/sfu/:sessionId/close", async (c) => {
  const sfu = await authorizeSfu(c);
  if (sfu instanceof Response) return sfu;
  // Closing tracks is a publisher's job; viewers just drop their session. Without this check any student
  // (the host's SFU session id is broadcast to them) could stop the host's screen for everyone.
  if (!sfu.canPublish) return c.json(fail("Not allowed."), 403);
  const id = sfuSessionParam(c);
  if (!id) return c.json(fail("Invalid session."), 400);
  return forwardSfu(c, sfu, "PUT", `/sessions/${id}/tracks/close`, await c.req.text());
});

// ───────────────────────── 24h reminder cron ─────────────────────────

routes.post("/internal/reminders", async (c) => {
  const expected = process.env.CRON_SECRET;
  const given = bearer(c.req.header("authorization"));
  if (!expected || !given || !safeEqual(given, expected)) return c.json(fail("Unauthorized"), 401);

  // One extra row tells us whether another call is needed.
  const due = await listDueReminders(REMINDER_BATCH + 1);
  const batch = due.slice(0, REMINDER_BATCH);
  if (!batch.length) return c.json({ sent: 0, more: false });

  const results = await sendEmailBatch(batch.map(liveReminderEmail));
  // Only what actually went out is marked: a failed batch stays unmarked and the next run retries it.
  const sentIds = batch.filter((_, i) => results[i]).map((r) => r.id);
  await markRemindersSent(sentIds);
  return c.json({ sent: sentIds.length, more: due.length > REMINDER_BATCH && sentIds.length > 0 });
});
