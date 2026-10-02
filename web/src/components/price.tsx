import { formatINR } from "@shared/format";
import { anchorPaise } from "@shared/pricing";
import { useSite } from "@/lib/site-context";
import { cn } from "./ui";

/**
 * The struck-through "regular price" for a real price (paise), or null when the
 * admin has switched the markup off. Display only — nothing is charged at it.
 * Always computed from the price BEFORE any returning-student discount.
 */
export function useAnchor(paise: number): number | null {
  const { anchorMarkupPercent } = useSite().pricing;
  return anchorPaise(paise, anchorMarkupPercent);
}

/**
 * A price figure with its struck-through anchor in front of it, inline and
 * baseline-aligned: `<s>₹530</s> ₹279`. With no anchor it renders just the real
 * price in a plain span, exactly like a bare `formatINR(paise)`.
 *
 * - `className` styles the whole figure (font, size, colour of the real price).
 * - The anchor is a little smaller and muted; `strikeClassName` replaces its
 *   default colour (`text-muted`), e.g. pass `text-on-dark-muted` on a dark surface.
 * - `comparePaise` overrides the computed anchor (pass `null` to suppress it).
 *
 * Each figure never breaks mid-number; in a narrow flex row the anchor wraps
 * above the real price instead. Screen readers hear "Regular price ₹530 Now ₹279".
 */
export function Price({
  paise,
  comparePaise,
  className,
  strikeClassName,
}: {
  paise: number;
  comparePaise?: number | null;
  className?: string;
  strikeClassName?: string;
}) {
  const computed = useAnchor(paise);
  const anchor = comparePaise === undefined ? computed : comparePaise !== null && comparePaise > paise ? comparePaise : null;

  if (anchor === null) return <span className={className}>{formatINR(paise)}</span>;

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <s className={cn("whitespace-nowrap text-[0.75em] font-medium", strikeClassName ?? "text-muted")}>
        <span className="sr-only">Regular price </span>
        {formatINR(anchor)}
      </s>
      <span className="whitespace-nowrap">
        <span className="sr-only">Now </span>
        {formatINR(paise)}
      </span>
    </span>
  );
}
