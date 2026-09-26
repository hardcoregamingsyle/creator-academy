import { NextResponse } from "next/server";
import { fulfilPayment, getPayable, isPayKind, successPath } from "@/lib/checkout";
import { verifyCheckoutSignature } from "@/lib/payments";
import { str } from "@/lib/validate";

/** Called by the browser after Razorpay Checkout reports a successful payment. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind;
  const code = str(body.code, 40);
  const orderId = str(body.razorpay_order_id, 80);
  const paymentId = str(body.razorpay_payment_id, 80);
  const signature = str(body.razorpay_signature, 200);
  if (!isPayKind(kind) || !code) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const payable = await getPayable(kind, code);
  if (!payable) return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
  if (!payable.providerOrderId || payable.providerOrderId !== orderId) {
    return NextResponse.json({ ok: false, error: "Payment does not match this booking." }, { status: 400 });
  }
  if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
    return NextResponse.json({ ok: false, error: "Payment verification failed." }, { status: 400 });
  }

  await fulfilPayment(kind, payable.id, { provider: "razorpay", paymentId });
  return NextResponse.json({ ok: true, redirect: successPath(kind, payable.code) });
}
