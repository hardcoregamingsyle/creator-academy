import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Clock, Loader2, Lock, LogOut, MonitorUp, Radio, Users, Video, X } from "lucide-react";
import { JOIN_OPENS_MIN_BEFORE, type LiveJoinInfo } from "@shared/live";
import { formatDateLong, formatTime, formatTimeRange } from "@shared/format";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { ChatPanel } from "@/components/live/chat-panel";
import { ConnectionBadge } from "@/components/live/connection-badge";
import { FilesPanel } from "@/components/live/files-panel";
import { PollPanel } from "@/components/live/poll-panel";
import { TabPanel, Tabs } from "@/components/live/tabs";
import { VideoTile } from "@/components/live/video-tile";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, Button, ButtonLink, Card, Container, Eyebrow, Notice } from "@/components/ui";
import { usePageMeta } from "@/lib/usePageMeta";
import { useApi } from "@/lib/useApi";
import { canReceiveVideo, canShareScreen, describeMediaError, iceServersOf, startStudentShare, type LocalShare } from "@/lib/live/p2p";
import { useLiveRoom, type UseLiveRoom } from "@/lib/live/use-live-room";
import { useReceiver } from "@/lib/live/use-receiver";
import { useUnread } from "@/lib/live/use-unread";

type Tab = "chat" | "polls" | "files";

// ───────────────────────── page ─────────────────────────

export function Component() {
  const { code = "" } = useParams();
  const { data, error, reload } = useApi<LiveJoinInfo>(`/api/live/${encodeURIComponent(code)}`);
  usePageMeta({ title: data ? `Live: ${data.session.title}` : "Live class", noindex: true });

  // A failed background refresh must never replace a room people are sitting in: keep the last good answer.
  const lastGood = useRef<{ code: string; info: LiveJoinInfo } | undefined>(undefined);
  if (data) lastGood.current = { code, info: data };
  const info = data ?? (lastGood.current?.code === code ? lastGood.current.info : undefined);

  if (!info) {
    if (error?.status === 404) return <UnknownClass />;
    if (error) return <ApiErrorNotice error={error} onRetry={reload} title="We couldn't open this class" />;
    return <PageSkeleton />;
  }
  return <LiveExperience code={code} info={info} reload={reload} />;
}

function UnknownClass() {
  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-xl">
        <Notice tone="warning" title="We couldn't find this class">
          The link or booking code doesn&apos;t match a paid booking. Check that you copied the whole link, or look your booking up
          with the email you used.
        </Notice>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/booking" variant="primary">
            Find my booking
          </ButtonLink>
          <ButtonLink href="/schedule" variant="outline">
            Browse classes
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}

function LiveExperience({ code, info, reload }: { code: string; info: LiveJoinInfo; reload: () => void }) {
  const room = useLiveRoom({ kind: "student", code });
  if (room.phase === "joined") return <Room info={info} room={room} />;
  return <Lobby code={code} info={info} room={room} reload={reload} />;
}

