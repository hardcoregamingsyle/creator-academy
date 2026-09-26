import { NextResponse } from "next/server";
import { registerInterest } from "@/lib/data/misc";
import { isEmail, str } from "@/lib/validate";

/** Capture "notify me" / "vote for this workshop" interest for a class that isn't bookable yet. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const workshopSlug = str(body.workshopSlug, 200);
  const email = str(body.email, 200);
  const name = str(body.name, 120);
  const note = str(body.note, 1000);

  if (!workshopSlug) return NextResponse.json({ ok: false, error: "Missing workshop." }, { status: 400 });
  if (!isEmail(email)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  }

  const result = await registerInterest({ workshopSlug, email, name: name || null, note: note || null });
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
