/**
 * Live classes: the contract shared by the SPA, the Pages API (functions/) and
 * the room Worker (live-worker/). Pure TypeScript + Web Crypto only, so it runs
 * in the browser, in Pages Functions and in Workers.
 *
 * ARCHITECTURE
 *  - One Durable Object ("LiveRoom", in the createva-live Worker) per class
 *    session: WebSocket hub for chat / polls / presence / screen-share
 *    signalling, plus file storage (SQLite). Room id = class_sessions.id.
 *  - Audio/video travels through Cloudflare Realtime SFU. The SFU secret never
 *    reaches the browser: the SPA calls the Pages API's /api/live/sfu/* proxy.
 *  - Auth = signed tickets (HMAC-SHA256, secret LIVE_SECRET shared by Pages and
 *    the Worker). The Pages API mints them: students get one for a paid booking
 *    code, the admin cookie gets a host ticket.
 *  - Students can talk ONLY to the host. The room never relays student chat to
 *    other students and never reveals other students' names/messages to them.
 */

// ───────────────────────── tickets ─────────────────────────

export type LiveRole = "host" | "student";

export type TicketClaims = {
  /** class_sessions.id */
  room: string;
  role: LiveRole;
  /** Stable participant id: registrations.id for students, "host" for the host. */
  pid: string;
  /** Display name. */
  name: string;
  /** Expiry, unix seconds. */
  exp: number;
  /** Set only on a short-lived "share grant" the room gives a student after they accept a screen-share request: allows publishing to the SFU. */
  share?: boolean;
};

