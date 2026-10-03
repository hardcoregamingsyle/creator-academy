import type { ClientMsg, LiveTicketResponse, MediaPublication, RtcCandidate, RtcStream, ServerMsg } from "@shared/live";

/*
 * Peer-to-peer screen sharing (no SFU, no paid service). The room Worker only relays signalling (shared/live.ts, {t:"rtc"}):
 *
 *   viewer  --want-->  sender        (viewer asks for a stream)
 *   viewer  <-offer--  sender        (sender: ONE RTCPeerConnection per viewer, created for that `want`)
 *   viewer  --answer-> sender
 *   both    <--ice-->  both          (trickle; candidate null = end)
 *
 * "screen" = host -> students, "student-screen" = student -> host. Broadcaster = the sender side, Receiver = the viewer side.
 */

export type RtcIn = Extract<ServerMsg, { t: "rtc" }>;
export type RtcOut = Omit<Extract<ClientMsg, { t: "rtc" }>, "t">;

/** What the room gives p2p.ts: a way to send signalling, a way to listen for it, and the ICE servers. */
export type RtcLink = {
  send(msg: RtcOut): boolean;
  onRtc(handler: (msg: RtcIn) => void): () => void;
  iceServers: RTCIceServer[];
};

const FALLBACK_ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function iceServersOf(ticket: Pick<LiveTicketResponse, "iceServers"> | null | undefined): RTCIceServer[] {
  const list = ticket?.iceServers;
  return Array.isArray(list) && list.length > 0 ? list : FALLBACK_ICE;
}

type Label = MediaPublication["tracks"][number]["label"];

// ───────────────────────── errors & feature detection ─────────────────────────

export class ShareError extends Error {
  /** Retrying will not help (unsupported device). */
  readonly fatal: boolean;

  constructor(message: string, fatal = false) {
    super(message);
    this.name = "ShareError";
    this.fatal = fatal;
  }
}

