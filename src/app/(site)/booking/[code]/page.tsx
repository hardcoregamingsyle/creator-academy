import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  ListChecks,
  Mail,
  Ticket,
  XCircle,
} from "lucide-react";
import type { Workshop } from "@/content/workshops";
import { getRegistrationByCode, type RegistrationWithSession } from "@/lib/data/registrations";
import { formatDateLong, formatINR, formatTimeRange } from "@/lib/format";
import { paymentMode, type PaymentMode } from "@/lib/payments";
import { site, siteUrl } from "@/lib/site";
import { ButtonLink, Card, Container, Notice } from "@/components/ui";
import { CopyButton } from "./copy-button";
import { RetryPayment } from "./retry-payment";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

/** ISO timestamp → UTC basic format for calendar links, e.g. "20260926T113000Z". */
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

export default async function BookingConfirmationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const reg = await getRegistrationByCode(code);
  if (!reg) notFound();

  const title = reg.workshop?.title ?? "your workshop";
  const mode = paymentMode();
  const sessionInFuture = new Date(reg.sessionStartsAt).getTime() > Date.now();
  const sessionCancelled = reg.sessionStatus === "cancelled";

  const gcalUrl = googleCalendarUrl({
    title: `${title} — ${site.name}`,
    startsAt: reg.sessionStartsAt,
    durationMin: reg.sessionDurationMin,
    details: [
      `Your booking page: ${siteUrl}/booking/${reg.code}`,
      reg.meetingLink ? `Joining link: ${reg.meetingLink}` : "Your joining link will be emailed before the class.",
    ].join("\n"),
  });

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {sessionCancelled && (
          <Notice tone="warning" title="This class was cancelled" className="mb-8">
            {title} on {formatDateLong(reg.sessionStartsAt)} was cancelled. We&apos;ll contact you at {reg.email}{" "}
            about a refund or a free transfer to another date. Questions? Email{" "}
            <a href={`mailto:${site.contactEmail}`} className="font-semibold underline underline-offset-2">
              {site.contactEmail}
            </a>{" "}
            and quote your registration ID {reg.code}.
          </Notice>
        )}

        {reg.status === "paid" && <PaidView reg={reg} title={title} gcalUrl={gcalUrl} />}
        {reg.status === "pending" && (
          <PendingView reg={reg} title={title} mode={mode} sessionInFuture={sessionInFuture} />
        )}
        {(reg.status === "cancelled" || reg.status === "refunded" || reg.status === "failed") && (
          <OtherStatusView reg={reg} title={title} />
        )}
      </div>
    </Container>
  );
}

// ───────────────────────── paid ─────────────────────────

