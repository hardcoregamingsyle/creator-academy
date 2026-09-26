import { NextResponse } from "next/server";
import { ensureHold, getPayable, isPayKind, saveOrderId, successPath } from "@/lib/checkout";
import { createRazorpayOrder, paymentMode, razorpayKeyId } from "@/lib/payments";
import { site } from "@/lib/site";
import { str } from "@/lib/validate";

/**
 * Begin payment for a pending booking. Returns what the browser needs to open
 * Razorpay Checkout (or tells it we're in demo mode).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind;
  const code = str(body.code, 40);
  if (!isPayKind(kind) || !code) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const payable = await getPayable(kind, code);
  if (!payable) return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
  if (payable.status === "paid" || payable.status === "completed") {
    return NextResponse.json({ ok: true, alreadyPaid: true, redirect: successPath(kind, payable.code) });
  }
  if (payable.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: "This booking can no longer be paid. Please start a new booking." },
      { status: 409 },
    );
  }
  if (new Date(payable.startsAt).getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: "This session has already started." }, { status: 409 });
  }

  if (!(await ensureHold(payable))) {
    return NextResponse.json(
      {
        ok: false,
        error:
          kind === "workshop"
            ? "Sorry — your seat hold expired and this session has since filled up. Please pick another date."
            : "Sorry — your hold expired and this time has since been booked. Please pick another time.",
      },
      { status: 409 },
    );
  }

  const mode = paymentMode();
  if (mode === "disabled") {
    return NextResponse.json(
      { ok: false, error: `Online payments are not available right now. Please contact us at ${site.contactEmail}.` },
      { status: 503 },
    );
  }
  if (mode === "demo") {
    return NextResponse.json({ ok: true, mode, amountPaise: payable.amountPaise });
  }

  try {
    let orderId = payable.providerOrderId;
    if (!orderId) {
      const order = await createRazorpayOrder({
        amountPaise: payable.amountPaise,
        receipt: payable.code,
        notes: { kind, code: payable.code },
      });
      orderId = order.id;
      await saveOrderId(payable, orderId);
    }
    return NextResponse.json({
      ok: true,
      mode,
      keyId: razorpayKeyId(),
      orderId,
      amountPaise: payable.amountPaise,
      currency: "INR",
      name: site.name,
      description: payable.description,
      prefill: { name: payable.name, email: payable.email, contact: payable.phone ?? "" },
    });
  } catch (err) {
    console.error("[pay/start]", err);
    return NextResponse.json(
      { ok: false, error: "We couldn't start the payment. Please try again in a moment." },
      { status: 502 },
    );
  }
}
