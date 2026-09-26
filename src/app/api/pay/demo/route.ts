import { NextResponse } from "next/server";
import { fulfilPayment, getPayable, isPayKind, successPath } from "@/lib/checkout";
import { paymentMode } from "@/lib/payments";
import { str } from "@/lib/validate";

/** DEMO MODE ONLY: simulate a successful payment so the booking flow can be tested. */
export async function POST(req: Request) {
  if (paymentMode() !== "demo") {
    return NextResponse.json({ ok: false, error: "Demo payments are disabled." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind;
  const code = str(body.code, 40);
  if (!isPayKind(kind) || !code) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  const payable = await getPayable(kind, code);
  if (!payable) return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
  if (payable.status !== "pending" && payable.status !== "paid") {
    return NextResponse.json({ ok: false, error: "This booking can no longer be paid." }, { status: 409 });
  }
  await fulfilPayment(kind, payable.id, { provider: "demo", paymentId: `demo_${Date.now()}` });
  return NextResponse.json({ ok: true, redirect: successPath(kind, payable.code) });
}
