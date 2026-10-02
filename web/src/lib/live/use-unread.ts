import { useEffect, useState } from "react";

/**
 * Unread counters for tabs/threads. `totals` is how many items each key has so
 * far; whatever exists when `ready` first turns true counts as already seen
 * (history replayed on join), and later arrivals count as unread until `active`
 * (the key being looked at, or null when nothing is visible) catches up.
 */
export function useUnread(active: string | null, totals: Record<string, number>, ready: boolean): Record<string, number> {
  const [seen, setSeen] = useState<Record<string, number> | null>(null);
  const signature = Object.keys(totals)
    .sort()
    .map((k) => `${k}:${totals[k]}`)
    .join("|");

  useEffect(() => {
    if (!ready) return;
    setSeen((prev) => {
      if (prev === null) return { ...totals };
      if (active !== null && prev[active] !== (totals[active] ?? 0)) return { ...prev, [active]: totals[active] ?? 0 };
      return prev;
    });
    // `signature` stands in for `totals`, which is a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, active, signature]);

  const out: Record<string, number> = {};
  for (const key of Object.keys(totals)) {
    out[key] = seen === null ? 0 : Math.max(0, totals[key] - (seen[key] ?? 0));
  }
  return out;
}
