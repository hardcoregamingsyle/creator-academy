import type {
  ChatMessage,
  ClientMsg,
  LiveTicketResponse,
  MediaPublication,
  Participant,
  Poll,
  RoomSnapshot,
  ServerMsg,
  SharedFile,
} from "@shared/live";
import { api, ApiError, errorMessage } from "@/lib/api";

/*
 * Room socket: connects to `${wsUrl}?t=${ticket}`, reconnects with backoff
 * (1s -> 10s) and folds ServerMsg frames into RoomState. The server sends a full
 * snapshot on every (re)connect, so nothing else is requested after a drop.
 */

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export type ShareResponse = { name: string; accept: boolean; at: number };

export type RoomState = {
  connection: ConnectionState;
  /** True once the first snapshot has arrived. */
  ready: boolean;
  snapshot: RoomSnapshot | null;
  you: RoomSnapshot["you"] | null;
  /** Host pressed Start and has not ended the class. */
  live: boolean;
  ended: boolean;
  chat: ChatMessage[];
  polls: Poll[];
  files: SharedFile[];
  presenter: MediaPublication | null;
  /** Host only. */
  studentShare: RoomSnapshot["studentShare"];
  /** Host only. */
  participants: Participant[];
  studentCount: number;
  /** Student: a pending screen-share request (the value is the SFU grant to use if they accept). */
  shareRequestGrant: string | null;
  /** Student: bumps every time the host withdraws the request / stops the share. */
  shareCancelTick: number;
  /** Host: the latest accept/decline per student pid. */
  shareResponses: Record<string, ShareResponse>;
  error: string | null;
};

export function initialRoomState(): RoomState {
  return {
    connection: "connecting",
    ready: false,
    snapshot: null,
    you: null,
    live: false,
    ended: false,
    chat: [],
    polls: [],
    files: [],
    presenter: null,
    studentShare: null,
    participants: [],
    studentCount: 0,
    shareRequestGrant: null,
    shareCancelTick: 0,
    shareResponses: {},
    error: null,
  };
}

export type RoomAction =
  | { type: "reset" }
  | { type: "connection"; connection: ConnectionState }
  | { type: "server"; msg: ServerMsg }
  | { type: "error"; message: string | null }
  | { type: "clear-grant" }
  /** Student: show the chosen option right away; the server's next `poll` frame confirms or corrects it. */
  | { type: "local-vote"; pollId: string; option: number };

const MAX_CHAT = 500;

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "reset":
      return initialRoomState();
    case "connection":
      return state.connection === action.connection ? state : { ...state, connection: action.connection };
    case "error":
      return state.error === action.message ? state : { ...state, error: action.message };
    case "clear-grant":
      return state.shareRequestGrant === null ? state : { ...state, shareRequestGrant: null };
    case "local-vote":
      return {
        ...state,
        polls: state.polls.map((p) => (p.id === action.pollId && p.open ? { ...p, myVote: action.option } : p)),
      };
    case "server":
      return applyServerMsg(state, action.msg);
  }
}

