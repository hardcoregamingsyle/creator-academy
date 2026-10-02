import type { FormEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Search } from "lucide-react";
import { formatDateShort, formatINR, formatTime, timeAgo } from "@shared/format";
import type { AdminBookingsPageData, BookingStatusFilter } from "@shared/pages/admin-ops";
import { ActionForm, ConfirmButton } from "@/components/admin-ui";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, Button, Card, Input, cn } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { enc, postTo } from "./post";
import { useKeepPrevious } from "./use-keep-previous";

const STATUS_FILTERS: { value: BookingStatusFilter; label: string }[] = [
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

export function Component() {
  usePageMeta({ title: "Bookings" });
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const statusParam = params.get("status") ?? "all";
  const statusFilter = STATUS_FILTERS.find((s) => s.value === statusParam)?.value ?? "all";

  const { data, error, reload } = useApi<AdminBookingsPageData>(
    `/api/admin/bookings?status=${statusFilter}${q ? `&q=${enc(q)}` : ""}`,
  );
  const shown = useKeepPrevious(data);

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!shown) return <PageSkeleton bare />;
  const switching = data === undefined;
  const { counts, bookings, totalPaidPaise, returningDiscountPercent } = shown;

  const exportHref = `/api/admin/export?status=${statusFilter}${q ? `&q=${enc(q)}` : ""}`;

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    const next = new URLSearchParams({ status: statusFilter });
    if (value) next.set("q", value);
    setParams(next);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Bookings</h1>
          <p className="mt-2 text-muted">All workshop registrations, oldest action needed first.</p>
        </div>
        <a
          href={exportHref}
          className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-ink"
        >
          <Download className="size-4" aria-hidden />
          Download CSV
        </a>
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
              to={`/admin/bookings?status=${s.value}${q ? `&q=${enc(q)}` : ""}`}
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
        <form onSubmit={onSearch} className="flex gap-2">
          <Input
            key={q}
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
      <div
        className={cn(
          "mt-6 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card transition-opacity",
          switching && "opacity-60",
        )}
        aria-busy={switching}
      >
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
            {bookings.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{r.name}</p>
                  <p className="text-muted">{r.email}</p>
                  {r.phone && <p className="text-muted">{r.phone}</p>}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{r.workshopTitle}</p>
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
                      {returningDiscountPercent}% returning
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
                  {r.abandoned && (
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
                      <StatusForm id={r.id} status="paid" onDone={reload}>
                        <ConfirmButton message={`Mark ${r.name}'s registration as paid (manual)?`} variant="outline" size="sm">
                          Mark paid
                        </ConfirmButton>
                      </StatusForm>
                    )}
                    {r.status !== "refunded" && (
                      <StatusForm id={r.id} status="refunded" onDone={reload}>
                        <ConfirmButton message={`Mark ${r.name}'s registration as refunded?`} size="sm">
                          Refund
                        </ConfirmButton>
                      </StatusForm>
                    )}
                    {r.status !== "cancelled" && (
                      <StatusForm id={r.id} status="cancelled" onDone={reload}>
                        <ConfirmButton message={`Cancel ${r.name}'s registration?`} size="sm">
                          Cancel
                        </ConfirmButton>
                      </StatusForm>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bookings.length === 0 && <p className="px-4 py-10 text-center text-muted">No bookings match this filter.</p>}
      </div>
    </div>
  );
}

function StatusForm({
  id,
  status,
  onDone,
  children,
}: {
  id: string;
  status: "paid" | "refunded" | "cancelled";
  onDone: () => void;
  children: ReactNode;
}) {
  return (
    <ActionForm action={postTo(`/api/admin/registrations/${enc(id)}/status`)} onDone={(r) => r.ok && onDone()} quiet>
      <input type="hidden" name="status" value={status} />
      {children}
    </ActionForm>
  );
}
