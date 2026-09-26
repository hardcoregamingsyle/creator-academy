import { NextResponse } from "next/server";
import { getRegistrationByCode } from "@/lib/data/registrations";
import { getTrainingBookingByCode } from "@/lib/data/training";
import { site, siteUrl } from "@/lib/site";

/** GET /api/calendar/:code — a downloadable .ics file for a paid booking. */
export const dynamic = "force-dynamic";

/** ISO timestamp → UTC basic format, e.g. "20260926T113000Z". */
function toUtcBasic(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Escape text for use inside an ICS content line (RFC 5545 §3.3.11). */
function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Fold a content line at 75 octets, with continuation lines starting with a space (RFC 5545 §3.1). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let out = "";
  let rest = line;
  while (rest.length > 75) {
    out += rest.slice(0, 75) + "\r\n ";
    rest = rest.slice(75);
  }
  return out + rest;
}

type EventInfo = {
  title: string;
  startsAt: string;
  durationMin: number;
  meetingLink: string | null;
  bookingPath: string;
};

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.trim().toUpperCase();
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

  let event: EventInfo | null = null;

  if (code.startsWith("CA-")) {
    const reg = await getRegistrationByCode(code);
    if (!reg || reg.status !== "paid") return notFound();
    event = {
      title: `${reg.workshop?.title ?? "Workshop"} — ${site.name}`,
      startsAt: reg.sessionStartsAt,
      durationMin: reg.sessionDurationMin,
      meetingLink: reg.meetingLink,
      bookingPath: `/booking/${reg.code}`,
    };
  } else if (code.startsWith("PT-")) {
    const booking = await getTrainingBookingByCode(code);
    if (!booking || (booking.status !== "paid" && booking.status !== "completed")) return notFound();
    event = {
      title: `Personal training: ${booking.topic} — ${site.name}`,
      startsAt: booking.startsAt,
      durationMin: booking.durationMin,
      meetingLink: booking.meetingLink,
      bookingPath: `/training/${booking.code}`,
    };
  } else {
    return notFound();
  }

  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + event.durationMin * 60_000);
  const descriptionLines = [`Booking page: ${siteUrl}${event.bookingPath}`];
  descriptionLines.push(
    event.meetingLink ? `Joining link: ${event.meetingLink}` : "Your joining link will be emailed before the class.",
  );

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${site.name}//Booking//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${code}@${siteUrl.replace(/^https?:\/\//, "")}`,
    `DTSTAMP:${toUtcBasic(new Date().toISOString())}`,
    `DTSTART:${toUtcBasic(start.toISOString())}`,
    `DTEND:${toUtcBasic(end.toISOString())}`,
    foldLine(`SUMMARY:${escapeIcsText(event.title)}`),
    foldLine(`DESCRIPTION:${escapeIcsText(descriptionLines.join("\n"))}`),
    "LOCATION:Online",
    `URL:${siteUrl}${event.bookingPath}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${code}.ics"`,
    },
  });
}
