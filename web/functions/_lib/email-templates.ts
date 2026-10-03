import { formatDateLong, formatDateShort, formatINR, formatTime, formatTimeRange, monthLabel } from "../../shared/format";
import { JOIN_OPENS_MIN_BEFORE } from "../../shared/live";
import { site, siteUrl } from "./site";
import { getSiteSettings } from "./data/site-settings";
import type { RegistrationWithSession } from "./data/registrations";
import type { TrainingBooking } from "./data/training";
import type { MonthlyPass } from "./data/monthly-pass";
import type { EmailMessage } from "./email";

/** Plain-text email templates. Keep them short, specific and friendly. */

/** `onSiteLink`: the on-site class room (live classes), used when the session has no external meeting link. */
function joiningBlock(link: string | null, onSiteLink?: string): string {
  if (link) return `Joining link: ${link}\nPlease join 5 minutes early so we can start on time.`;
  if (onSiteLink) {
    return `Joining link: ${onSiteLink}\nThe class happens right on our website, so there is nothing to install. Please join 5 minutes early so we can start on time.`;
  }
  return `Your joining link will be emailed to you before the class. You can also find it on your booking page once it's ready.`;
}

const liveLink = (code: string) => `${siteUrl}/live/${code}`;

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
    joiningBlock(reg.meetingLink, liveLink(reg.code)),
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
      joiningBlock(reg.meetingLink, liveLink(reg.code)),
      reg.workshop?.bring.length ? `Please have ready:\n${reg.workshop.bring.map((b) => `• ${b}`).join("\n")}` : "",
      `Registration ID: ${reg.code}\nBooking page: ${siteUrl}/booking/${reg.code}`,
      `— ${site.name}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    kind: "reminder",
  };
}

/** The automatic reminder sent ~24h before a class (POST /api/internal/reminders). */
export function liveReminderEmail(reg: RegistrationWithSession): EmailMessage {
  const title = reg.workshop?.title ?? "your workshop";
  const day = formatDateShort(reg.sessionStartsAt) === formatDateShort(new Date()) ? "Today" : "Tomorrow";
  return {
    to: reg.email,
    subject: `${day}: ${title} at ${formatTime(reg.sessionStartsAt)} IST`,
    text: [
      `Hi ${reg.name.split(" ")[0]},`,
      `A quick reminder that ${title} is ${day.toLowerCase()}.`,
      [`Date: ${formatDateLong(reg.sessionStartsAt)}`, `Time: ${formatTimeRange(reg.sessionStartsAt, reg.sessionDurationMin)}`].join("\n"),
      reg.meetingLink
        ? joiningBlock(reg.meetingLink)
        : [
            `Join the class here: ${liveLink(reg.code)}`,
            `The class happens on our website: no app and no Zoom needed. The room opens ${JOIN_OPENS_MIN_BEFORE} minutes before the start, so you can join early and check your sound.`,
            `For the best experience use a laptop or desktop with Chrome, Edge, Safari or Firefox.`,
          ].join("\n\n"),
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

// ───────────────────────── refunds & moves ─────────────────────────

/** What happened to a cancelled booking's money: refunded through Razorpay / the demo flow, left for a manual refund, or nothing was paid. */
export type RefundOutcome = "razorpay" | "demo" | "manual" | "free";

export type RefundNoticeInfo = {
  product: "workshop" | "training";
  code: string;
  name: string;
  email: string;
  /** Workshop title, or "Personal training: <topic>". */
  title: string;
  startsAt: string;
  amountPaise: number;
  outcome: RefundOutcome;
  refundId: string | null;
  actor: "customer" | "admin";
  /** The class was cancelled by us (workshops only). */
  cancelledByUs: boolean;
};

/** To the customer after a successful cancel/refund. */
export function refundCustomerEmail(i: RefundNoticeInfo): EmailMessage {
  const first = i.name.split(" ")[0];
  const bookingUrl = `${siteUrl}/${i.product === "workshop" ? "booking" : "training"}/${i.code}`;
  const what = `${i.product === "workshop" ? "Registration" : "Booking"} ID: ${i.code}\n${i.title}\nDate: ${formatDateLong(i.startsAt)}, ${formatTime(i.startsAt)} IST`;
  let headline: string;
  if (i.outcome === "razorpay" || i.outcome === "demo") {
    headline =
      `Your booking has been cancelled and a full refund of ${formatINR(i.amountPaise)} is on its way. ` +
      `It goes back to your original payment method and usually takes 5-7 business days to show up.` +
      (i.outcome === "demo" ? " (This was a test booking, so no real money was involved.)" : "");
  } else if (i.outcome === "manual") {
    headline =
      `Your booking has been cancelled. It wasn't paid through our website checkout, so our team will refund ` +
      `${formatINR(i.amountPaise)} to you manually and email you once it's done.`;
  } else {
    headline = `Your booking has been cancelled. Nothing was charged for it, so there is nothing to refund.`;
  }
  return {
    to: i.email,
    subject: `Booking cancelled${i.outcome === "razorpay" || i.outcome === "demo" ? ` — refund of ${formatINR(i.amountPaise)} on its way` : ""} (${i.code})`,
    text: [
      `Hi ${first},`,
      headline,
      what,
      `Your seat has been released and this can't be undone. If you change your mind you're welcome to book again (subject to availability): ${siteUrl}/schedule`,
      `Booking page: ${bookingUrl}`,
      `Questions? Just reply to this email or write to ${site.contactEmail} and quote ${i.code}.`,
      `— ${site.name}`,
    ].join("\n\n"),
    kind: i.product === "workshop" ? "booking" : "training",
  };
}

