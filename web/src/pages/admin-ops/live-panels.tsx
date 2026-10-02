import { useRef, useState, type FormEvent } from "react";
import { Megaphone, Paperclip, Plus, Trash2, X } from "lucide-react";
import { LIVE_LIMITS, type ChatMessage, type Participant, type SharedFile } from "@shared/live";
import { ChatPanel } from "@/components/live/chat-panel";
import { FilesPanel } from "@/components/live/files-panel";
import { CountBadge } from "@/components/live/tabs";
import { Badge, Button, Field, Input, cn } from "@/components/ui";
import type { RoomState, ShareResponse } from "@/lib/live/room-client";
import { checkUpload, formatBytes, UPLOAD_ACCEPT, uploadFile } from "@/lib/live/upload";
import { errorMessage } from "@/lib/api";

// ───────────────────────── chat threads ─────────────────────────

export type Thread = {
  /** "all" for the broadcast thread, otherwise the student's pid. */
  id: string;
  name: string;
  online: boolean;
  messages: ChatMessage[];
  /** Messages the student has sent (what can be unread). */
  incoming: number;
  lastAt: number;
};

export const EVERYONE = "all";

/** "Everyone" + one thread per student who has written or is online (online and recently active first). */
export function buildThreads(state: Pick<RoomState, "chat" | "participants">): Thread[] {
  const names = new Map<string, string>();
  const online = new Set<string>();
  for (const p of state.participants) {
    names.set(p.pid, p.name);
    if (p.online) online.add(p.pid);
  }
  const everyone: ChatMessage[] = [];
  const byStudent = new Map<string, ChatMessage[]>();
  for (const m of state.chat) {
    // A student's own messages belong to their thread (even if `to` were ever left empty); the host's go where they are addressed.
    const student = m.from === "host" ? m.to : m.from;
    if (student === null) {
      everyone.push(m);
      continue;
    }
    const list = byStudent.get(student);
    if (list) list.push(m);
    else byStudent.set(student, [m]);
    if (m.from !== "host" && !names.has(m.from)) names.set(m.from, m.fromName);
  }

  const ids = new Set<string>([...online, ...byStudent.keys()]);
  const students: Thread[] = [...ids].map((id) => {
    const messages = byStudent.get(id) ?? [];
    return {
      id,
      name: names.get(id) ?? "Student",
      online: online.has(id),
      messages,
      incoming: messages.filter((m) => m.from !== "host").length,
      lastAt: messages.length ? messages[messages.length - 1].at : 0,
    };
  });
  students.sort((a, b) => Number(b.online) - Number(a.online) || b.lastAt - a.lastAt || a.name.localeCompare(b.name));

  return [
    { id: EVERYONE, name: "Everyone", online: true, messages: everyone, incoming: 0, lastAt: everyone.length ? everyone[everyone.length - 1].at : 0 },
    ...students,
  ];
}

export function OnlineDot({ online }: { online: boolean }) {
  return (
    <span className={cn("inline-block size-2 shrink-0 rounded-full", online ? "bg-success" : "bg-line-strong")}>
      <span className="sr-only">{online ? "online" : "offline"}</span>
    </span>
  );
}

