"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { formatINR } from "@/lib/format";
import { isEmail } from "@/lib/validate";
import { Button, Field, Input, Notice } from "@/components/ui";
import { DemoPaymentDialog, PaymentSpinner, paymentButtonLabel, usePayment } from "@/components/payment/use-payment";

type MonthOption = { monthKey: string; label: string };

export function PassForm({
  months,
  pricePaise,
  demoMode,
}: {
  months: MonthOption[];
  pricePaise: number;
  demoMode: boolean;
}) {
  const payment = usePayment();
  const [monthKey, setMonthKey] = useState(months[0]?.monthKey ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accept, setAccept] = useState(false);
  const [creating, setCreating] = useState(false);

  const busy = creating || payment.busy;
  const idleLabel = `Get the All-Access Pass · ${formatINR(pricePaise)}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    payment.setError(null);
    if (!monthKey) return payment.setError("Please choose a month.");
    if (name.trim().length < 2) return payment.setError("Please enter your name.");
    if (!isEmail(email)) return payment.setError("Please enter a valid email address.");
    if (!accept) return payment.setError("Please accept the terms and refund policy to continue.");

    setCreating(true);
    const res = await fetch("/api/book/pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthKey, name, email, phone, acceptTerms: accept }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "Network error — please try again." }));
    setCreating(false);
    if (!res.ok) return payment.setError(res.error ?? "Something went wrong.");
    await payment.pay("pass", res.code as string);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {months.length > 1 && (
        <fieldset>
          <legend className="mb-1.5 block text-sm font-semibold text-ink">Which month?</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {months.map((m) => (
              <label
                key={m.monthKey}
                className={`cursor-pointer rounded-xl border p-3 text-center text-sm font-semibold transition-colors ${
                  monthKey === m.monthKey
                    ? "border-accent-strong bg-accent-soft text-accent-strong"
                    : "border-line-strong text-ink-soft hover:border-ink"
                }`}
              >
                <input
                  type="radio"
                  name="monthKey"
                  value={m.monthKey}
                  checked={monthKey === m.monthKey}
                  onChange={() => setMonthKey(m.monthKey)}
                  className="sr-only"
                  disabled={busy}
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Field label="Full name" htmlFor="pass-name">
        <Input
          id="pass-name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          disabled={busy}
        />
      </Field>
      <Field label="Email" htmlFor="pass-email" hint="Book any class this month with this same email — it's free automatically.">
        <Input
          id="pass-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={busy}
        />
      </Field>
      <Field label="Phone" htmlFor="pass-phone" optional>
        <Input
          id="pass-phone"
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
          <Link href="/policies/terms" target="_blank" className="font-medium text-accent-strong underline underline-offset-2">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/policies/refunds" target="_blank" className="font-medium text-accent-strong underline underline-offset-2">
            cancellation &amp; refund policy
          </Link>
          . If I&apos;m under 18, a parent or guardian has approved this purchase.
        </span>
      </label>

      {payment.error && <Notice tone="error">{payment.error}</Notice>}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <PaymentSpinner /> : <Lock className="size-4" aria-hidden />}
        {creating ? "Setting up your pass…" : paymentButtonLabel(payment.state, idleLabel)}
        {!busy && <ArrowRight className="size-4" aria-hidden />}
      </Button>

      {demoMode && (
        <Notice tone="warning" title="Demo mode">
          Payments aren&apos;t connected yet — the next step simulates a payment so you can test the flow. No money is
          charged.
        </Notice>
      )}

      <DemoPaymentDialog payment={payment} />
    </form>
  );
}
