import { classStructure } from "@/content/workshops";
import { cn } from "./ui";

/**
 * The 20 / 60 / 20 class structure drawn as an editing timeline:
 * a timecode ruler, three "clips" on a track, and a playhead.
 */

const clipStyles = {
  explain: "bg-track-blue",
  demonstrate: "bg-accent",
  create: "bg-track-green",
} as const;

/** Minutes → "1:12" style timecode. */
function timecode(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function ClassTimeline({
  durationMin = 90,
  dark,
  showDescriptions = true,
  className,
}: {
  durationMin?: number;
  dark?: boolean;
  showDescriptions?: boolean;
  className?: string;
}) {
  let cursor = 0;
  const clips = classStructure.map((c) => {
    const start = cursor;
    const length = Math.round((durationMin * c.share) / 100);
    cursor += length;
    return { ...c, start, length };
  });

  return (
    <div className={cn("w-full", className)}>
      {/* ruler */}
      <div className={cn("relative h-6 font-mono text-[11px]", dark ? "text-on-dark-muted" : "text-muted")} aria-hidden>
        {[...clips.map((c) => c.start), durationMin].map((t, i, arr) => (
          <span
            key={t}
            className={cn(
              "absolute top-0",
              i === 0 ? "left-0" : i === arr.length - 1 ? "right-0" : "-translate-x-1/2",
            )}
            style={i !== 0 && i !== arr.length - 1 ? { left: `${(t / durationMin) * 100}%` } : undefined}
          >
            {timecode(t)}
          </span>
        ))}
      </div>

      {/* track */}
      <div
        className={cn(
          "relative flex h-14 gap-1 rounded-xl p-1",
          dark ? "bg-dark-surface ring-1 ring-dark-line" : "bg-sunken ring-1 ring-line",
        )}
        role="img"
        aria-label={`Class structure: ${clips.map((c) => `${c.label} ${c.share}%`).join(", ")}`}
      >
        {clips.map((c) => (
          <div
            key={c.key}
            className={cn(
              "flex min-w-0 items-center rounded-lg text-white",
              showDescriptions ? "justify-between px-3" : "justify-center px-1 sm:justify-start sm:px-2",
              clipStyles[c.key],
            )}
            style={{ width: `${c.share}%` }}
          >
            <span className={cn("truncate font-semibold", showDescriptions ? "text-sm" : "text-[11px] sm:text-xs")}>{c.label}</span>
            {showDescriptions && <span className="hidden font-mono text-[11px] opacity-85 sm:inline">{c.share}%</span>}
          </div>
        ))}
        {/* playhead */}
        <div className="pointer-events-none absolute inset-y-[-6px] left-[34%] w-0.5 bg-marker" aria-hidden>
          <div className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-marker" />
        </div>
      </div>

      {showDescriptions && (
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {clips.map((c) => (
            <div key={c.key}>
              <dt className="flex items-center gap-2 font-semibold">
                <span className={cn("size-2.5 rounded-sm", clipStyles[c.key])} aria-hidden />
                <span className={dark ? "text-on-dark" : "text-ink"}>
                  {c.label} <span className={cn("font-mono text-xs font-normal", dark ? "text-on-dark-muted" : "text-muted")}>~{c.length} min</span>
                </span>
              </dt>
              <dd className={cn("mt-1 text-sm", dark ? "text-on-dark-muted" : "text-muted")}>{c.description}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