function PaidView({ reg, title, gcalUrl }: { reg: RegistrationWithSession; title: string; gcalUrl: string }) {
  const w: Workshop | undefined = reg.workshop;
  return (
    <div>
      <div className="mb-8 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-success">
            Payment successful
          </p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">You&apos;re registered for {title}</h1>
        </div>
      </div>

      {reg.paymentProvider === "demo" && (
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
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em]">Registration ID</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">{reg.code}</span>
            <CopyButton value={reg.code} />
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <div>
            <p className="text-sm text-muted">Workshop</p>
            <p className="mt-1 font-semibold text-ink">{title}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Registered by</p>
            <p className="mt-1 font-semibold text-ink">{reg.name}</p>
            <p className="text-sm text-muted">{reg.email}</p>
          </div>
          <div className="flex gap-3">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
            <div>
              <p className="text-sm text-muted">Date</p>
              <p className="font-semibold text-ink">{formatDateLong(reg.sessionStartsAt)}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Clock className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
            <div>
              <p className="text-sm text-muted">Time</p>
              <p className="font-semibold text-ink">{formatTimeRange(reg.sessionStartsAt, reg.sessionDurationMin)}</p>
            </div>
          </div>
          <div className="border-t border-line pt-5 sm:col-span-2">
            <div className="flex items-center justify-between text-[15px] text-ink-soft">
              <span>Amount paid</span>
              <span className="font-display text-lg font-bold text-ink">{formatINR(reg.amountPaise)}</span>
            </div>
            {reg.discountPaise > 0 && (
              <div className="mt-2 flex items-center justify-between text-sm text-success">
                <span className="flex items-center gap-1.5">
                  <BadgePercent className="size-3.5" aria-hidden /> Includes returning-student discount
                </span>
                <span>−{formatINR(reg.discountPaise)}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Joining instructions */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Joining instructions</h2>
        {reg.meetingLink ? (
          <div className="mt-3">
            <ButtonLink href={reg.meetingLink} target="_blank" rel="noopener noreferrer" variant="primary">
              <ExternalLink className="size-4" aria-hidden /> Join the class
            </ButtonLink>
          </div>
        ) : (
          <p className="mt-2 text-[15px] text-ink-soft">
            Your joining link will be emailed before the class and will appear on this page once it&apos;s ready.
          </p>
        )}
      </section>

      {/* Have these ready */}
      {w && w.bring.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">Have these ready</h2>
          <ul className="mt-3 space-y-2 text-[15px] text-ink-soft">
            {w.bring.map((b) => (
              <li key={b} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add to calendar */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Add to calendar</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <ButtonLink href={gcalUrl} target="_blank" rel="noopener noreferrer" variant="outline">
            <CalendarPlus className="size-4" aria-hidden /> Google Calendar
          </ButtonLink>
          <ButtonLink href={`/api/calendar/${reg.code}`} variant="outline">
            <Download className="size-4" aria-hidden /> Download .ics
          </ButtonLink>
        </div>
      </section>

      {/* What happens next */}
      <section className="mt-10">
        <h2 className="font-display text-lg font-bold">What happens next</h2>
        <ol className="mt-4 space-y-4">
          {[
            { icon: Clock, text: "Join 5 minutes early so we can start on time." },
            {
              icon: ListChecks,
              text: w ? `Follow along and create — you'll leave with: ${w.outcome}.` : "Follow along and create something finished.",
            },
            { icon: Mail, text: "We'll email a short feedback form after class — it takes about 2 minutes." },
            {
              icon: BadgePercent,
              text: `Attend, and get ${site.pricing.returningDiscountPercent}% off your next class — book with this same email before our next class starts and it's applied automatically.`,
            },
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-soft">
                <step.icon className="size-4" aria-hidden />
              </span>
              <p className="mt-1 text-[15px] text-ink-soft">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-8">
        <ButtonLink href="/schedule" variant="outline">
          Browse other classes <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href={`/feedback?code=${reg.code}`} variant="ghost">
          Share feedback
        </ButtonLink>
      </div>
    </div>
  );
}

// ───────────────────────── pending ─────────────────────────

function PendingView({
  reg,
  title,
  mode,
  sessionInFuture,
}: {
  reg: RegistrationWithSession;
  title: string;
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
            Your seat for {title} on {formatDateLong(reg.sessionStartsAt)} isn&apos;t confirmed yet.
          </p>
        </div>
      </div>

      <Card className="p-6">
        <dl className="grid gap-4 text-[15px] sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Registration ID</dt>
            <dd className="mt-1 flex items-center gap-2 font-mono font-semibold text-ink">
              {reg.code} <CopyButton value={reg.code} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Amount due</dt>
            <dd className="mt-1 font-semibold text-ink">{formatINR(reg.amountPaise)}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-8">
        {!sessionInFuture ? (
          <Notice tone="warning" title="This session has already started">
            Payment can no longer be completed for this session.{" "}
            {reg.workshop && (
              <>
                See other dates for{" "}
                <Link href={`/classes/${reg.workshopSlug}`} className="font-semibold underline underline-offset-2">
                  {title}
                </Link>
                , or{" "}
              </>
            )}
            <a href={`mailto:${site.contactEmail}`} className="font-semibold underline underline-offset-2">
              contact us
            </a>{" "}
            if you already paid.
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
          <RetryPayment kind="workshop" code={reg.code} amountPaise={reg.amountPaise} demoMode={mode === "demo"} />
        )}
      </div>
    </div>
  );
}

// ───────────────────────── other statuses ─────────────────────────

const statusCopy: Record<string, { title: string; body: string }> = {
  cancelled: { title: "Booking cancelled", body: "This registration was cancelled." },
  refunded: { title: "Booking refunded", body: "This registration was refunded." },
  failed: { title: "Payment failed", body: "The payment for this registration didn't go through." },
};

function OtherStatusView({ reg, title }: { reg: RegistrationWithSession; title: string }) {
  const copy = statusCopy[reg.status] ?? { title: "Booking status", body: "" };
  return (
    <div>
      <div className="mb-8 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
          <XCircle className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{copy.title}</h1>
          <p className="mt-2 text-muted">
            {copy.body} Registration ID: <span className="font-mono">{reg.code}</span>
          </p>
        </div>
      </div>
      <Notice tone="info">
        Have questions about {title}? Contact us and quote your registration ID {reg.code} — we&apos;ll help sort it
        out.
      </Notice>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href={`mailto:${site.contactEmail}`} variant="outline">
          <Mail className="size-4" aria-hidden /> Email us
        </ButtonLink>
        <ButtonLink href="/schedule" variant="ghost">
          Browse other classes <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </div>
  );
}
