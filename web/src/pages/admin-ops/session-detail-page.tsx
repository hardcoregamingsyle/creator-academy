import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Download, Mail, MessageSquareQuote, Plus, Radio, Trash2, Undo2, UserCheck, Users } from "lucide-react";
import { formatDateLong, formatDateShort, formatINR, formatTime, formatTimeRange, toISTInputs } from "@shared/format";
import {
  bulkEmailMessage,
  type AdminSessionDetailData,
  type BulkEmailResult,
  type RefundAllResult,
  type RegistrationStatus,
  type SessionStatus,
} from "@shared/pages/admin-ops";
import { ActionForm, ConfirmButton, SubmitButton, type ActionResult } from "@/components/admin-ui";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { NotFound } from "@/components/not-found";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, ButtonLink, Card, Eyebrow, Field, Input, Select, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useSite } from "@/lib/site-context";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { enc, postTo } from "./post";

const sessionStatusTone = { scheduled: "accent", completed: "success", cancelled: "danger" } as const;

const regStatusTone: Record<RegistrationStatus, "success" | "warning" | "danger" | "neutral"> = {
  paid: "success",
  pending: "warning",
  failed: "danger",
  refunded: "neutral",
  cancelled: "neutral",
};

/** Recipients emailed per request, so one call stays within a Worker's CPU and subrequest budget. */
const EMAIL_CHUNK = 5;

/** Bookings refunded per request (each refund is a payment-provider call plus emails: several subrequests). */
const REFUND_CHUNK = 3;

/** Refunds a cancelled session's paid bookings in small chunks and adds the results up. Stops at the first chunk with a failure. */
async function refundAllInChunks(url: string): Promise<ActionResult> {
  let refunded = 0;
  let manual = 0;
  let remaining = 0;
  try {
    for (let i = 0; i < 100; i++) {
      const fd = new FormData();
      fd.set("limit", String(REFUND_CHUNK));
      const res = await api.postForm<RefundAllResult>(url, fd);
      if (res.attempted === 0 && !res.ok) return { ok: false, message: res.message };
      refunded += res.refunded;
      manual += res.manual;
      remaining = res.remaining;
      if (res.failed > 0) {
        return { ok: false, message: `${refunded} refunded so far. ${res.message} Try again: refunds already made are never repeated.` };
      }
      if (res.remaining === 0 || res.attempted === 0) break;
    }
  } catch (err) {
    return { ok: false, message: `${errorMessage(err)} ${refunded} refunded before the error. Press the button again to continue.` };
  }
  return {
    ok: true,
    message: `${refunded} refunded through Razorpay${manual ? `, ${manual} cancelled for a manual refund` : ""}. ${remaining} paid booking${remaining === 1 ? "" : "s"} left.`,
  };
}

export function Component() {
  const { id } = useParams();
  const { data, error, reload } = useApi<AdminSessionDetailData>(id ? `/api/admin/sessions/${enc(id)}` : null);
  usePageMeta({ title: data?.session.workshopTitle ?? "Session" });

  if (error?.status === 404) return <NotFound />;
  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton bare />;
  return <SessionDetail data={data} reload={reload} />;
}

/** Emails the list in small chunks (one request each) and adds the results up into a single message. */
async function sendInChunks(kind: "reminder" | "feedback", url: string, hasMeetingLink: boolean): Promise<ActionResult> {
  let offset = 0;
  let sent = 0;
  let total = 0;
  try {
    for (;;) {
      const fd = new FormData();
      fd.set("offset", String(offset));
      fd.set("limit", String(EMAIL_CHUNK));
      const res = await api.postForm<BulkEmailResult>(url, fd);
      if (res.total === 0) return { ok: false, message: res.message };
      sent += res.sent;
      total = res.total;
      offset += res.attempted;
      if (res.done || res.attempted === 0) break;
    }
  } catch (err) {
    if (sent === 0) throw err;
    return { ok: false, message: `${errorMessage(err)} ${bulkEmailMessage(kind, sent, total, hasMeetingLink)}` };
  }
  return { ok: sent > 0, message: bulkEmailMessage(kind, sent, total, hasMeetingLink) };
}