function applyServerMsg(state: RoomState, msg: ServerMsg): RoomState {
  switch (msg.t) {
    case "snapshot": {
      const s = msg.snapshot;
      return {
        ...state,
        ready: true,
        snapshot: s,
        you: s.you ?? null,
        live: Boolean(s.live),
        ended: Boolean(s.ended),
        presenter: s.presenter ?? null,
        studentShare: s.studentShare ?? null,
        polls: s.polls ?? [],
        files: s.files ?? [],
        chat: (s.history ?? []).slice(-MAX_CHAT),
        participants: s.participants ?? [],
        studentCount: typeof s.studentCount === "number" ? s.studentCount : 0,
      };
    }
    case "chat": {
      if (state.chat.some((m) => m.id === msg.msg.id)) return state;
      const chat = [...state.chat, msg.msg];
      return { ...state, chat: chat.length > MAX_CHAT ? chat.slice(-MAX_CHAT) : chat };
    }
    case "class":
      return { ...state, live: msg.live, ended: msg.ended };
    case "poll": {
      // A frame that doesn't carry `myVote` (e.g. someone else's vote, or a close) must not wipe the student's own choice.
      const prev = state.polls.find((p) => p.id === msg.poll.id);
      const poll = msg.poll.myVote === undefined && prev?.myVote !== undefined ? { ...msg.poll, myVote: prev.myVote } : msg.poll;
      return { ...state, polls: upsert(state.polls, poll) };
    }
    case "file":
      return { ...state, files: upsert(state.files, msg.file) };
    case "presenter":
      return { ...state, presenter: msg.media ?? null };
    case "presence":
      return {
        ...state,
        participants: Array.isArray(msg.participants) ? msg.participants : state.participants,
        studentCount: typeof msg.studentCount === "number" ? msg.studentCount : state.studentCount,
      };
    case "share:request":
      return { ...state, shareRequestGrant: msg.grant };
    case "share:cancelled":
      return { ...state, shareRequestGrant: null, shareCancelTick: state.shareCancelTick + 1 };
    case "share:response":
      return { ...state, shareResponses: { ...state.shareResponses, [msg.pid]: { name: msg.name, accept: msg.accept, at: Date.now() } } };
    case "share:media": {
      if (msg.media) return { ...state, studentShare: { pid: msg.pid, name: msg.name, media: msg.media } };
      return state.studentShare && state.studentShare.pid === msg.pid ? { ...state, studentShare: null } : state;
    }
    case "error":
      return { ...state, error: msg.message };
    case "pong":
      return state;
  }
}

// ───────────────────────── frame parsing ─────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Parses one text frame; returns null for anything that is not a well-formed ServerMsg. */
export function parseServerMsg(data: unknown): ServerMsg | null {
  if (typeof data !== "string") return null;
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObj(v) || typeof v.t !== "string") return null;
  switch (v.t) {
    case "snapshot":
      return isObj(v.snapshot) ? (v as ServerMsg) : null;
    case "chat":
      return isObj(v.msg) && typeof v.msg.id === "string" && typeof v.msg.text === "string" ? (v as ServerMsg) : null;
    case "class":
      return typeof v.live === "boolean" && typeof v.ended === "boolean" ? (v as ServerMsg) : null;
    case "poll":
      return isObj(v.poll) && typeof v.poll.id === "string" && Array.isArray(v.poll.options) ? (v as ServerMsg) : null;
    case "file":
      return isObj(v.file) && typeof v.file.id === "string" ? (v as ServerMsg) : null;
    case "presenter":
      return v.media === null || isObj(v.media) ? (v as ServerMsg) : null;
    case "presence":
      return typeof v.studentCount === "number" || Array.isArray(v.participants) ? (v as ServerMsg) : null;
    case "share:request":
      return typeof v.grant === "string" ? (v as ServerMsg) : null;
    case "share:cancelled":
    case "pong":
      return v as ServerMsg;
    case "share:response":
      return typeof v.pid === "string" && typeof v.accept === "boolean" ? (v as ServerMsg) : null;
    case "share:media":
      return typeof v.pid === "string" && (v.media === null || isObj(v.media)) ? (v as ServerMsg) : null;
    case "error":
      return typeof v.message === "string" ? (v as ServerMsg) : null;
    default:
      return null;
  }
}

// ───────────────────────── tickets ─────────────────────────

export type RoomSource = { kind: "student"; code: string } | { kind: "host"; sessionId: string };

/** POST /api/live/:code/ticket (students) or POST /api/admin/live/:sessionId/ticket (host). Rejects with ApiError; 403/404 messages are meant for people. */
export function fetchTicket(source: RoomSource): Promise<LiveTicketResponse> {
  const url =
    source.kind === "student"
      ? `/api/live/${encodeURIComponent(source.code)}/ticket`
      : `/api/admin/live/${encodeURIComponent(source.sessionId)}/ticket`;
  return api.post<LiveTicketResponse>(url);
}