/** Readable message for anything thrown while capturing media. */
export function describeMediaError(err: unknown): string {
  if (err instanceof ShareError) return err.message;
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

/** True when this browser can show live video at all. */
export function canReceiveVideo(): boolean {
  return typeof RTCPeerConnection !== "undefined";
}

/** True when this browser can capture a screen (not the case on phones and tablets: they get a polite message instead). */
export function canShareScreen(): boolean {
  if (import.meta.env.DEV && fakeScreenRequested()) return canReceiveVideo();
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function" && canReceiveVideo();
}

// ───────────────────────── small helpers ─────────────────────────

function candidateOf(c: RTCIceCandidate | null): RtcCandidate | null {
  return c && c.candidate ? (c.toJSON() as RtcCandidate) : null;
}

function addCandidate(pc: RTCPeerConnection, c: RtcCandidate): Promise<void> {
  // A candidate from a stale connection (older username fragment) is rejected by the browser: that is fine.
  return pc.addIceCandidate({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment }).catch(() => {});
}

function detach(pc: RTCPeerConnection): void {
  pc.onicecandidate = null;
  pc.onconnectionstatechange = null;
  pc.ontrack = null;
  try {
    pc.close();
  } catch {
    /* already closed */
  }
}

/** Video bitrate cap per viewer: the fewer the viewers, the sharper the picture. */
export function bitrateForPeers(peers: number): number {
  if (peers <= 5) return 1_500_000;
  if (peers <= 10) return 900_000;
  if (peers <= 20) return 500_000;
  return 300_000;
}

// ───────────────────────── Broadcaster (sender side) ─────────────────────────

type BPeer = {
  pc: RTCPeerConnection;
  /** Everything for this viewer runs through one chain, so an ICE candidate never overtakes the answer. */
  queue: Promise<void>;
  early: RtcCandidate[];
  outIce: (RtcCandidate | null)[];
  offered: boolean;
};

export type BroadcasterOptions = {
  stream: RtcStream;
  tracks: MediaStreamTrack[];
  send: (msg: RtcOut) => boolean;
  iceServers: RTCIceServer[];
  /** Number of viewers whose connection is up, whenever it changes. */
  onViewers?: (connected: number) => void;
};

/** Sends the given tracks to every viewer that asks: one RTCPeerConnection per viewer, keyed by the viewer's pid. */
export class Broadcaster {
  private readonly peers = new Map<string, BPeer>();
  private readonly media: MediaStream;
  private stopped = false;
  private bitrate = bitrateForPeers(0);

  constructor(private readonly o: BroadcasterOptions) {
    for (const t of o.tracks) if (t.kind === "video") t.contentHint = "detail";
    this.media = new MediaStream(o.tracks);
  }

  get peerCount(): number {
    return this.peers.size;
  }

  /** The per-viewer video cap currently in force (bits per second). */
  get videoBitrate(): number {
    return this.bitrate;
  }

  /** Feed every relayed signalling message of this stream here. */
  handle(msg: RtcIn): void {
    if (this.stopped || msg.stream !== this.o.stream) return;
    const pid = msg.from;
    if (msg.kind === "want") {
      this.offerTo(pid);
      return;
    }
    const peer = this.peers.get(pid);
    if (!peer) return;
    if (msg.kind === "answer" && msg.sdp) {
      const sdp = msg.sdp;
      this.run(pid, peer, async () => {
        await peer.pc.setRemoteDescription({ type: "answer", sdp });
        for (const c of peer.early.splice(0)) await addCandidate(peer.pc, c);
        await this.tune(peer.pc);
      });
    } else if (msg.kind === "ice" && msg.candidate) {
      const c = msg.candidate;
      this.run(pid, peer, async () => {
        if (peer.pc.remoteDescription) await addCandidate(peer.pc, c);
        else peer.early.push(c);
      });
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const pid of [...this.peers.keys()]) this.closePeer(pid);
    for (const t of this.o.tracks) t.stop();
    this.o.onViewers?.(0);
  }

  private offerTo(pid: string): void {
    // A second `want` means the viewer started over: give it a brand-new connection.
    this.closePeer(pid);
    const pc = new RTCPeerConnection({ iceServers: this.o.iceServers, bundlePolicy: "max-bundle" });
    const peer: BPeer = { pc, queue: Promise.resolve(), early: [], outIce: [], offered: false };
    this.peers.set(pid, peer);
    for (const t of this.o.tracks) pc.addTrack(t, this.media);

    pc.onicecandidate = (e) => {
      const c = candidateOf(e.candidate);
      if (peer.offered) this.sendIce(pid, c);
      else peer.outIce.push(c);
    };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(pid) !== peer) return;
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.dropPeer(pid, peer);
      else this.changed();
    };

    this.run(pid, peer, async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.o.send({ to: pid, stream: this.o.stream, kind: "offer", sdp: pc.localDescription?.sdp ?? offer.sdp });
      peer.offered = true;
      for (const c of peer.outIce.splice(0)) this.sendIce(pid, c);
    });
    this.changed();
  }

  private sendIce(pid: string, candidate: RtcCandidate | null): void {
    this.o.send({ to: pid, stream: this.o.stream, kind: "ice", candidate });
  }

  private run(pid: string, peer: BPeer, job: () => Promise<void>): void {
    peer.queue = peer.queue.then(job).catch(() => this.dropPeer(pid, peer));
  }

  private closePeer(pid: string): void {
    const peer = this.peers.get(pid);
    if (!peer) return;
    this.peers.delete(pid);
    detach(peer.pc);
  }

  private dropPeer(pid: string, peer: BPeer): void {
    if (this.peers.get(pid) !== peer) return;
    this.closePeer(pid);
    this.changed();
  }

  /** The peer count changed (or a connection came up or went down): re-cap every sender and report the viewers. */
  private changed(): void {
    const before = this.bitrate;
    this.bitrate = bitrateForPeers(this.peers.size);
    let connected = 0;
    for (const p of this.peers.values()) {
      if (p.pc.connectionState === "connected") connected++;
      // A cap that moved to another tier applies to every viewer already negotiated; a new viewer is capped when its answer arrives.
      if (this.bitrate !== before && p.pc.remoteDescription) void this.tune(p.pc);
    }
    this.o.onViewers?.(connected);
  }

  private async tune(pc: RTCPeerConnection): Promise<void> {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate = this.bitrate;
        params.degradationPreference = "maintain-resolution"; // text must stay sharp: drop frames before resolution
        await sender.setParameters(params);
      } catch {
        /* not supported everywhere: the browser defaults are fine */
      }
    }
  }
}