// ───────────────────────── lobby ─────────────────────────

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Countdown({ target, onZero }: { target: string; onZero: () => void }) {
  const now = useNow(1000);
  const remaining = new Date(target).getTime() - now;
  useEffect(() => {
    if (remaining <= 0) onZero();
    // Re-ask the server every few seconds once the clock says the room should be open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining <= 0 ? Math.floor(now / 5000) : -1]);
  return (
    <div className="rounded-2xl bg-sunken px-5 py-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">The room opens in</p>
      {/* The ticking number is decorative; the sentence below carries the information for screen readers. */}
      <p aria-hidden className="mt-1 font-display text-4xl font-bold tabular-nums text-ink">
        {remaining > 0 ? formatCountdown(remaining) : "Opening…"}
      </p>
      <p className="sr-only">The room opens at {formatTime(target)}.</p>
    </div>
  );
}

function Lobby({ code, info, room, reload }: { code: string; info: LiveJoinInfo; room: UseLiveRoom; reload: () => void }) {
  const { session, status } = info;
  const joining = room.phase === "joining";

  // Keep the status fresh while waiting (the host may start early, or the window may open).
  useEffect(() => {
    if (status === "ended" || status === "cancelled") return;
    const id = window.setInterval(reload, 30_000);
    return () => window.clearInterval(id);
  }, [status, reload]);

  return (
    <Container className="py-8 sm:py-14">
      <div className="mx-auto max-w-xl">
        <Card className="p-6 sm:p-8">
          <Eyebrow>Live class</Eyebrow>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{session.title}</h1>
          <p className="mt-2 text-muted">
            {formatDateLong(session.startsAt)} · {formatTimeRange(session.startsAt, session.durationMin)}
          </p>
          <p className="mt-1 text-sm text-muted">Registered as {info.studentName}</p>

          <div className="mt-6 space-y-4">
            {status === "upcoming" && (
              <>
                <Countdown target={info.opensAt} onZero={reload} />
                <p className="text-sm text-ink-soft">
                  The room opens {JOIN_OPENS_MIN_BEFORE} minutes before the class starts. Keep this page open — the Join button
                  appears here by itself.
                </p>
              </>
            )}

            {(status === "open" || status === "live") && (
              <>
                {status === "live" ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span className="size-2 animate-rec rounded-full bg-danger" aria-hidden /> The class is live now
                  </p>
                ) : (
                  <p className="text-sm text-ink-soft">
                    The room is open. The host hasn&apos;t started yet — join now and you&apos;ll see the class as soon as it begins.
                  </p>
                )}
                <Button size="lg" className="w-full sm:w-auto" onClick={() => void room.join()} disabled={joining}>
                  {joining ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Video className="size-4" aria-hidden />}
                  {joining ? "Joining…" : "Join class"}
                </Button>
                <p className="text-xs text-muted">You&apos;ll hear the host after you join. Use headphones if you can.</p>
              </>
            )}

            {status === "ended" && <Notice tone="info" title="This class has ended">Thanks for joining. We&apos;d love to hear how it went — you&apos;ll get a short feedback form by email.</Notice>}
            {status === "cancelled" && (
              <Notice tone="warning" title="This class was cancelled">
                You can choose a full refund or a free move to another date on your{" "}
                <Link to={`/booking/${encodeURIComponent(code)}`} className="font-semibold underline underline-offset-2">
                  booking page
                </Link>
                , any time.
              </Notice>
            )}

            {room.joinError && (
              <Notice tone="error" title="We couldn't open the room">
                {room.joinError}
              </Notice>
            )}
          </div>
        </Card>
      </div>
    </Container>
  );
}

// ───────────────────────── room ─────────────────────────

function Room({ info, room }: { info: LiveJoinInfo; room: UseLiveRoom }) {
  const { state, ticket } = room;
  const { publishShare, respondShare, clearShareGrant, clearError } = room;
  const bearer = ticket?.ticket ?? null;
  const videoEnabled = ticket?.sfuEnabled ?? false;
  const selfPid = state.you?.pid ?? "";

  const [tab, setTab] = useState<Tab>("chat");
  // The host's screen: pulled peer-to-peer for as long as the host is presenting (a new share = a new connection).
  const presenter = useReceiver({
    enabled: videoEnabled && state.presenter !== null && state.connection !== "closed",
    stream: "screen",
    shareKey: state.presenter?.sessionId ?? "",
    sendRtc: room.sendRtc,
    onRtc: room.onRtc,
    ticket,
  });

  // ── unread badges ──
  const unread = useUnread(
    tab,
    {
      chat: state.chat.filter((m) => m.from !== selfPid).length,
      polls: state.polls.length,
      files: state.files.length,
    },
    state.ready,
  );

  // ── errors from the server fade after a while ──
  useEffect(() => {
    if (!state.error) return;
    const id = window.setTimeout(clearError, 10_000);
    return () => window.clearTimeout(id);
  }, [state.error, clearError]);

  // ── the host asking this student to share their screen ──
  const shareRef = useRef<LocalShare | null>(null);
  const [sharing, setSharing] = useState<LocalShare | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const canShare = canShareScreen() && videoEnabled;

  const endLocalShare = useCallback(
    (tellRoom: boolean) => {
      const share = shareRef.current;
      shareRef.current = null;
      setSharing(null);
      if (share) void share.stop();
      if (tellRoom && share) publishShare(null);
      clearShareGrant();
    },
    [publishShare, clearShareGrant],
  );

  async function acceptShare() {
    if (!state.shareRequestGrant || shareBusy || shareRef.current) return;
    setShareBusy(true);
    setShareError(null);
    setShareNote(null);
    let responded = false;
    try {
      const share = await startStudentShare({
        link: { send: room.sendRtc, onRtc: room.onRtc, iceServers: iceServersOf(ticket) },
        // Called once the screen is captured (so cancelling the browser prompt does not count as accepting).
        beforePublish: () => {
          responded = true;
          respondShare(true);
        },
        onEnded: (reason) => {
          // The browser's own "Stop sharing" button, or the media connection dropped.
          shareRef.current = null;
          setSharing(null);
          publishShare(null);
          clearShareGrant();
          if (reason) setShareError(reason);
        },
      });
      shareRef.current = share;
      setSharing(share);
      publishShare(share.publication);
      clearShareGrant();
    } catch (err) {
      setShareError(describeMediaError(err));
      if (responded) {
        publishShare(null);
        clearShareGrant();
      }
    } finally {
      setShareBusy(false);
    }
  }

  function declineShare() {
    setShareError(null);
    respondShare(false);
  }

  // The host withdrew the request or stopped our share.
  useEffect(() => {
    if (state.shareCancelTick === 0) return;
    if (shareRef.current) {
      endLocalShare(false);
      setShareNote("The host stopped your screen share.");
    } else {
      setShareError(null);
    }
  }, [state.shareCancelTick, endLocalShare]);

  // After a reconnect the room may have forgotten our share: say it again.
  useEffect(() => {
    if (state.connection === "open" && shareRef.current) publishShare(shareRef.current.publication);
  }, [state.connection, publishShare]);

  // Leaving the page stops sharing.
  useEffect(
    () => () => {
      const share = shareRef.current;
      shareRef.current = null;
      if (share) void share.stop();
    },
    [],
  );

  function leave() {
    endLocalShare(true);
    room.leave();
  }

  // ── presenter area ──
  let placeholder: ReactNode;
  if (state.ended) placeholder = "This class has ended.";
  else if (!state.ready) placeholder = <><Loader2 className="size-6 animate-spin" aria-hidden /> Connecting to the class…</>;
  else if (!state.live && !state.presenter) placeholder = "Waiting for the host to start…";
  else if (state.presenter && !videoEnabled) placeholder = "Live video isn't switched on for this class. Chat, polls and files still work.";
  else if (state.presenter && !canReceiveVideo()) placeholder = "This browser can't show live video. Chat, polls and files still work.";
  else if (state.presenter && presenter.status === "full") {
    placeholder = (
      <>
        <p>Video is full right now — chat still works</p>
        <Button size="sm" variant="light" onClick={presenter.retry}>
          Try again
        </Button>
      </>
    );
  } else if (state.presenter && presenter.status === "reconnecting") {
    placeholder = <><Loader2 className="size-6 animate-spin" aria-hidden /> Reconnecting to the host&apos;s screen…</>;
  } else if (state.presenter) placeholder = <><Loader2 className="size-6 animate-spin" aria-hidden /> Connecting to the host&apos;s screen…</>;
  else placeholder = "Host is not sharing right now";

  const tabs = [
    { id: "chat" as const, label: "Chat", badge: unread.chat },
    { id: "polls" as const, label: "Polls", badge: unread.polls },
    { id: "files" as const, label: "Files", badge: unread.files },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-6 sm:py-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold sm:text-xl">{info.session.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {state.ended ? (
              "Class ended"
            ) : state.live ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <Radio className="size-3.5 text-danger" aria-hidden /> Live now
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden /> Starts {formatTime(info.session.startsAt)}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge connection={state.connection} />
          <Badge tone="neutral">
            <Users className="size-3.5" aria-hidden /> {state.studentCount} watching
          </Badge>
          <Button size="sm" variant="outline" onClick={leave}>
            <LogOut className="size-4" aria-hidden /> Leave
          </Button>
        </div>
      </header>

      {state.connection === "closed" && (
        <Notice tone="error" title="You were disconnected" className="mb-3">
          {state.error ?? "The connection to the room ended."}{" "}
          <button type="button" onClick={leave} className="font-semibold underline underline-offset-2">
            Go back
          </button>
        </Notice>
      )}
      {state.error && state.connection !== "closed" && (
        <Notice tone="warning" className="mb-3">
          <span className="flex items-start justify-between gap-3">
            <span>{state.error}</span>
            <button type="button" onClick={clearError} aria-label="Dismiss message" className="shrink-0 text-muted hover:text-ink">
              <X className="size-4" aria-hidden />
            </button>
          </span>
        </Notice>
      )}
      {state.ended && (
        <Notice tone="info" title="This class has ended" className="mb-3">
          Thanks for joining. Files shared in class stay available here for a few days.
        </Notice>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          {state.shareRequestGrant && !sharing && (
            <div role="alert" className="rounded-2xl border border-accent/40 bg-accent-soft p-4 text-ink">
              <p className="flex items-center gap-2 font-semibold">
                <MonitorUp className="size-5 shrink-0" aria-hidden /> The host asks you to share your screen
              </p>
              {canShare ? (
                <>
                  <p className="mt-1 text-sm text-ink-soft">
                    Only the host will see it. You choose what to share, and you can stop at any time.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => void acceptShare()} disabled={shareBusy}>
                      {shareBusy ? "Starting…" : "Accept"}
                    </Button>
                    <Button variant="outline" onClick={declineShare} disabled={shareBusy}>
                      Decline
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm text-ink-soft">
                    {videoEnabled
                      ? "Screen sharing isn't supported on this device — it needs a computer with Chrome, Edge or Firefox. You can tell the host in the chat."
                      : "Screen sharing isn't switched on for this class yet. You can tell the host in the chat."}
                  </p>
                  <div className="mt-3">
                    <Button variant="outline" onClick={declineShare}>
                      Dismiss
                    </Button>
                  </div>
                </>
              )}
              {shareError && <p className="mt-2 text-sm text-danger">{shareError}</p>}
            </div>
          )}

          {sharing && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-3 text-ink">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="size-2 animate-rec rounded-full bg-danger" aria-hidden /> You are sharing your screen
              </span>
              <Button size="sm" variant="danger" onClick={() => endLocalShare(true)}>
                Stop sharing
              </Button>
            </div>
          )}
          {!sharing && !state.shareRequestGrant && (shareNote || shareError) && (
            <Notice tone={shareError ? "error" : "info"}>{shareError ?? shareNote}</Notice>
          )}

          <VideoTile stream={presenter.stream} label={presenter.stream ? "Host's screen" : undefined} placeholder={placeholder} />
        </div>

        <Card className="flex h-[30rem] min-w-0 flex-col overflow-hidden lg:h-[calc(100dvh-10rem)] lg:min-h-[30rem]">
          <Tabs tabs={tabs} active={tab} onChange={setTab} label="Class tools" />

          <TabPanel id="chat" active={tab === "chat"}>
            <ChatPanel
              messages={state.chat}
              selfPid={selfPid}
              senderLabel={(m) => (m.from === selfPid ? null : m.to === null ? "Host (to everyone)" : "Host")}
              onSend={(text) => room.sendChat(text)}
              disabled={state.connection === "closed"}
              disabledReason="Disconnected"
              placeholder="Message the host…"
              emptyText="No messages yet. Ask the host a question — it's private."
              notice={
                <span className="flex items-start gap-1.5">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    Private chat with the host. <strong className="font-semibold text-ink-soft">Only the host can see your messages</strong> —
                    other students can&apos;t.
                  </span>
                </span>
              }
              logLabel="Chat with the host"
            />
          </TabPanel>

          <TabPanel id="polls" active={tab === "polls"} className="overflow-y-auto p-3">
            <PollPanel polls={state.polls} role="student" onVote={room.vote} emptyText="No polls yet. When the host asks a question it will show up here." />
          </TabPanel>

          <TabPanel id="files" active={tab === "files"} className="overflow-y-auto p-3">
            <FilesPanel
              files={state.files}
              httpBase={ticket?.httpBase ?? null}
              room={info.session.id}
              ticket={bearer}
              emptyText="No files yet. Images and documents the host shares will appear here."
            />
          </TabPanel>
        </Card>
      </div>
    </div>
  );
}