/** Short notice to the owner contact address: a refund went out, or one needs doing by hand. */
export function refundOwnerEmail(i: RefundNoticeInfo): EmailMessage {
  const manual = i.outcome === "manual";
  const how =
    i.outcome === "razorpay"
      ? `Refunded through Razorpay (refund ${i.refundId ?? "n/a"}), 5-7 business days to the customer.`
      : i.outcome === "demo"
        ? "Test (demo) booking: no real money."
        : manual
          ? "ACTION NEEDED: this booking was not paid through Razorpay checkout. Please refund the customer manually."
          : "Nothing was paid (for example covered by a Monthly Pass), so there is nothing to refund.";
  return {
    to: site.contactEmail,
    subject: `${manual ? "ACTION NEEDED: manual refund" : "Refund"} ${i.code} — ${formatINR(i.amountPaise)} (${i.product})`,
    text: [
      `${i.name} <${i.email}> ${i.actor === "admin" ? "was refunded from the admin dashboard" : "cancelled their booking themselves"}${i.cancelledByUs ? " (class cancelled by us)" : ""}.`,
      `Code: ${i.code}\n${i.title}\nDate: ${formatDateLong(i.startsAt)}, ${formatTime(i.startsAt)} IST\nAmount: ${formatINR(i.amountPaise)}`,
      how,
      `The seat has been released.`,
    ].join("\n\n"),
    kind: "other",
  };
}

/** To the student after they moved their booking to another date. */
export function workshopMovedEmail(reg: RegistrationWithSession): EmailMessage {
  const title = reg.workshop?.title ?? "your workshop";
  return {
    to: reg.email,
    subject: `You're moved: ${title} — ${formatDateLong(reg.sessionStartsAt)}`,
    text: [
      `Hi ${reg.name.split(" ")[0]},`,
      `Your booking has been moved to a new date. Nothing to pay and your registration ID stays the same.`,
      [
        `Registration ID: ${reg.code}`,
        `New date: ${formatDateLong(reg.sessionStartsAt)}`,
        `Time: ${formatTimeRange(reg.sessionStartsAt, reg.sessionDurationMin)}`,
      ].join("\n"),
      joiningBlock(reg.meetingLink, liveLink(reg.code)),
      `Your booking page: ${siteUrl}/booking/${reg.code}`,
      `We'll send a reminder about 24 hours before the class. Questions? Write to ${site.contactEmail}.`,
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
