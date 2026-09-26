import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Download,
  Mail,
  MessageSquareQuote,
  Plus,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { getSession } from "@/lib/data/sessions";
import { listRegistrations, type RegistrationStatus } from "@/lib/data/registrations";
import {
  formatDateLong,
  formatDateShort,
  formatINR,
  formatTime,
  formatTimeRange,
  toISTInputs,
} from "@/lib/format";
import { Badge, Card, Eyebrow, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, ConfirmButton, SubmitButton } from "../../admin-ui";
import {
  addManualRegistrationAction,
  cancelSessionAction,
  deleteSessionAction,
  markAllAttendedAction,
  sendFeedbackRequestAction,
  sendReminderAction,
  setRegistrationStatusAction,
  toggleAttendanceAction,
  updateSessionAction,
} from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession(id);
  return { title: session?.workshop?.title ?? "Session" };
}

const sessionStatusTone = { scheduled: "accent", completed: "success", cancelled: "danger" } as const;

const regStatusTone: Record<RegistrationStatus, "success" | "warning" | "danger" | "neutral"> = {
  paid: "success",
  pending: "warning",
  failed: "danger",
  refunded: "neutral",
  cancelled: "neutral",
};

export default async function AdminSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, registrations] = await Promise.all([getSession(id), listRegistrations({ sessionId: id })]);
  if (!session) notFound();

  const w = session.workshop;
  const paidCount = registrations.filter((r) => r.status === "paid").length;
  const { date: currentDate, time: currentTime } = toISTInputs(session.startsAt);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/sessions" className="text-sm font-medium text-muted hover:text-ink">
          ← All sessions
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>{w?.title ?? session.workshopSlug}</Eyebrow>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{formatDateLong(session.startsAt)}</h1>
            <p className="mt-1 text-muted">{formatTimeRange(session.startsAt, session.durationMin)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone={sessionStatusTone[session.status]}>{session.status}</Badge>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Users className="size-4" aria-hidden /> {session.paidCount}/{session.capacity} paid seats
            </span>
          </div>
        </div>
      </div>

      {/* Edit session */}
      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">Edit session</h2>
        <ActionForm action={updateSessionAction} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={session.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="date">
              <Input id="date" name="date" type="date" defaultValue={currentDate} />
            </Field>
            <Field label="Time (IST)" htmlFor="time">
              <Input id="time" name="time" type="time" defaultValue={currentTime} />
            </Field>
            <Field label="Capacity" htmlFor="capacity">
              <Input id="capacity" name="capacity" type="number" min={1} defaultValue={session.capacity} />
            </Field>
            <Field label="Price (₹)" htmlFor="price">
              <Input id="price" name="price" type="number" min={0} defaultValue={session.pricePaise / 100} />
            </Field>
          </div>
          <Field label="Meeting link" htmlFor="meetingLink" optional>
            <Input
              id="meetingLink"
              name="meetingLink"
              type="url"
              defaultValue={session.meetingLink ?? ""}
              placeholder="https://meet.google.com/…"
            />
          </Field>
          <Field label="Notes" htmlFor="notes" optional>
            <Textarea id="notes" name="notes" rows={2} defaultValue={session.notes ?? ""} />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={session.status}>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        </ActionForm>
      </Card>

      {/* Registrations */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
          <h2 className="font-display text-lg font-bold">Registrations ({registrations.length})</h2>
          <Link
            href={`/api/admin/export?sessionId=${session.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong hover:underline"
          >
            <Download className="size-4" aria-hidden /> Download CSV
          </Link>
        </div>
        <p className="px-6 pt-2 text-xs text-muted">
          Attendance must be marked for the 10% returning-student discount to apply on a student&apos;s next booking.
        </p>
        {registrations.length === 0 ? (
          <p className="px-6 pb-6 pt-4 text-sm text-muted">No registrations yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-6 py-2.5 font-medium">Student</th>
                  <th className="px-3 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Paid</th>
                  <th className="px-3 py-2.5 font-medium">Attended</th>
                  <th className="px-6 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {registrations.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-3">
                      <div className="font-medium text-ink">{r.name}</div>
                      <div className="text-xs text-muted">{r.email}</div>
                      {r.phone && <div className="text-xs text-muted">{r.phone}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-ink-soft">{r.code}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-soft">
                      {formatINR(r.amountPaise)}
                      {r.discountPaise > 0 && (
                        <div className="text-xs text-success">−{formatINR(r.discountPaise)} discount</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={regStatusTone[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-soft">
                      {r.paidAt ? `${formatDateShort(r.paidAt)} ${formatTime(r.paidAt)}` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {r.status === "paid" ? (
                        <ActionForm action={toggleAttendanceAction} quiet>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="sessionId" value={session.id} />
                          <input type="hidden" name="attended" value={r.attended ? "0" : "1"} />
                          <SubmitButton
                            size="sm"
                            variant="outline"
                            className={r.attended ? "border-success bg-success-soft text-success hover:border-success" : undefined}
                          >
                            {r.attended ? "✓ Attended" : "Mark attended"}
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {(r.status === "paid" || r.status === "pending") && (
                        <div className="flex flex-wrap gap-2">
                          <ActionForm action={setRegistrationStatusAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="sessionId" value={session.id} />
                            <input type="hidden" name="status" value="refunded" />
                            <ConfirmButton size="sm" variant="outline" message={`Mark ${r.name}'s registration as refunded?`}>
                              Refund
                            </ConfirmButton>
                          </ActionForm>
                          <ActionForm action={setRegistrationStatusAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="sessionId" value={session.id} />
                            <input type="hidden" name="status" value="cancelled" />
                            <ConfirmButton size="sm" variant="ghost" message={`Cancel ${r.name}'s registration?`}>
                              Cancel
                            </ConfirmButton>
                          </ActionForm>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Bulk actions */}
      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">Bulk actions</h2>
        <div className="mt-4 flex flex-col items-start gap-4">
          <ActionForm action={markAllAttendedAction}>
            <input type="hidden" name="sessionId" value={session.id} />
            <SubmitButton variant="outline" pendingLabel="Marking…">
              <UserCheck className="size-4" aria-hidden /> Mark all paid as attended
            </SubmitButton>
          </ActionForm>

          <div>
            <ActionForm action={sendReminderAction}>
              <input type="hidden" name="sessionId" value={session.id} />
              <SubmitButton variant="outline" pendingLabel="Sending…">
                <Mail className="size-4" aria-hidden /> Email reminder to all paid students ({paidCount})
              </SubmitButton>
            </ActionForm>
            {!session.meetingLink && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="size-3.5" aria-hidden /> No meeting link is set on this session yet.
              </p>
            )}
          </div>

          <ActionForm action={sendFeedbackRequestAction}>
            <input type="hidden" name="sessionId" value={session.id} />
            <SubmitButton variant="outline" pendingLabel="Sending…">
              <MessageSquareQuote className="size-4" aria-hidden /> Send feedback request to attendees
            </SubmitButton>
          </ActionForm>
        </div>
      </Card>

      {/* Add student manually */}
      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">Add a student manually</h2>
        <p className="mt-1 text-sm text-muted">For a student who paid another way (cash, direct UPI, etc).</p>
        <ActionForm action={addManualRegistrationAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="sessionId" value={session.id} />
          <Field label="Name" htmlFor="m-name">
            <Input id="m-name" name="name" required />
          </Field>
          <Field label="Email" htmlFor="m-email">
            <Input id="m-email" name="email" type="email" required />
          </Field>
          <Field label="Phone" htmlFor="m-phone" optional>
            <Input id="m-phone" name="phone" type="tel" />
          </Field>
          <Field label="Amount paid (₹)" htmlFor="m-amount" optional hint={`Defaults to ${formatINR(session.pricePaise)}`}>
            <Input id="m-amount" name="amount" type="number" min={0} placeholder={String(session.pricePaise / 100)} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Adding…">
              <Plus className="size-4" aria-hidden /> Add student
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {/* Danger zone */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-danger">
          <AlertTriangle className="size-4.5" aria-hidden /> Danger zone
        </h2>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <ActionForm action={cancelSessionAction}>
            <input type="hidden" name="id" value={session.id} />
            <ConfirmButton
              variant="outline"
              message="Cancel this session? Any refunds must be processed manually in the Razorpay dashboard."
            >
              Cancel session
            </ConfirmButton>
          </ActionForm>
          <ActionForm action={deleteSessionAction}>
            <input type="hidden" name="id" value={session.id} />
            <ConfirmButton
              variant="danger"
              message="Permanently delete this session? This only works if it has no paid registrations."
            >
              <Trash2 className="size-4" aria-hidden /> Delete session
            </ConfirmButton>
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
