import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaPublication } from "@shared/live";
import { describeMediaError, subscribe, type SubscriptionStatus } from "./sfu";

export type UseSubscription = {
  stream: MediaStream | null;
  status: SubscriptionStatus | "idle";
  /** Readable reason when status is "failed". */
  error: string | null;
  retry(): void;
};

/**
 * Pulls a publisher's tracks from the SFU into a MediaStream for as long as
 * `media` stays the same (same SFU session and track names). Pass `enabled=false`
 * (or media null) to stay idle.
 */
export function useSubscription(media: MediaPublication | null, ticket: string | null, enabled = true): UseSubscription {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<UseSubscription["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Ticket refreshes must not tear the stream down.
  const ticketRef = useRef(ticket);
  ticketRef.current = ticket;
  const mediaRef = useRef(media);
  mediaRef.current = media;

  const key = media ? `${media.sessionId}|${media.tracks.map((t) => t.name).join(",")}` : "";
  const active = enabled && key !== "" && ticket !== null;

  useEffect(() => {
    const m = mediaRef.current;
    const t = ticketRef.current;
    if (!active || !m || !t) {
      setStream(null);
      setStatus("idle");
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setStream(null);
    setStatus("connecting");
    setError(null);
    subscribe(m, {
      ticket: t,
      signal: ctrl.signal,
      onStream: (s) => {
        if (!ctrl.signal.aborted) setStream(s);
      },
      onStatus: (s, detail) => {
        if (ctrl.signal.aborted) return;
        setStatus(s);
        setError(s === "failed" ? (detail ?? "The connection to the stream was lost.") : null);
      },
    }).then(
      (sub) => {
        if (ctrl.signal.aborted) sub.close();
        else setStream(sub.stream);
      },
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        setStatus("failed");
        setError(describeMediaError(err));
      },
    );
    return () => ctrl.abort();
  }, [key, active, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { stream, status, error, retry };
}
