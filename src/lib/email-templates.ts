import { formatDateLong, formatINR, formatTimeRange, monthLabel } from "@/lib/format";
import { site, siteUrl } from "@/lib/site";
import { getSiteSettings } from "@/lib/data/site-settings";
import type { RegistrationWithSession } from "@/lib/data/registrations";
import type { TrainingBooking } from "@/lib/data/training";
import type { MonthlyPass } from "@/lib/data/monthly-pass";
import type { EmailMessage } from "@/lib/email";

/** Plain-text email templates. Keep them short, specific and friendly. */

function joiningBlock(link: string | null): string {
  return link
    ? `Joining link: ${link}\nPlease join 5 minutes early so we can start on time.`
    : `Your joining link will be emailed to you before the class. You can also find it on your booking page once it's ready.`;
}

export function workshopConfirmationEmail(reg: RegistrationWithSession): EmailMessage {
  const w = reg.workshop;
  const title = w?.title ?? "your workshop";
  const lines = [
    `Hi ${reg.name.split(" ")[0]},`,
    `You're registered for ${title}. See you there!`,
    [
      `Registration ID: ${reg.code}`,
      `Date: ${formatDateLong(reg.sessionStartsAt)}`,
      `Time: ${formatTimeRange(reg.sessionStartsAt, reg.sessionDurationMin)}`,
      reg.coveredByPassId
        ? `Amount paid: ${formatINR(0)} — covered by your Monthly Pass`
        : `Amount paid: ${formatINR(reg.amountPaise)}${reg.discountPaise ? ` (includes ${formatINR(reg.discountPaise)} returning-student discount)` : ""}`,
    ].join("\n"),
    joiningBlock(reg.meetingLink),
    w?.bring.length ? `Please have ready:\n${w.bring.map((b) => `• ${b}`).join("\n")}` : "",
    w ? `By the end of the class you'll have: ${w.outcome}.` : "",
    `Your booking page (keep this link): ${siteUrl}/booking/${reg.code}`,
    `Questions? Just reply to this email or write to ${site.contactEmail}.`,
    `— ${site.name}`,
  ];
  return {
    to: reg.email,
    subject: `You're booked: ${title} — ${formatDateLong(reg.sessionStartsAt)}`,
    text: lines.filter(Boolean).join("\n\n"),
    kind: "booking",
  };
}

export function sessionReminderEmail(reg: RegistrationWithSession): EmailMessage {
  const title = reg.workshop?.title ?? "your workshop";
  return {
    to: reg.email,
    subject: `Reminder: ${title} — ${formatDateLong(reg.sessionStartsAt)}`,
    text: [
      `Hi ${reg.name.split(" ")[0]},`,
      `A quick reminder that ${title} starts ${formatDateLong(reg.sessionStartsAt)}, ${formatTimeRange(reg.sessionStartsAt, reg.sessionDurationMin)}.`,
      joiningBlock(reg.meetingLink),
      reg.workshop?.bring.length ? `Please have ready:\n${reg.workshop.bring.map((b) => `• ${b}`).join("\n")}` : "",
      `Registration ID: ${reg.code}\nBooking page: ${siteUrl}/booking/${reg.code}`,
      `— ${site.name}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    kind: "reminder",
  };
}

export async function feedbackRequestEmail(reg: RegistrationWithSession): Promise<EmailMessage> {
  const title = reg.workshop?.title ?? "the workshop";
  const settings = await getSiteSettings();
  return {
    to: reg.email,
    subject: `How was ${title}?`,
    text: [
      `Hi ${reg.name.split(" ")[0]},`,
      `Thanks for joining ${title}! We'd love to know how it went — it takes 2 minutes and directly shapes what we teach next:`,
      `${siteUrl}/feedback?code=${reg.code}`,
      `As a thank-you for attending, you get ${settings.returningDiscountPercent}% off your next class. Book with this same email address before the next class starts and the discount is applied automatically at checkout.`,
      `Upcoming classes: ${siteUrl}/schedule`,
      `— ${site.name}`,
    ].join("\n\n"),
    kind: "feedback",
  };
}

