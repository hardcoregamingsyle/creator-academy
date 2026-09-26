import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listSlots, listTrainingBookings, type TrainingBookingStatus } from "@/lib/data/training";
import { formatDateShort, formatINR, formatTime } from "@/lib/format";
import { Badge, Card, Field, Input, Select, cn } from "@/components/ui";
import { ActionForm, ConfirmButton, SubmitButton } from "../admin-ui";
import { createSlotsAction, deleteSlotAction, setMeetingLinkAction, setSlotOpenAction, setTrainingStatusAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Personal training", robots: { index: false, follow: false } };

const statusTone = {
  pending: "warning",
  paid: "success",
  completed: "success",
  refunded: "neutral",
  cancelled: "neutral",
  failed: "danger",
} as const;

export default async function TrainingAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const { tab } = await searchParams;
  const scope = tab === "past" ? "past" : "upcoming";

  const [slots, bookings] = await Promise.all([listSlots("upcoming"), listTrainingBookings({ scope })]);

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Personal training</h1>
      <p className="mt-2 text-muted">Publish available times and manage 1:1 bookings.</p>

      {/* ── available time slots ── */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Available time slots</h2>
        <p className="mt-1 text-sm text-muted">
          Slots that overlap a group class or another booking are hidden from students automatically.
        </p>

        <Card className="mt-4 p-5">
          <ActionForm action={createSlotsAction} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
            <Field label="Date" htmlFor="slot-date" className="w-full sm:w-auto">
              <Input id="slot-date" type="date" name="date" required />
            </Field>
            <Field label="Time (IST)" htmlFor="slot-time" className="w-full sm:w-auto">
              <Input id="slot-time" type="time" name="time" required />
            </Field>
            <Field label="Repeat weekly" htmlFor="slot-repeat" hint="Adds the same time for N weeks" className="w-full sm:w-40">
              <Select id="slot-repeat" name="repeatWeeks" defaultValue="1">
                {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "week" : "weeks"}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton pendingLabel="Adding…">Add slot(s)</SubmitButton>
          </ActionForm>
        </Card>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line bg-sunken/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Date &amp; time</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Booked</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {slots.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{formatDateShort(s.startsAt)}</p>
                    <p className="text-muted">{formatTime(s.startsAt)} IST</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={s.isOpen ? "success" : "neutral"}>{s.isOpen ? "Open" : "Closed"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {s.bookingCode ? (
                      <div>
                        <code className="font-mono text-xs">{s.bookingCode}</code>
                        <Badge tone="accent" className="ml-1.5">
                          {s.bookingStatus}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <ActionForm action={setSlotOpenAction.bind(null, s.id, !s.isOpen)} quiet>
                        <SubmitButton variant="outline" size="sm">
                          {s.isOpen ? "Close" : "Open"}
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={deleteSlotAction.bind(null, s.id)} quiet>
                        <ConfirmButton message="Delete this slot? This can't be undone." size="sm">
                          Delete
                        </ConfirmButton>
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {slots.length === 0 && <p className="px-4 py-10 text-center text-muted">No upcoming slots yet — add one above.</p>}
        </div>
      </section>

      {/* ── bookings ── */}
      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-xl font-bold">Bookings</h2>
          <div className="flex gap-2">
            {(["upcoming", "past"] as const).map((t) => (
              <Link
                key={t}
                href={`/admin/training?tab=${t}`}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition-colors",
                  scope === t ? "bg-ink text-on-dark" : "bg-sunken text-ink-soft hover:bg-line",
                )}
              >
                {t}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="border-b border-line bg-sunken/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Student</th>
                <th className="px-4 py-3 font-semibold">Topic</th>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Goals</th>
                <th className="px-4 py-3 font-semibold">Meeting link</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bookings.map((b) => (
                <tr key={b.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{b.name}</p>
                    <p className="text-muted">{b.email}</p>
                    {b.phone && <p className="text-muted">{b.phone}</p>}
                    <code className="mt-1 block font-mono text-xs text-muted">{b.code}</code>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{b.topic}</p>
                    <p className="text-muted">{b.durationMin} min</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink-soft">{formatDateShort(b.startsAt)}</p>
                    <p className="text-muted">{formatTime(b.startsAt)}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">{formatINR(b.amountPaise)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone[b.status]}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {b.goals ? (
                      <details>
                        <summary className="cursor-pointer text-sm font-medium text-accent-strong">View</summary>
                        <p className="mt-1.5 max-w-[220px] whitespace-pre-wrap text-ink-soft">{b.goals}</p>
                      </details>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ActionForm action={setMeetingLinkAction.bind(null, b.id)} className="flex w-48 flex-col gap-1.5">
                      <Input
                        type="url"
                        name="link"
                        defaultValue={b.meetingLink ?? ""}
                        placeholder="https://…"
                        aria-label={`Meeting link for ${b.name}`}
                        className="h-9 px-2.5 py-1.5 text-xs"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        <input type="checkbox" name="notify" className="size-3.5 rounded border-line-strong" />
                        Email link to student
                      </label>
                      <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
                        Save
                      </SubmitButton>
                    </ActionForm>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {(["completed", "cancelled", "refunded"] as TrainingBookingStatus[])
                        .filter((s) => s !== b.status)
                        .map((s) => (
                          <ActionForm key={s} action={setTrainingStatusAction.bind(null, b.id, s)}>
                            <ConfirmButton message={`Mark ${b.name}'s session as ${s}?`} size="sm" className="w-full capitalize">
                              Mark {s}
                            </ConfirmButton>
                          </ActionForm>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {bookings.length === 0 && (
            <p className="px-4 py-10 text-center text-muted">No {scope} training bookings.</p>
          )}
        </div>
      </section>
    </div>
  );
}
