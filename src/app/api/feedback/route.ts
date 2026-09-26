import { NextResponse } from "next/server";
import { createFeedback, type AttendAgain } from "@/lib/data/feedback";
import { str } from "@/lib/validate";

const ATTEND_AGAIN_VALUES: AttendAgain[] = ["yes", "maybe", "no"];

/** Post-class feedback. No email required — identified by an optional registration code or workshop. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const rating = Number(body.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ ok: false, error: "Please choose a rating from 1 to 5 stars." }, { status: 400 });
  }

  const registrationCode = str(body.registrationCode, 32) || null;
  const workshopSlug = str(body.workshopSlug, 80) || null;
  const attendAgainRaw = str(body.attendAgain, 10);
  const attendAgain = ATTEND_AGAIN_VALUES.includes(attendAgainRaw as AttendAgain) ? (attendAgainRaw as AttendAgain) : null;

  const result = await createFeedback({
    registrationCode,
    workshopSlug,
    rating,
    learned: str(body.learned, 2000) || null,
    unclear: str(body.unclear, 2000) || null,
    improve: str(body.improve, 2000) || null,
    teachNext: str(body.teachNext, 2000) || null,
    attendAgain,
    publicComment: str(body.publicComment, 2000) || null,
    displayName: str(body.displayName, 60) || null,
    consentPublic: body.consentPublic === true,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