function SessionDetail({ data, reload }: { data: AdminSessionDetailData; reload: () => void }) {
  const { pricing } = useSite();
  const { session, registrations } = data;
  const navigate = useNavigate();
  const paidCount = registrations.filter((r) => r.status === "paid").length;
  const { date: currentDate, time: currentTime } = toISTInputs(session.startsAt);
  const base = `/api/admin/sessions/${enc(session.id)}`;

  // The status select is controlled so it follows changes made elsewhere on the page (e.g. "Cancel session").
  const [status, setStatus] = useState<SessionStatus>(session.status);
  useEffect(() => setStatus(session.status), [session.status]);

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin/sessions" className="text-sm font-medium text-muted hover:text-ink">
          ← All sessions
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>{session.workshopTitle ?? session.workshopSlug}</Eyebrow>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{formatDateLong(session.startsAt)}</h1>
            <p className="mt-1 text-muted">{formatTimeRange(session.startsAt, session.durationMin)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone={sessionStatusTone[session.status]}>{session.status}</Badge>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Users className="size-4" aria-hidden /> {session.paidCount}/{session.capacity} paid seats
            </span>
            {session.status !== "cancelled" && (
              <ButtonLink href={`/admin/sessions/${enc(session.id)}/live`} size="sm" variant="primary">
                <Radio className="size-4" aria-hidden /> Open live room
              </ButtonLink>
            )}
          </div>
        </div>
      </div>

      {/* Edit session */}
      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">Edit session</h2>
        <ActionForm action={postTo(`${base}/update`)} onDone={(r) => r.ok && reload()} className="mt-4 space-y-4">
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
            <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as SessionStatus)}>
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
          <a
            href={`/api/admin/export?sessionId=${enc(session.id)}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong hover:underline"
          >
            <Download className="size-4" aria-hidden /> Download CSV
          </a>
        </div>
        <p className="px-6 pt-2 text-xs text-muted">
          Attendance must be marked for the {pricing.returningDiscountPercent}% returning-student discount to apply on a student&apos;s next booking.
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
                      {r.discountPaise > 0 && <div className="text-xs text-success">−{formatINR(r.discountPaise)} discount</div>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={regStatusTone[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-soft">
                      {r.paidAt ? `${formatDateShort(r.paidAt)} ${formatTime(r.paidAt)}` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {r.status === "paid" ? (
                        <ActionForm action={postTo(`/api/admin/registrations/${enc(r.id)}/attendance`)} onDone={(res) => res.ok && reload()} quiet>
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
                          <ActionForm action={postTo(`/api/admin/registrations/${enc(r.id)}/status`)} onDone={(res) => res.ok && reload()}>
                            <input type="hidden" name="status" value="refunded" />
                            <ConfirmButton size="sm" variant="outline" message={`Mark ${r.name}'s registration as refunded?`}>
                              Refund
                            </ConfirmButton>
                          </ActionForm>
                          <ActionForm action={postTo(`/api/admin/registrations/${enc(r.id)}/status`)} onDone={(res) => res.ok && reload()}>
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
          <ActionForm action={postTo(`${base}/mark-all-attended`)} onDone={(r) => r.ok && reload()}>
            <SubmitButton variant="outline" pendingLabel="Marking…">
              <UserCheck className="size-4" aria-hidden /> Mark all paid as attended
            </SubmitButton>
          </ActionForm>

          <div>
            <ActionForm action={() => sendInChunks("reminder", `${base}/send-reminder`, Boolean(session.meetingLink))}>
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

          <ActionForm action={() => sendInChunks("feedback", `${base}/send-feedback-request`, Boolean(session.meetingLink))}>
            <SubmitButton variant="outline" pendingLabel="Sending…">
              <MessageSquareQuote className="size-4" aria-hidden /> Send feedback request to attendees
            </SubmitButton>
          </ActionForm>

          {session.status === "cancelled" && paidCount > 0 && (
            <div>
              <ActionForm action={() => refundAllInChunks(`${base}/refund-all`)} onDone={() => reload()}>
                <ConfirmButton
                  variant="danger"
                  message={`Refund all ${paidCount} paid booking${paidCount === 1 ? "" : "s"} of this cancelled class?\n\nPaid-through-Razorpay bookings are refunded in full to the original payment method; each student is emailed. This cannot be undone.`}
                >
                  <Undo2 className="size-4" aria-hidden /> Refund all paid bookings ({paidCount})
                </ConfirmButton>
              </ActionForm>
              <p className="mt-2 text-xs text-muted">
                Students can also refund or move themselves from their booking page. Bookings not paid through Razorpay are cancelled and need a manual refund.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Add student manually */}
      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">Add a student manually</h2>
        <p className="mt-1 text-sm text-muted">For a student who paid another way (cash, direct UPI, etc).</p>
        <ActionForm
          action={postTo(`${base}/registrations`)}
          onDone={(r) => r.ok && reload()}
          resetOnSuccess
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
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
          <ActionForm action={postTo(`${base}/cancel`)} onDone={(r) => r.ok && reload()}>
            <ConfirmButton
              variant="outline"
              message="Cancel this session? Students will be able to refund or move themselves from their booking page, and you can refund everyone at once from this page afterwards."
            >
              Cancel session
            </ConfirmButton>
          </ActionForm>
          <ActionForm action={postTo(`${base}/delete`)} onDone={(r) => r.ok && navigate("/admin/sessions")}>
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
