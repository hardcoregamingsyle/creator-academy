import { NextResponse } from "next/server";
import { applyDiscount, checkReturningDiscount } from "@/lib/data/registrations";
import { getSession } from "@/lib/data/sessions";
import { isEmail, str } from "@/lib/validate";

/** Check whether an email qualifies for the returning-student discount on a session. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = str(body.email, 200);
  const session = await getSession(str(body.sessionId, 64));
  if (!session || !isEmail(email)) return NextResponse.json({ eligible: false });

  const check = await checkReturningDiscount(email);
  if (!check.eligible) return NextResponse.json({ eligible: false, amountPaise: session.pricePaise });
  const { discountPaise, amountPaise } = applyDiscount(session.pricePaise, check.percent);
  return NextResponse.json({
    eligible: true,
    percent: check.percent,
    sourceWorkshopTitle: check.sourceWorkshopTitle,
    discountPaise,
    amountPaise,
  });
}
