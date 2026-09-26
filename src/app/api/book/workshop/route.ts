import { NextResponse } from "next/server";
import { createPendingRegistration } from "@/lib/data/registrations";
import { isEmail, normalisePhone, str } from "@/lib/validate";

/** Create a pending registration for a group workshop session. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionId = str(body.sessionId, 64);
  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const phone = normalisePhone(str(body.phone, 30));

  if (!sessionId) return NextResponse.json({ ok: false, error: "Please choose a session." }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  if (!isEmail(email)) return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  if (!phone.ok) {
    return NextResponse.json({ ok: false, error: "Please enter a valid phone number (or leave it empty)." }, { status: 400 });
  }
  if (body.acceptTerms !== true) {
    return NextResponse.json({ ok: false, error: "Please accept the terms and refund policy to continue." }, { status: 400 });
  }

  const result = await createPendingRegistration({ sessionId, name, email, phone: phone.value });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, existingCode: result.existingCode }, { status: 409 });
  }
  const r = result.registration;
  return NextResponse.json({
    ok: true,
    code: r.code,
    basePaise: r.basePaise,
    discountPaise: r.discountPaise,
    amountPaise: r.amountPaise,
  });
}