export function trainingConfirmationEmail(b: TrainingBooking): EmailMessage {
  return {
    to: b.email,
    subject: `Personal training booked — ${formatDateLong(b.startsAt)}`,
    text: [
      `Hi ${b.name.split(" ")[0]},`,
      `Your personal training session is booked.`,
      [
        `Booking ID: ${b.code}`,
        `Topic: ${b.topic}`,
        `Date: ${formatDateLong(b.startsAt)}`,
        `Time: ${formatTimeRange(b.startsAt, b.durationMin)}`,
        `Amount paid: ${formatINR(b.amountPaise)}`,
      ].join("\n"),
      joiningBlock(b.meetingLink),
      `To make the most of the session, send us any files, links or examples you want to work on by replying to this email.`,
      `Your booking page: ${siteUrl}/training/${b.code}`,
      `— ${site.name}`,
    ].join("\n\n"),
    kind: "training",
  };
}

export function trainingLinkEmail(b: TrainingBooking): EmailMessage {
  return {
    to: b.email,
    subject: `Joining link for your personal training — ${formatDateLong(b.startsAt)}`,
    text: [
      `Hi ${b.name.split(" ")[0]},`,
      `Here are the details for your ${b.durationMin}-minute session on ${b.topic}.`,
      `Date: ${formatDateLong(b.startsAt)}\nTime: ${formatTimeRange(b.startsAt, b.durationMin)}`,
      joiningBlock(b.meetingLink),
      `Booking page: ${siteUrl}/training/${b.code}`,
      `— ${site.name}`,
    ].join("\n\n"),
    kind: "training",
  };
}

export function monthlyPassConfirmationEmail(pass: MonthlyPass): EmailMessage {
  const label = monthLabel(pass.monthKey);
  return {
    to: pass.email,
    subject: `You're all set — ${label} All-Access Pass`,
    text: [
      `Hi ${pass.name.split(" ")[0]},`,
      `Your ${label} All-Access Pass is confirmed. You can now book any live workshop scheduled in ${label} for free — just use this same email address at checkout and the class is instantly confirmed, no payment step.`,
      [`Pass ID: ${pass.code}`, `Covers: ${label}`, `Amount paid: ${formatINR(pass.amountPaise)}`].join("\n"),
      `See what's scheduled and book your classes: ${siteUrl}/schedule`,
      `Your pass page: ${siteUrl}/monthly-pass/${pass.code}`,
      `Questions? Just reply to this email or write to ${site.contactEmail}.`,
      `— ${site.name}`,
    ].join("\n\n"),
    kind: "booking",
  };
}

/** "Here are your bookings" — sent when a student looks up their bookings by email. */
export function bookingLinksEmail(
  email: string,
  registrations: RegistrationWithSession[],
  trainings: TrainingBooking[],
): EmailMessage {
  const lines = [
    ...registrations.map(
      (r) =>
        `• ${r.workshop?.title ?? "Workshop"} — ${formatDateLong(r.sessionStartsAt)}, ${formatTimeRange(r.sessionStartsAt, r.sessionDurationMin)}\n  Registration ID: ${r.code}\n  ${siteUrl}/booking/${r.code}`,
    ),
    ...trainings.map(
      (b) =>
        `• Personal training (${b.topic}, ${b.durationMin} min) — ${formatDateLong(b.startsAt)}, ${formatTimeRange(b.startsAt, b.durationMin)}\n  Booking ID: ${b.code}\n  ${siteUrl}/training/${b.code}`,
    ),
  ];
  return {
    to: email,
    subject: `Your ${site.name} bookings`,
    text: [
      `Hi,`,
      `You (or someone using your email address) asked for your booking details. Here they are:`,
      lines.join("\n\n"),
      `Each link shows your ticket, joining instructions and calendar links.`,
      `Didn't ask for this? You can safely ignore this email.`,
      `— ${site.name}`,
    ].join("\n\n"),
    kind: "other",
  };
}
