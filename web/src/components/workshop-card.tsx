import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, Check } from "lucide-react";
import { getCategory, type Workshop } from "@shared/content";
import { formatDateShort, formatTime } from "@shared/format";
import { CategoryIcon } from "./brand";
import { Price } from "./price";
import { Badge, cn } from "./ui";

export function WorkshopStatusBadge({ status }: { status: Workshop["status"] }) {
  if (status === "live") return <Badge tone="success">Booking open</Badge>;
  if (status === "planned") return <Badge tone="blue">Coming soon</Badge>;
  return <Badge tone="neutral">On the roadmap</Badge>;
}

/**
 * Catalogue card for a workshop. Leads with the promise (what you'll be able
 * to do) and the concrete outcome (what you'll leave with).
 */
export function WorkshopCard({
  workshop,
  workshopPricePaise,
  nextSessionAt,
  className,
}: {
  workshop: Workshop;
  workshopPricePaise: number;
  /** ISO start time of the next bookable session, if any. */
  nextSessionAt?: string | null;
  className?: string;
}) {
  const category = getCategory(workshop.category);
  return (
    <Link
      to={`/classes/${workshop.slug}`}
      className={cn(
        "lift-hover group relative flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-card hover:border-line-strong hover:shadow-lift",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-muted">
          <span className="flex size-8 items-center justify-center rounded-lg bg-sunken text-ink">
            <CategoryIcon category={workshop.category} className="size-4" />
          </span>
          {category?.name}
        </span>
        <WorkshopStatusBadge status={workshop.status} />
      </div>

      <h3 className="mt-5 text-xl font-bold leading-snug text-ink">{workshop.title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{workshop.promise}</p>

      <div className="mt-5 rounded-xl bg-paper px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">You leave with</p>
        <p className="mt-1 flex items-center gap-2 font-semibold text-ink">
          <Check className="size-4 shrink-0 text-track-green" aria-hidden strokeWidth={2.5} />
          {workshop.outcome}
        </p>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-6">
        <div className="text-sm text-muted">
          {workshop.status === "live" ? (
            <>
              <Price paise={workshopPricePaise} className="font-display text-lg font-bold text-ink" />
              <span className="mx-1.5">·</span>
              {workshop.durationMin} min live
              {nextSessionAt ? (
                <span className="mt-1 flex items-center gap-1.5 text-ink-soft">
                  <CalendarDays className="size-3.5" aria-hidden />
                  Next: {formatDateShort(nextSessionAt)}, {formatTime(nextSessionAt)}
                </span>
              ) : (
                <span className="mt-1 block">New dates announced soon</span>
              )}
            </>
          ) : (
            <span>{workshop.status === "planned" ? "Get notified when it opens" : "Vote to bring it sooner"}</span>
          )}
        </div>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink transition-colors group-hover:border-ink group-hover:bg-deep group-hover:text-on-dark"
          aria-hidden
        >
          <ArrowUpRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
