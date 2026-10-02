import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/components/ui";

export type TabDef<T extends string> = {
  id: T;
  label: string;
  /** Unread/attention count; hidden when 0. */
  badge?: number;
};

/** Small accent pill with a count (hidden for 0). Screen readers get "N unread". */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-accent-strong px-1.5 py-0.5 text-[11px] font-bold leading-none text-paper",
        className,
      )}
    >
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{count} unread</span>
    </span>
  );
}

/** Accessible tab list (arrow keys, Home/End). Pair each tab with a <TabPanel>. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
  className,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === -1) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn("flex gap-1 border-b border-line px-2 pt-2", className)}>
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`live-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`live-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold",
              selected ? "border-accent-strong text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
            {!selected && t.badge ? <CountBadge count={t.badge} /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Content for one tab. Hidden (not unmounted) when inactive so drafts and scroll positions survive tab switches. */
export function TabPanel({ id, active, children, className }: { id: string; active: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      role="tabpanel"
      id={`live-panel-${id}`}
      aria-labelledby={`live-tab-${id}`}
      hidden={!active}
      className={cn(active ? "flex" : "hidden", "min-h-0 flex-1 flex-col", className)}
    >
      {children}
    </div>
  );
}
