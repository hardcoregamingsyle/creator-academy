import { useMemo } from "react";
import { Check, Lock } from "lucide-react";
import type { Poll } from "@shared/live";
import { Badge, Button, cn } from "@/components/ui";

function OptionRow({
  label,
  count,
  total,
  showBar,
  mine,
  onClick,
  pressed,
}: {
  label: string;
  count: number;
  total: number;
  showBar: boolean;
  mine?: boolean;
  /** Present when the row is a vote button. */
  onClick?: () => void;
  pressed?: boolean;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const inner = (
    <>
      {showBar && <span aria-hidden className="absolute inset-y-0 left-0 bg-accent-soft transition-[width] duration-300" style={{ width: `${pct}%` }} />}
      <span className="relative flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          {mine && <Check className="size-4 shrink-0 text-accent-strong" aria-hidden />}
          <span className="min-w-0 break-words">{label}</span>
          {mine && <span className="sr-only">(your vote)</span>}
        </span>
        {showBar && (
          <span className="shrink-0 text-xs font-semibold text-ink-soft">
            {count} · {pct}%
          </span>
        )}
      </span>
    </>
  );
  const base = "relative block w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm text-ink";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        className={cn(base, pressed ? "border-accent-strong" : "border-line-strong hover:border-ink")}
      >
        {inner}
      </button>
    );
  }
  return <div className={cn(base, mine ? "border-accent-strong" : "border-line")}>{inner}</div>;
}

function PollCard({
  poll,
  role,
  onVote,
  onClose,
}: {
  poll: Poll;
  role: "host" | "student";
  onVote?: (pollId: string, option: number) => void;
  onClose?: (pollId: string) => void;
}) {
  const results = poll.results;
  const total = results?.total ?? 0;
  const canVote = role === "student" && poll.open && onVote;
  return (
    <section className="rounded-2xl border border-line bg-surface p-3.5" aria-label={`Poll: ${poll.question}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-bold leading-snug text-ink">{poll.question}</h3>
        <Badge tone={poll.open ? "success" : "neutral"} className="shrink-0">
          {poll.open ? "Open" : "Closed"}
        </Badge>
      </div>

      <div className="mt-3 space-y-2">
        {poll.options.map((opt, i) => (
          <OptionRow
            key={i}
            label={opt}
            count={results?.counts[i] ?? 0}
            total={total}
            showBar={Boolean(results)}
            mine={poll.myVote === i}
            pressed={canVote ? poll.myVote === i : undefined}
            onClick={canVote ? () => onVote(poll.id, i) : undefined}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {results ? `${total} ${total === 1 ? "vote" : "votes"}` : role === "student" && poll.open ? "Results appear when the poll closes" : ""}
          {role === "host" && poll.open && !poll.showResults && " · hidden from students until closed"}
        </span>
        {role === "student" && poll.open && (
          <span>{poll.myVote == null ? "Tap an option to vote" : "You can change your vote until it closes"}</span>
        )}
        {role === "host" && poll.open && onClose && (
          <Button type="button" size="sm" variant="outline" onClick={() => onClose(poll.id)}>
            <Lock className="size-3.5" aria-hidden /> Close poll
          </Button>
        )}
      </div>
    </section>
  );
}

/** Lists polls (open first, newest first). Students vote with `onVote`; the host closes polls with `onClose`. */
export function PollPanel({
  polls,
  role,
  onVote,
  onClose,
  emptyText,
}: {
  polls: Poll[];
  role: "host" | "student";
  onVote?: (pollId: string, option: number) => void;
  onClose?: (pollId: string) => void;
  emptyText: string;
}) {
  const sorted = useMemo(() => [...polls].sort((a, b) => Number(b.open) - Number(a.open) || b.createdAt - a.createdAt), [polls]);
  if (sorted.length === 0) return <p className="py-8 text-center text-sm text-muted">{emptyText}</p>;
  return (
    <div className="space-y-3" aria-live="polite">
      {sorted.map((p) => (
        <PollCard key={p.id} poll={p} role={role} onVote={onVote} onClose={onClose} />
      ))}
    </div>
  );
}
