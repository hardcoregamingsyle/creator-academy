import { NextResponse } from "next/server";
import { fulfilPayment } from "@/lib/checkout";
import { getRegistrationByOrderId } from "@/lib/data/registrations";
import { getTrainingBookingByOrderId } from "@/lib/data/training";
import { verifyWebhookSignature } from "@/lib/payments";

/**
 * Razorpay webhook — a safety net in case the student closes the browser
 * before the checkout callback runs. Configure it in the Razorpay dashboard
 * for the `payment.captured` and `order.paid` events.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  type Entity = { id?: string; order_id?: string };
  let event: { event?: string; payload?: { payment?: { entity?: Entity }; order?: { entity?: Entity } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (event.event !== "payment.captured" && event.event !== "order.paid") {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id ?? event.payload?.order?.entity?.id;
  if (!orderId) return NextResponse.json({ ok: true, ignored: true });

  const reg = await getRegistrationByOrderId(orderId);
  if (reg) {
    await fulfilPayment("workshop", reg.id, { provider: "razorpay", paymentId: payment?.id ?? null });
    return NextResponse.json({ ok: true });
  }
  const booking = await getTrainingBookingByOrderId(orderId);
  if (booking) {
    await fulfilPayment("training", booking.id, { provider: "razorpay", paymentId: payment?.id ?? null });
  }
  return NextResponse.json({ ok: true });
}