// ───────────────────────── Receiver (viewer side) ─────────────────────────

export type ReceiverStatus = "connecting" | "connected" | "reconnecting" | "full" | "unsupported";

export type ReceiverOptions = {
  stream: RtcStream;
  /** Whose stream this is: the student's pid when the host watches a student; omit for the host's own screen. */
  peer?: string;
  send: (msg: RtcOut) => boolean;
  iceServers: RTCIceServer[];
  onStream: (stream: MediaStream | null) => void;
  onStatus: (status: ReceiverStatus) => void;
};

const NO_OFFER_MS = 6_000;
const CONNECT_MS = 15_000;
const DISCONNECTED_MS = 4_000;
const FULL_RETRY_MS = 30_000;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 10_000;

/** Asks for a stream (`want`), answers the offer and exposes the arriving tracks as ONE MediaStream. Reconnects by itself. */
export class Receiver {
  private pc: RTCPeerConnection | null = null;
  private queue: Promise<void> = Promise.resolve();
  private early: RtcCandidate[] = [];
  private outIce: (RtcCandidate | null)[] = [];
  private answered = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private backoff = MIN_BACKOFF_MS;
  private everConnected = false;
  private closed = false;
  private status: ReceiverStatus | null = null;

  constructor(private readonly o: ReceiverOptions) {}

  start(): void {
    if (!canReceiveVideo()) {
      this.setStatus("unsupported");
      return;
    }
    this.setStatus("connecting");
    this.want();
  }

  /** Feed every relayed signalling message of this stream here. */
  handle(msg: RtcIn): void {
    if (this.closed || msg.stream !== this.o.stream) return;
    if (msg.from !== (this.o.peer ?? "host")) return;
    if (msg.kind === "full") {
      this.onFull();
    } else if (msg.kind === "offer" && msg.sdp) {
      const sdp = msg.sdp;
      this.chain(() => this.onOffer(sdp));
    } else if (msg.kind === "ice" && msg.candidate) {
      const c = msg.candidate;
      this.chain(async () => {
        if (this.pc?.remoteDescription) await addCandidate(this.pc, c);
        else this.early.push(c);
      });
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.closePc();
  }

  private setStatus(s: ReceiverStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.o.onStatus(s);
  }

  private want(): void {
    if (this.closed) return;
    this.o.send({ ...(this.o.peer ? { to: this.o.peer } : {}), stream: this.o.stream, kind: "want" });
    // No offer in time (host busy, socket was down, message dropped): start over with backoff.
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.retry(), NO_OFFER_MS);
  }

  private retry(): void {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.closePc();
    this.o.onStream(null);
    this.setStatus(this.everConnected ? "reconnecting" : "connecting");
    const delay = this.backoff;
    this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
    this.timer = setTimeout(() => this.want(), delay);
  }

  private onFull(): void {
    clearTimeout(this.timer);
    this.closePc();
    this.o.onStream(null);
    this.setStatus("full");
    // A slot may free up later: ask again now and then.
    this.timer = setTimeout(() => this.want(), FULL_RETRY_MS);
  }

  private chain(job: () => Promise<void>): void {
    this.queue = this.queue.then(job).catch(() => this.retry());
  }

  private closePc(): void {
    const pc = this.pc;
    this.pc = null;
    this.early = [];
    this.outIce = [];
    this.answered = false;
    if (pc) detach(pc);
  }

