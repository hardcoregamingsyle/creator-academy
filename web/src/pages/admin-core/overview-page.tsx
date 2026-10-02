import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  MessageSquareQuote,
  Repeat2,
  Ticket,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { formatDateShort, formatINR, formatTime, plural, timeAgo } from "@shared/format";
import type { AdminOverviewData, RegistrationStatus } from "@shared/pages/admin-core";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, Card, Eyebrow } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";

const regStatusTone: Record<RegistrationStatus, "success" | "warning" | "danger" | "neutral"> = {
  paid: "success",
  pending: "warning",
  failed: "danger",
  refunded: "neutral",
  cancelled: "neutral",
};

export function Component() {
  usePageMeta({ title: "Overview" });
  const { data, error, reload } = useApi<AdminOverviewData>("/api/admin/overview");

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton bare />;

  const { stats, nextSessions, recent, milestones, checklist } = data;
  const WORKSHOP_PRICE_PAISE = data.workshopPricePaise;

  return (
    <div className="space-y-10">
      <div>
        <Eyebrow>Overview</Eyebrow>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Dashboard</h1>
        {stats.demoBookings > 0 && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-sm text-warning">
            <AlertTriangle className="size-4" aria-hidden />
            {plural(stats.demoBookings, "test booking")} made with demo payments {stats.demoBookings === 1 ? "is" : "are"}{" "}
            not counted in these numbers.
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={CircleDollarSign} label="Revenue" value={formatINR(stats.revenuePaise)} />
        <StatCard icon={Ticket} label="Paid workshop seats" value={String(stats.paidRegistrations)} />
        <StatCard icon={UserRound} label="Personal training sessions" value={String(stats.paidTrainingBookings)} />
        <StatCard icon={Users} label="Unique students" value={String(stats.uniqueStudents)} />
        <StatCard icon={Repeat2} label="Returning students" value={String(stats.returningStudents)} />
        <StatCard icon={MessageSquareQuote} label="Feedback responses" value={String(stats.feedbackCount)} />
        <StatCard icon={AlertTriangle} label="Unread messages" value={String(stats.openMessages)} />
      </div>

      {/* Milestones */}
      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">Revenue milestones</h2>
        <div className="mt-5 space-y-5">
          {milestones.map((m) => {
            const pct = Math.min(100, Math.round((stats.revenuePaise / m.paise) * 100));
            const remaining = Math.max(0, m.paise - stats.revenuePaise);
            const seatsToGo = Math.ceil(remaining / WORKSHOP_PRICE_PAISE);
            return (
              <div key={m.label}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold text-ink">{m.label}</span>
                  <span className="text-muted">
                    {formatINR(stats.revenuePaise)} / {formatINR(m.paise)} · {pct}%
                  </span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full bg-accent-strong" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {remaining > 0
                    ? `≈ ${plural(seatsToGo, `more ${formatINR(WORKSHOP_PRICE_PAISE)} seat`)} to go`
                    : "Milestone reached."}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Next sessions */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Next sessions</h2>
            <Link to="/admin/sessions" className="text-sm font-medium text-accent-strong hover:underline">
              View all
            </Link>
          </div>
          {nextSessions.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No upcoming sessions scheduled yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {nextSessions.map((s) => {
                const fillPct = s.capacity > 0 ? Math.min(100, Math.round((s.paidCount / s.capacity) * 100)) : 0;
                return (
                  <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                    <Link to={`/admin/sessions/${s.id}`} className="block">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold text-ink">{s.title}</span>
                        <span className="shrink-0 text-sm text-muted">
                          {formatDateShort(s.startsAt)} · {formatTime(s.startsAt)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${fillPct}%` }} />
                        </div>
                        <span className="shrink-0 text-xs text-muted">
                          {s.paidCount}/{s.capacity}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Launch checklist */}
        <Card className="p-6">
          <h2 className="font-display text-lg font-bold">Launch checklist</h2>
          <ul className="mt-4 space-y-3">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                )}
                <span className={c.ok ? "text-ink-soft" : "text-ink"}>{c.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Recent bookings */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 pt-6">
          <h2 className="font-display text-lg font-bold">Recent bookings</h2>
          <Link to="/admin/bookings" className="text-sm font-medium text-accent-strong hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-6 pb-6 pt-4 text-sm text-muted">No bookings yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-6 py-2.5 font-medium">Student</th>
                  <th className="px-3 py-2.5 font-medium">Workshop</th>
                  <th className="px-3 py-2.5 font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-6 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-3">
                      <div className="font-medium text-ink">{r.name}</div>
                      <div className="text-xs text-muted">{r.email}</div>
                    </td>
                    <td className="px-3 py-3 text-ink-soft">{r.workshopTitle}</td>
                    <td className="px-3 py-3 text-ink-soft">{formatINR(r.amountPaise)}</td>
                    <td className="px-3 py-3">
                      <Badge tone={regStatusTone[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-xs text-muted">{timeAgo(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4" aria-hidden />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-ink">{value}</p>
    </Card>
  );
}
