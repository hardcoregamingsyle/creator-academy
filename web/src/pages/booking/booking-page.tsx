import { useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  Radio,
  Ticket,
  Undo2,
  XCircle,
} from "lucide-react";
import type { PaymentMode } from "@shared/api-types";
import { formatDateLong, formatINR, formatTimeRange } from "@shared/format";
import { JOIN_CLOSES_MIN_AFTER_END, JOIN_OPENS_MIN_BEFORE } from "@shared/live";
import type { BookingChangeOptions, BookingPageData, BookingView } from "@shared/pages/booking";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { useRefetchOnNavigation } from "@/lib/useRefetchOnNavigation";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { CopyButton } from "@/components/booking/copy-button";
import { RetryPayment } from "@/components/booking/retry-payment";
import { NotFound } from "@/components/not-found";
import { PageSkeleton } from "@/components/page-skeleton";
import { ButtonLink, Card, Container, Notice } from "@/components/ui";
import { ChangeOfPlans, mailtoSubject, type ChangeFlash } from "./change-of-plans";

export function Component() {
  const { code = "" } = useParams();
  const { data, error, reload } = useApi<BookingPageData>(`/api/pages/booking/${encodeURIComponent(code)}`);
  // A successful retry payment navigates to this very URL; the route stays mounted, so refetch to show the paid state.
  useRefetchOnNavigation(reload);
  usePageMeta({ title: data ? "Your booking" : undefined, noindex: true });

  if (error?.status === 404) return <NotFound />;
  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;
  return <BookingConfirmation data={data} reload={reload} />;
}

