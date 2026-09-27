import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listPasses, passRevenuePaise, passesOnSale, type MonthlyPassStatus } from "@/lib/data/monthly-pass";
import { formatDateShort, formatINR, monthLabel, timeAgo } from "@/lib/format";
import { site } from "@/lib/site";
import { Badge, Card } from "@/components/ui";
import { ActionForm, ConfirmButton } from "../admin-ui";
import { setPassStatusAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Monthly Pass", robots: { index: false, follow: false } };

const statusTone = {
  paid: "success",
  pending: "warning",
  refunded: "neutral",
  cancelled: "neutral",
  failed: "danger",
} as const satisfies Record<MonthlyPassStatus, string>;

export default async function AdminPassesPage() {
  await requireAdmin();
  const [passes, revenue, onSale] = await Promise.all([listPasses({}), passRevenuePaise(), Promise.resolve(passesOnSale())]);

  const paidCount = passes.filter((p) => p.status === "paid").length;
  const currentMonthCount = passes.filter((p) => p.status === "paid" && p.monthKey === onSale[0]?.monthKey).length;

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Monthly Pass</h1>
      <p className="mt-2 text-muted">
        Current price: {formatINR(site.pricing.monthlyPassPaise)}/month — change it in{" "}
        <code className="font-mono text-xs">src/lib/site.ts</code> (site.pricing.monthlyPassPaise).
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total pass revenue</p>
          <p className="mt-1 font-display text-2xl font-bold">{formatINR(revenue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Active passes (all time)</p>
          <p className="mt-1 font-display text-2xl font-bold">{paidCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {onSale[0] ? monthLabel(onSale[0].monthKey) : "This month"}
          </p>
          <p className="mt-1 font-display text-2xl font-bold">{currentMonthCount}</p>
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
                  {p.paymentProvider === "demo" && (
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
                      <ActionForm action={setPassStatusAction.bind(null, p.id, "paid")} quiet>
                        <ConfirmButton message={`Mark ${p.name}'s pass as paid (manual)?`} variant="outline" size="sm">
                          Mark paid
                        </ConfirmButton>
                      </ActionForm>
                    )}
                    {p.status !== "refunded" && (
                      <ActionForm action={setPassStatusAction.bind(null, p.id, "refunded")} quiet>
                        <ConfirmButton message={`Mark ${p.name}'s pass as refunded?`} size="sm">
                          Refund
                        </ConfirmButton>
                      </ActionForm>
                    )}
                    {p.status !== "cancelled" && (
                      <ActionForm action={setPassStatusAction.bind(null, p.id, "cancelled")} quiet>
                        <ConfirmButton message={`Cancel ${p.name}'s pass?`} size="sm">
                          Cancel
                        </ConfirmButton>
                      </ActionForm>
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
