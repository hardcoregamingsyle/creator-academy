import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BadgePercent, Lock, Sparkles } from "lucide-react";
import { formatINR } from "@shared/format";
import { isEmail } from "@shared/validate";
import type {
  DiscountCheckRequest,
  DiscountCheckResponse,
  WorkshopBookingRequest,
  WorkshopBookingResponse,
} from "@shared/pages/booking";
import { api, ApiError } from "@/lib/api";
import { Price } from "@/components/price";
import { Button, Field, Input, Notice } from "@/components/ui";
import { useSite } from "@/lib/site-context";
import {
  DemoPaymentDialog,
  PaymentSpinner,
  paymentButtonLabel,
  usePayment,
} from "@/components/payment/use-payment";

type Discount = {
  eligible: true;
  percent?: number;
  sourceWorkshopTitle?: string;
  discountPaise: number;
  amountPaise: number;
  coveredByPass?: boolean;
};

/** The booking endpoint answers failures as `{ ok: false, error }` with a 4xx status; fold them into the success shape. */
async function createBooking(body: WorkshopBookingRequest): Promise<WorkshopBookingResponse> {
  try {
    return await api.post<WorkshopBookingResponse>("/api/book/workshop", body);
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Network error — please try again." };
  }
}

/** The "already registered" answer points people to "Find my booking" (the server never reveals the booking code here). */
const FIND_MY_BOOKING = /find my booking/i;

export function CheckoutForm({
  sessionId,
  pricePaise,
  demoMode,
}: {
  sessionId: string;
  pricePaise: number;
  demoMode: boolean;
}) {
  const payment = usePayment();
  const { returningDiscountPercent } = useSite().pricing;
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accept, setAccept] = useState(false);
  const [creating, setCreating] = useState(false);
  const [discount, setDiscount] = useState<Discount | null>(null);

  const amount = discount?.amountPaise ?? pricePaise;
  const busy = creating || payment.busy;

  async function checkDiscount(value: string) {
    if (!isEmail(value)) {
      setDiscount(null);
      return;
    }
    const request: DiscountCheckRequest = { sessionId, email: value };
    const res = await api.post<DiscountCheckResponse>("/api/book/discount", request).catch(() => null);
    setDiscount(res?.eligible ? (res as Discount) : null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    payment.setError(null);

    if (name.trim().length < 2) return payment.setError("Please enter your name.");
    if (!isEmail(email)) return payment.setError("Please enter a valid email address — your joining details are sent there.");
    if (!accept) return payment.setError("Please accept the terms and refund policy to continue.");

    // The server re-uses an unpaid booking for the same email, so retrying is safe.
    setCreating(true);
    const res = await createBooking({ sessionId, name, email, phone, acceptTerms: accept });
    setCreating(false);
    if (!res.ok) {
      payment.setError(res.error ?? "Something went wrong.");
      return;
    }
    const code = res.code;

    // Covered by a Monthly Pass — already paid server-side, no checkout step.
    if (res.coveredByPass) {
      navigate(`/booking/${code}`);
      return;
    }

    // Trust the server's price (it applies the returning-student discount itself).
    if (res.discountPaise > 0) {
      setDiscount((d) =>
        d ?? {
          eligible: true,
          percent: Math.round((res.discountPaise / res.basePaise) * 100),
          sourceWorkshopTitle: "our previous class",
          discountPaise: res.discountPaise,
          amountPaise: res.amountPaise,
        },
      );
    } else {
      setDiscount(null);
    }
    await payment.pay("workshop", code);
  }

  const idleLabel = discount?.coveredByPass ? "Confirm booking — Free" : `Continue to payment · ${formatINR(amount)}`;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Full name" htmlFor="name">
        <Input
          id="name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          disabled={busy}
        />
      </Field>
      <Field
        label="Email"
        htmlFor="email"
        hint="Your confirmation, joining link and class files are sent here."
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={(e) => checkDiscount(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={busy}
        />
      </Field>
      {discount?.coveredByPass && (
        <Notice tone="success" title="Covered by your Monthly Pass — this class is free">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5" aria-hidden /> No payment needed — just confirm your details below.
          </span>
        </Notice>
      )}
      {discount && !discount.coveredByPass && (
        <Notice tone="success" title={`Welcome back — ${discount.percent}% returning-student discount applied`}>
          Thanks for attending {discount.sourceWorkshopTitle}. You pay {formatINR(discount.amountPaise)} instead of{" "}
          {formatINR(pricePaise)}.
        </Notice>
      )}
      <Field
        label="Phone"
        htmlFor="phone"
        optional
        hint="Only used if we need to reach you about this class."
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98765 43210"
          disabled={busy}
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-4 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={accept}
          onChange={(e) => setAccept(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[#6D28D9]"
          disabled={busy}
        />
        <span>
          I agree to the{" "}
          <Link to="/policies/terms" target="_blank" className="font-medium text-accent-strong underline underline-offset-2">
            terms
          </Link>{" "}
          and{" "}
          <Link to="/policies/refunds" target="_blank" className="font-medium text-accent-strong underline underline-offset-2">
            cancellation &amp; refund policy
          </Link>
          . If I&apos;m under 18, a parent or guardian has approved this booking.
        </span>
      </label>

      <div className="rounded-xl border border-line p-4 text-[15px]">
        <div className="flex justify-between text-ink-soft">
          <span>Workshop seat</span>
          <Price paise={pricePaise} />
        </div>
        {discount?.coveredByPass && (
          <div className="mt-2 flex justify-between text-success">
            <span>Monthly Pass</span>
            <span>−{formatINR(discount.discountPaise)}</span>
          </div>
        )}
        {discount && !discount.coveredByPass && (
          <div className="mt-2 flex justify-between text-success">
            <span>Returning-student discount ({discount.percent}%)</span>
            <span>−{formatINR(discount.discountPaise)}</span>
          </div>
        )}
        <div className="mt-3 flex justify-between border-t border-line pt-3 font-semibold text-ink">
          <span>Total</span>
          <span className="font-display text-lg">{formatINR(amount)}</span>
        </div>
      </div>

      {payment.error && (
        <Notice tone="error">
          {payment.error}
          {FIND_MY_BOOKING.test(payment.error) && (
            <>
              {" "}
              <Link to="/booking" className="font-semibold underline">
                Find my booking
              </Link>
            </>
          )}
        </Notice>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <PaymentSpinner /> : <Lock className="size-4" aria-hidden />}
        {creating ? "Reserving your seat…" : paymentButtonLabel(payment.state, idleLabel)}
        {!busy && <ArrowRight className="size-4" aria-hidden />}
      </Button>

      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted">
        <BadgePercent className="size-3.5" aria-hidden />
        Attended our last class? Use the same email and {returningDiscountPercent}% comes off automatically.
      </p>

      {demoMode && (
        <Notice tone="warning" title="Demo mode">
          Payments aren&apos;t connected yet — the next step simulates a payment so you can test the booking flow. No
          money is charged.
        </Notice>
      )}

      <DemoPaymentDialog payment={payment} />
    </form>
  );
}