export function HostChat({
  threads,
  selectedId,
  onSelect,
  unread,
  onSend,
  disabled,
}: {
  threads: Thread[];
  selectedId: string;
  onSelect: (id: string) => void;
  unread: Record<string, number>;
  /** Send to the selected thread; return false when nothing was sent. */
  onSend: (text: string) => boolean;
  disabled: boolean;
}) {
  const current = threads.find((t) => t.id === selectedId) ?? threads[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul aria-label="Conversations" className="max-h-36 shrink-0 space-y-0.5 overflow-y-auto border-b border-line p-2">
        {threads.map((t) => {
          const selected = t.id === current.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(t.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm",
                  selected ? "bg-accent-soft text-ink" : "text-ink-soft hover:bg-sunken",
                )}
              >
                {t.id === EVERYONE ? <Megaphone className="size-3.5 shrink-0 text-muted" aria-hidden /> : <OnlineDot online={t.online} />}
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                <CountBadge count={unread[t.id] ?? 0} />
              </button>
            </li>
          );
        })}
      </ul>
      <ChatPanel
        key={current.id}
        messages={current.messages}
        selfPid="host"
        senderLabel={() => null}
        onSend={onSend}
        disabled={disabled}
        disabledReason="Disconnected"
        placeholder={current.id === EVERYONE ? "Message every student…" : `Reply to ${current.name}…`}
        emptyText={current.id === EVERYONE ? "Nothing broadcast yet." : `No messages with ${current.name} yet.`}
        notice={
          current.id === EVERYONE
            ? "Sent to every student. They can't see each other's messages or reply to one another."
            : `Private conversation with ${current.name}. Only you and ${current.name} see it.`
        }
        logLabel={`Chat: ${current.name}`}
      />
    </div>
  );
}

// ───────────────────────── people ─────────────────────────

