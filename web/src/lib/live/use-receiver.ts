import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveTicketResponse, RtcStream } from "@shared/live";
import { iceServersOf, Receiver, type ReceiverStatus, type RtcIn, type RtcOut } from "./p2p";

export type UseReceiver = {
  stream: MediaStream | null;
  status: ReceiverStatus | "idle";
  /** Start over right now (e.g. after "video is full"). */
  retry(): void;
};

/**
 * Watches one P2P stream for as long as `enabled` and `shareKey` stay the same. `shareKey` changes whenever the sender
 * starts a new share (MediaPublication.sessionId), which makes a fresh connection. Ticket refreshes never tear it down.
 */
export function useReceiver(o: {
  enabled: boolean;
  stream: RtcStream;
  shareKey: string;
  /** The student's pid when the host watches a student's screen. */
  peer?: string;
  sendRtc: (msg: RtcOut) => boolean;
  onRtc: (handler: (msg: RtcIn) => void) => () => void;
  ticket: Pick<LiveTicketResponse, "iceServers"> | null;
}): UseReceiver {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<UseReceiver["status"]>("idle");
  const [attempt, setAttempt] = useState(0);

  const ticketRef = useRef(o.ticket);
  ticketRef.current = o.ticket;
  const { enabled, stream: name, shareKey, peer, sendRtc, onRtc } = o;
  const active = enabled && shareKey !== "";

  useEffect(() => {
    if (!active) return;
    const receiver = new Receiver({
      stream: name,
      peer,
      send: sendRtc,
      iceServers: iceServersOf(ticketRef.current),
      onStream: setStream,
      onStatus: setStatus,
    });
    const off = onRtc((m) => receiver.handle(m));
    receiver.start();
    return () => {
      off();
      receiver.close();
      setStream(null);
      setStatus("idle");
    };
  }, [active, name, shareKey, peer, sendRtc, onRtc, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { stream, status, retry };
}
