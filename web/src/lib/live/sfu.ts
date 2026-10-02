import type { MediaPublication } from "@shared/live";

/*
 * Cloudflare Realtime SFU client. The browser never sees the SFU secret: every
 * call goes through our Pages proxy (/api/live/sfu/*) with a room ticket as the
 * bearer token. Flow (see shared/live.ts):
 *
 *   publisher:  new session -> addTransceiver(sendonly) -> offer -> POST tracks/new
 *               (location: "local") -> setRemoteDescription(answer)
 *   subscriber: separate session -> POST tracks/new (location: "remote",
 *               sessionId = publisher's) -> setRemoteDescription(offer) ->
 *               createAnswer -> PUT renegotiate
 */

const SFU_ENDPOINT = "/api/live/sfu";
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
const CONNECT_TIMEOUT_MS = 15_000;

const HOST_VIDEO_BITRATE = 2_500_000;
const STUDENT_VIDEO_BITRATE = 1_500_000;

type Label = MediaPublication["tracks"][number]["label"];

// ───────────────────────── errors ─────────────────────────

export class SfuError extends Error {
  /** Retrying will not help (permissions, SFU not configured). */
  readonly fatal: boolean;

  constructor(message: string, fatal = false) {
    super(message);
    this.name = "SfuError";
    this.fatal = fatal;
  }
}

/** Readable message for anything thrown while capturing or publishing media. */
export function describeMediaError(err: unknown): string {
  if (err instanceof SfuError) return err.message;
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "Screen sharing was cancelled or blocked. Choose a screen, window or tab in the browser prompt (and check this site is allowed to share).";
      case "NotFoundError":
        return "No screen or microphone was found.";
      case "NotReadableError":
        return "The screen or microphone could not be read. Another app may be using it.";
      case "AbortError":
        return "Screen capture was interrupted. Please try again.";
      case "SecurityError":
        return "Screen sharing needs a secure (https) connection.";
      case "NotSupportedError":
      case "TypeError":
        return "This browser does not support screen sharing.";
      default:
        break;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong with screen sharing. Please try again.";
}

/** True when this browser can capture a screen at all (not the case on most phones and tablets). */
export function canShareScreen(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof RTCPeerConnection !== "undefined"
  );
}

function canReceiveMedia(): boolean {
  return typeof RTCPeerConnection !== "undefined";
}

// ───────────────────────── proxy calls ─────────────────────────

type SfuTrackResult = { location?: string; mid?: string; trackName?: string; errorCode?: string; errorDescription?: string };

type SfuResponse = {
  sessionId?: string;
  sessionDescription?: { type: RTCSdpType; sdp: string };
  requiresImmediateRenegotiation?: boolean;
  tracks?: SfuTrackResult[];
  errorCode?: string;
  errorDescription?: string;
  message?: string;
  error?: string;
};

function httpMessage(status: number, data: SfuResponse): string {
  const fromBody = data.message || data.errorDescription || (typeof data.error === "string" ? data.error : "");
  if (fromBody) return fromBody;
  if (status === 401 || status === 403) return "You are not allowed to do that. Reload the page and try again.";
  if (status === 404 || status === 501 || status === 503) return "Screen sharing is not set up on the server yet.";
  return `The media server returned an error (${status}). Please try again.`;
}

