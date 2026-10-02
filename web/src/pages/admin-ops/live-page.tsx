import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Mic, MicOff, MonitorOff, MonitorUp, Play, Square, Users, X } from "lucide-react";
import { formatDateLong, formatTimeRange } from "@shared/format";
import type { AdminLiveInfo } from "@shared/live";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { ConnectionBadge } from "@/components/live/connection-badge";
import { PollPanel } from "@/components/live/poll-panel";
import { TabPanel, Tabs } from "@/components/live/tabs";
import { VideoTile } from "@/components/live/video-tile";
import { NotFound } from "@/components/not-found";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, Button, Card, Eyebrow, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { canShareScreen, describeMediaError, startScreenShare, type ScreenShare } from "@/lib/live/sfu";
import { useLiveRoom } from "@/lib/live/use-live-room";
import { useSubscription } from "@/lib/live/use-subscription";
import { useUnread } from "@/lib/live/use-unread";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { buildThreads, EVERYONE, FilesAdmin, HostChat, PeoplePanel, PollComposer } from "./live-panels";
import { enc } from "./post";

type Tab = "chat" | "people" | "polls" | "files";

export function Component() {
  const { id } = useParams();
  const { data, error, reload } = useApi<AdminLiveInfo>(id ? `/api/admin/live/${enc(id)}` : null);
  usePageMeta({ title: data ? `Live · ${data.session.title}` : "Live class" });

  if (error?.status === 404) return <NotFound />;
  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton bare />;
  return <Console info={data} />;
}

function omit<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

