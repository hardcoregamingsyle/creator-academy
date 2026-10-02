import type { ReactNode } from "react";
import type { AdminPassesPageData, PassStatus } from "@shared/pages/admin-ops";
import { formatDateShort, formatINR, monthLabel, timeAgo } from "@shared/format";
import { ActionForm, ConfirmButton } from "@/components/admin-ui";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, Card } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { enc, postTo } from "./post";

const statusTone = {
  paid: "success",
  pending: "warning",
  refunded: "neutral",
  cancelled: "neutral",
  failed: "danger",
} as const satisfies Record<PassStatus, string>;

export function Component() {
  usePageMeta({ title: "Monthly Pass" });
  const { data, error, reload } = useApi<AdminPassesPageData>("/api/admin/passes");

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton bare />;

  const { passes, revenuePaise, paidCount, monthKey, monthCount, monthlyPassPricePaise } = data;

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Monthly Pass</h1>
      <p className="mt-2 text-muted">
        Current price: {formatINR(monthlyPassPricePaise)}/month — change it in{" "}
        <code className="font-mono text-xs">/admin/pricing</code>.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total pass revenue</p>
          <p className="mt-1 font-display text-2xl font-bold">{formatINR(revenuePaise)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Active passes (all time)</p>
          <p className="mt-1 font-display text-2xl font-bold">{paidCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{monthKey ? monthLabel(monthKey) : "This month"}</p>
          <p className="mt-1 font-display text-2xl font-bold">{monthCount}</p>
        </Card>
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line bg-sunken/60 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Buyer</th>
              <th className="px-4 py-3 font-semibold">Month</th>
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {passes.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{p.name}</p>
                  <p className="text-muted">{p.email}</p>
                  {p.phone && <p className="text-muted">{p.phone}</p>}
                </td>
                <td className="px-4 py-3 text-ink-soft">{monthLabel(p.monthKey)}</td>
                <td className="px-4 py-3">
                  <code className="font-mono text-xs">{p.code}</code>
                </td>
                <td className="px-4 py-3 font-semibold text-ink">{formatINR(p.amountPaise)}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone[p.status]}>{p.status}</Badge>
                  {p.demo && (
                    <Badge tone="warning" className="ml-1.5">
                      Test
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="text-ink-soft">{formatDateShort(p.createdAt)}</p>
                  <p className="text-muted">{timeAgo(p.createdAt)}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {p.status !== "paid" && (
                      <StatusForm id={p.id} status="paid" onDone={reload}>
                        <ConfirmButton message={`Mark ${p.name}'s pass as paid (manual)?`} variant="outline" size="sm">
                          Mark paid
                        </ConfirmButton>
                      </StatusForm>
                    )}
                    {p.status !== "refunded" && (
                      <StatusForm id={p.id} status="refunded" onDone={reload}>
                        <ConfirmButton message={`Mark ${p.name}'s pass as refunded?`} size="sm">
                          Refund
                        </ConfirmButton>
                      </StatusForm>
                    )}
                    {p.status !== "cancelled" && (
                      <StatusForm id={p.id} status="cancelled" onDone={reload}>
                        <ConfirmButton message={`Cancel ${p.name}'s pass?`} size="sm">
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
        {passes.length === 0 && <p className="px-4 py-10 text-center text-muted">No pass purchases yet.</p>}
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
    <ActionForm action={postTo(`/api/admin/passes/${enc(id)}/status`)} onDone={(r) => r.ok && onDone()} quiet>
      <input type="hidden" name="status" value={status} />
      {children}
    </ActionForm>
  );
}
