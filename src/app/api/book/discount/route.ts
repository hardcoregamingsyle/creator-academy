import { NextResponse } from "next/server";
import { istMonthKey } from "@/lib/format";
import { applyDiscount, checkReturningDiscount } from "@/lib/data/registrations";
import { getSession } from "@/lib/data/sessions";
import { hasActivePass } from "@/lib/data/monthly-pass";
import { isEmail, str } from "@/lib/validate";

/** Check whether an email gets this session free (Monthly Pass) or discounted (returning student). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = str(body.email, 200);
  const session = await getSession(str(body.sessionId, 64));
  if (!session || !isEmail(email)) return NextResponse.json({ eligible: false });

  const pass = await hasActivePass(email, istMonthKey(session.startsAt));
  if (pass) {
    return NextResponse.json({ eligible: true, coveredByPass: true, discountPaise: session.pricePaise, amountPaise: 0 });
  }

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
