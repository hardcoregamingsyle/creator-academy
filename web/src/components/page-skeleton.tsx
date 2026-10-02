import { Container, cn } from "./ui";

/**
 * Lightweight placeholder shown while a page's data (or an admin session check)
 * is loading. `bare` drops the Container for places that already pad their content.
 */
export function PageSkeleton({ className, bare }: { className?: string; bare?: boolean }) {
  const body = (
    <div role="status" aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="h-3 w-28 rounded-full bg-sunken" />
      <div className="mt-5 h-9 w-full max-w-xl rounded-xl bg-sunken sm:h-11" />
      <div className="mt-5 space-y-3">
        <div className="h-4 w-full max-w-2xl rounded-full bg-sunken" />
        <div className="h-4 w-full max-w-lg rounded-full bg-sunken" />
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-52 rounded-2xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
  if (bare) return body;
  return <Container className={cn("py-10 sm:py-14", className)}>{body}</Container>;
}
