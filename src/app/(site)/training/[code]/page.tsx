import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  XCircle,
} from "lucide-react";
import { getTrainingBookingByCode, type TrainingBooking } from "@/lib/data/training";
import { formatDateLong, formatINR, formatTimeRange } from "@/lib/format";
import { paymentMode, type PaymentMode } from "@/lib/payments";
import { site, siteUrl } from "@/lib/site";
import { ButtonLink, Card, Container, Notice } from "@/components/ui";
import { CopyButton } from "../../booking/[code]/copy-button";
import { RetryPayment } from "../../booking/[code]/retry-payment";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your personal training booking", robots: { index: false } };

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

export default async function TrainingConfirmationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const b = await getTrainingBookingByCode(code);
  if (!b) notFound();

  const mode = paymentMode();
  const sessionInFuture = new Date(b.startsAt).getTime() > Date.now();

  const gcalUrl = googleCalendarUrl({
    title: `Personal training: ${b.topic} — ${site.name}`,
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
        {(b.status === "paid" || b.status === "completed") && <PaidView b={b} gcalUrl={gcalUrl} />}
        {b.status === "pending" && <PendingView b={b} mode={mode} sessionInFuture={sessionInFuture} />}
        {(b.status === "cancelled" || b.status === "refunded" || b.status === "failed") && <OtherStatusView b={b} />}
      </div>
    </Container>
  );
}

// ───────────────────────── paid / completed ─────────────────────────

function PaidView({ b, gcalUrl }: { b: TrainingBooking; gcalUrl: string }) {
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

      {b.paymentProvider === "demo" && (
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
              href={`mailto:${site.contactEmail}`}
              className="font-medium text-accent-strong underline underline-offset-2"
            >
              {site.contactEmail}
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

// ───────────────────────── pending ─────────────────────────

function PendingView({
  b,
  mode,
  sessionInFuture,
}: {
  b: TrainingBooking;
  mode: PaymentMode;
  sessionInFuture: boolean;
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
            <a href={`mailto:${site.contactEmail}`} className="font-semibold underline underline-offset-2">
              Contact us
            </a>{" "}
            if you already paid, or{" "}
            <Link href="/personal-training" className="font-semibold underline underline-offset-2">
              book a new session
            </Link>
            .
          </Notice>
        ) : mode === "disabled" ? (
          <Notice tone="warning" title="Online booking is paused">
            We&apos;re finishing our payment setup. Please{" "}
            <a href={`mailto:${site.contactEmail}`} className="font-semibold underline underline-offset-2">
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

function OtherStatusView({ b }: { b: TrainingBooking }) {
  const copy = statusCopy[b.status] ?? { title: "Booking status", body: "" };
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
      <Notice tone="info">
        Have questions about this booking? Contact us and quote your booking ID {b.code} — we&apos;ll help sort it
        out.
      </Notice>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href={`mailto:${site.contactEmail}`} variant="outline">
          <Mail className="size-4" aria-hidden /> Email us
        </ButtonLink>
        <ButtonLink href="/personal-training" variant="ghost">
          Book a new session
        </ButtonLink>
      </div>
    </div>
  );
}
