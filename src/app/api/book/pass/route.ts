import { NextResponse } from "next/server";
import { createPendingPass } from "@/lib/data/monthly-pass";
import { isEmail, normalisePhone, str } from "@/lib/validate";

/** Create a pending Monthly Pass purchase for a calendar month. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const monthKey = str(body.monthKey, 7);
  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const phone = normalisePhone(str(body.phone, 30));

  if (!monthKey) return NextResponse.json({ ok: false, error: "Please choose a month." }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  if (!isEmail(email)) return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  if (!phone.ok) {
    return NextResponse.json({ ok: false, error: "Please enter a valid phone number (or leave it empty)." }, { status: 400 });
  }
  if (body.acceptTerms !== true) {
    return NextResponse.json({ ok: false, error: "Please accept the terms and refund policy to continue." }, { status: 400 });
  }

  const result = await createPendingPass({ monthKey, name, email, phone: phone.value });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, code: result.pass.code, amountPaise: result.pass.amountPaise });
}
