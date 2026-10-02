/**
 * The struck-through "regular price" shown next to a real price (display only —
 * nothing is ever charged at this amount). It is derived from the real price
 * with one admin-set markup so it always follows price changes.
 *
 * Returns null when the markup is off (<= 0) or the price is not positive.
 * The result is rounded to a whole rupee, in paise.
 */
export function anchorPaise(paise: number, markupPercent: number): number | null {
  if (!Number.isFinite(paise) || paise <= 0) return null;
  if (!Number.isFinite(markupPercent) || markupPercent <= 0) return null;
  const rupees = Math.round((paise * (1 + markupPercent / 100)) / 100);
  const anchor = rupees * 100;
  return anchor > paise ? anchor : null;
}
