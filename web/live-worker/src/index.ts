import { LIVE_LIMITS, verifyTicket, type TicketClaims } from "../../shared/live";
import type { LiveRoom } from "./room";

export { LiveRoom } from "./room";

/**
 * createva-live: front door of the live-class rooms.
 *   GET  /health
 *   GET  /room/:room?t=<ticket>                 WebSocket upgrade  -> Durable Object (one per class session)
 *   POST /room/:room/upload?name=<file>         Bearer <host ticket>, raw body
 *   GET  /room/:room/file/:id?t=<ticket>        file download
 *   cron (scheduled): asks the Pages API to send the 24h reminders.
 * Tickets are minted by the Pages API and checked here with the shared LIVE_SECRET, so a junk or wrong-room
 * request never wakes a Durable Object. The room re-checks the ticket itself (it never trusts the caller).
 */
export interface Env {
  LIVE_ROOM: DurableObjectNamespace<LiveRoom>;
  /** Secret: signs/verifies tickets (same value as on the Pages project). */
  LIVE_SECRET: string;
  /** Secret: Bearer token for POST <SITE_URL>/api/internal/reminders. */
  CRON_SECRET: string;
  /** Public site origin (CORS + cron target). */
  SITE_URL: string;
}

const ROUTE = /^\/room\/([A-Za-z0-9_-]{1,64})(?:\/(upload)|\/file\/([A-Za-z0-9_-]{1,64}))?$/;
const REMINDER_MAX_ROUNDS = 5;

function allowedOrigins(env: Env): Set<string> {
  const origins = new Set<string>(["http://localhost:5173"]);
  try {
    const u = new URL(env.SITE_URL);
    origins.add(u.origin);
    origins.add(`${u.protocol}//${u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`}${u.port ? `:${u.port}` : ""}`);
  } catch {
    // SITE_URL unset or malformed: only localhost is allowed.
  }
  return origins;
}

function corsFor(request: Request, env: Env): Headers {
  const h = new Headers({ Vary: "Origin" });
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins(env).has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

function withCors(res: Response, cors: Headers): Response {
  if (res.status === 101) return res; // the WebSocket handshake response must be returned untouched
  const out = new Response(res.body, res);
  cors.forEach((value, key) => out.headers.set(key, value));
  return out;
}

function json(data: unknown, status: number, cors: Headers): Response {
  return withCors(Response.json(data, { status, headers: { "Cache-Control": "no-store" } }), cors);
}

function bearer(request: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "");
  return m ? m[1] : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsFor(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true }, 200, cors);

    const m = ROUTE.exec(url.pathname);
    if (!m) return json({ ok: false, message: "Not found" }, 404, cors);
    const room = m[1];
    const isUpload = m[2] === "upload";
    const isFile = m[3] !== undefined;

    if (isUpload) {
      if (request.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405, cors);
    } else if (request.method !== "GET") {
      return json({ ok: false, message: "Method not allowed" }, 405, cors);
    }

    let claims: TicketClaims | null;
    if (isUpload) {
      claims = await verifyTicket(bearer(request), env.LIVE_SECRET);
    } else {
      if (!isFile && request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return json({ ok: false, message: "Expected a WebSocket connection." }, 426, cors);
      }
      claims = await verifyTicket(url.searchParams.get("t"), env.LIVE_SECRET);
    }
    if (!claims || claims.room !== room) return json({ ok: false, message: "Your class ticket is missing or has expired." }, 401, cors);

    if (isUpload) {
      if (claims.role !== "host") return json({ ok: false, message: "Only the host can upload files." }, 403, cors);
      const declared = Number(request.headers.get("Content-Length"));
      if (Number.isFinite(declared) && declared > LIVE_LIMITS.fileMaxBytes) {
        return json({ ok: false, message: `Files can be at most ${LIVE_LIMITS.fileMaxBytes / (1024 * 1024)} MB.` }, 413, cors);
      }
    }

    const stub = env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName(room));
    return withCors(await stub.fetch(request), cors);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runReminders(env));
  },
} satisfies ExportedHandler<Env>;

/** Calls the Pages API until it says there is nothing more to send (max a few rounds of up to 100 emails). */
async function runReminders(env: Env): Promise<void> {
  if (!env.CRON_SECRET || !env.SITE_URL) {
    console.error("[cron] CRON_SECRET or SITE_URL is not set; skipping reminders");
    return;
  }
  for (let round = 1; round <= REMINDER_MAX_ROUNDS; round++) {
    try {
      const res = await fetch(`${env.SITE_URL.replace(/\/$/, "")}/api/internal/reminders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      if (!res.ok) {
        console.error(`[cron] reminders returned ${res.status}`);
        return;
      }
      const body = (await res.json()) as { sent?: number; more?: boolean };
      if (body.sent) console.log(`[cron] reminders: sent ${body.sent}`);
      if (body.more !== true) return;
    } catch (err) {
      console.error("[cron] reminders request failed:", err);
      return;
    }
  }
}
