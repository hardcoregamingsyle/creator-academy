import type { Metadata } from "next";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { listRegistrations, type RegistrationStatus, type RegistrationWithSession } from "@/lib/data/registrations";
import { formatDateShort, formatINR, formatTime, timeAgo } from "@/lib/format";
import { site } from "@/lib/site";
import { Badge, Button, Card, Input, cn } from "@/components/ui";
import { ActionForm, ConfirmButton } from "../admin-ui";
import { setRegistrationStatusAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Bookings", robots: { index: false, follow: false } };

const STATUS_FILTERS: { value: RegistrationStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
];

const statusTone = {
  paid: "success",
  pending: "warning",
  refunded: "neutral",
  cancelled: "neutral",
  failed: "danger",
} as const;

const providerLabel: Record<string, string> = {
  razorpay: "Razorpay",
  demo: "Test",
  manual: "Manual",
};

function isAbandoned(r: RegistrationWithSession): boolean {
  if (r.status !== "pending") return false;
  const ageMin = (Date.now() - new Date(r.createdAt).getTime()) / 60_000;
  return ageMin > site.seatHoldMinutes;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireAdmin();
  const { q = "", status = "all" } = await searchParams;
  const statusFilter = (STATUS_FILTERS.some((s) => s.value === status) ? status : "all") as RegistrationStatus | "all";

  const [all, filtered] = await Promise.all([
    listRegistrations({}),
    listRegistrations({ search: q || undefined, status: statusFilter }),
  ]);

  const totalPaidPaise = all.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.amountPaise, 0);
  const counts: Record<string, number> = { all: all.length };
  for (const r of all) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const exportHref = `/api/admin/export?status=${statusFilter}${
    q ? `&q=${encodeURIComponent(q)}` : ""
  }`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Bookings</h1>
          <p className="mt-2 text-muted">All workshop registrations, oldest action needed first.</p>
        </div>
        <Link
          href={exportHref}
          className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-ink"
        >
          <Download className="size-4" aria-hidden />
          Download CSV
        </Link>
      </div>

      {/* summary */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total paid revenue</p>
          <p className="mt-1 font-display text-2xl font-bold">{formatINR(totalPaidPaise)}</p>
        </Card>
        {(["paid", "pending", "refunded", "cancelled", "failed"] as const).map((s) => (
          <Card key={s} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted capitalize">{s}</p>
            <p className="mt-1 font-display text-2xl font-bold">{counts[s] ?? 0}</p>
          </Card>
        ))}
      </div>

      {/* filters */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <Link
              key={s.value}
              href={`/admin/bookings?status=${s.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                statusFilter === s.value ? "bg-deep text-on-dark" : "bg-sunken text-ink-soft hover:bg-line",
              )}
            >
              {s.label}
              {s.value !== "all" && <span className="ml-1.5 text-xs opacity-70">{counts[s.value] ?? 0}</span>}
            </Link>
          ))}
        </div>
        <form method="GET" className="flex gap-2">
          <input type="hidden" name="status" value={statusFilter} />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, email, code or phone"
            aria-label="Search bookings"
            className="w-64"
          />
          <Button type="submit" variant="outline" size="md" aria-label="Search">
            <Search className="size-4" aria-hidden />
          </Button>
        </form>
      </div>

      {/* table */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-line bg-sunken/60 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Workshop &amp; session</th>
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Provider</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((r) => {
              const abandoned = isAbandoned(r);
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{r.name}</p>
                    <p className="text-muted">{r.email}</p>
                    {r.phone && <p className="text-muted">{r.phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{r.workshop?.title ?? r.workshopSlug}</p>
                    <p className="text-muted">
                      {formatDateShort(r.sessionStartsAt)} · {formatTime(r.sessionStartsAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-xs">{r.code}</code>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{formatINR(r.amountPaise)}</p>
                    {r.discountPaise > 0 && (
                      <Badge tone="accent" className="mt-1">
                        {site.pricing.returningDiscountPercent}% returning
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.paymentProvider ? (
                      <Badge tone={r.paymentProvider === "demo" ? "warning" : "neutral"}>
                        {providerLabel[r.paymentProvider] ?? r.paymentProvider}
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                    {abandoned && (
                      <Badge tone="danger" className="ml-1.5">
                        Abandoned
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink-soft">{formatDateShort(r.createdAt)}</p>
                    <p className="text-muted">{timeAgo(r.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {r.status !== "paid" && (
                        <ActionForm action={setRegistrationStatusAction.bind(null, r.id, "paid")} quiet>
                          <ConfirmButton
                            message={`Mark ${r.name}'s registration as paid (manual)?`}
                            variant="outline"
                            size="sm"
                          >
                            Mark paid
                          </ConfirmButton>
                        </ActionForm>
                      )}
                      {r.status !== "refunded" && (
                        <ActionForm action={setRegistrationStatusAction.bind(null, r.id, "refunded")} quiet>
                          <ConfirmButton message={`Mark ${r.name}'s registration as refunded?`} size="sm">
                            Refund
                          </ConfirmButton>
                        </ActionForm>
                      )}
                      {r.status !== "cancelled" && (
                        <ActionForm action={setRegistrationStatusAction.bind(null, r.id, "cancelled")} quiet>
                          <ConfirmButton message={`Cancel ${r.name}'s registration?`} size="sm">
                            Cancel
                          </ConfirmButton>
                        </ActionForm>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="px-4 py-10 text-center text-muted">No bookings match this filter.</p>}
      </div>
    </div>
  );
}