  private async onOffer(sdp: string): Promise<void> {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.closePc();
    const pc = new RTCPeerConnection({ iceServers: this.o.iceServers, bundlePolicy: "max-bundle" });
    const media = new MediaStream();
    this.pc = pc;

    pc.ontrack = (e) => {
      if (this.pc === pc && !media.getTracks().includes(e.track)) media.addTrack(e.track);
    };
    pc.onicecandidate = (e) => {
      if (this.pc !== pc) return;
      const c = candidateOf(e.candidate);
      if (this.answered) this.sendIce(c);
      else this.outIce.push(c);
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc || this.closed) return;
      switch (pc.connectionState) {
        case "connected":
          clearTimeout(this.timer);
          this.backoff = MIN_BACKOFF_MS;
          this.everConnected = true;
          this.setStatus("connected");
          break;
        case "disconnected":
          clearTimeout(this.timer);
          this.timer = setTimeout(() => {
            if (this.pc === pc && pc.connectionState !== "connected") this.retry();
          }, DISCONNECTED_MS);
          break;
        case "failed":
        case "closed":
          this.retry();
          break;
        default:
          break;
      }
    };

    await pc.setRemoteDescription({ type: "offer", sdp });
    if (this.pc !== pc) return;
    for (const c of this.early.splice(0)) await addCandidate(pc, c);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (this.pc !== pc) return;
    this.o.send({ ...(this.o.peer ? { to: this.o.peer } : {}), stream: this.o.stream, kind: "answer", sdp: pc.localDescription?.sdp ?? answer.sdp });
    this.answered = true;
    for (const c of this.outIce.splice(0)) this.sendIce(c);
    // All the tracks of the offer have been added by now: hand the stream out in one piece (audio and video together).
    this.o.onStream(media);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.pc === pc && pc.connectionState !== "connected") this.retry();
    }, CONNECT_MS);
  }

  private sendIce(candidate: RtcCandidate | null): void {
    this.o.send({ ...(this.o.peer ? { to: this.o.peer } : {}), stream: this.o.stream, kind: "ice", candidate });
  }
}

// ───────────────────────── capturing and sharing ─────────────────────────

export type ShareOptions = {
  link: RtcLink;
  /** Called when sharing ends on its own (the browser's "Stop sharing" bar). Not called after stop(). */
  onEnded?: (reason: string | null) => void;
  /** Number of viewers whose connection is up. */
  onViewers?: (connected: number) => void;
};

export type LocalShare = {
  /** What to announce to the room (`presenter` / `share:publish`). */
  publication: MediaPublication;
  /** Video-only preview of what is being shared (play it muted). */
  stream: MediaStream;
  hasMic: boolean;
  /** Non-fatal problem, e.g. the microphone was unavailable. */
  warning: string | null;
  /** Mutes/unmutes the microphone without renegotiating. No-op when there is no mic. */
  setMicEnabled(on: boolean): void;
  /** Stops capturing and closes every viewer connection. Safe to call more than once. */
  stop(): void;
};

type LocalItem = { track: MediaStreamTrack; name: string; label: Label };

async function captureDisplay(wantAudio: boolean): Promise<MediaStream> {
  if (import.meta.env.DEV && fakeScreenRequested()) return fakeScreenStream();
  if (!canShareScreen()) throw new ShareError("This device or browser can't share its screen. Use Chrome, Edge or Firefox on a computer.", true);
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
  if (!track) throw new ShareError("No microphone was found.");
  return track;
}