export const TICKET_TTL_SECONDS = 6 * 3600;
export const SHARE_GRANT_TTL_SECONDS = 15 * 60;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** `<base64url(json claims)>.<base64url(hmac)>` */
export async function signTicket(claims: TicketClaims, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** Returns the claims, or null when the signature is wrong, the format is bad or the ticket has expired. */
export async function verifyTicket(token: string | null | undefined, secret: string): Promise<TicketClaims | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64urlToBytes(token.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as TicketClaims;
    if (!claims || typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    if (claims.role !== "host" && claims.role !== "student") return null;
    if (!claims.room || !claims.pid) return null;
    return claims;
  } catch {
    return null;
  }
}

// ───────────────────────── limits ─────────────────────────

export const LIVE_LIMITS = {
  chatMaxChars: 1000,
  pollQuestionMaxChars: 200,
  pollOptionMaxChars: 80,
  pollMinOptions: 2,
  pollMaxOptions: 8,
  /** Max upload (image or file) in bytes. */
  fileMaxBytes: 8 * 1024 * 1024,
  /** Chat messages replayed to someone who (re)joins. */
  historyMessages: 200,
  /** Hard cap on simultaneous student sockets per room. */
  maxStudents: 300,
  /** Rooms are wiped this long after the class ends (DO alarm). */
  roomRetentionDays: 7,
} as const;

/** The student join window around the scheduled time (enforced by the Pages API when minting tickets). */
export const JOIN_OPENS_MIN_BEFORE = 30;
export const JOIN_CLOSES_MIN_AFTER_END = 180;

// ───────────────────────── room data ─────────────────────────

export type ChatMessage = {
  id: string;
  /** ms since epoch */
  at: number;
  /** "host" or a student pid. */
  from: string;
  fromName: string;
  /** null = host broadcast to everyone; otherwise the student pid it is addressed to (host→student) or sent by (student→host). */
  to: string | null;
  text: string;
};

export type PollResults = { counts: number[]; total: number };

export type Poll = {
  id: string;
  question: string;
  options: string[];
  open: boolean;
  /** When true, students see the live tallies; when false they only see results once the poll is closed. Hosts always see them. */
  showResults: boolean;
  createdAt: number;
  /** Present for hosts always; for students only when showResults or the poll is closed. */
  results?: PollResults;
  /** Student only: the option index they chose, if any. */
  myVote?: number | null;
};

export type SharedFile = {
  id: string;
  at: number;
  name: string;
  mime: string;
  size: number;
  /** Rendered inline as an image by the SPA. */
  isImage: boolean;
};

/** What the SFU publisher is currently sending: enough for others to pull it. */
export type MediaPublication = {
  /** Cloudflare SFU session id of the publisher. */
  sessionId: string;
  tracks: { name: string; kind: "video" | "audio"; label: "screen" | "screen-audio" | "mic" }[];
};

export type Participant = { pid: string; name: string; online: boolean };

/** Everything a freshly connected socket needs. Students receive a reduced copy (no participants list, no other students' data). */
export type RoomSnapshot = {
  /** Host pressed "Start class" and has not ended it. */
  live: boolean;
  ended: boolean;
  /** Host's current publication, or null. */
  presenter: MediaPublication | null;
  /** Student screen being shared with the host (host only). */
  studentShare: { pid: string; name: string; media: MediaPublication } | null;
  polls: Poll[];
  files: SharedFile[];
  /** Host: all messages. Student: host broadcasts + their own thread with the host. */
  history: ChatMessage[];
  /** Host only. */
  participants?: Participant[];
  /** Everyone: number of students connected. */
  studentCount: number;
  you: { pid: string; name: string; role: LiveRole };
};

// ───────────────────────── WebSocket protocol ─────────────────────────
// Connect: GET <wsUrl>?t=<ticket>  (upgrade). One JSON object per message.

/** Client → server. */
export type ClientMsg =
  | { t: "chat"; text: string; /** host only: omit to broadcast */ to?: string }
  | { t: "class"; action: "start" | "end" } // host
  | { t: "poll:create"; question: string; options: string[]; showResults: boolean } // host
  | { t: "poll:close"; pollId: string } // host
  | { t: "poll:vote"; pollId: string; option: number } // student
  | { t: "presenter"; media: MediaPublication | null } // host: announce / withdraw the SFU tracks
  | { t: "share:request"; to: string } // host asks a student to share their screen
  | { t: "share:cancel"; to: string } // host withdraws the request / stops that student's share
  | { t: "share:respond"; accept: boolean } // student answers the pending request
  | { t: "share:publish"; media: MediaPublication | null } // student: announce / withdraw their SFU tracks (after accepting)
  | { t: "ping" };

/** Server → client. */
export type ServerMsg =
  | { t: "snapshot"; snapshot: RoomSnapshot }
  | { t: "chat"; msg: ChatMessage }
  | { t: "class"; live: boolean; ended: boolean }
  | { t: "poll"; poll: Poll } // created, voted (host/showResults), or closed
  | { t: "file"; file: SharedFile }
  | { t: "presenter"; media: MediaPublication | null }
  | { t: "presence"; participants: Participant[]; studentCount: number } // participants: host only
  | { t: "share:request"; /** short-lived signed grant (ticket with share:true), only used if the student accepts */ grant: string }
  | { t: "share:cancelled" } // to student: request withdrawn / share stopped
  | { t: "share:response"; pid: string; name: string; accept: boolean } // to host
  | { t: "share:media"; pid: string; name: string; media: MediaPublication | null } // to host
  | { t: "error"; message: string }
  | { t: "pong" };

// ───────────────────────── room Worker HTTP (files) ─────────────────────────
// All on the Worker host (LIVE_WS_URL's origin):
//   POST /room/:room/upload?name=<filename>   Authorization: Bearer <host ticket>, raw body, Content-Type = file mime
//        → 200 SharedFile (also broadcast to the room as {t:"file"})
//   GET  /room/:room/file/:fileId?t=<ticket>  any valid ticket for that room → file bytes (Content-Disposition inline for images, attachment otherwise)
// Rooms are created lazily; every response carries CORS for SITE_URL.

// ───────────────────────── Pages API (JSON, /api prefix) ─────────────────────────

export type LiveStatus = "upcoming" | "open" | "live" | "ended" | "cancelled";

export type LiveJoinInfo = {
  /** The booking this code belongs to (paid only; otherwise 404). */
  studentName: string;
  session: {
    id: string;
    title: string;
    startsAt: string;
    durationMin: number;
  };
  status: LiveStatus;
  /** ISO time the room opens for students. */
  opensAt: string;
};

/** GET /api/live/:code → LiveJoinInfo */

export type LiveTicketResponse = {
  ticket: string;
  /** wss:// URL of the room socket: `${wsUrl}?t=${ticket}` */
  wsUrl: string;
  /** https:// origin of the Worker for uploads/downloads. */
  httpBase: string;
  /** False until CF_SFU_APP_ID / CF_SFU_APP_SECRET are configured: the UI must then hide screen sharing and explain it. */
  sfuEnabled: boolean;
  role: LiveRole;
};

/** POST /api/live/:code/ticket → LiveTicketResponse   (403 outside the join window; 404 unknown/unpaid code)
 *  POST /api/admin/live/:sessionId/ticket → LiveTicketResponse   (admin cookie)
 *  POST /api/admin/live/:sessionId/start | /end → { ok: true }    (records live_started_at / live_ended_at on class_sessions) */

// Cloudflare SFU proxy. Auth: `Authorization: Bearer <ticket>` (host ticket or student share-grant for publishing; any
// valid ticket for pulling remote tracks). Bodies/responses are passed through verbatim to
// https://rtc.live.cloudflare.com/v1/apps/<APP_ID>/…  — see Cloudflare Realtime "HTTPS API".
//   POST /api/live/sfu/session                      → { sessionId }                (creates an SFU session; any valid ticket)
//   POST /api/live/sfu/:sessionId/tracks            → SFU response                 (local tracks only if role=host or ticket.share; remote always allowed)
//   PUT  /api/live/sfu/:sessionId/renegotiate       → SFU response
//   PUT  /api/live/sfu/:sessionId/close             → SFU response                 (publisher closes its tracks)
// Track naming used by the SPA: "screen", "screen-audio", "mic" (names are unique per SFU session).

// Reminder cron (called by the Worker's scheduled() every 10 minutes):
//   POST /api/internal/reminders   Authorization: Bearer <CRON_SECRET>
//   → { sent: number, more: boolean }   sends ≤100 emails per call (one Resend batch); `more` = call again.

/** GET /api/admin/live/:sessionId → AdminLiveInfo (admin cookie). */
export type AdminLiveInfo = {
  session: { id: string; title: string; startsAt: string; durationMin: number; status: string };
  liveStartedAt: string | null;
  liveEndedAt: string | null;
  /** Paid registrations for this session (so the console can show who is expected). */
  registered: number;
};
