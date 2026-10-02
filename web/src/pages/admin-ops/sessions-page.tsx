import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarPlus, Link2 } from "lucide-react";
import { formatDateShort, formatTime } from "@shared/format";
import type { AdminSessionsPageData, SessionStatus } from "@shared/pages/admin-ops";
import { ActionForm, SubmitButton } from "@/components/admin-ui";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, Card, cn, Eyebrow, Field, Input, Select, Textarea } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { postTo } from "./post";
import { useKeepPrevious } from "./use-keep-previous";

const statusTone: Record<SessionStatus, "accent" | "success" | "danger"> = {
  scheduled: "accent",
  completed: "success",
  cancelled: "danger",
};

export function Component() {
  usePageMeta({ title: "Sessions" });
  const [params] = useSearchParams();
  const scope = params.get("scope") === "past" ? "past" : "upcoming";
  const { data, error, reload } = useApi<AdminSessionsPageData>(`/api/admin/sessions?scope=${scope}`);
  const shown = useKeepPrevious(data);

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!shown) return <PageSkeleton bare />;
  const switching = data === undefined;

  return (
    <div className="space-y-8">
      <div>
        <Eyebrow>Sessions</Eyebrow>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Class sessions</h1>
      </div>

      <ScheduleForm data={shown} onScheduled={reload} />

      <div>
        <div className="mb-4 flex w-fit gap-1 rounded-full bg-sunken p-1">
          <TabLink href="/admin/sessions" active={scope === "upcoming"}>
            Upcoming
          </TabLink>
          <TabLink href="/admin/sessions?scope=past" active={scope === "past"}>
            Past
          </TabLink>
        </div>

        <Card className="overflow-hidden">
          {switching ? (
            <p className="px-6 py-10 text-center text-sm text-muted">Loading…</p>
          ) : shown.sessions.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">
              {scope === "upcoming" ? "No upcoming sessions scheduled yet." : "No past sessions yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium sm:px-6">Date &amp; time</th>
                    <th className="px-3 py-3 font-medium">Workshop</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Seats</th>
                    {scope === "past" && <th className="px-3 py-3 font-medium">Attended</th>}
                    <th className="px-3 py-3 font-medium">Link</th>
                    <th className="px-4 py-3 sm:px-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap px-4 py-3 sm:px-6">
                        <div className="font-medium text-ink">{formatDateShort(s.startsAt)}</div>
                        <div className="text-xs text-muted">{formatTime(s.startsAt)} IST</div>
                      </td>
                      <td className="px-3 py-3 text-ink-soft">{s.workshopTitle}</td>
                      <td className="px-3 py-3">
                        <Badge tone={statusTone[s.status]}>{s.status}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink-soft">
                        {s.paidCount}/{s.capacity}
                      </td>
                      {scope === "past" && <td className="px-3 py-3 text-ink-soft">{s.attendedCount}</td>}
                      <td className="px-3 py-3">
                        {s.hasMeetingLink ? (
                          <span className="inline-flex items-center gap-1 text-success">
                            <Link2 className="size-3.5" aria-hidden /> Set
                          </span>
                        ) : (
                          <span className="text-muted">Not set</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right sm:px-6">
                        <Link to={`/admin/sessions/${s.id}`} className="text-sm font-semibold text-accent-strong hover:underline">
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={href}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
        active ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

function ScheduleForm({ data, onScheduled }: { data: AdminSessionsPageData; onScheduled: () => void }) {
  const { liveWorkshops, plannedWorkshops, defaultCapacity, defaultPricePaise } = data;

  return (
    <details className="group rounded-2xl border border-line bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 font-display text-lg font-bold text-ink">
        <span className="flex items-center gap-2">
          <CalendarPlus className="size-5 text-accent-strong" aria-hidden /> Schedule a session
        </span>
        <span className="text-sm font-medium text-muted group-open:hidden">Show</span>
        <span className="hidden text-sm font-medium text-muted group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-line px-6 py-6">
        <ActionForm
          action={postTo("/api/admin/sessions")}
          onDone={(r) => r.ok && onScheduled()}
          resetOnSuccess
          className="space-y-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Workshop" htmlFor="workshopSlug" className="sm:col-span-2">
              <Select id="workshopSlug" name="workshopSlug" required defaultValue="">
                <option value="" disabled>
                  Choose a workshop…
                </option>
                <optgroup label="Live">
                  {liveWorkshops.map((w) => (
                    <option key={w.slug} value={w.slug}>
                      {w.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Planned">
                  {plannedWorkshops.map((w) => (
                    <option key={w.slug} value={w.slug}>
                      {w.title}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>
            <Field label="Date" htmlFor="date">
              <Input id="date" name="date" type="date" required />
            </Field>
            <Field label="Time (IST)" htmlFor="time">
              <Input id="time" name="time" type="time" defaultValue="17:00" required />
            </Field>
            <Field label="Capacity" htmlFor="capacity">
              <Input id="capacity" name="capacity" type="number" min={1} defaultValue={defaultCapacity} required />
            </Field>
            <Field label="Price (₹)" htmlFor="price">
              <Input id="price" name="price" type="number" min={0} step="1" defaultValue={defaultPricePaise / 100} required />
            </Field>
            <Field label="Meeting link" htmlFor="meetingLink" optional hint="Zoom/Meet link — can be added later.">
              <Input id="meetingLink" name="meetingLink" type="url" placeholder="https://meet.google.com/…" />
            </Field>
            <Field label="Notes" htmlFor="notes" optional className="sm:col-span-2">
              <Textarea id="notes" name="notes" rows={2} placeholder="Internal notes — not shown to students." />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Tip: scheduling a &ldquo;planned&rdquo; workshop makes it bookable on the site — remember to change its status
            to <code className="font-mono">live</code> under <code className="font-mono">Classes</code> in the admin menu.
          </p>
          <SubmitButton pendingLabel="Scheduling…">Schedule session</SubmitButton>
        </ActionForm>
      </div>
    </details>
  );
}