function begin(stream: RtcStream, opts: ShareOptions, items: LocalItem[], display: MediaStream, warning: string | null): LocalShare {
  // `display` holds the screen (and system audio) tracks; the microphone is its own stream, so every item track is stopped too.
  const video = items.find((i) => i.label === "screen")?.track;
  if (!video) {
    for (const t of [...display.getTracks(), ...items.map((i) => i.track)]) t.stop();
    throw new ShareError("No video was captured.");
  }
  const tracks = items.map((i) => i.track);
  const broadcaster = new Broadcaster({ stream, tracks, send: opts.link.send, iceServers: opts.link.iceServers, onViewers: opts.onViewers });
  const off = opts.link.onRtc((m) => broadcaster.handle(m));
  const mic = items.find((i) => i.label === "mic")?.track ?? null;
  const publication: MediaPublication = {
    sessionId: crypto.randomUUID(),
    tracks: items.map((i) => ({ name: i.name, kind: i.track.kind === "video" ? "video" : "audio", label: i.label })),
  };

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    video.removeEventListener("ended", onVideoEnded);
    off();
    broadcaster.stop(); // stops every item track, including the microphone
    for (const t of display.getTracks()) t.stop();
  };
  function onVideoEnded(): void {
    if (stopped) return;
    stop();
    opts.onEnded?.(null);
  }
  video.addEventListener("ended", onVideoEnded);

  return {
    publication,
    stream: new MediaStream([video]),
    hasMic: mic !== null,
    warning,
    setMicEnabled(on: boolean) {
      if (mic) mic.enabled = on;
    },
    stop,
  };
}

/** Host: shares a screen/window/tab (+ system audio when the browser offers it) and optionally the microphone, to the students. */
export async function startHostShare(opts: ShareOptions & { withMic: boolean }): Promise<LocalShare> {
  const display = await captureDisplay(true);
  const screen = display.getVideoTracks()[0];
  if (!screen) {
    for (const t of display.getTracks()) t.stop();
    throw new ShareError("No video was captured.");
  }
  const items: LocalItem[] = [{ track: screen, name: "screen", label: "screen" }];
  const systemAudio = display.getAudioTracks()[0];
  if (systemAudio) items.push({ track: systemAudio, name: "screen-audio", label: "screen-audio" });

  let warning: string | null = null;
  const fake = import.meta.env.DEV && fakeScreenRequested(); // the dev test screen has no microphone to ask for
  if (opts.withMic && !fake) {
    try {
      const mic = await captureMic();
      items.push({ track: mic, name: "mic", label: "mic" });
    } catch (err) {
      warning = `Sharing without the microphone: ${describeMediaError(err)}`;
    }
  }
  return begin("screen", opts, items, display, warning);
}

/** Student: shares their screen only (no audio) with the host. `beforePublish` runs once the screen is captured, before anything is sent. */
export async function startStudentShare(opts: ShareOptions & { beforePublish?: () => void }): Promise<LocalShare> {
  const display = await captureDisplay(false);
  const screen = display.getVideoTracks()[0];
  if (!screen) {
    for (const t of display.getTracks()) t.stop();
    throw new ShareError("No video was captured.");
  }
  opts.beforePublish?.();
  return begin("student-screen", opts, [{ track: screen, name: "screen", label: "screen" }], display, null);
}

// ───────────────────────── dev-only test screen ─────────────────────────
// Used by browser tests (`?fakeScreen=1` on a dev server): an animated canvas stands in for getDisplayMedia. Every use is
// behind `import.meta.env.DEV`, so none of this reaches a production build.

function fakeScreenRequested(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).get("fakeScreen") === "1";
}

function fakeScreenStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d")!;
  let frame = 0;
  const draw = () => {
    frame++;
    const t = frame / 15;
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(320 + Math.cos(t * 2) * 200, 190 + Math.sin(t * 3) * 90, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f472b6";
    ctx.fillRect((frame * 7) % 580, 300, 60, 40);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px monospace";
    ctx.fillText(`FRAME ${frame}`, 16, 40);
  };
  draw();
  const timer = window.setInterval(draw, 1000 / 15);
  const stream = canvas.captureStream(15);
  const track = stream.getVideoTracks()[0];
  const stopTrack = track.stop.bind(track);
  track.stop = () => {
    window.clearInterval(timer);
    stopTrack();
  };
  return stream;
}
