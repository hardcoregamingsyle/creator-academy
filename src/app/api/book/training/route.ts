import { NextResponse } from "next/server";
import { createPendingTrainingBooking } from "@/lib/data/training";
import { isEmail, normalisePhone, str } from "@/lib/validate";

/** Create a pending 1:1 personal training booking. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slotId = str(body.slotId, 64);
  const topic = str(body.topic, 120);
  const durationMin = Number(body.durationMin);
  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const phone = normalisePhone(str(body.phone, 30));
  const goals = str(body.goals, 2000);

  if (!topic) return NextResponse.json({ ok: false, error: "Please choose a topic." }, { status: 400 });
  if (!slotId) return NextResponse.json({ ok: false, error: "Please choose a time." }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  if (!isEmail(email)) return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  if (!phone.ok) {
    return NextResponse.json({ ok: false, error: "Please enter a valid phone number (or leave it empty)." }, { status: 400 });
  }
  if (body.acceptTerms !== true) {
    return NextResponse.json({ ok: false, error: "Please accept the terms and refund policy to continue." }, { status: 400 });
  }

  const result = await createPendingTrainingBooking({ slotId, topic, durationMin, name, email, phone: phone.value, goals });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, code: result.booking.code, amountPaise: result.booking.amountPaise });
}
