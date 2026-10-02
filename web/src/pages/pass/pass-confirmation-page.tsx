import { useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Mail, Sparkles, Ticket, XCircle } from "lucide-react";
import { formatINR } from "@shared/format";
import type { PassConfirmationPage } from "@shared/pages/pass";
import type { PaymentMode } from "@shared/api-types";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { CopyButton } from "@/components/booking/copy-button";
import { RetryPayment } from "@/components/booking/retry-payment";
import { NotFound } from "@/components/not-found";
import { PageSkeleton } from "@/components/page-skeleton";
import { ButtonLink, Card, Container, Notice } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { useRefetchOnNavigation } from "@/lib/useRefetchOnNavigation";

type PassData = PassConfirmationPage["pass"];

export function Component() {
  usePageMeta({ title: "Your All-Access Pass", noindex: true });

  const { code } = useParams<{ code: string }>();
  const { data, error, reload } = useApi<PassConfirmationPage>(code ? `/api/pages/monthly-pass/${encodeURIComponent(code)}` : null);

  // A successful retry payment navigates to this very URL; the route stays mounted, so refetch to show the paid state.
  useRefetchOnNavigation(reload);

  if (error?.status === 404) return <NotFound />;
  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;

  const { pass, paymentMode, contactEmail } = data;

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {pass.status === "paid" && <PaidView pass={pass} />}
        {pass.status === "pending" && <PendingView pass={pass} mode={paymentMode} contactEmail={contactEmail} />}
        {(pass.status === "cancelled" || pass.status === "refunded" || pass.status === "failed") && (
          <OtherStatusView pass={pass} contactEmail={contactEmail} />
        )}
      </div>
    </Container>
  );
}

function PaidView({ pass }: { pass: PassData }) {
  const label = pass.label;
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
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Your {label} pass is active</h1>
        </div>
      </div>

      {pass.paymentProvider === "demo" && (
        <Notice tone="warning" title="Test purchase" className="mb-6">
          No real payment was made — this pass was created with demo payments while online payments are being set up.
        </Notice>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-4 border-b border-dashed border-line bg-sunken px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2 text-ink-soft">
            <Ticket className="size-4" aria-hidden />
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em]">Pass ID</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-ink">{pass.code}</span>
            <CopyButton value={pass.code} />
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <div>
            <p className="text-sm text-muted">Covers</p>
            <p className="mt-1 font-semibold text-ink">{label}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Registered by</p>
            <p className="mt-1 font-semibold text-ink">{pass.name}</p>
            <p className="text-sm text-muted">{pass.email}</p>
          </div>
          <div className="border-t border-line pt-5 sm:col-span-2">
            <div className="flex items-center justify-between text-[15px] text-ink-soft">
              <span>Amount paid</span>
              <span className="font-display text-lg font-bold text-ink">{formatINR(pass.amountPaise)}</span>
            </div>
          </div>
        </div>
      </Card>

      <section className="mt-8 rounded-2xl border border-accent-soft bg-accent-soft/40 p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Sparkles className="size-5 text-accent-strong" aria-hidden /> How to use your pass
        </h2>
        <ol className="mt-3 space-y-2 text-[15px] text-ink-soft">
          <li>1. Browse the schedule and pick any workshop happening in {label}.</li>
          <li>
            2. Book it using <span className="font-semibold text-ink">{pass.email}</span> — the same email you used
            here.
          </li>
          <li>3. It&apos;s instantly confirmed at ₹0 — no payment step, no code to enter.</li>
          <li>4. Repeat for every class you want that month.</li>
        </ol>
      </section>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-8">
        <ButtonLink href="/schedule" variant="primary">
          Browse this month&apos;s classes <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href="/booking" variant="ghost">
          Find a booking
        </ButtonLink>
      </div>
    </div>
  );
}

function PendingView({ pass, mode, contactEmail }: { pass: PassData; mode: PaymentMode; contactEmail: string }) {
  const label = pass.label;
  return (
    <div>
      <div className="mb-8 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
          <Clock className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Payment not completed</h1>
          <p className="mt-2 text-muted">Your {label} All-Access Pass isn&apos;t active yet.</p>
        </div>
      </div>

      <Card className="p-6">
        <dl className="grid gap-4 text-[15px] sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Pass ID</dt>
            <dd className="mt-1 flex items-center gap-2 font-mono font-semibold text-ink">
              {pass.code} <CopyButton value={pass.code} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Amount due</dt>
            <dd className="mt-1 font-semibold text-ink">{formatINR(pass.amountPaise)}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-8">
        {mode === "disabled" ? (
          <Notice tone="warning" title="Online payment is paused">
            We&apos;re finishing our payment setup. Please{" "}
            <a href={`mailto:${contactEmail}`} className="font-semibold underline underline-offset-2">
              contact us
            </a>{" "}
            to complete your purchase.
          </Notice>
        ) : (
          <RetryPayment kind="pass" code={pass.code} amountPaise={pass.amountPaise} demoMode={mode === "demo"} />
        )}
      </div>
    </div>
  );
}

const statusCopy: Record<string, { title: string; body: string }> = {
  cancelled: { title: "Pass cancelled", body: "This pass was cancelled." },
  refunded: { title: "Pass refunded", body: "This pass was refunded." },
  failed: { title: "Payment failed", body: "The payment for this pass didn't go through." },
};

function OtherStatusView({ pass, contactEmail }: { pass: PassData; contactEmail: string }) {
  const copy = statusCopy[pass.status] ?? { title: "Pass status", body: "" };
  return (
    <div>
      <div className="mb-8 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
          <XCircle className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{copy.title}</h1>
          <p className="mt-2 text-muted">
            {copy.body} {pass.label} · Pass ID: <span className="font-mono">{pass.code}</span>
          </p>
        </div>
      </div>
      <Notice tone="info">
        Have questions? Contact us and quote your pass ID {pass.code} — we&apos;ll help sort it out.
      </Notice>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href={`mailto:${contactEmail}`} variant="outline">
          <Mail className="size-4" aria-hidden /> Email us
        </ButtonLink>
        <ButtonLink href="/monthly-pass" variant="ghost">
          Back to All-Access Pass <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </div>
  );
}
