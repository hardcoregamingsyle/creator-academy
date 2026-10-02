import { Lightbulb } from "lucide-react";
import { formatDateShort } from "@shared/format";
import type { AdminDemandPageData } from "@shared/pages/admin-ops";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, Card, EmptyState, Notice } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { CopyEmailsButton } from "./copy-emails-button";

const statusTone: Record<string, "success" | "warning" | "neutral"> = {
  live: "success",
  planned: "warning",
  future: "neutral",
};

export function Component() {
  usePageMeta({ title: "Demand" });
  const { data, error, reload } = useApi<AdminDemandPageData>("/api/admin/demand");

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton bare />;

  const { rows, teachNext } = data;

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">What should we teach next?</h1>
      <p className="mt-2 text-muted">Real interest and demand signals from students — nothing invented.</p>

      <Notice tone="info" className="mt-6">
        Schedule more of what fills up; launch planned workshops with the most interest.
      </Notice>

      {/* ── interest table ── */}
      <div className="mt-8 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line bg-sunken/60 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Workshop</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Interested</th>
              <th className="px-4 py-3 font-semibold">Paid seats (live)</th>
              <th className="px-4 py-3 font-semibold">Emails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.workshopSlug} className="align-top">
                <td className="px-4 py-3 font-medium text-ink">{c.workshopTitle}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone[c.status] ?? "neutral"} className="capitalize">
                    {c.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-semibold text-ink">{c.count}</td>
                <td className="px-4 py-3 text-ink-soft">{c.status === "live" ? c.paidSeats : <span className="text-muted">—</span>}</td>
                <td className="px-4 py-3">
                  {c.emails.length === 0 ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-accent-strong">
                        {c.emails.length} {c.emails.length === 1 ? "email" : "emails"}
                      </summary>
                      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-ink-soft">
                        {c.emails.map((e, i) => (
                          <li key={i}>
                            {e.email}
                            {e.name ? ` (${e.name})` : ""}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2">
                        <CopyEmailsButton emails={c.emails.map((e) => e.email)} />
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── free-text answers ── */}
      <h2 className="mt-10 font-display text-xl font-bold">In students&apos; own words</h2>
      {teachNext.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={<Lightbulb className="size-5" aria-hidden />} title="No answers yet">
            When students tell us what to teach next in their feedback, it&apos;ll show up here.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {teachNext.map((t) => (
            <Card key={t.id} className="p-4">
              <p className="whitespace-pre-wrap text-sm text-ink-soft">&ldquo;{t.text}&rdquo;</p>
              <p className="mt-2 text-xs text-muted">
                {formatDateShort(t.createdAt)}
                {t.workshopTitle ? ` · after ${t.workshopTitle}` : ""}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
