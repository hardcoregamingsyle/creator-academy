import { DurableObject } from "cloudflare:workers";
import {
  LIVE_LIMITS,
  SHARE_GRANT_TTL_SECONDS,
  signTicket,
  verifyTicket,
  type ChatMessage,
  type MediaPublication,
  type Participant,
  type Poll,
  type RoomSnapshot,
  type RtcCandidate,
  type RtcStream,
  type ServerMsg,
  type SharedFile,
  type TicketClaims,
} from "../../shared/live";
import type { Env } from "./index";

/**
 * One LiveRoom per class session (Durable Object, SQLite storage, hibernating WebSockets).
 * Implements the protocol in shared/live.ts. Identity ALWAYS comes from the ticket stored as the socket's
 * attachment; nothing the client sends (pid / name / role) is trusted. Students can talk only to the host:
 * a student's chat goes to the host and to that student's own sockets, never to other students.
 */

const CHUNK_BYTES = 1_500_000; // SQLite rows/blobs are capped at 2 MB
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 20; // messages per socket per window
const MAX_MESSAGE_CHARS = 32_768;
/** WebRTC signalling (SDP/ICE) is bursty and has its own, larger bucket and size cap. */
const RTC_MAX_CHARS = 16_384;
const RTC_RATE_MAX = 600; // per socket per window: a host answering 30 viewers sends ~30 offers + ~8 candidates each
const STORED_MESSAGES_MAX = 5_000;
const DAY_MS = 86_400_000;
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

type PollRow = { id: string; question: string; options: string; is_open: number; show_results: number; created_at: number };
type MsgRow = { id: string; at: number; from_pid: string; from_name: string; to_pid: string | null; text: string };
type FileRow = { id: string; at: number; name: string; mime: string; size: number; is_image: number };

type PollData = {
  id: string;
  question: string;
  options: string[];
  open: boolean;
  showResults: boolean;
  createdAt: number;
  counts: number[];
  total: number;
  votes: Map<string, number>;
};