function Console({ info }: { info: AdminLiveInfo }) {
  const sessionId = info.session.id;
  const room = useLiveRoom({ kind: "host", sessionId });
  const { state, ticket, join, setPresenter, cancelShare } = room;
  const bearer = ticket?.ticket ?? null;
  const sfuEnabled = ticket?.sfuEnabled ?? false;
  const connected = state.connection === "open";

  // The host opens the room as soon as the console loads.
  useEffect(() => {
    void join();
  }, [join, sessionId]);

  // ── class state ──
  const live = state.ready ? state.live : info.liveStartedAt !== null && info.liveEndedAt === null;
  const ended = state.ready ? state.ended : info.liveEndedAt !== null;
  const [busy, setBusy] = useState<"start" | "end" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── the host's own screen share ──
  const shareRef = useRef<ScreenShare | null>(null);
  const [local, setLocal] = useState<ScreenShare | null>(null);
  const [starting, setStarting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const supported = canShareScreen();

  const stopShare = useCallback(() => {
    const share = shareRef.current;
    shareRef.current = null;
    setLocal(null);
    if (share) {
      void share.stop();
      setPresenter(null);
    }
  }, [setPresenter]);

  async function startShare() {
    if (starting || shareRef.current || !bearer) return;
    setStarting(true);
    setShareError(null);
    try {
      const share = await startScreenShare({
        ticket: bearer,
        withMic: micOn,
        onEnded: (reason) => {
          // The browser's own "Stop sharing" bar, or the media connection dropped.
          shareRef.current = null;
          setLocal(null);
          setPresenter(null);
          if (reason) setShareError(reason);
        },
      });
      shareRef.current = share;
      setLocal(share);
      setPresenter(share.publication);
      if (share.warning) setShareError(share.warning);
    } catch (err) {
      setShareError(describeMediaError(err));
    } finally {
      setStarting(false);
    }
  }

  // Mic switch: mutes the published track (no renegotiation).
  useEffect(() => {
    shareRef.current?.setMicEnabled(micOn);
  }, [micOn, local]);

  // After a reconnect the room may have lost the announcement: repeat it.
  useEffect(() => {
    if (state.connection === "open" && shareRef.current) setPresenter(shareRef.current.publication);
  }, [state.connection, setPresenter]);

  // A page reload leaves a stale announcement behind (its media died with the old page): withdraw it once.
  const clearedStale = useRef(false);
  useEffect(() => {
    if (!state.ready || clearedStale.current) return;
    clearedStale.current = true;
    if (state.presenter && !shareRef.current) setPresenter(null);
  }, [state.ready, state.presenter, setPresenter]);

  // Leaving the console stops sharing.
  useEffect(
    () => () => {
      const share = shareRef.current;
      shareRef.current = null;
      if (share) void share.stop();
    },
    [],
  );

  // ── class start / end ──
  async function startClass() {
    setBusy("start");
    setActionError(null);
    try {
      await api.post(`/api/admin/live/${enc(sessionId)}/start`);
      if (!room.startClass()) setActionError("The room connection dropped before the class could start. Please press Start class again.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function endClass() {
    if (!window.confirm("End the class for everyone? Students will see that it has ended and screen sharing will stop.")) return;
    setBusy("end");
    setActionError(null);
    stopShare();
    try {
      await api.post(`/api/admin/live/${enc(sessionId)}/end`);
      if (!room.endClass()) setActionError("The room connection dropped before the class could end. Please press End class again.");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // ── a student's screen ──
  const studentView = useSubscription(state.studentShare?.media ?? null, bearer, sfuEnabled);
  const [requested, setRequested] = useState<Record<string, number>>({});
  const prevSharing = useRef<string | null>(null);
  useEffect(() => {
    const now = state.studentShare?.pid ?? null;
    const before = prevSharing.current;
    prevSharing.current = now;
    if (before && !now) setRequested((r) => omit(r, before));
  }, [state.studentShare]);

  function requestScreen(pid: string) {
    if (room.requestShare(pid)) setRequested((r) => ({ ...r, [pid]: Date.now() }));
    else setActionError("The room connection dropped — try again in a moment.");
  }
  function cancelRequest(pid: string) {
    cancelShare(pid);
    setRequested((r) => omit(r, pid));
  }

  // ── tabs & chat threads ──
  const [tab, setTab] = useState<Tab>("chat");
  const [selectedThread, setSelectedThread] = useState<string>(EVERYONE);
  const threads = useMemo(() => buildThreads(state), [state.chat, state.participants]); // eslint-disable-line react-hooks/exhaustive-deps
  const currentThread = threads.find((t) => t.id === selectedThread) ?? threads[0];
  const totals = useMemo(() => Object.fromEntries(threads.map((t) => [t.id, t.incoming])), [threads]);
  const unread = useUnread(tab === "chat" ? currentThread.id : null, totals, state.ready);
  const chatUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  const tabs = [
    { id: "chat" as const, label: "Chat", badge: chatUnread },
    { id: "people" as const, label: `People${state.participants.length ? ` (${state.participants.filter((p) => p.online).length})` : ""}` },
    { id: "polls" as const, label: "Polls" },
    { id: "files" as const, label: "Files" },
  ];

  // Errors from the room fade after a while.
  const { clearError } = room;
  useEffect(() => {
    if (!state.error) return;
    const id = window.setTimeout(clearError, 10_000);
    return () => window.clearTimeout(id);
  }, [state.error, clearError]);

  const status = ended ? { label: "Ended", tone: "neutral" as const } : live ? { label: "Live", tone: "danger" as const } : { label: "Not started", tone: "warning" as const };

  return (
    <div className="space-y-5">
      <div>
        <Link to={`/admin/sessions/${enc(sessionId)}`} className="text-sm font-medium text-muted hover:text-ink">
          ← Session details
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Live class</Eyebrow>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{info.session.title}</h1>
            <p className="mt-1 text-muted">
              {formatDateLong(info.session.startsAt)} · {formatTimeRange(info.session.startsAt, info.session.durationMin)}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              <ConnectionBadge connection={state.connection} />
              <Badge tone="neutral">
                <Users className="size-3.5" aria-hidden /> {state.studentCount} online · {info.registered} registered
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void startClass()} disabled={!connected || live || ended || busy !== null}>
                <Play className="size-4" aria-hidden /> {busy === "start" ? "Starting…" : "Start class"}
              </Button>
              <Button variant="danger" onClick={() => void endClass()} disabled={!connected || !live || busy !== null}>
                <Square className="size-4" aria-hidden /> {busy === "end" ? "Ending…" : "End class"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {room.phase === "failed" && (
        <Notice tone="error" title="We couldn't open the live room">
          {room.joinError}{" "}
          <button type="button" onClick={() => void join()} className="font-semibold underline underline-offset-2">
            Try again
          </button>
        </Notice>
      )}
      {actionError && (
        <Notice tone="error">
          <span className="flex items-start justify-between gap-3">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss" className="shrink-0 text-muted hover:text-ink">
              <X className="size-4" aria-hidden />
            </button>
          </span>
        </Notice>
      )}
      {state.error && <Notice tone="warning">{state.error}</Notice>}
      {ticket && !ticket.sfuEnabled && (
        <Notice tone="info" title="Screen sharing isn't switched on yet">
          Screen sharing needs the Cloudflare Realtime keys — chat, polls and files already work.
        </Notice>
      )}
      {!supported && (
        <Notice tone="warning">This browser can&apos;t share a screen. Open the console in Chrome, Edge or Firefox on a computer to present.</Notice>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <VideoTile
            stream={local?.stream ?? null}
            muted
            label={local ? "Your screen (preview)" : undefined}
            placeholder={
              <>
                <MonitorUp className="size-8" aria-hidden />
                <p className="font-semibold text-on-dark">You&apos;re not sharing</p>
                <p>Press &ldquo;Share screen&rdquo; and choose a window or tab to show students.</p>
              </>
            }
          />

          <div className="flex flex-wrap items-center gap-2">
            {local ? (
              <Button variant="danger" onClick={stopShare}>
                <MonitorOff className="size-4" aria-hidden /> Stop sharing
              </Button>
            ) : (
              <Button onClick={() => void startShare()} disabled={!supported || !sfuEnabled || !connected || starting || !bearer}>
                <MonitorUp className="size-4" aria-hidden /> {starting ? "Starting…" : "Share screen"}
              </Button>
            )}
            <Button
              variant="outline"
              aria-pressed={micOn}
              onClick={() => setMicOn((on) => !on)}
              disabled={Boolean(local) && !local?.hasMic}
              title={local && !local.hasMic ? "This share started without a microphone — stop and share again to add it." : undefined}
            >
              {micOn ? <Mic className="size-4" aria-hidden /> : <MicOff className="size-4" aria-hidden />} Mic {micOn ? "on" : "off"}
            </Button>
            {local && (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="size-2 animate-rec rounded-full bg-danger" aria-hidden /> Sharing with students
              </span>
            )}
          </div>
          <p className="text-xs text-muted">
            Tip: share a single window or tab instead of the whole screen so the preview doesn&apos;t mirror itself. Your microphone is switched on
            only when you start sharing.
          </p>
          {shareError && (
            <Notice tone={local ? "warning" : "error"}>
              {shareError}
            </Notice>
          )}

          {state.studentShare && (
            <div className="max-w-2xl">
              <VideoTile
                stream={studentView.stream}
                muted
                label={`${state.studentShare.name}'s screen`}
                actions={
                  <Button size="sm" variant="danger" onClick={() => cancelShare(state.studentShare!.pid)} aria-label={`Stop ${state.studentShare.name}'s screen share`}>
                    Stop
                  </Button>
                }
                placeholder={
                  studentView.status === "failed" ? (
                    <>
                      <p>{studentView.error}</p>
                      <Button size="sm" variant="light" onClick={studentView.retry}>
                        Try again
                      </Button>
                    </>
                  ) : (
                    "Connecting to the student's screen…"
                  )
                }
              />
            </div>
          )}
        </div>

        <Card className="flex h-[34rem] min-w-0 flex-col overflow-hidden xl:h-[calc(100dvh-8rem)] xl:min-h-[34rem]">
          <Tabs tabs={tabs} active={tab} onChange={setTab} label="Live class tools" />

          <TabPanel id="chat" active={tab === "chat"}>
            <HostChat
              threads={threads}
              selectedId={currentThread.id}
              onSelect={setSelectedThread}
              unread={unread}
              disabled={state.connection === "closed"}
              onSend={(text) => room.sendChat(text, currentThread.id === EVERYONE ? undefined : currentThread.id)}
            />
          </TabPanel>

          <TabPanel id="people" active={tab === "people"} className="overflow-y-auto p-3">
            <PeoplePanel
              participants={state.participants}
              sharingPid={state.studentShare?.pid ?? null}
              requested={requested}
              responses={state.shareResponses}
              sfuEnabled={sfuEnabled}
              onRequest={requestScreen}
              onCancel={cancelRequest}
            />
          </TabPanel>

          <TabPanel id="polls" active={tab === "polls"} className="space-y-3 overflow-y-auto p-3">
            <PollComposer onCreate={room.createPoll} />
            <PollPanel polls={state.polls} role="host" onClose={room.closePoll} emptyText="No polls yet. Create one above." />
          </TabPanel>

          <TabPanel id="files" active={tab === "files"} className="overflow-y-auto p-3">
            <FilesAdmin
              files={state.files}
              httpBase={ticket?.httpBase ?? null}
              room={sessionId}
              ticket={bearer}
              disabled={!connected}
            />
          </TabPanel>
        </Card>
      </div>
    </div>
  );
}
