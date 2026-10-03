import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Mail,
  Send,
  Ticket,
  Undo2,
  XCircle,
} from "lucide-react";
import { brand } from "@shared/brand";
import { formatDateLong, formatDateTime, formatINR, formatTimeRange } from "@shared/format";
import type { PaymentMode } from "@shared/api-types";
import type { RefundBookingResponse } from "@shared/pages/booking";
import type { TrainingBookingPageData, TrainingBookingView, TrainingChangeOptions } from "@shared/pages/training";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { useRefetchOnNavigation } from "@/lib/useRefetchOnNavigation";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { ConfirmDialog } from "@/components/booking/confirm-dialog";
import { CopyButton } from "@/components/booking/copy-button";
import { RetryPayment } from "@/components/booking/retry-payment";
import { NotFound } from "@/components/not-found";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button, ButtonLink, Card, Container, Notice } from "@/components/ui";

function toUtcBasic(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function googleCalendarUrl(opts: { title: string; startsAt: string; durationMin: number; details: string }): string {
  const start = new Date(opts.startsAt);
  const end = new Date(start.getTime() + opts.durationMin * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${toUtcBasic(start.toISOString())}/${toUtcBasic(end.toISOString())}`,
    details: opts.details,
    location: "Online",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function Component() {
  const { code } = useParams<{ code: string }>();
  usePageMeta({ title: "Your personal training booking", noindex: true });
  const { data, error, reload } = useApi<TrainingBookingPageData>(
    code ? `/api/pages/training/${encodeURIComponent(code)}` : null,
  );
  // A successful retry payment navigates to this very URL; the route stays mounted, so refetch to show the paid state.
  useRefetchOnNavigation(reload);

  if (!code || error?.status === 404) return <NotFound />;
  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;
  return <TrainingConfirmation data={data} reload={reload} />;
}

function TrainingConfirmation({ data, reload }: { data: TrainingBookingPageData; reload: () => void }) {
  const { booking: b, paymentMode: mode, sessionInFuture, contactEmail, siteUrl, changeOptions } = data;
  // What the last refund said; kept here so it survives the reload that swaps the page into its refunded state.
  const [flash, setFlash] = useState<string | null>(null);

  const gcalUrl = googleCalendarUrl({
    title: `Personal training: ${b.topic} — ${brand.name}`,
    startsAt: b.startsAt,
    durationMin: b.durationMin,
    details: [
      `Your booking page: ${siteUrl}/training/${b.code}`,
      b.meetingLink ? `Joining link: ${b.meetingLink}` : "Your joining link will be emailed before the session.",
    ].join("\n"),
  });

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {flash && (
          <Notice tone="success" title="Booking cancelled" className="mb-8">
            {flash}
          </Notice>
        )}
        {(b.status === "paid" || b.status === "completed") && (
          <PaidView
            b={b}
            gcalUrl={gcalUrl}
            contactEmail={contactEmail}
            changeOptions={changeOptions}
            onCancelled={(message) => {
              setFlash(message);
              reload();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
        {b.status === "pending" && (
          <PendingView b={b} mode={mode} sessionInFuture={sessionInFuture} contactEmail={contactEmail} />
        )}
        {(b.status === "cancelled" || b.status === "refunded" || b.status === "failed") && (
          <OtherStatusView b={b} contactEmail={contactEmail} />
        )}
      </div>
    </Container>
  );
}

// ───────────────────────── paid / completed ─────────────────────────

function PaidView({
  b,
  gcalUrl,
  contactEmail,
  changeOptions,
  onCancelled,
}: {
  b: TrainingBookingView;
  gcalUrl: string;
  contactEmail: string;
  changeOptions: TrainingChangeOptions | null;
  onCancelled: (message: string) => void;
}) {
  return (
    <div>
      <div className="mb-8 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-success">
            {b.status === "completed" ? "Session completed" : "Payment successful"}
          </p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Your personal training session is booked</h1>
        </div>
      </div>

      {b.demoPayment && (
        <Notice tone="warning" title="Test booking" className="mb-6">
          No real payment was made — this booking was created with demo payments while online payments are being set
          up.
        </Notice>
      )}

      {/* Ticket */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-4 border-b border-dashed border-line bg-sunken px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2 text-ink-soft">
            <Ticket className="size-4" aria-hidden />
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em]">Booking ID</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">{b.code}</span>
            <CopyButton value={b.code} />
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <div>
            <p className="text-sm text-muted">Topic</p>
            <p className="mt-1 font-semibold text-ink">{b.topic}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Duration</p>
            <p className="mt-1 font-semibold text-ink">{b.durationMin} minutes</p>
          </div>
          <div className="flex gap-3">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
            <div>
              <p className="text-sm text-muted">Date</p>
              <p className="font-semibold text-ink">{formatDateLong(b.startsAt)}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Clock className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
            <div>
              <p className="text-sm text-muted">Time</p>
              <p className="font-semibold text-ink">{formatTimeRange(b.startsAt, b.durationMin)}</p>
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className="text-sm text-muted">Booked by</p>
            <p className="mt-1 font-semibold text-ink">{b.name}</p>
            <p className="text-sm text-muted">{b.email}</p>
          </div>
          <div className="border-t border-line pt-5 sm:col-span-2">
            <div className="flex items-center justify-between text-[15px] text-ink-soft">
              <span>Amount paid</span>
              <span className="font-display text-lg font-bold text-ink">{formatINR(b.amountPaise)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Joining instructions */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Joining instructions</h2>
        {b.meetingLink ? (
          <div className="mt-3">
            <ButtonLink href={b.meetingLink} target="_blank" rel="noopener noreferrer" variant="primary">
              <ExternalLink className="size-4" aria-hidden /> Join the session
            </ButtonLink>
          </div>
        ) : (
          <p className="mt-2 text-[15px] text-ink-soft">
            Your joining link will be emailed before the session and will appear on this page once it&apos;s ready.
          </p>
        )}
      </section>

      {/* Send files */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Send us your files</h2>
        <p className="mt-2 flex items-start gap-2 text-[15px] text-ink-soft">
          <Send className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <span>
            To make the most of your session, reply to your confirmation email or write to{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="font-medium text-accent-strong underline underline-offset-2"
            >
              {contactEmail}
            </a>{" "}
            with any files, links or examples — and mention your booking ID {b.code}.
          </span>
        </p>
      </section>

      {/* Add to calendar */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Add to calendar</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <ButtonLink href={gcalUrl} target="_blank" rel="noopener noreferrer" variant="outline">
            <CalendarPlus className="size-4" aria-hidden /> Google Calendar
          </ButtonLink>
          <ButtonLink href={`/api/calendar/${b.code}`} variant="outline">
            <Download className="size-4" aria-hidden /> Download .ics
          </ButtonLink>
        </div>
      </section>

      {changeOptions && <TrainingChangeOfPlans b={b} options={changeOptions} contactEmail={contactEmail} onCancelled={onCancelled} />}

      <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-8">
        <ButtonLink href="/schedule" variant="outline">
          Browse our classes <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href="/personal-training" variant="ghost">
          Book another session
        </ButtonLink>
      </div>
    </div>
  );
}

/** "Change of plans?" for personal training: cancel for a refund 24h or more before the session; rescheduling is by email. */
function TrainingChangeOfPlans({
  b,
  options,
  contactEmail,
  onCancelled,
}: {
  b: TrainingBookingView;
  options: TrainingChangeOptions;
  contactEmail: string;
  onCancelled: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false); // blocks a second click before React has re-rendered the disabled button
  const free = options.refundAmountPaise <= 0;
  const viaApi = options.refundMethodNote.startsWith("Refunded");
  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(`Booking ${b.code}: reschedule or refund request`)}`;

  async function cancel() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await api.post<RefundBookingResponse>(`/api/training/${encodeURIComponent(b.code)}/refund`);
      if (!res.ok) throw new Error(res.message);
      setOpen(false);
      onCancelled(res.message);
    } catch (err) {
      setError(errorMessage(err));
      setOpen(false);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Card className="mt-10 p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold">Change of plans?</h2>
      <p className="mt-1 text-sm text-ink-soft">{options.reason}</p>
      <p className="mt-2 text-sm text-ink-soft">
        To reschedule instead, email us and we will find a new time with you. Rescheduling is free up to 24 hours before the session.
      </p>

      {error && (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {options.canRefund && (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setOpen(true)}>
            <Undo2 className="size-4" aria-hidden /> {free ? "Cancel booking" : "Cancel and refund"}
          </Button>
        )}
        <ButtonLink href={mailto} variant={options.canRefund ? "ghost" : "outline"} size="sm">
          <Mail className="size-4" aria-hidden /> Email us
        </ButtonLink>
      </div>

      {options.canRefund && options.deadlineAt && (
        <p className="mt-4 text-xs text-muted">
          Free cancellation closes {formatDateTime(options.deadlineAt)}, 24 hours before the session.
        </p>
      )}

      {open && (
        <ConfirmDialog
          title={free ? "Cancel this booking?" : `Cancel and get ${formatINR(options.refundAmountPaise)} back?`}
          busy={pending}
          confirmLabel={free ? "Yes, cancel my booking" : `Yes, cancel and refund ${formatINR(options.refundAmountPaise)}`}
          onConfirm={cancel}
          onClose={() => setOpen(false)}
        >
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            {viaApi && !free ? (
              <li>
                <span className="font-semibold text-ink">{formatINR(options.refundAmountPaise)}</span>{" "}
                {options.refundMethodNote.replace(/^Refunded/, "goes back")}
              </li>
            ) : (
              <li>{options.refundMethodNote}</li>
            )}
            <li>Your time slot is released straight away, so it can go to someone else.</li>
            <li className="font-semibold text-ink">This can&apos;t be undone.</li>
          </ul>
        </ConfirmDialog>
      )}
    </Card>
  );
}

// ───────────────────────── pending ─────────────────────────

function PendingView({
  b,
  mode,
  sessionInFuture,
  contactEmail,
}: {
  b: TrainingBookingView;
  mode: PaymentMode;
  sessionInFuture: boolean;
  contactEmail: string;
}) {
  return (
    <div>
      <div className="mb-8 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
          <Clock className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Payment not completed</h1>
          <p className="mt-2 text-muted">
            Your session on {formatDateLong(b.startsAt)} isn&apos;t confirmed yet.
          </p>
        </div>
      </div>

      <Card className="p-6">
        <dl className="grid gap-4 text-[15px] sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Booking ID</dt>
            <dd className="mt-1 flex items-center gap-2 font-mono font-semibold text-ink">
              {b.code} <CopyButton value={b.code} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Amount due</dt>
            <dd className="mt-1 font-semibold text-ink">{formatINR(b.amountPaise)}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-8">
        {!sessionInFuture ? (
          <Notice tone="warning" title="This session has already started">
            Payment can no longer be completed for this time.{" "}
            <a href={`mailto:${contactEmail}`} className="font-semibold underline underline-offset-2">
              Contact us
            </a>{" "}
            if you already paid, or{" "}
            <Link to="/personal-training" className="font-semibold underline underline-offset-2">
              book a new session
            </Link>
            .
          </Notice>
        ) : mode === "disabled" ? (
          <Notice tone="warning" title="Online booking is paused">
            We&apos;re finishing our payment setup. Please{" "}
            <a href={`mailto:${contactEmail}`} className="font-semibold underline underline-offset-2">
              contact us
            </a>{" "}
            to complete your booking.
          </Notice>
        ) : (
          <RetryPayment kind="training" code={b.code} amountPaise={b.amountPaise} demoMode={mode === "demo"} />
        )}
      </div>
    </div>
  );
}

// ───────────────────────── other statuses ─────────────────────────

const statusCopy: Record<string, { title: string; body: string }> = {
  cancelled: { title: "Booking cancelled", body: "This booking was cancelled." },
  refunded: { title: "Booking refunded", body: "This booking was refunded." },
  failed: { title: "Payment failed", body: "The payment for this booking didn't go through." },
};

function OtherStatusView({ b, contactEmail }: { b: TrainingBookingView; contactEmail: string }) {
  const copy = statusCopy[b.status] ?? { title: "Booking status", body: "" };
  const refundNote =
    b.status === "refunded" && b.refundAmountPaise && !b.demoPayment
      ? `${formatINR(b.refundAmountPaise)} is on its way back to your original payment method. It usually takes 5-7 business days to show up. Your time slot has been released.`
      : b.status === "refunded" && b.demoPayment
        ? "This was a test booking, so no real money was involved."
        : null;
  return (
    <div>
      <div className="mb-8 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
          <XCircle className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{copy.title}</h1>
          <p className="mt-2 text-muted">
            {copy.body} Booking ID: <span className="font-mono">{b.code}</span>
          </p>
        </div>
      </div>
      {refundNote && (
        <Notice tone="success" className="mb-4">
          {refundNote}
        </Notice>
      )}
      <Notice tone="info">
        Have questions about this booking? Contact us and quote your booking ID {b.code} — we&apos;ll help sort it
        out.
      </Notice>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href={`mailto:${contactEmail}`} variant="outline">
          <Mail className="size-4" aria-hidden /> Email us
        </ButtonLink>
        <ButtonLink href="/personal-training" variant="ghost">
          Book a new session
        </ButtonLink>
      </div>
    </div>
  );
}