function BookingConfirmation({ data, reload }: { data: BookingPageData; reload: () => void }) {
  const {
    booking: reg,
    returningDiscountPercent,
    paymentMode: mode,
    sessionInFuture,
    googleCalendarUrl,
    contactEmail,
    changeOptions,
  } = data;
  const title = reg.workshop?.title ?? "your workshop";
  const sessionCancelled = reg.sessionStatus === "cancelled";
  // What the last refund / move said; kept here so it survives the reload that swaps the page into its new state.
  const [flash, setFlash] = useState<ChangeFlash | null>(null);

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {flash && (
          <Notice tone="success" title={flash.kind === "moved" ? "Booking moved" : "Booking cancelled"} className="mb-8">
            {flash.message}
            {flash.kind === "moved" && (
              <>
                {" "}
                Your join link is{" "}
                <Link to={`/live/${encodeURIComponent(flash.code)}`} className="font-semibold underline underline-offset-2">
                  /live/{flash.code}
                </Link>
                . It opens {JOIN_OPENS_MIN_BEFORE} minutes before the class.
              </>
            )}
          </Notice>
        )}

        {sessionCancelled && (
          <Notice tone="warning" title="This class was cancelled" className="mb-8">
            {title} on {formatDateLong(reg.sessionStartsAt)} was cancelled.{" "}
            {reg.status === "paid" ? (
              <>You can choose a full refund or a free move to another date in the &ldquo;Change of plans?&rdquo; section below, whenever you like. </>
            ) : (
              <>
                We&apos;ll contact you at {reg.email} about a refund or a free transfer to another date.{" "}
              </>
            )}
            Questions? Email{" "}
            <a href={`mailto:${contactEmail}`} className="font-semibold underline underline-offset-2">
              {contactEmail}
            </a>{" "}
            and quote your registration ID {reg.code}.
          </Notice>
        )}

        {reg.status === "paid" && (
          <PaidView
            reg={reg}
            title={title}
            gcalUrl={googleCalendarUrl}
            returningDiscountPercent={returningDiscountPercent}
            changeOptions={changeOptions}
            contactEmail={contactEmail}
            onChanged={(f) => {
              setFlash(f);
              reload();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
        {reg.status === "pending" && (
          <PendingView reg={reg} title={title} mode={mode} sessionInFuture={sessionInFuture} contactEmail={contactEmail} />
        )}
        {reg.status === "refunded" && <RefundedView reg={reg} title={title} contactEmail={contactEmail} />}
        {(reg.status === "cancelled" || reg.status === "failed") && (
          <OtherStatusView reg={reg} title={title} contactEmail={contactEmail} />
        )}
      </div>
    </Container>
  );
}

// ───────────────────────── paid ─────────────────────────

function PaidView({
  reg,
  title,
  gcalUrl,
  returningDiscountPercent,
  changeOptions,
  contactEmail,
  onChanged,
}: {
  reg: BookingView;
  title: string;
  gcalUrl: string | null;
  returningDiscountPercent: number;
  changeOptions: BookingChangeOptions | null;
  contactEmail: string;
  onChanged: (flash: ChangeFlash) => void;
}) {
  const w = reg.workshop;
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

      {reg.demoPayment && (
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

      <LiveClassCard reg={reg} />

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
          {gcalUrl && (
            <ButtonLink href={gcalUrl} target="_blank" rel="noopener noreferrer" variant="outline">
              <CalendarPlus className="size-4" aria-hidden /> Google Calendar
            </ButtonLink>
          )}
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
              text: `Attend, and get ${returningDiscountPercent}% off your next class — book with this same email before our next class starts and it's applied automatically.`,
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

      {changeOptions && <ChangeOfPlans reg={reg} options={changeOptions} contactEmail={contactEmail} onChanged={onChanged} />}

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

/** Link to the in-browser live room for a paid booking, from 30 minutes before the class until the join window closes. */
function LiveClassCard({ reg }: { reg: BookingView }) {
  if (reg.sessionStatus === "cancelled") return null;
  const start = new Date(reg.sessionStartsAt).getTime();
  const now = Date.now();
  if (now > start + (reg.sessionDurationMin + JOIN_CLOSES_MIN_AFTER_END) * 60_000) return null;
  const open = now >= start - JOIN_OPENS_MIN_BEFORE * 60_000;
  return (
    <Card className="mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
          <Radio className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">Join the live class</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {open
              ? "The room is open. Watch the class, chat with the host and join polls right here in your browser."
              : `Watch the class in your browser. The room opens ${JOIN_OPENS_MIN_BEFORE} minutes before the start — come back to this page then.`}
          </p>
        </div>
      </div>
      <ButtonLink href={`/live/${encodeURIComponent(reg.code)}`} variant="primary" className="shrink-0">
        <Radio className="size-4" aria-hidden /> Join the live class
      </ButtonLink>
    </Card>
  );
}

// ───────────────────────── pending ─────────────────────────

function PendingView({
  reg,
  title,
  mode,
  sessionInFuture,
  contactEmail,
}: {
  reg: BookingView;
  title: string;
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
                <Link to={`/classes/${reg.workshopSlug}`} className="font-semibold underline underline-offset-2">
                  {title}
                </Link>
                , or{" "}
              </>
            )}
            <a href={`mailto:${contactEmail}`} className="font-semibold underline underline-offset-2">
              contact us
            </a>{" "}
            if you already paid.
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
          <RetryPayment kind="workshop" code={reg.code} amountPaise={reg.amountPaise} demoMode={mode === "demo"} />
        )}
      </div>
    </div>
  );
}

// ───────────────────────── other statuses ─────────────────────────

const statusCopy: Record<string, { title: string; body: string }> = {
  cancelled: { title: "Booking cancelled", body: "This registration was cancelled." },
  failed: { title: "Payment failed", body: "The payment for this registration didn't go through." },
};

/** A refunded booking: how much, where it goes and when to expect it. No join button: the seat has been released. */
function RefundedView({ reg, title, contactEmail }: { reg: BookingView; title: string; contactEmail: string }) {
  return (
    <div>
      <div className="mb-8 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-soft">
          <Undo2 className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Booking refunded</h1>
          <p className="mt-2 text-muted">
            {title} on {formatDateLong(reg.sessionStartsAt)}. Registration ID: <span className="font-mono">{reg.code}</span>
          </p>
        </div>
      </div>
      <Card className="p-6">
        {reg.demoPayment ? (
          <p className="text-[15px] text-ink-soft">This was a test booking, so no real money was involved. Your seat has been released.</p>
        ) : reg.refundAmountPaise ? (
          <>
            <p className="font-display text-2xl font-bold text-ink">{formatINR(reg.refundAmountPaise)}</p>
            <p className="mt-1 text-[15px] text-ink-soft">
              is on its way back to your original payment method. It usually takes 5-7 business days to show up. Your seat has been
              released.
            </p>
          </>
        ) : (
          <p className="text-[15px] text-ink-soft">This registration was refunded and your seat has been released.</p>
        )}
      </Card>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href={mailtoSubject(contactEmail, reg.code, "question about my refund")} variant="outline">
          <Mail className="size-4" aria-hidden /> Email us
        </ButtonLink>
        <ButtonLink href="/schedule" variant="ghost">
          Browse other classes <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </div>
  );
}

function OtherStatusView({ reg, title, contactEmail }: { reg: BookingView; title: string; contactEmail: string }) {
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
        <ButtonLink href={`mailto:${contactEmail}`} variant="outline">
          <Mail className="size-4" aria-hidden /> Email us
        </ButtonLink>
        <ButtonLink href="/schedule" variant="ghost">
          Browse other classes <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </div>
  );
}
