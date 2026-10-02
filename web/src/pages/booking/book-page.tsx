import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Check, Clock, Mail, ShieldCheck, Users } from "lucide-react";
import { formatDateLong, formatTimeRange } from "@shared/format";
import type { BookPageData } from "@shared/pages/booking";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { CategoryIcon } from "@/components/brand";
import { NotFound } from "@/components/not-found";
import { PageSkeleton } from "@/components/page-skeleton";
import { SeatsLeft, SessionList } from "@/components/session-list";
import { ButtonLink, Card, Container, Notice } from "@/components/ui";
import { CheckoutForm } from "./checkout-form";

export function Component() {
  const { sessionId = "" } = useParams();
  const { data, error, reload } = useApi<BookPageData>(`/api/pages/book/${encodeURIComponent(sessionId)}`);
  usePageMeta({ title: data ? "Book your seat" : undefined, noindex: true });

  if (error?.status === 404) return <NotFound />;
  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;
  return <BookView data={data} />;
}

function BookView({ data }: { data: BookPageData }) {
  const { session, bookable, paymentMode: mode, alternatives } = data;
  const w = session.workshop;

  return (
    <Container className="py-10 sm:py-14">
      <Link to={`/classes/${w.slug}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back to {w.title}
      </Link>

      <p className="mt-6 font-mono text-xs uppercase tracking-[0.14em] text-muted">Checkout · Step 2 of 2</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Book your seat</h1>

      {/* Mobile order: summary → form → extras. Desktop: summary + extras left, form right. */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_420px] lg:gap-x-12">
        <div className="lg:col-start-1 lg:row-start-1">
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink">
                <CategoryIcon category={w.category} />
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-bold">{w.title}</h2>
                <p className="mt-1 text-muted">{w.promise}</p>
              </div>
            </div>
            <dl className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                <div>
                  <dt className="text-sm text-muted">Date</dt>
                  <dd className="font-semibold">{formatDateLong(session.startsAt)}</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                <div>
                  <dt className="text-sm text-muted">Time</dt>
                  <dd className="font-semibold">{formatTimeRange(session.startsAt, session.durationMin)}</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Users className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                <div>
                  <dt className="text-sm text-muted">Format</dt>
                  <dd className="font-semibold">Live online · small group</dd>
                  <dd className="mt-1">
                    <SeatsLeft session={session} />
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-track-green" aria-hidden />
                <div>
                  <dt className="text-sm text-muted">You leave with</dt>
                  <dd className="font-semibold">{w.outcome}</dd>
                </div>
              </div>
            </dl>
          </Card>
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Card className="p-6 sm:p-7 lg:sticky lg:top-24">
            {bookable && mode !== "disabled" ? (
              <>
                <h2 className="text-xl font-bold">Your details</h2>
                <p className="mt-1 mb-6 text-sm text-muted">Takes under a minute. No account needed.</p>
                <CheckoutForm sessionId={session.id} pricePaise={session.pricePaise} demoMode={mode === "demo"} />
              </>
            ) : mode === "disabled" ? (
              <Notice tone="warning" title="Online booking is paused">
                We&apos;re finishing our payment setup. Please check back soon or contact us to reserve a seat.
              </Notice>
            ) : (
              <div>
                <Notice tone="warning" title={session.seatsLeft <= 0 ? "This session is full" : "This session is closed for booking"}>
                  {alternatives.length ? "Pick another date below." : "New dates are announced regularly."}
                </Notice>
                {alternatives.length === 0 && (
                  <ButtonLink href={`/classes/${w.slug}`} variant="outline" className="mt-4 w-full">
                    Get notified about new dates
                  </ButtonLink>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <ul className="space-y-3 text-[15px] text-ink-soft">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
              Secure checkout — pay with UPI, card, netbanking or wallet.
            </li>
            <li className="flex gap-3">
              <Mail className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
              Instant confirmation email with your registration ID, class time and joining instructions.
            </li>
            <li className="flex gap-3">
              <CalendarDays className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
              <span>
                Can&apos;t make it? Cancel 24+ hours before for a full refund or a free move to another date —{" "}
                <Link to="/policies/refunds" className="font-medium text-accent-strong underline underline-offset-2">
                  refund policy
                </Link>
                .
              </span>
            </li>
          </ul>

          {w.bring.length > 0 && (
            <div className="mt-8">
              <h3 className="font-display text-lg font-bold">Have these ready for class</h3>
              <ul className="mt-3 space-y-2 text-[15px] text-ink-soft">
                {w.bring.map((b) => (
                  <li key={b} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {alternatives.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 text-2xl font-bold">Other dates for {w.title}</h2>
          <SessionList sessions={alternatives.map((a) => ({ ...a, workshop: w }))} showWorkshop={false} />
        </div>
      )}
    </Container>
  );
}
