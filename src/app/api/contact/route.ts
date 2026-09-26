import { NextResponse } from "next/server";
import { createContactMessage } from "@/lib/data/misc";
import { isEmail, str } from "@/lib/validate";

/** Contact form submissions. A filled honeypot field pretends success without writing anything. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Honeypot: real visitors never see or fill this field.
  if (str(body.website, 200)) {
    return NextResponse.json({ ok: true });
  }

  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const topic = str(body.topic, 60);
  const message = str(body.message, 5000);

  if (name.length < 2) return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  if (!isEmail(email)) return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  if (message.length < 10) {
    return NextResponse.json({ ok: false, error: "Please add a few more details to your message." }, { status: 400 });
  }

  await createContactMessage({ name, email, topic: topic || null, message });
  return NextResponse.json({ ok: true });
}
