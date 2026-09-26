"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { FlaskConical, LoaderCircle, ShieldCheck } from "lucide-react";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui";

/**
 * Client-side payment flow shared by workshop and personal-training checkout.
 *
 *   const payment = usePayment();
 *   await payment.pay("workshop", code);   // opens Razorpay (or the demo dialog)
 *   <DemoPaymentDialog payment={payment} /> // render once in the form
 *
 * On success the browser is redirected to the booking confirmation page.
 */

export type PayKind = "workshop" | "training";

type StartResponse =
  | {
      ok: true;
      mode: "razorpay";
      keyId: string;
      orderId: string;
      amountPaise: number;
      currency: string;
      name: string;
      description: string;
      prefill: { name: string; email: string; contact: string };
    }
  | { ok: true; mode: "demo"; amountPaise: number }
  | { ok: true; alreadyPaid: true; redirect: string }
  | { ok: false; error: string };

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadRazorpay(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error("Could not load the payment window. Check your connection and try again."));
      };
      document.body.appendChild(s);
    });
  }
  return scriptPromise;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({ ok: false, error: "Unexpected server response." }))) as T;
}

export type PaymentState = "idle" | "starting" | "checkout" | "verifying" | "redirecting";

export function usePayment() {
  const router = useRouter();
  const [state, setState] = useState<PaymentState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<{ kind: PayKind; code: string; amountPaise: number } | null>(null);

  const go = useCallback(
    (url: string) => {
      setState("redirecting");
      router.push(url);
    },
    [router],
  );

  const pay = useCallback(
    async (kind: PayKind, code: string) => {
      setError(null);
      setState("starting");
      const start = await postJson<StartResponse>("/api/pay/start", { kind, code });
      if (!start.ok) {
        setError(start.error);
        setState("idle");
        return;
      }
      if ("alreadyPaid" in start) return go(start.redirect);
      if (start.mode === "demo") {
        setDemo({ kind, code, amountPaise: start.amountPaise });
        setState("checkout");
        return;
      }

      try {
        await loadRazorpay();
      } catch (e) {
        setError((e as Error).message);
        setState("idle");
        return;
      }
      const rzp = new window.Razorpay!({
        key: start.keyId,
        amount: start.amountPaise,
        currency: start.currency,
        name: start.name,
        description: start.description,
        order_id: start.orderId,
        prefill: start.prefill,
        theme: { color: "#6D28D9" },
        modal: {
          ondismiss: () => {
            setState("idle");
            setError("Payment was cancelled. Your seat is held for a few minutes — you can try again.");
          },
        },
        handler: async (resp: RazorpayResponse) => {
          setState("verifying");
          const verified = await postJson<{ ok: boolean; redirect?: string; error?: string }>("/api/pay/verify", {
            kind,
            code,
            ...resp,
          });
          if (verified.ok && verified.redirect) return go(verified.redirect);
          setState("idle");
          setError(
            (verified.error ?? "We couldn't verify the payment.") +
              " If money was deducted, don't worry — it will be confirmed automatically or refunded. Contact us with your booking ID: " +
              code,
          );
        },
      });
      rzp.on("payment.failed", (r) => {
        setError(r.error?.description ? `Payment failed: ${r.error.description}` : "Payment failed. Please try again.");
      });
      setState("checkout");
      rzp.open();
    },
    [go],
  );

  const confirmDemo = useCallback(async () => {
    if (!demo) return;
    setState("verifying");
    const res = await postJson<{ ok: boolean; redirect?: string; error?: string }>("/api/pay/demo", {
      kind: demo.kind,
      code: demo.code,
    });
    if (res.ok && res.redirect) {
      setDemo(null);
      return go(res.redirect);
    }
    setDemo(null);
    setState("idle");
    setError(res.error ?? "Demo payment failed.");
  }, [demo, go]);

  const cancelDemo = useCallback(() => {
    setDemo(null);
    setState("idle");
  }, []);

  const busy = state !== "idle";
  return { pay, state, busy, error, setError, demo, confirmDemo, cancelDemo };
}

export type PaymentController = ReturnType<typeof usePayment>;

/** Label for the pay button while the flow is running. */
export function paymentButtonLabel(state: PaymentState, idleLabel: string): string {
  switch (state) {
    case "starting":
      return "Preparing secure payment…";
    case "checkout":
      return "Complete payment in the popup…";
    case "verifying":
      return "Confirming payment…";
    case "redirecting":
      return "Payment successful — redirecting…";
    default:
      return idleLabel;
  }
}

export function PaymentSpinner() {
  return <LoaderCircle className="size-4 animate-spin" aria-hidden />;
}

/** Demo-mode stand-in for the Razorpay window. Only shown when no payment keys are configured. */
export function DemoPaymentDialog({ payment }: { payment: PaymentController }) {
  if (!payment.demo) return null;
  const verifying = payment.state === "verifying" || payment.state === "redirecting";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="demo-pay-title">
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-lift">
        <div className="flex items-center gap-2 text-warning">
          <FlaskConical className="size-5" aria-hidden />
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em]">Demo mode</p>
        </div>
        <h2 id="demo-pay-title" className="mt-3 text-2xl font-bold">
          Simulate payment of {formatINR(payment.demo.amountPaise)}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Online payments aren&apos;t connected yet, so no real money is charged. This completes the booking exactly as
          a successful payment would — confirmation, registration ID and email included.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={payment.cancelDemo} disabled={verifying}>
            Cancel
          </Button>
          <Button variant="primary" onClick={payment.confirmDemo} disabled={verifying}>
            {verifying ? <PaymentSpinner /> : <ShieldCheck className="size-4" aria-hidden />}
            {verifying ? "Completing…" : "Simulate successful payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