/** Expiry (unix seconds) read from the ticket's claims, or null when it can't be read. */
function ticketExp(ticket: string): number | null {
  try {
    const body = ticket.split(".")[0] ?? "";
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

// ───────────────────────── client ─────────────────────────

const PING_MS = 25_000;
const STALE_MS = 75_000;
const MAX_BACKOFF_MS = 10_000;

type ClientOptions = {
  initial: LiveTicketResponse;
  refreshTicket: () => Promise<LiveTicketResponse>;
  dispatch: (action: RoomAction) => void;
  onTicket: (ticket: LiveTicketResponse) => void;
};

export class RoomClient {
  private info: LiveTicketResponse;
  private ws: WebSocket | null = null;
  private closed = false;
  private everOpened = false;
  private retries = 0;
  private failures = 0;
  private lastRx = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private readonly onOnline = () => {
    // The network is back: skip the remaining backoff.
    if (this.closed || this.ws || this.retryTimer === undefined) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    void this.reconnect();
  };

  constructor(private readonly opts: ClientOptions) {
    this.info = opts.initial;
  }

  get ticket(): LiveTicketResponse {
    return this.info;
  }

  connect(): void {
    window.addEventListener("online", this.onOnline);
    this.open();
  }

  send(msg: ClientMsg): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener("online", this.onOnline);
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close(1000, "leave");
      } catch {
        /* already closed */
      }
    }
  }

  private open(): void {
    if (this.closed) return;
    this.opts.dispatch({ type: "connection", connection: this.everOpened ? "reconnecting" : "connecting" });
    const { wsUrl, ticket } = this.info;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${wsUrl}${wsUrl.includes("?") ? "&" : "?"}t=${encodeURIComponent(ticket)}`);
    } catch {
      this.failures++;
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    let opened = false;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      opened = true;
      this.everOpened = true;
      this.retries = 0;
      this.failures = 0;
      this.lastRx = Date.now();
      this.opts.dispatch({ type: "error", message: null });
      this.opts.dispatch({ type: "connection", connection: "open" });
      this.startPing();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return;
      this.lastRx = Date.now();
      const msg = parseServerMsg(ev.data);
      if (msg) this.opts.dispatch({ type: "server", msg });
    };
    ws.onerror = () => {
      /* a close event always follows */
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      if (this.closed) return;
      if (!opened) this.failures++;
      this.opts.dispatch({ type: "connection", connection: "reconnecting" });
      if (!this.everOpened && this.failures === 4) {
        this.opts.dispatch({ type: "error", message: "Having trouble reaching the live room. We'll keep trying." });
      }
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.closed) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.retries, 4));
    this.retries++;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.reconnect();
    }, delay);
  }

  private async reconnect(): Promise<void> {
    if (this.closed) return;
    const exp = ticketExp(this.info.ticket);
    const expiring = exp !== null && exp * 1000 - Date.now() < 2 * 60_000;
    if (expiring || this.failures >= 2) {
      try {
        const fresh = await this.opts.refreshTicket();
        if (this.closed) return;
        this.info = fresh;
        this.opts.onTicket(fresh);
        this.failures = 0;
      } catch (err) {
        if (this.closed) return;
        // 401/403/404: the join window closed or the booking is gone. Retrying cannot help.
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          this.opts.dispatch({ type: "error", message: errorMessage(err) });
          this.opts.dispatch({ type: "connection", connection: "closed" });
          this.close();
          return;
        }
        /* network trouble: try the old ticket anyway */
      }
    }
    this.open();
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws) return;
      if (Date.now() - this.lastRx > STALE_MS) {
        // Half-open socket: nothing heard for a long while. A close handshake could hang, so drop it and reconnect now.
        this.ws = null;
        this.stopPing();
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        try {
          ws.close();
        } catch {
          /* already closed */
        }
        this.opts.dispatch({ type: "connection", connection: "reconnecting" });
        this.scheduleRetry();
        return;
      }
      this.send({ t: "ping" });
    }, PING_MS);
  }

  private stopPing(): void {
    clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }
}
