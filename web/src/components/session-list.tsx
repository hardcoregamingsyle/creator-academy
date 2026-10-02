import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { dateParts, formatTimeRange } from "@shared/format";
import type { ClassSession } from "@/lib/types";
import { CategoryIcon } from "./brand";
import { Price } from "./price";
import { Badge, buttonClass, cn } from "./ui";

/** Seats-left indicator — honest numbers, no fake urgency. */
export function SeatsLeft({ session, className, dark }: { session: ClassSession; className?: string; dark?: boolean }) {
  if (session.seatsLeft <= 0) return <Badge tone="danger" className={className}>Full</Badge>;
  if (session.seatsLeft <= 5) return <Badge tone="warning" className={className}>{session.seatsLeft} seats left</Badge>;
  if (dark) {
    return (
      <span className={cn("inline-flex items-center rounded-full bg-dark-surface px-2.5 py-1 text-xs font-semibold text-on-dark ring-1 ring-dark-line", className)}>
        {session.seatsLeft} of {session.capacity} seats open
      </span>
    );
  }
  return <Badge tone="neutral" className={className}>{session.seatsLeft} of {session.capacity} seats open</Badge>;
}

export function DateChip({ iso, dark }: { iso: string; dark?: boolean }) {
  const p = dateParts(iso);
  return (
    <div
      className={cn(
        "flex w-16 shrink-0 flex-col items-center justify-center rounded-xl py-2 text-center",
        dark ? "bg-dark-surface text-on-dark" : "bg-paper text-ink ring-1 ring-line",
      )}
    >
      <span className="font-mono text-[11px] uppercase tracking-wider text-accent-strong">{p.weekday}</span>
      <span className="font-display text-2xl font-bold leading-none">{p.day}</span>
      <span className={cn("text-xs", dark ? "text-on-dark-muted" : "text-muted")}>{p.month}</span>
    </div>
  );
}

/**
 * List of upcoming sessions, each with a Book button that goes to checkout.
 * `showWorkshop` shows the workshop title (for mixed lists like the schedule).
 */
export function SessionList({
  sessions,
  showWorkshop = true,
  className,
}: {
  sessions: ClassSession[];
  showWorkshop?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card", className)}>
      {sessions.map((s) => {
        const full = s.seatsLeft <= 0;
        return (
          <li key={s.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <DateChip iso={s.startsAt} />
              <div className="min-w-0">
                {showWorkshop && s.workshop && (
                  <Link
                    to={`/classes/${s.workshop.slug}`}
                    className="flex items-center gap-2 font-display text-lg font-bold leading-snug text-ink hover:underline"
                  >
                    <CategoryIcon category={s.workshop.category} className="size-4 shrink-0 text-muted" />
                    <span className="truncate">{s.workshop.title}</span>
                  </Link>
                )}
                <p className={cn("text-[15px] text-ink-soft", !showWorkshop && "font-semibold text-ink")}>
                  {formatTimeRange(s.startsAt, s.durationMin)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <SeatsLeft session={s} />
                  {s.workshop && <span className="text-sm text-muted">Leave with: {s.workshop.outcome}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 sm:justify-end">
              <Price paise={s.pricePaise} className="font-display text-xl font-bold text-ink" />
              {full ? (
                <span className={buttonClass("outline", "md", "pointer-events-none opacity-60")}>Full</span>
              ) : (
                <Link to={`/book/${s.id}`} className={buttonClass("primary", "md")}>
                  Book <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
