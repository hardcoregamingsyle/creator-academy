import { NextResponse } from "next/server";
import { listRegistrationsByEmail, normaliseEmail } from "@/lib/data/registrations";
import { listTrainingBookingsByEmail } from "@/lib/data/training";
import { sendEmail } from "@/lib/email";
import { bookingLinksEmail } from "@/lib/email-templates";
import { isEmail, str } from "@/lib/validate";

/**
 * "Lost your booking ID?" — emails the student links to their paid bookings.
 * The response is identical whether or not bookings exist, so this can't be
 * used to discover who has booked. Links are only ever sent to the inbox.
 */

const recent = new Map<string, number>();
const COOLDOWN_MS = 2 * 60_000;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = normaliseEmail(str(body.email, 200));
  if (!isEmail(email)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  }

  const last = recent.get(email) ?? 0;
  if (Date.now() - last > COOLDOWN_MS) {
    recent.set(email, Date.now());
    const since = Date.now() - 30 * 86_400_000; // upcoming + last 30 days
    const [regs, trainings] = await Promise.all([listRegistrationsByEmail(email), listTrainingBookingsByEmail(email)]);
    const paidRegs = regs.filter((r) => r.status === "paid" && new Date(r.sessionStartsAt).getTime() > since);
    const paidTrainings = trainings.filter(
      (b) => (b.status === "paid" || b.status === "completed") && new Date(b.startsAt).getTime() > since,
    );
    if (paidRegs.length || paidTrainings.length) {
      await sendEmail(bookingLinksEmail(email, paidRegs, paidTrainings));
    }
  }

  return NextResponse.json({ ok: true });
}
