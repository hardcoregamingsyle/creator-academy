import { Lock } from "lucide-react";
import { formatINR } from "@shared/format";
import { Button, Notice } from "@/components/ui";
import {
  DemoPaymentDialog,
  PaymentSpinner,
  paymentButtonLabel,
  usePayment,
  type PayKind,
} from "@/components/payment/use-payment";

/**
 * "Retry payment" button shown on a pending booking's confirmation page.
 * Shared by the workshop (`kind="workshop"`) and personal-training
 * (`kind="training"`) confirmation pages.
 */
export function RetryPayment({
  kind,
  code,
  amountPaise,
  demoMode,
}: {
  kind: PayKind;
  code: string;
  amountPaise: number;
  demoMode: boolean;
}) {
  const payment = usePayment();
  const idleLabel = `Retry payment · ${formatINR(amountPaise)}`;

  return (
    <div className="space-y-4">
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={payment.busy}
        onClick={() => {
          payment.setError(null);
          payment.pay(kind, code);
        }}
      >
        {payment.busy ? <PaymentSpinner /> : <Lock className="size-4" aria-hidden />}
        {paymentButtonLabel(payment.state, idleLabel)}
      </Button>

      {payment.error && <Notice tone="error">{payment.error}</Notice>}

      {demoMode && (
        <Notice tone="warning" title="Demo mode">
          Payments aren&apos;t connected yet — this simulates a payment so you can test the booking flow. No money is
          charged.
        </Notice>
      )}

      <DemoPaymentDialog payment={payment} />
    </div>
  );
}