/** `accepted`: the student pressed Accept (only then may they send their screen's signalling). */
type ShareState = { pid: string; name: string; accepted?: boolean };
type StudentShare = { pid: string; name: string; media: MediaPublication };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS messages (
     seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, at INTEGER NOT NULL,
     from_pid TEXT NOT NULL, from_name TEXT NOT NULL, to_pid TEXT, text TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS polls (
     id TEXT PRIMARY KEY, question TEXT NOT NULL, options TEXT NOT NULL,
     is_open INTEGER NOT NULL, show_results INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS votes (
     poll_id TEXT NOT NULL, pid TEXT NOT NULL, choice INTEGER NOT NULL, PRIMARY KEY (poll_id, pid))`,
  `CREATE TABLE IF NOT EXISTS files (
     id TEXT PRIMARY KEY, at INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL,
     size INTEGER NOT NULL, is_image INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS file_chunks (
     file_id TEXT NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (file_id, idx))`,
  `CREATE TABLE IF NOT EXISTS participants (
     pid TEXT PRIMARY KEY, name TEXT NOT NULL, last_seen INTEGER NOT NULL)`,
];

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function bearer(request: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "");
  return m ? m[1] : null;
}

/** "image/png; charset=x" -> "image/png"; anything odd -> application/octet-stream. */
function cleanMime(raw: string | null): string {
  const mime = (raw ?? "").split(";")[0].trim().toLowerCase();
  return mime.length <= 100 && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mime) ? mime : "application/octet-stream";
}

/** A safe display / download file name: no paths, no control or reserved characters, at most 120 characters. */
function cleanName(raw: string | null): string {
  let name = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (name.length > 120) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : "";
    name = name.slice(0, 120 - ext.length) + ext;
  }
  return name || "file";
}

/** Validates a client-supplied media announcement (what is being shared peer-to-peer). `undefined` = malformed, `null` = "nothing published". */
function cleanMedia(raw: unknown): MediaPublication | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const { sessionId, tracks } = raw as { sessionId?: unknown; tracks?: unknown };
  if (typeof sessionId !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(sessionId)) return undefined;
  if (!Array.isArray(tracks) || tracks.length > 6) return undefined;
  const out: MediaPublication["tracks"] = [];
  for (const t of tracks) {
    const { name, kind, label } = (t ?? {}) as { name?: unknown; kind?: unknown; label?: unknown };
    if (typeof name !== "string" || name.length < 1 || name.length > 64) return undefined;
    if (kind !== "video" && kind !== "audio") return undefined;
    if (label !== "screen" && label !== "screen-audio" && label !== "mic") return undefined;
    out.push({ name, kind, label });
  }
  return { sessionId, tracks: out };
}

export class LiveRoom extends DurableObject<Env> {
  private sql: SqlStorage;
  private rates = new WeakMap<WebSocket, { start: number; count: number; warned: boolean }>();
  private rtcRates = new WeakMap<WebSocket, { start: number; count: number; warned: boolean }>();
  private lastAlarmAt = 0;
  private insertedSincePrune = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.initSchema();
    // Heartbeats are answered without waking a hibernated room (the SPA sends exactly this string).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  private initSchema(): void {
    for (const statement of SCHEMA) this.sql.exec(statement);
  }

  // ───────────────────────── HTTP entry (from the Worker) ─────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const m = /^\/room\/([A-Za-z0-9_-]{1,64})(?:\/(upload)|\/file\/([A-Za-z0-9_-]{1,64}))?$/.exec(url.pathname);
    if (!m) return json({ ok: false, message: "Not found" }, 404);
    if (m[2]) return this.handleUpload(request, url, m[1]);
    if (m[3]) return this.handleDownload(request, url, m[1], m[3]);
    return this.handleConnect(request, url, m[1]);
  }

  private async handleConnect(request: Request, url: URL, room: string): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ ok: false, message: "Expected a WebSocket connection." }, 426);
    const verified = await verifyTicket(url.searchParams.get("t"), this.env.LIVE_SECRET);
    if (!verified || verified.room !== room) return json({ ok: false, message: "Your class ticket is missing or has expired." }, 401);

    // What the socket keeps for its whole life: only identity, never anything the client supplies afterwards.
    const claims: TicketClaims = {
      room,
      role: verified.role,
      pid: verified.pid,
      name: verified.name.trim().slice(0, 80) || (verified.role === "host" ? "Host" : "Student"),
      exp: verified.exp,
    };

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    if (claims.role === "student") {
      const online = this.onlineStudentPids();
      if (online.size >= LIVE_LIMITS.maxStudents && !online.has(claims.pid)) {
        server.accept();
        this.send(server, { t: "error", message: "This class room is full." });
        server.close(1013, "room full");
        return new Response(null, { status: 101, webSocket: client });
      }
    }

    this.ctx.acceptWebSocket(server, claims.role === claims.pid ? [claims.role] : [claims.role, claims.pid]);
    server.serializeAttachment(claims);

    if (claims.role === "student") {
      this.sql.exec(
        `INSERT INTO participants (pid, name, last_seen) VALUES (?, ?, ?)
         ON CONFLICT(pid) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`,
        claims.pid,
        claims.name,
        Date.now(),
      );
    }
    await this.touch();
    this.send(server, { t: "snapshot", snapshot: this.buildSnapshot(claims) });
    if (claims.role === "student") this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  // ───────────────────────── files ─────────────────────────

  private async handleUpload(request: Request, url: URL, room: string): Promise<Response> {
    if (request.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
    const claims = await verifyTicket(bearer(request), this.env.LIVE_SECRET);
    if (!claims || claims.room !== room) return json({ ok: false, message: "Your class ticket is missing or has expired." }, 401);
    if (claims.role !== "host") return json({ ok: false, message: "Only the host can upload files." }, 403);

    const tooBig = () => json({ ok: false, message: `Files can be at most ${LIVE_LIMITS.fileMaxBytes / (1024 * 1024)} MB.` }, 413);
    const declared = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(declared) && declared > LIVE_LIMITS.fileMaxBytes) return tooBig();

    // Count the bytes as they arrive: Content-Length can be absent or wrong.
    const reader = request.body?.getReader();
    if (!reader) return json({ ok: false, message: "The file is empty." }, 400);
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIVE_LIMITS.fileMaxBytes) {
        await reader.cancel().catch(() => {});
        return tooBig();
      }
      parts.push(value);
    }
    if (size === 0) return json({ ok: false, message: "The file is empty." }, 400);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.byteLength;
    }

    const file: SharedFile = {
      id: crypto.randomUUID(),
      at: Date.now(),
      name: cleanName(url.searchParams.get("name")),
      mime: cleanMime(request.headers.get("Content-Type")),
      size,
      isImage: false,
    };
    file.isImage = IMAGE_MIMES.has(file.mime);

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`INSERT INTO files (id, at, name, mime, size, is_image) VALUES (?, ?, ?, ?, ?, ?)`, file.id, file.at, file.name, file.mime, size, file.isImage ? 1 : 0);
      for (let i = 0, idx = 0; i < size; i += CHUNK_BYTES, idx++) {
        this.sql.exec(`INSERT INTO file_chunks (file_id, idx, data) VALUES (?, ?, ?)`, file.id, idx, bytes.slice(i, i + CHUNK_BYTES).buffer);
      }
    });
    await this.touch();
    this.broadcast(this.openSockets(), { t: "file", file });
    return json(file);
  }

  private async handleDownload(request: Request, url: URL, room: string, fileId: string): Promise<Response> {
    if (request.method !== "GET") return json({ ok: false, message: "Method not allowed" }, 405);
    const claims = await verifyTicket(url.searchParams.get("t"), this.env.LIVE_SECRET);
    if (!claims || claims.room !== room) return json({ ok: false, message: "Your class ticket is missing or has expired." }, 401);

    const file = this.sql.exec<FileRow>(`SELECT id, at, name, mime, size, is_image FROM files WHERE id = ?`, fileId).toArray()[0];
    if (!file) return json({ ok: false, message: "File not found." }, 404);

    const body = new Uint8Array(Number(file.size));
    let offset = 0;
    for (const chunk of this.sql.exec<{ data: ArrayBuffer }>(`SELECT data FROM file_chunks WHERE file_id = ? ORDER BY idx`, fileId)) {
      const part = new Uint8Array(chunk.data);
      body.set(part, offset);
      offset += part.byteLength;
    }

    const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
    return new Response(body, {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(body.byteLength),
        // Only real images render inline; everything else is a download. Nothing here may run as a page.
        "Content-Disposition": `${file.is_image ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // ───────────────────────── WebSocket events (hibernation API) ─────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > MAX_MESSAGE_CHARS) return;
    const claims = ws.deserializeAttachment() as TicketClaims | null;
    if (!claims) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      this.allowMessage(ws); // malformed JSON is ignored, but still counts against the flood limit
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.allowMessage(ws);
      return;
    }
    if ((parsed as { t?: unknown }).t === "rtc") {
      if (message.length > RTC_MAX_CHARS || !this.allowRtc(ws)) return;
    } else if (!this.allowMessage(ws)) {
      return;
    }

    try {
      await this.dispatch(ws, claims, parsed as Record<string, unknown>);
    } catch (err) {
      console.error("[room] message failed:", err);
      this.send(ws, { t: "error", message: "Something went wrong. Please try again." });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 || code === 1015 ? 1000 : code, reason);
    } catch {
      // already closed
    }
    await this.onDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.onDisconnect(ws);
  }

  private async onDisconnect(ws: WebSocket): Promise<void> {
    const claims = ws.deserializeAttachment() as TicketClaims | null;
    if (!claims || claims.role !== "student") return;
    this.sql.exec(`UPDATE participants SET last_seen = ? WHERE pid = ?`, Date.now(), claims.pid);

    // A student's screen share dies with their last open tab: stop showing it to the host.
    if (this.openSockets(claims.pid, ws).length === 0) {
      this.dropScreenViewer(claims.pid);
      const pending = this.getJson<ShareState>("shareReq");
      const active = this.getJson<StudentShare>("studentShare");
      if (pending?.pid === claims.pid || active?.pid === claims.pid) {
        this.setMeta("shareReq", null);
        this.setMeta("studentShare", null);
        this.broadcast(this.openSockets("host"), { t: "share:media", pid: claims.pid, name: claims.name, media: null });
      }
    }
    this.broadcastPresence(ws);
  }

  /** Wipes the room a few days after the class ended (or after its last activity). */
  async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "room closed");
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.initSchema();
  }

  // ───────────────────────── protocol ─────────────────────────

  private async dispatch(ws: WebSocket, claims: TicketClaims, m: Record<string, unknown>): Promise<void> {
    const isHost = claims.role === "host";
    const deny = () => this.send(ws, { t: "error", message: "You are not allowed to do that." });

    switch (m.t) {
      case "ping":
        this.send(ws, { t: "pong" });
        return;

      case "chat":
        return this.onChat(ws, claims, m);

      case "class": {
        if (!isHost) return deny();
        if (m.action !== "start" && m.action !== "end") return;
        await this.onClass(m.action);
        return;
      }

      case "poll:create":
        if (!isHost) return deny();
        return this.onPollCreate(ws, m);

      case "poll:close": {
        if (!isHost) return deny();
        const id = typeof m.pollId === "string" ? m.pollId : "";
        const poll = this.loadPolls(id)[0];
        if (!poll || !poll.open) return;
        this.sql.exec(`UPDATE polls SET is_open = 0 WHERE id = ?`, id);
        poll.open = false;
        this.broadcastPoll(poll, "all");
        return;
      }

      case "poll:vote": {
        if (isHost) return deny();
        const poll = this.loadPolls(typeof m.pollId === "string" ? m.pollId : "")[0];
        if (!poll) return this.send(ws, { t: "error", message: "That poll no longer exists." });
        if (!poll.open) return this.send(ws, { t: "error", message: "This poll is closed." });
        const choice = m.option;
        if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) {
          return this.send(ws, { t: "error", message: "That is not an option in this poll." });
        }
        this.sql.exec(`INSERT OR REPLACE INTO votes (poll_id, pid, choice) VALUES (?, ?, ?)`, poll.id, claims.pid, choice);
        const updated = this.loadPolls(poll.id)[0];
        // Live tallies go to everyone only when the host chose to show them; otherwise just the host and this voter.
        this.broadcastPoll(updated, poll.showResults ? "all" : claims.pid);
        return;
      }

      case "presenter": {
        if (!isHost) return deny();
        const media = cleanMedia(m.media);
        if (media === undefined) return this.send(ws, { t: "error", message: "Invalid presentation details." });
        // A withdrawn or replaced share frees every video slot (viewers send a fresh `want` for the new one).
        if (!media || media.sessionId !== this.getJson<MediaPublication>("presenter")?.sessionId) this.setMeta("wantScreen", null);
        this.setMeta("presenter", media ? JSON.stringify(media) : null);
        this.broadcast(this.openSockets(), { t: "presenter", media });
        return;
      }

      case "rtc":
        return this.onRtc(ws, claims, m);

      case "share:request":
        if (!isHost) return deny();
        return this.onShareRequest(ws, m);

      case "share:cancel":
        if (!isHost) return deny();
        return this.onShareCancel(m);

      case "share:respond": {
        if (isHost) return deny();
        const pending = this.getJson<ShareState>("shareReq");
        if (pending?.pid !== claims.pid || typeof m.accept !== "boolean") return;
        this.setMeta("shareReq", m.accept ? JSON.stringify({ ...pending, accepted: true } satisfies ShareState) : null);
        this.broadcast(this.openSockets("host"), { t: "share:response", pid: claims.pid, name: claims.name, accept: m.accept });
        return;
      }

      case "share:publish": {
        if (isHost) return deny();
        const pending = this.getJson<ShareState>("shareReq");
        const active = this.getJson<StudentShare>("studentShare");
        if (pending?.pid !== claims.pid && active?.pid !== claims.pid) {
          return this.send(ws, { t: "error", message: "The host has not asked you to share your screen." });
        }
        const media = cleanMedia(m.media);
        if (media === undefined) return this.send(ws, { t: "error", message: "Invalid screen-share details." });
        this.setMeta("shareReq", null);
        this.setMeta("studentShare", media ? JSON.stringify({ pid: claims.pid, name: claims.name, media } satisfies StudentShare) : null);
        this.broadcast(this.openSockets("host"), { t: "share:media", pid: claims.pid, name: claims.name, media });
        return;
      }

      default:
        return; // unknown message types are ignored
    }
  }

  // ───────────────────────── WebRTC signalling relay ─────────────────────────

  /** Pids of the students currently pulling the host's video (persisted so a hibernated room keeps counting). */
  private screenViewers(): string[] {
    return this.getJson<string[]>("wantScreen") ?? [];
  }

  private dropScreenViewer(pid: string): void {
    const viewers = this.screenViewers();
    if (viewers.includes(pid)) this.setMeta("wantScreen", viewers.length > 1 ? JSON.stringify(viewers.filter((v) => v !== pid)) : null);
  }

  /** Validates a candidate from the wire. `undefined` = malformed; `null` = end of candidates. */
  private cleanCandidate(raw: unknown): RtcCandidate | null | undefined {
    if (raw === null) return null;
    if (!raw || typeof raw !== "object") return undefined;
    const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = raw as Record<string, unknown>;
    if (typeof candidate !== "string" || candidate.length > 2_000) return undefined;
    const out: RtcCandidate = { candidate };
    if (typeof sdpMid === "string" && sdpMid.length <= 64) out.sdpMid = sdpMid;
    else if (sdpMid === null) out.sdpMid = null;
    if (typeof sdpMLineIndex === "number" && Number.isInteger(sdpMLineIndex) && sdpMLineIndex >= 0 && sdpMLineIndex < 64) out.sdpMLineIndex = sdpMLineIndex;
    else if (sdpMLineIndex === null) out.sdpMLineIndex = null;
    if (typeof usernameFragment === "string" && usernameFragment.length <= 64) out.usernameFragment = usernameFragment;
    else if (usernameFragment === null) out.usernameFragment = null;
    return out;
  }

  /**
   * Blind P2P signalling relay: student to host only (the server stamps `from`, any client `to` is ignored) and host to
   * one connected student. Student to student does not exist. The message is rebuilt from validated fields.
   */
  private onRtc(ws: WebSocket, claims: TicketClaims, m: Record<string, unknown>): void {
    const stream = m.stream as RtcStream;
    const kind = m.kind;
    if (stream !== "screen" && stream !== "student-screen") return;
    if (kind !== "want" && kind !== "offer" && kind !== "answer" && kind !== "ice") return;

    const out: Extract<ServerMsg, { t: "rtc" }> = { t: "rtc", from: claims.pid, stream, kind };
    if (kind === "offer" || kind === "answer") {
      if (typeof m.sdp !== "string" || m.sdp.length === 0 || m.sdp.length > RTC_MAX_CHARS - 512) return;
      out.sdp = m.sdp;
    } else if (kind === "ice") {
      const candidate = this.cleanCandidate(m.candidate);
      if (candidate === undefined) return;
      out.candidate = candidate;
    }

    if (claims.role === "host") {
      const to = typeof m.to === "string" ? m.to : "";
      const targets = this.openSockets(to).filter((s) => (s.deserializeAttachment() as TicketClaims | null)?.role === "student");
      if (!to || targets.length === 0) return;
      this.broadcast(targets, out);
      return;
    }

    // Student: only toward the host, and only for things that are actually going on.
    if (stream === "screen") {
      if (kind !== "want" && kind !== "answer" && kind !== "ice") return; // students are never senders of "screen"
      if (!this.getJson<MediaPublication>("presenter")) return;
      if (kind === "want") {
        const viewers = this.screenViewers();
        if (!viewers.includes(claims.pid)) {
          if (viewers.length >= LIVE_LIMITS.maxVideoViewers) {
            this.send(ws, { t: "rtc", from: "host", stream: "screen", kind: "full" });
            return;
          }
          this.setMeta("wantScreen", JSON.stringify([...viewers, claims.pid]));
        }
      }
    } else {
      if (kind !== "want" && kind !== "offer" && kind !== "ice") return; // the host is the only viewer of "student-screen"
      const req = this.getJson<ShareState>("shareReq");
      const active = this.getJson<StudentShare>("studentShare");
      if (!((req?.pid === claims.pid && req.accepted) || active?.pid === claims.pid)) return;
    }
    this.broadcast(this.openSockets("host"), out);
  }

  private onChat(ws: WebSocket, claims: TicketClaims, m: Record<string, unknown>): void {
    const text = typeof m.text === "string" ? m.text.trim().slice(0, LIVE_LIMITS.chatMaxChars).trim() : "";
    if (!text) return;

    let to: string | null;
    if (claims.role === "student") {
      to = claims.pid; // a student's messages are always their private thread with the host
    } else if (m.to === undefined || m.to === null || m.to === "") {
      to = null; // host broadcast
    } else if (typeof m.to === "string" && this.sql.exec(`SELECT 1 FROM participants WHERE pid = ?`, m.to).toArray().length > 0) {
      to = m.to;
    } else {
      return this.send(ws, { t: "error", message: "That student is not in this class." });
    }

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      at: Date.now(),
      from: claims.pid,
      fromName: claims.name,
      to,
      text,
    };
    this.sql.exec(`INSERT INTO messages (id, at, from_pid, from_name, to_pid, text) VALUES (?, ?, ?, ?, ?, ?)`, msg.id, msg.at, msg.from, msg.fromName, msg.to, msg.text);
    if (++this.insertedSincePrune >= 100) {
      this.insertedSincePrune = 0;
      this.sql.exec(`DELETE FROM messages WHERE seq <= (SELECT MAX(seq) FROM messages) - ?`, STORED_MESSAGES_MAX);
    }

    const audience = to === null ? this.openSockets() : [...this.openSockets("host"), ...this.openSockets(to)];
    // Student -> host: the host's sockets plus the sender's own (their other tabs). Nobody else is ever in `audience`.
    this.broadcast(audience, { t: "chat", msg });
  }

  private async onClass(action: "start" | "end"): Promise<void> {
    if (action === "start") {
      this.setMeta("live", "1");
      this.setMeta("ended", null);
      this.setMeta("endedAt", null);
      await this.touch(true);
    } else {
      this.setMeta("live", null);
      this.setMeta("ended", "1");
      this.setMeta("endedAt", String(Date.now()));
      // Nothing keeps being presented after the class: withdraw the host's media and any student share.
      this.setMeta("presenter", null);
      this.setMeta("wantScreen", null);
      const pending = this.getJson<ShareState>("shareReq");
      const active = this.getJson<StudentShare>("studentShare");
      this.setMeta("shareReq", null);
      this.setMeta("studentShare", null);
      const sharer = active ?? pending;
      if (sharer) {
        this.broadcast(this.openSockets(sharer.pid), { t: "share:cancelled" });
        this.broadcast(this.openSockets("host"), { t: "share:media", pid: sharer.pid, name: sharer.name, media: null });
      }
      this.broadcast(this.openSockets(), { t: "presenter", media: null });
      await this.ctx.storage.setAlarm(Date.now() + LIVE_LIMITS.roomRetentionDays * DAY_MS);
    }
    this.broadcast(this.openSockets(), { t: "class", live: action === "start", ended: action === "end" });
  }

  private onPollCreate(ws: WebSocket, m: Record<string, unknown>): void {
    const question = typeof m.question === "string" ? m.question.trim().slice(0, LIVE_LIMITS.pollQuestionMaxChars) : "";
    const options = Array.isArray(m.options)
      ? m.options.filter((o): o is string => typeof o === "string").map((o) => o.trim().slice(0, LIVE_LIMITS.pollOptionMaxChars)).filter(Boolean)
      : [];
    if (!question) return this.send(ws, { t: "error", message: "Write a question for the poll." });
    if (options.length < LIVE_LIMITS.pollMinOptions || options.length > LIVE_LIMITS.pollMaxOptions) {
      return this.send(ws, { t: "error", message: `A poll needs ${LIVE_LIMITS.pollMinOptions} to ${LIVE_LIMITS.pollMaxOptions} options.` });
    }
    const id = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO polls (id, question, options, is_open, show_results, created_at) VALUES (?, ?, ?, 1, ?, ?)`,
      id,
      question,
      JSON.stringify(options),
      m.showResults === true ? 1 : 0,
      Date.now(),
    );
    this.broadcastPoll(this.loadPolls(id)[0], "all");
  }

  private async onShareRequest(ws: WebSocket, m: Record<string, unknown>): Promise<void> {
    const to = typeof m.to === "string" ? m.to : "";
    const target = this.openSockets(to).find((s) => (s.deserializeAttachment() as TicketClaims | null)?.role === "student");
    if (!target) return this.send(ws, { t: "error", message: "That student is not connected." });
    const name = (target.deserializeAttachment() as TicketClaims).name;

    const pending = this.getJson<ShareState>("shareReq");
    const active = this.getJson<StudentShare>("studentShare");
    if (active?.pid === to) return this.send(ws, { t: "error", message: "That student is already sharing their screen." });
    if ((active && active.pid !== to) || (pending && pending.pid !== to)) {
      return this.send(ws, { t: "error", message: "Another student is already sharing or has been asked to. Stop that first." });
    }

    this.setMeta("shareReq", JSON.stringify({ pid: to, name } satisfies ShareState));
    let grant: string;
    try {
      grant = await signTicket(
        { room: this.roomId(target), role: "student", pid: to, name, exp: Math.floor(Date.now() / 1000) + SHARE_GRANT_TTL_SECONDS, share: true },
        this.env.LIVE_SECRET,
      );
    } catch (err) {
      this.setMeta("shareReq", null);
      throw err;
    }
    this.broadcast(this.openSockets(to), { t: "share:request", grant });
  }

  private onShareCancel(m: Record<string, unknown>): void {
    const to = typeof m.to === "string" ? m.to : "";
    if (!to) return;
    const pending = this.getJson<ShareState>("shareReq");
    const active = this.getJson<StudentShare>("studentShare");
    const had = pending?.pid === to ? pending : active?.pid === to ? active : null;
    if (pending?.pid === to) this.setMeta("shareReq", null);
    if (active?.pid === to) this.setMeta("studentShare", null);
    this.broadcast(this.openSockets(to), { t: "share:cancelled" });
    if (had) this.broadcast(this.openSockets("host"), { t: "share:media", pid: to, name: had.name, media: null });
  }

  // ───────────────────────── state ─────────────────────────

  private getMeta(key: string): string | null {
    const row = this.sql.exec<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key).toArray()[0];
    return row ? row.value : null;
  }

  private setMeta(key: string, value: string | null): void {
    if (value === null) this.sql.exec(`DELETE FROM meta WHERE key = ?`, key);
    else this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`, key, value);
  }

  private getJson<T>(key: string): T | null {
    const raw = this.getMeta(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** The room id the sockets were issued for (every attachment carries it). */
  private roomId(ws: WebSocket): string {
    return (ws.deserializeAttachment() as TicketClaims).room;
  }

  /** Push the wipe alarm out to `roomRetentionDays` after the last activity (at most hourly, and never once the class has ended). */
  private async touch(force = false): Promise<void> {
    if (this.getMeta("ended") === "1" && !force) return;
    const now = Date.now();
    if (!force && now - this.lastAlarmAt < 3_600_000) return;
    this.lastAlarmAt = now;
    await this.ctx.storage.setAlarm(now + LIVE_LIMITS.roomRetentionDays * DAY_MS);
  }

  private loadPolls(onlyId?: string): PollData[] {
    const rows = onlyId !== undefined
      ? this.sql.exec<PollRow>(`SELECT id, question, options, is_open, show_results, created_at FROM polls WHERE id = ?`, onlyId).toArray()
      : this.sql.exec<PollRow>(`SELECT id, question, options, is_open, show_results, created_at FROM polls ORDER BY created_at, rowid`).toArray();
    if (rows.length === 0) return [];
    const voteRows = onlyId !== undefined
      ? this.sql.exec<{ poll_id: string; pid: string; choice: number }>(`SELECT poll_id, pid, choice FROM votes WHERE poll_id = ?`, onlyId).toArray()
      : this.sql.exec<{ poll_id: string; pid: string; choice: number }>(`SELECT poll_id, pid, choice FROM votes`).toArray();

    return rows.map((r) => {
      const options = JSON.parse(r.options) as string[];
      const counts = options.map(() => 0);
      const votes = new Map<string, number>();
      for (const v of voteRows) {
        if (v.poll_id !== r.id) continue;
        const c = Number(v.choice);
        if (c >= 0 && c < counts.length) {
          counts[c]++;
          votes.set(v.pid, c);
        }
      }
      return {
        id: r.id,
        question: r.question,
        options,
        open: Number(r.is_open) === 1,
        showResults: Number(r.show_results) === 1,
        createdAt: Number(r.created_at),
        counts,
        total: counts.reduce((a, b) => a + b, 0),
        votes,
      };
    });
  }

  /** The poll as one viewer may see it: hosts always get tallies; students only when showResults or closed, plus their own vote. */
  private pollFor(p: PollData, viewer: TicketClaims): Poll {
    const poll: Poll = { id: p.id, question: p.question, options: p.options, open: p.open, showResults: p.showResults, createdAt: p.createdAt };
    if (viewer.role === "host") {
      poll.results = { counts: p.counts, total: p.total };
    } else {
      if (p.showResults || !p.open) poll.results = { counts: p.counts, total: p.total };
      poll.myVote = p.votes.get(viewer.pid) ?? null;
    }
    return poll;
  }

  /** `audience`: "all" sockets, or only the host plus the student with this pid. */
  private broadcastPoll(p: PollData, audience: "all" | string): void {
    const sockets = audience === "all" ? this.openSockets() : [...this.openSockets("host"), ...this.openSockets(audience)];
    for (const ws of sockets) {
      const viewer = ws.deserializeAttachment() as TicketClaims | null;
      if (viewer) this.send(ws, { t: "poll", poll: this.pollFor(p, viewer) });
    }
  }

  private buildSnapshot(claims: TicketClaims): RoomSnapshot {
    const isHost = claims.role === "host";
    const limit = LIVE_LIMITS.historyMessages;
    const history = (
      isHost
        ? this.sql.exec<MsgRow>(`SELECT * FROM (SELECT seq, id, at, from_pid, from_name, to_pid, text FROM messages ORDER BY seq DESC LIMIT ?) ORDER BY seq`, limit)
        : this.sql.exec<MsgRow>(
            `SELECT * FROM (SELECT seq, id, at, from_pid, from_name, to_pid, text FROM messages
                            WHERE to_pid IS NULL OR to_pid = ? ORDER BY seq DESC LIMIT ?) ORDER BY seq`,
            claims.pid,
            limit,
          )
    )
      .toArray()
      .map((r): ChatMessage => ({ id: r.id, at: Number(r.at), from: r.from_pid, fromName: r.from_name, to: r.to_pid, text: r.text }));

    const files = this.sql
      .exec<FileRow>(`SELECT id, at, name, mime, size, is_image FROM files ORDER BY at, rowid`)
      .toArray()
      .map((f): SharedFile => ({ id: f.id, at: Number(f.at), name: f.name, mime: f.mime, size: Number(f.size), isImage: Number(f.is_image) === 1 }));

    const ended = this.getMeta("ended") === "1";
    const share = this.getJson<StudentShare>("studentShare");
    const snapshot: RoomSnapshot = {
      live: this.getMeta("live") === "1" && !ended,
      ended,
      presenter: this.getJson<MediaPublication>("presenter"),
      studentShare: isHost ? share : null,
      polls: this.loadPolls().map((p) => this.pollFor(p, claims)),
      files,
      history,
      studentCount: this.onlineStudentPids().size,
      you: { pid: claims.pid, name: claims.name, role: claims.role },
    };
    if (isHost) snapshot.participants = this.participants();
    return snapshot;
  }

  // ───────────────────────── presence & sockets ─────────────────────────

  /** Sockets that are open right now (optionally only those tagged `tag`, optionally leaving out one that is closing). */
  private openSockets(tag?: string, exclude?: WebSocket): WebSocket[] {
    return (tag === undefined ? this.ctx.getWebSockets() : this.ctx.getWebSockets(tag)).filter((s) => s !== exclude && s.readyState === WebSocket.READY_STATE_OPEN);
  }

  private onlineStudentPids(exclude?: WebSocket): Set<string> {
    const pids = new Set<string>();
    for (const s of this.openSockets("student", exclude)) {
      const c = s.deserializeAttachment() as TicketClaims | null;
      if (c) pids.add(c.pid);
    }
    return pids;
  }

  /** Every student seen this session, online or not. Host only. */
  private participants(exclude?: WebSocket): Participant[] {
    const online = this.onlineStudentPids(exclude);
    return this.sql
      .exec<{ pid: string; name: string }>(`SELECT pid, name FROM participants ORDER BY name COLLATE NOCASE, pid`)
      .toArray()
      .map((r) => ({ pid: r.pid, name: r.name, online: online.has(r.pid) }));
  }

  private broadcastPresence(exclude?: WebSocket): void {
    const hosts = this.openSockets("host", exclude);
    if (hosts.length === 0) return;
    this.broadcast(hosts, { t: "presence", participants: this.participants(exclude), studentCount: this.onlineStudentPids(exclude).size });
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // the socket is closing
    }
  }

  private broadcast(sockets: WebSocket[], msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const ws of new Set(sockets)) {
      try {
        ws.send(data);
      } catch {
        // the socket is closing
      }
    }
  }

  /** Per-socket flood control: at most RATE_MAX messages per window; the rest are dropped (one warning per window). */
  private allowMessage(ws: WebSocket): boolean {
    return this.allow(this.rates, ws, RATE_MAX);
  }

  /** Signalling has a bucket of its own so ICE trickle is not throttled by (nor does it eat into) the chat limit. */
  private allowRtc(ws: WebSocket): boolean {
    return this.allow(this.rtcRates, ws, RTC_RATE_MAX);
  }

  private allow(buckets: WeakMap<WebSocket, { start: number; count: number; warned: boolean }>, ws: WebSocket, max: number): boolean {
    const now = Date.now();
    let r = buckets.get(ws);
    if (!r || now - r.start >= RATE_WINDOW_MS) {
      r = { start: now, count: 0, warned: false };
      buckets.set(ws, r);
    }
    if (++r.count <= max) return true;
    if (!r.warned) {
      r.warned = true;
      this.send(ws, { t: "error", message: "You are sending messages too fast. Please slow down." });
    }
    return false;
  }
}
