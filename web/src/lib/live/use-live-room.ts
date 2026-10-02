import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { LIVE_LIMITS, type ClientMsg, type LiveTicketResponse, type MediaPublication } from "@shared/live";
import { errorMessage } from "@/lib/api";
import { fetchTicket, initialRoomState, RoomClient, roomReducer, type RoomSource, type RoomState } from "./room-client";

export type LivePhase = "idle" | "joining" | "joined" | "failed";

export type LiveRoomActions = {
  /** `to` (host only): a student's pid; omit to broadcast. Returns false when nothing was sent (empty, too long, or offline). */
  sendChat(text: string, to?: string): boolean;
  startClass(): boolean;
  endClass(): boolean;
  createPoll(question: string, options: string[], showResults: boolean): boolean;
  closePoll(pollId: string): boolean;
  vote(pollId: string, option: number): boolean;
  setPresenter(media: MediaPublication | null): boolean;
  requestShare(pid: string): boolean;
  cancelShare(pid: string): boolean;
  /** Declining also forgets the grant; after accepting, keep it until publishing has started, then clearShareGrant(). */
  respondShare(accept: boolean): boolean;
  publishShare(media: MediaPublication | null): boolean;
  clearShareGrant(): void;
  clearError(): void;
};

export type UseLiveRoom = LiveRoomActions & {
  state: RoomState;
  phase: LivePhase;
  /** Readable reason when joining failed (e.g. the 403 "room opens at …" message). */
  joinError: string | null;
  /** The current ticket response (wsUrl, httpBase, sfuEnabled, ...); refreshed when the socket re-authenticates. */
  ticket: LiveTicketResponse | null;
  join(): Promise<void>;
  leave(): void;
};

/**
 * Joins a live room: fetches a ticket (POST /api/live/:code/ticket for students,
 * /api/admin/live/:id/ticket for the host), opens the socket and keeps `state`
 * in sync. Nothing happens until `join()` is called. The senders are stable.
 */
export function useLiveRoom(source: RoomSource): UseLiveRoom {
  const [state, dispatch] = useReducer(roomReducer, undefined, initialRoomState);
  const [phase, setPhase] = useState<LivePhase>("idle");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<LiveTicketResponse | null>(null);

  const clientRef = useRef<RoomClient | null>(null);
  const joiningRef = useRef(false);
  const genRef = useRef(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const sourceKey = source.kind === "student" ? `s:${source.code}` : `h:${source.sessionId}`;

  const leave = useCallback(() => {
    genRef.current++;
    joiningRef.current = false;
    clientRef.current?.close();
    clientRef.current = null;
    setTicket(null);
    setJoinError(null);
    setPhase("idle");
    dispatch({ type: "reset" });
  }, []);

  const join = useCallback(async () => {
    if (clientRef.current || joiningRef.current) return;
    joiningRef.current = true;
    const gen = ++genRef.current;
    setPhase("joining");
    setJoinError(null);
    try {
      const first = await fetchTicket(sourceRef.current);
      if (gen !== genRef.current) return;
      dispatch({ type: "reset" });
      const client = new RoomClient({
        initial: first,
        refreshTicket: () => fetchTicket(sourceRef.current),
        dispatch,
        onTicket: setTicket,
      });
      clientRef.current = client;
      setTicket(first);
      setPhase("joined");
      client.connect();
    } catch (err) {
      if (gen !== genRef.current) return;
      setPhase("failed");
      setJoinError(errorMessage(err, "We couldn't open the live room. Please try again."));
    } finally {
      if (gen === genRef.current) joiningRef.current = false;
    }
  }, []);

  // Leaving the page (or switching to another room) closes the socket.
  useEffect(() => leave, [sourceKey, leave]);

  const actions = useMemo<LiveRoomActions>(() => {
    const send = (msg: ClientMsg): boolean => clientRef.current?.send(msg) ?? false;
    return {
      sendChat(text, to) {
        const t = text.trim();
        if (!t || t.length > LIVE_LIMITS.chatMaxChars) return false;
        return send(to ? { t: "chat", text: t, to } : { t: "chat", text: t });
      },
      startClass: () => send({ t: "class", action: "start" }),
      endClass: () => send({ t: "class", action: "end" }),
      createPoll(question, options, showResults) {
        const q = question.trim();
        const opts = options.map((o) => o.trim()).filter(Boolean);
        if (!q || q.length > LIVE_LIMITS.pollQuestionMaxChars) return false;
        if (opts.length < LIVE_LIMITS.pollMinOptions || opts.length > LIVE_LIMITS.pollMaxOptions) return false;
        if (opts.some((o) => o.length > LIVE_LIMITS.pollOptionMaxChars)) return false;
        return send({ t: "poll:create", question: q, options: opts, showResults });
      },
      closePoll: (pollId) => send({ t: "poll:close", pollId }),
      vote(pollId, option) {
        const ok = send({ t: "poll:vote", pollId, option });
        if (ok) dispatch({ type: "local-vote", pollId, option });
        return ok;
      },
      setPresenter: (media) => send({ t: "presenter", media }),
      requestShare: (pid) => send({ t: "share:request", to: pid }),
      cancelShare: (pid) => send({ t: "share:cancel", to: pid }),
      respondShare(accept) {
        const ok = send({ t: "share:respond", accept });
        if (!accept) dispatch({ type: "clear-grant" });
        return ok;
      },
      publishShare: (media) => send({ t: "share:publish", media }),
      clearShareGrant: () => dispatch({ type: "clear-grant" }),
      clearError: () => dispatch({ type: "error", message: null }),
    };
  }, []);

  return { ...actions, state, phase, joinError, ticket, join, leave };
}