async function sfuCall(
  ticket: string,
  method: "POST" | "PUT",
  path: string,
  body?: unknown,
  keepalive = false,
): Promise<SfuResponse> {
  let res: Response;
  try {
    res = await fetch(`${SFU_ENDPOINT}${path}`, {
      method,
      keepalive,
      headers: {
        Authorization: `Bearer ${ticket}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SfuError("Network error while talking to the media server. Check your connection and try again.");
  }
  const text = await res.text().catch(() => "");
  let data: SfuResponse = {};
  if (text) {
    try {
      data = JSON.parse(text) as SfuResponse;
    } catch {
      data = {};
    }
  }
  if (!res.ok) throw new SfuError(httpMessage(res.status, data), [401, 403, 404, 501, 503].includes(res.status));
  if (data.errorCode) throw new SfuError(data.errorDescription || `The media server reported an error (${data.errorCode}).`);
  return data;
}

function assertTracksOk(res: SfuResponse): void {
  const bad = res.tracks?.find((t) => t.errorCode);
  if (bad) {
    throw new SfuError(bad.errorDescription || `The media server could not use the "${bad.trackName ?? "?"}" track (${bad.errorCode}).`);
  }
}

async function createSession(ticket: string): Promise<string> {
  const res = await sfuCall(ticket, "POST", "/session");
  if (!res.sessionId) throw new SfuError("The media server did not return a session.");
  return res.sessionId;
}

/** Resolves once ICE is connected; rejects on failure/close/timeout. */
function waitForIce(pc: RTCPeerConnection, timeoutMs = CONNECT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const isUp = () => pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed";
    if (isUp()) {
      resolve();
      return;
    }
    const finish = (err?: Error) => {
      clearTimeout(timer);
      pc.removeEventListener("iceconnectionstatechange", onChange);
      if (err) reject(err);
      else resolve();
    };
    const onChange = () => {
      if (isUp()) finish();
      else if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        finish(new SfuError("Could not connect to the media server. Your network may be blocking video (try another network or turn off your VPN)."));
      }
    };
    const timer = setTimeout(
      () => finish(new SfuError("Timed out connecting to the media server. Check your connection and try again.")),
      timeoutMs,
    );
    pc.addEventListener("iceconnectionstatechange", onChange);
  });
}

function newPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: "max-bundle" });
}

// ───────────────────────── publishing ─────────────────────────

export type ScreenShare = {
  publication: MediaPublication;
  /** Video-only preview of what is being shared (play it muted). */
  stream: MediaStream;
  hasMic: boolean;
  /** Non-fatal problem, e.g. the microphone was unavailable. */
  warning: string | null;
  /** Mutes/unmutes the published microphone without renegotiating. No-op when there is no mic. */
  setMicEnabled(on: boolean): void;
  /** Stops capturing, closes the SFU tracks and the connection. Safe to call more than once. */
  stop(): Promise<void>;
};

type ShareOptions = {
  /** Bearer for the SFU proxy: the host ticket, or a student's share grant. */
  ticket: string;
  /** Called when sharing ends on its own (the browser's "Stop sharing" bar, or a lost connection). `reason` is set for failures. Not called after stop(). */
  onEnded?: (reason: string | null) => void;
};

type LocalItem = { track: MediaStreamTrack; name: string; label: Label; maxBitrate?: number };

async function captureDisplay(wantAudio: boolean): Promise<MediaStream> {
  if (!canShareScreen()) throw new SfuError("This device or browser can't share its screen. Use Chrome, Edge or Firefox on a computer.", true);
  const md = navigator.mediaDevices;
  try {
    return await md.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: wantAudio });
  } catch (err) {
    // Some browsers reject unknown constraints such as audio outright; retry with the plainest request.
    const name = err instanceof DOMException ? err.name : err instanceof TypeError ? "TypeError" : "";
    if (name === "TypeError" || name === "NotSupportedError" || name === "OverconstrainedError") {
      return md.getDisplayMedia({ video: true });
    }
    throw err;
  }
}

async function captureMic(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const track = stream.getAudioTracks()[0];
  if (!track) throw new SfuError("No microphone was found.");
  return track;
}

async function tuneSender(sender: RTCRtpSender, maxBitrate: number | undefined, isVideo: boolean): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    if (maxBitrate) params.encodings[0].maxBitrate = maxBitrate;
    if (isVideo) {
      // Text must stay sharp: drop frames before resolution.
      params.degradationPreference = "maintain-resolution";
    }
    await sender.setParameters(params);
  } catch {
    /* not supported everywhere — the defaults are fine */
  }
}

async function publish(opts: ShareOptions, items: LocalItem[], display: MediaStream, extra: MediaStream[], warning: string | null): Promise<ScreenShare> {
  const { ticket } = opts;
  const allTracks = items.map((i) => i.track);
  const stopCapture = () => {
    for (const s of [display, ...extra]) for (const t of s.getTracks()) t.stop();
    for (const t of allTracks) t.stop();
  };

  const video = items.find((i) => i.label === "screen")?.track;
  if (!video) {
    stopCapture();
    throw new SfuError("No video was captured.");
  }
  video.contentHint = "detail";

  const pc = newPeerConnection();
  let sessionId = "";
  const mids: string[] = [];
  try {
    sessionId = await createSession(ticket);
    const transceivers = items.map((item) => ({ item, tr: pc.addTransceiver(item.track, { direction: "sendonly" }) }));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = pc.localDescription?.sdp ?? offer.sdp;
    const trackRequests = transceivers.map(({ item, tr }) => {
      if (!tr.mid) throw new SfuError("Could not negotiate the media tracks. Please try again.");
      mids.push(tr.mid);
      return { location: "local", mid: tr.mid, trackName: item.name };
    });
    const res = await sfuCall(ticket, "POST", `/${sessionId}/tracks`, {
      sessionDescription: { type: "offer", sdp },
      tracks: trackRequests,
    });
    assertTracksOk(res);
    if (!res.sessionDescription) throw new SfuError("The media server did not answer. Please try again.");
    await pc.setRemoteDescription(res.sessionDescription);
    await Promise.all(transceivers.map(({ item, tr }) => tuneSender(tr.sender, item.maxBitrate, item.track.kind === "video")));
    await waitForIce(pc);
  } catch (err) {
    pc.close();
    stopCapture();
    throw err;
  }

  const publication: MediaPublication = {
    sessionId,
    tracks: items.map((i) => ({ name: i.name, kind: i.track.kind === "video" ? "video" : "audio", label: i.label })),
  };
  const mic = items.find((i) => i.label === "mic")?.track ?? null;

  let stopped = false;
  const teardown = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    video.removeEventListener("ended", onVideoEnded);
    pc.removeEventListener("iceconnectionstatechange", onIce);
    stopCapture();
    try {
      await sfuCall(ticket, "PUT", `/${sessionId}/close`, { tracks: mids.map((mid) => ({ mid })), force: true }, true);
    } catch {
      /* best effort — closing the connection ends the session anyway */
    }
    pc.close();
  };
  const endByItself = (reason: string | null) => {
    if (stopped) return;
    void teardown().then(() => opts.onEnded?.(reason));
  };
  function onVideoEnded() {
    endByItself(null);
  }
  function onIce() {
    if (pc.iceConnectionState === "failed") endByItself("The connection to the media server was lost. Share your screen again to continue.");
  }
  video.addEventListener("ended", onVideoEnded);
  pc.addEventListener("iceconnectionstatechange", onIce);

  return {
    publication,
    stream: new MediaStream([video]),
    hasMic: mic !== null,
    warning,
    setMicEnabled(on: boolean) {
      if (mic) mic.enabled = on;
    },
    stop: teardown,
  };
}

/** Host: shares a screen/window/tab (+ system audio when the browser offers it) and optionally the microphone. */
export async function startScreenShare(opts: ShareOptions & { withMic: boolean }): Promise<ScreenShare> {
  const display = await captureDisplay(true);
  const items: LocalItem[] = [];
  const extra: MediaStream[] = [];
  let warning: string | null = null;

  const screen = display.getVideoTracks()[0];
  if (!screen) {
    for (const t of display.getTracks()) t.stop();
    throw new SfuError("No video was captured.");
  }
  items.push({ track: screen, name: "screen", label: "screen", maxBitrate: HOST_VIDEO_BITRATE });
  const systemAudio = display.getAudioTracks()[0];
  if (systemAudio) items.push({ track: systemAudio, name: "screen-audio", label: "screen-audio" });

  if (opts.withMic) {
    try {
      const mic = await captureMic();
      extra.push(new MediaStream([mic]));
      items.push({ track: mic, name: "mic", label: "mic" });
    } catch (err) {
      warning = `Sharing without the microphone: ${describeMediaError(err)}`;
    }
  }
  return publish(opts, items, display, extra, warning);
}

/** Student: shares their screen only (no audio), at a lower bitrate. `beforePublish` runs once the screen is captured, before anything is sent. */
export async function startStudentShare(opts: ShareOptions & { beforePublish?: () => void }): Promise<ScreenShare> {
  const display = await captureDisplay(false);
  const screen = display.getVideoTracks()[0];
  if (!screen) {
    for (const t of display.getTracks()) t.stop();
    throw new SfuError("No video was captured.");
  }
  opts.beforePublish?.();
  return publish(opts, [{ track: screen, name: "screen", label: "screen", maxBitrate: STUDENT_VIDEO_BITRATE }], display, [], null);
}

// ───────────────────────── subscribing ─────────────────────────

export type SubscriptionStatus = "connecting" | "connected" | "reconnecting" | "failed";

export type Subscription = {
  /** The current stream; replaced (see onStream) after a reconnect. */
  readonly stream: MediaStream;
  close(): void;
};

export type SubscribeOptions = {
  /** Any valid room ticket. */
  ticket: string;
  /** Aborting closes the subscription. */
  signal?: AbortSignal;
  /** A reconnect produced a fresh stream. */
  onStream?: (stream: MediaStream) => void;
  onStatus?: (status: SubscriptionStatus, detail?: string) => void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Pulls the publisher's tracks into one MediaStream. Reconnects (new SFU session) when ICE fails. */
export async function subscribe(media: MediaPublication, opts: SubscribeOptions): Promise<Subscription> {
  if (!canReceiveMedia()) throw new SfuError("This browser can't play live video.", true);

  let closed = false;
  let current: { pc: RTCPeerConnection; stream: MediaStream } | null = null;
  let reconnecting = false;
  let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  /** Connections still negotiating, so close() can cut them short. */
  const pending = new Set<RTCPeerConnection>();

  const aborted = () => closed || opts.signal?.aborted === true;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(disconnectTimer);
    opts.signal?.removeEventListener("abort", close);
    current?.pc.close();
    current = null;
    for (const p of pending) p.close();
    pending.clear();
  };
  opts.signal?.addEventListener("abort", close);
  if (opts.signal?.aborted) close();

  const connectOnce = async (): Promise<{ pc: RTCPeerConnection; stream: MediaStream }> => {
    const pc = newPeerConnection();
    pending.add(pc);
    const stream = new MediaStream();
    // Must be set before setRemoteDescription: the tracks arrive during it.
    pc.ontrack = (ev) => {
      if (!stream.getTracks().includes(ev.track)) stream.addTrack(ev.track);
    };
    try {
      const sessionId = await createSession(opts.ticket);
      const res = await sfuCall(opts.ticket, "POST", `/${sessionId}/tracks`, {
        tracks: media.tracks.map((t) => ({ location: "remote", sessionId: media.sessionId, trackName: t.name })),
      });
      assertTracksOk(res);
      if (res.requiresImmediateRenegotiation) {
        if (!res.sessionDescription) throw new SfuError("The media server did not send the stream. Please try again.");
        await pc.setRemoteDescription(res.sessionDescription);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sfuCall(opts.ticket, "PUT", `/${sessionId}/renegotiate`, {
          sessionDescription: { type: "answer", sdp: pc.localDescription?.sdp ?? answer.sdp },
        });
      }
      await waitForIce(pc);
      if (aborted()) throw new SfuError("Closed.");
      return { pc, stream };
    } catch (err) {
      pc.close();
      throw err;
    } finally {
      pending.delete(pc);
    }
  };

  const watch = (pc: RTCPeerConnection) => {
    pc.addEventListener("iceconnectionstatechange", () => {
      if (aborted() || current?.pc !== pc) return;
      const state = pc.iceConnectionState;
      if (state === "failed") {
        void reconnect();
      } else if (state === "disconnected") {
        opts.onStatus?.("reconnecting");
        clearTimeout(disconnectTimer);
        disconnectTimer = setTimeout(() => {
          if (!aborted() && current?.pc === pc && pc.iceConnectionState !== "connected" && pc.iceConnectionState !== "completed") void reconnect();
        }, 6000);
      } else if (state === "connected" || state === "completed") {
        clearTimeout(disconnectTimer);
        opts.onStatus?.("connected");
      }
    });
  };

  const reconnect = async (): Promise<void> => {
    if (reconnecting || aborted()) return;
    reconnecting = true;
    opts.onStatus?.("reconnecting");
    current?.pc.close();
    current = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 6 && !aborted(); attempt++) {
      await sleep(Math.min(8000, 1000 * 2 ** attempt));
      if (aborted()) break;
      try {
        const next = await connectOnce();
        if (aborted()) {
          next.pc.close();
          break;
        }
        current = next;
        watch(next.pc);
        reconnecting = false;
        opts.onStream?.(next.stream);
        opts.onStatus?.("connected");
        return;
      } catch (err) {
        lastError = err;
        if (err instanceof SfuError && err.fatal) break;
      }
    }
    reconnecting = false;
    if (!aborted()) opts.onStatus?.("failed", lastError ? describeMediaError(lastError) : "Lost the connection to the host's screen.");
  };

  opts.onStatus?.("connecting");
  // The host may have just announced the stream; give the SFU a moment before giving up.
  let first: { pc: RTCPeerConnection; stream: MediaStream } | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3 && !aborted(); attempt++) {
    if (attempt > 0) await sleep(1500);
    if (aborted()) break;
    try {
      first = await connectOnce();
      break;
    } catch (err) {
      lastError = err;
      if (err instanceof SfuError && err.fatal) break;
    }
  }
  if (aborted() || !first) {
    const wasAborted = aborted();
    close();
    throw wasAborted ? new SfuError("Closed.") : lastError ?? new SfuError("Could not connect to the stream.");
  }
  if (aborted()) {
    first.pc.close();
    close();
    throw new SfuError("Closed.");
  }
  current = first;
  watch(first.pc);
  opts.onStatus?.("connected");

  return {
    get stream() {
      return current?.stream ?? first!.stream;
    },
    close,
  };
}