export function PeoplePanel({
  participants,
  sharingPid,
  requested,
  responses,
  sfuEnabled,
  onRequest,
  onCancel,
}: {
  participants: Participant[];
  /** The student whose screen is currently being shown. */
  sharingPid: string | null;
  /** pid -> time the request was sent. */
  requested: Record<string, number>;
  responses: Record<string, ShareResponse>;
  sfuEnabled: boolean;
  onRequest: (pid: string) => void;
  onCancel: (pid: string) => void;
}) {
  const sorted = [...participants].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  const onlineCount = sorted.filter((p) => p.online).length;

  if (sorted.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Nobody has joined yet. Students appear here when they open the room.</p>;
  }

  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        {onlineCount} online · {sorted.length - onlineCount} offline
      </p>
      {!sfuEnabled && <p className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">Screen requests need the Cloudflare Realtime keys.</p>}
      <ul className="divide-y divide-line">
        {sorted.map((p) => {
          const asked = requested[p.pid];
          const reply = responses[p.pid];
          const answered = asked !== undefined && reply !== undefined && reply.at >= asked ? reply : null;
          return (
            <li key={p.pid} className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <OnlineDot online={p.online} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                  <span className="block text-xs text-muted">{p.online ? "Online" : "Offline"}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {sharingPid === p.pid ? (
                  <>
                    <Badge tone="accent">Sharing</Badge>
                    <Button size="sm" variant="outline" onClick={() => onCancel(p.pid)} aria-label={`Stop ${p.name}'s screen share`}>
                      Stop
                    </Button>
                  </>
                ) : answered?.accept ? (
                  <Badge tone="success">Accepted · starting…</Badge>
                ) : answered && !answered.accept ? (
                  <>
                    <Badge tone="danger">Declined</Badge>
                    {p.online && sfuEnabled && (
                      <Button size="sm" variant="ghost" onClick={() => onRequest(p.pid)}>
                        Ask again
                      </Button>
                    )}
                  </>
                ) : asked !== undefined ? (
                  <>
                    <Badge tone="warning">Waiting for reply…</Badge>
                    <Button size="sm" variant="ghost" onClick={() => onCancel(p.pid)} aria-label={`Cancel the request to ${p.name}`}>
                      Cancel
                    </Button>
                  </>
                ) : p.online ? (
                  <Button size="sm" variant="outline" disabled={!sfuEnabled} onClick={() => onRequest(p.pid)} aria-label={`Request ${p.name}'s screen`}>
                    Request screen
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────────────────────── polls ─────────────────────────

export function PollComposer({ onCreate }: { onCreate: (question: string, options: string[], showResults: boolean) => boolean }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [showResults, setShowResults] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim().length > 0 && filled.length >= LIVE_LIMITS.pollMinOptions;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (onCreate(question, options, showResults)) {
      setQuestion("");
      setOptions(["", ""]);
      setProblem(null);
    } else {
      setProblem("Couldn't create the poll — the room connection is down. Try again in a moment.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-sunken/50 p-3">
      <Field label="New poll" htmlFor="poll-question">
        <Input
          id="poll-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={LIVE_LIMITS.pollQuestionMaxChars}
          placeholder="Ask a question…"
        />
      </Field>
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={`Option ${i + 1}`}
              value={opt}
              onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
              maxLength={LIVE_LIMITS.pollOptionMaxChars}
              placeholder={`Option ${i + 1}`}
            />
            {options.length > LIVE_LIMITS.pollMinOptions && (
              <button
                type="button"
                onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove option ${i + 1}`}
                className="shrink-0 rounded-full p-2 text-muted hover:bg-sunken hover:text-ink"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < LIVE_LIMITS.pollMaxOptions && (
        <Button type="button" size="sm" variant="ghost" onClick={() => setOptions((prev) => [...prev, ""])}>
          <Plus className="size-4" aria-hidden /> Add option
        </Button>
      )}
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={showResults}
          onChange={(e) => setShowResults(e.target.checked)}
          className="size-4 rounded border-line-strong accent-[var(--color-accent-strong)]"
        />
        Show live results to students
      </label>
      {problem && (
        <p role="alert" className="text-xs text-danger">
          {problem}
        </p>
      )}
      <Button type="submit" size="sm" disabled={!valid}>
        Start poll
      </Button>
    </form>
  );
}

// ───────────────────────── files ─────────────────────────

type UploadRow = { key: number; name: string; pct: number; error?: string; done?: boolean };

export function FilesAdmin({
  files,
  httpBase,
  room,
  ticket,
  disabled,
}: {
  files: SharedFile[];
  httpBase: string | null;
  room: string;
  ticket: string | null;
  disabled: boolean;
}) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  const patch = (key: number, change: Partial<UploadRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));

  async function onPick(list: FileList | null) {
    const picked = list ? [...list] : [];
    if (inputRef.current) inputRef.current.value = "";
    if (!httpBase || !ticket) return;
    for (const file of picked) {
      const key = ++counter.current;
      const problem = checkUpload(file);
      if (problem) {
        setRows((prev) => [...prev, { key, name: file.name, pct: 0, error: problem }]);
        continue;
      }
      setRows((prev) => [...prev, { key, name: file.name, pct: 0 }]);
      try {
        await uploadFile(httpBase, room, ticket, file, (pct) => patch(key, { pct }));
        patch(key, { pct: 100, done: true });
        window.setTimeout(() => setRows((prev) => prev.filter((r) => r.key !== key)), 2500);
      } catch (err) {
        patch(key, { error: errorMessage(err, "Upload failed. Please try again.") });
      }
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <input
          ref={inputRef}
          id="live-upload"
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="sr-only"
          disabled={disabled || !httpBase || !ticket}
          onChange={(e) => void onPick(e.target.files)}
        />
        <label
          htmlFor="live-upload"
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-sunken/50 px-4 py-4 text-sm font-semibold text-ink-soft hover:border-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-strong",
            (disabled || !httpBase || !ticket) && "pointer-events-none opacity-50",
          )}
        >
          <Paperclip className="size-4" aria-hidden /> Share an image or document
        </label>
        <p className="mt-1.5 text-xs text-muted">
          Images, PDF, Word, PowerPoint, Excel, text or ZIP · up to {formatBytes(LIVE_LIMITS.fileMaxBytes)} each. Every upload goes to all students.
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {rows.map((r) => (
            <li key={r.key} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-ink">{r.name}</span>
                {r.error ? (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                    aria-label={`Dismiss error for ${r.name}`}
                    className="shrink-0 text-muted hover:text-ink"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-muted">{r.done ? "Shared" : `${r.pct}%`}</span>
                )}
              </div>
              {r.error ? (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {r.error}
                </p>
              ) : (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={r.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${r.name}`}>
                  <div className="h-full bg-accent-strong transition-[width]" style={{ width: `${r.pct}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <FilesPanel files={files} httpBase={httpBase} room={room} ticket={ticket} emptyText="Nothing shared yet." />
    </div>
  );
}
