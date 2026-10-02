import { Hono, type Context } from "hono";
import type {
  BookingLookupResponse,
  BookingPageData,
  BookingSessionCore,
  BookPageData,
  DiscountCheckResponse,
  PayDoneResponse,
  PayStartResponse,
  ResendResponse,
  WorkshopBookingResponse,
} from "../../shared/pages/booking";
import { istMonthKey } from "../../shared/format";
import { ensureHold, fulfilPayment, getPayable, isPayKind, saveOrderId, successPath } from "../_lib/checkout";
import {
  applyDiscount,
  checkReturningDiscount,
  createPendingRegistration,
  getRegistrationById,
  getRegistrationByCode,
  getRegistrationByOrderId,
  listRegistrationsByEmail,
  normaliseEmail,
} from "../_lib/data/registrations";
import { hasActivePass, getPassByOrderId } from "../_lib/data/monthly-pass";
import { getSession, isBookable, listUpcomingSessions, type ClassSession } from "../_lib/data/sessions";
import { getSiteSettings } from "../_lib/data/site-settings";
import {
  getTrainingBookingByCode,
  getTrainingBookingByOrderId,
  listTrainingBookingsByEmail,
} from "../_lib/data/training";
import { sendEmail } from "../_lib/email";
import { bookingLinksEmail, workshopConfirmationEmail } from "../_lib/email-templates";
import { createRazorpayOrder, paymentMode, razorpayKeyId, verifyCheckoutSignature, verifyWebhookSignature } from "../_lib/payments";
import { site, siteUrl } from "../_lib/site";
import type { AppEnv } from "./types";
import { isEmail, normalisePhone, notFound, str } from "./util";

export const routes = new Hono<AppEnv>();

async function readJson(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** Blank the fields that are only for people who booked (join link, internal notes, attendance count). */
function publicSession(s: ClassSession): BookingSessionCore {
  return {
    id: s.id,
    workshopSlug: s.workshopSlug,
    startsAt: s.startsAt,
    durationMin: s.durationMin,
    capacity: s.capacity,
    pricePaise: s.pricePaise,
    meetingLink: null,
    status: s.status,
    notes: null,
    createdAt: s.createdAt,
    seatsTaken: s.seatsTaken,
    seatsLeft: s.seatsLeft,
    paidCount: 0, // a business metric: public pages never show it (same as the other public routers)
    attendedCount: 0,
  };
}

/** ISO timestamp → UTC basic format, e.g. "20260926T113000Z". */
function toUtcBasic(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function googleCalendarUrl(opts: { title: string; startsAt: string; durationMin: number; details: string }): string {
  const start = new Date(opts.startsAt);
  const end = new Date(start.getTime() + opts.durationMin * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${toUtcBasic(start.toISOString())}/${toUtcBasic(end.toISOString())}`,
    details: opts.details,
    location: "Online",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ───────────────────────── page data ─────────────────────────

/** Replaces the data fetching of the old /book/[sessionId] server page. */
routes.get("/pages/book/:sessionId", async (c) => {
  const session = await getSession(c.req.param("sessionId"));
  if (!session || !session.workshop) return notFound(c);
  const workshop = session.workshop;
  const bookable = isBookable(session);

  const alternatives = bookable ? [] : await listUpcomingSessions({ workshopSlug: workshop.slug, limit: 4 });

  const payload: BookPageData = {
    session: { ...publicSession(session), workshop },
    bookable,
    paymentMode: paymentMode(),
    alternatives: alternatives.map(publicSession),
  };
  return c.json(payload);
});

/** Replaces the data fetching of the old /booking/[code] server page. */
routes.get("/pages/booking/:code", async (c) => {
  const [reg, settings] = await Promise.all([getRegistrationByCode(c.req.param("code")), getSiteSettings()]);
  if (!reg) return notFound(c);

  const paid = reg.status === "paid";
  const title = reg.workshop?.title ?? "your workshop";
  const payload: BookingPageData = {
    booking: {
      code: reg.code,
      status: reg.status,
      name: reg.name,
      email: reg.email,
      amountPaise: reg.amountPaise,
      discountPaise: reg.discountPaise,
      demoPayment: reg.paymentProvider === "demo",
      sessionStartsAt: reg.sessionStartsAt,
      sessionDurationMin: reg.sessionDurationMin,
      sessionStatus: reg.sessionStatus,
      meetingLink: paid ? reg.meetingLink : null,
      workshopSlug: reg.workshopSlug,
      workshop: reg.workshop,
    },
    returningDiscountPercent: settings.returningDiscountPercent,
    paymentMode: paymentMode(),
    sessionInFuture: new Date(reg.sessionStartsAt).getTime() > Date.now(),
    googleCalendarUrl: paid
      ? googleCalendarUrl({
          title: `${title} — ${site.name}`,
          startsAt: reg.sessionStartsAt,
          durationMin: reg.sessionDurationMin,
          details: [
            `Your booking page: ${siteUrl}/booking/${reg.code}`,
            `Joining link: ${reg.meetingLink ?? `${siteUrl}/live/${reg.code}`}`, // on-site class room unless an external link is set
          ].join("\n"),
        })
      : null,
    contactEmail: site.contactEmail,
  };
  return c.json(payload);
});

/** The server half of the old /booking page: resolves a typed booking ID to the page it lives on. */
routes.get("/pages/booking-lookup", async (c) => {
  const code = (c.req.query("code") ?? "").trim().toUpperCase();
  let result: BookingLookupResponse;

  if (code.startsWith("CA-")) {
    const reg = await getRegistrationByCode(code);
    result = reg
      ? { redirect: `/booking/${reg.code}` }
      : { error: `We couldn't find a workshop booking with the ID "${code}". Double-check it against your confirmation email.` };
  } else if (code.startsWith("PT-")) {
    const booking = await getTrainingBookingByCode(code);
    result = booking
      ? { redirect: `/training/${booking.code}` }
      : {
          error: `We couldn't find a personal training booking with the ID "${code}". Double-check it against your confirmation email.`,
        };
  } else {
    result = {
      error: `That doesn't look like a booking ID. Workshop bookings start with "CA-", personal training bookings start with "PT-".`,
    };
  }
  return c.json(result);
});

// ───────────────────────── booking ─────────────────────────

/** Create a pending registration for a group workshop session. */
routes.post("/book/workshop", async (c) => {
  const body = await readJson(c);
  const sessionId = str(body.sessionId, 64);
  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const phone = normalisePhone(str(body.phone, 30));

  const reject = (error: string) => c.json<WorkshopBookingResponse>({ ok: false, error }, 400);
  if (!sessionId) return reject("Please choose a session.");
  if (name.length < 2) return reject("Please enter your name.");
  if (!isEmail(email)) return reject("Please enter a valid email address.");
  if (!phone.ok) return reject("Please enter a valid phone number (or leave it empty).");
  if (body.acceptTerms !== true) return reject("Please accept the terms and refund policy to continue.");

  const result = await createPendingRegistration({ sessionId, name, email, phone: phone.value });
  if (!result.ok) {
    // Deliberately no booking code here, only a message: the code unlocks the paid join link.
    return c.json<WorkshopBookingResponse>({ ok: false, error: result.error }, 409);
  }
  const r = result.registration;

  // Covered by a Monthly Pass — already paid, no checkout step. Send the
  // confirmation now, since fulfilPayment() (which normally does this) never runs.
  if (result.coveredByPass) {
    const full = await getRegistrationById(r.id);
    if (full) await sendEmail(workshopConfirmationEmail(full));
  }

  return c.json<WorkshopBookingResponse>({
    ok: true,
    code: r.code,
    basePaise: r.basePaise,
    discountPaise: r.discountPaise,
    amountPaise: r.amountPaise,
    coveredByPass: Boolean(result.coveredByPass),
  });
});

/** Check whether an email gets this session free (Monthly Pass) or discounted (returning student). */
routes.post("/book/discount", async (c) => {
  const body = await readJson(c);
  const email = str(body.email, 200);
  const session = await getSession(str(body.sessionId, 64));
  if (!session || !isEmail(email)) return c.json<DiscountCheckResponse>({ eligible: false });

  // Independent lookups: run them together (a pass makes the discount check moot, but that's the rare case).
  const [pass, check] = await Promise.all([
    hasActivePass(email, istMonthKey(session.startsAt)),
    checkReturningDiscount(email),
  ]);
  if (pass) {
    return c.json<DiscountCheckResponse>({
      eligible: true,
      coveredByPass: true,
      discountPaise: session.pricePaise,
      amountPaise: 0,
    });
  }

  if (!check.eligible) return c.json<DiscountCheckResponse>({ eligible: false, amountPaise: session.pricePaise });
  const { discountPaise, amountPaise } = applyDiscount(session.pricePaise, check.percent);
  return c.json<DiscountCheckResponse>({
    eligible: true,
    percent: check.percent,
    sourceWorkshopTitle: check.sourceWorkshopTitle,
    discountPaise,
    amountPaise,
  });
});

/**
 * "Lost your booking ID?" — emails the student links to their paid bookings.
 * The response is identical whether or not bookings exist, so this can't be
 * used to discover who has booked. Links are only ever sent to the inbox.
 * The cooldown is per running instance (best effort), same as before.
 */
const recentResends = new Map<string, number>();
const RESEND_COOLDOWN_MS = 2 * 60_000;
const RESEND_MAP_LIMIT = 1000;

routes.post("/booking/resend", async (c) => {
  const body = await readJson(c);
  const email = normaliseEmail(str(body.email, 200));
  if (!isEmail(email)) return c.json<ResendResponse>({ ok: false, error: "Please enter a valid email address." }, 400);

  const now = Date.now();
  const last = recentResends.get(email) ?? 0;
  if (now - last > RESEND_COOLDOWN_MS) {
    if (recentResends.size >= RESEND_MAP_LIMIT) {
      for (const [key, at] of recentResends) if (now - at > RESEND_COOLDOWN_MS) recentResends.delete(key);
    }
    recentResends.set(email, now);
    const since = now - 30 * 86_400_000; // upcoming + last 30 days
    const [regs, trainings] = await Promise.all([listRegistrationsByEmail(email), listTrainingBookingsByEmail(email)]);
    const paidRegs = regs.filter((r) => r.status === "paid" && new Date(r.sessionStartsAt).getTime() > since);
    const paidTrainings = trainings.filter(
      (b) => (b.status === "paid" || b.status === "completed") && new Date(b.startsAt).getTime() > since,
    );
    if (paidRegs.length || paidTrainings.length) {
      await sendEmail(bookingLinksEmail(email, paidRegs, paidTrainings));
    }
  }

  return c.json<ResendResponse>({ ok: true });
});

// ───────────────────────── calendar ─────────────────────────

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

/** GET /api/calendar/:code — a downloadable .ics file for a paid booking. */
routes.get("/calendar/:code", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  const missing = () => c.json({ error: "Not found" }, 404);

  let event: EventInfo;
  if (code.startsWith("CA-")) {
    const reg = await getRegistrationByCode(code);
    if (!reg || reg.status !== "paid") return missing();
    event = {
      title: `${reg.workshop?.title ?? "Workshop"} — ${site.name}`,
      startsAt: reg.sessionStartsAt,
      durationMin: reg.sessionDurationMin,
      meetingLink: reg.meetingLink ?? `${siteUrl}/live/${reg.code}`, // on-site class room unless an external link is set
      bookingPath: `/booking/${reg.code}`,
    };
  } else if (code.startsWith("PT-")) {
    const booking = await getTrainingBookingByCode(code);
    if (!booking || (booking.status !== "paid" && booking.status !== "completed")) return missing();
    event = {
      title: `Personal training: ${booking.topic} — ${site.name}`,
      startsAt: booking.startsAt,
      durationMin: booking.durationMin,
      meetingLink: booking.meetingLink,
      bookingPath: `/training/${booking.code}`,
    };
  } else {
    return missing();
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

  return c.body(ics, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `attachment; filename="${code}.ics"`,
  });
});

// ───────────────────────── payments (workshop, training and pass) ─────────────────────────

/**
 * Begin payment for a pending booking. Returns what the browser needs to open
 * Razorpay Checkout (or tells it we're in demo mode).
 */
routes.post("/pay/start", async (c) => {
  const body = await readJson(c);
  const kind = body.kind;
  const code = str(body.code, 40);
  const reply = (payload: PayStartResponse, status: 200 | 400 | 404 | 409 | 502 | 503 = 200) => c.json(payload, status);

  if (!isPayKind(kind) || !code) return reply({ ok: false, error: "Invalid request." }, 400);

  const payable = await getPayable(kind, code);
  if (!payable) return reply({ ok: false, error: "Booking not found." }, 404);
  if (payable.status === "paid" || payable.status === "completed") {
    return reply({ ok: true, alreadyPaid: true, redirect: successPath(kind, payable.code) });
  }
  if (payable.status !== "pending") {
    return reply({ ok: false, error: "This booking can no longer be paid. Please start a new booking." }, 409);
  }
  if (new Date(payable.startsAt).getTime() <= Date.now()) {
    return reply({ ok: false, error: "This session has already started." }, 409);
  }

  if (!(await ensureHold(payable))) {
    return reply(
      {
        ok: false,
        error:
          kind === "workshop"
            ? "Sorry — your seat hold expired and this session has since filled up. Please pick another date."
            : "Sorry — your hold expired and this time has since been booked. Please pick another time.",
      },
      409,
    );
  }

  const mode = paymentMode();
  if (mode === "disabled") {
    return reply(
      { ok: false, error: `Online payments are not available right now. Please contact us at ${site.contactEmail}.` },
      503,
    );
  }
  if (mode === "demo") {
    return reply({ ok: true, mode, amountPaise: payable.amountPaise });
  }

  try {
    let orderId = payable.providerOrderId;
    if (!orderId) {
      const order = await createRazorpayOrder({
        amountPaise: payable.amountPaise,
        receipt: payable.code,
        notes: { kind, code: payable.code },
      });
      orderId = order.id;
      await saveOrderId(payable, orderId);
    }
    return reply({
      ok: true,
      mode,
      keyId: razorpayKeyId(),
      orderId,
      amountPaise: payable.amountPaise,
      currency: "INR",
      name: site.name,
      description: payable.description,
      prefill: { name: payable.name, email: payable.email, contact: payable.phone ?? "" },
    });
  } catch (err) {
    console.error("[pay/start]", err);
    return reply({ ok: false, error: "We couldn't start the payment. Please try again in a moment." }, 502);
  }
});

/** Called by the browser after Razorpay Checkout reports a successful payment. */
routes.post("/pay/verify", async (c) => {
  const body = await readJson(c);
  const kind = body.kind;
  const code = str(body.code, 40);
  const orderId = str(body.razorpay_order_id, 80);
  const paymentId = str(body.razorpay_payment_id, 80);
  const signature = str(body.razorpay_signature, 200);
  const reply = (payload: PayDoneResponse, status: 200 | 400 | 404 = 200) => c.json(payload, status);

  if (!isPayKind(kind) || !code) return reply({ ok: false, error: "Invalid request." }, 400);

  const payable = await getPayable(kind, code);
  if (!payable) return reply({ ok: false, error: "Booking not found." }, 404);
  if (!payable.providerOrderId || payable.providerOrderId !== orderId) {
    return reply({ ok: false, error: "Payment does not match this booking." }, 400);
  }
  if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
    return reply({ ok: false, error: "Payment verification failed." }, 400);
  }

  await fulfilPayment(kind, payable.id, { provider: "razorpay", paymentId });
  return reply({ ok: true, redirect: successPath(kind, payable.code) });
});

/** DEMO MODE ONLY: simulate a successful payment so the booking flow can be tested. */
routes.post("/pay/demo", async (c) => {
  const reply = (payload: PayDoneResponse, status: 200 | 400 | 403 | 404 | 409 = 200) => c.json(payload, status);
  if (paymentMode() !== "demo") return reply({ ok: false, error: "Demo payments are disabled." }, 403);

  const body = await readJson(c);
  const kind = body.kind;
  const code = str(body.code, 40);
  if (!isPayKind(kind) || !code) return reply({ ok: false, error: "Invalid request." }, 400);

  const payable = await getPayable(kind, code);
  if (!payable) return reply({ ok: false, error: "Booking not found." }, 404);
  if (payable.status !== "pending" && payable.status !== "paid") {
    return reply({ ok: false, error: "This booking can no longer be paid." }, 409);
  }
  await fulfilPayment(kind, payable.id, { provider: "demo", paymentId: `demo_${Date.now()}` });
  return reply({ ok: true, redirect: successPath(kind, payable.code) });
});

/**
 * Razorpay webhook — a safety net in case the student closes the browser
 * before the checkout callback runs. Configure it in the Razorpay dashboard
 * for the `payment.captured` and `order.paid` events. Server-to-server: it has
 * no Origin header (CSRF-exempt under /api/webhooks) and is authenticated by
 * the HMAC over the raw body only.
 */
routes.post("/webhooks/razorpay", async (c) => {
  const raw = await c.req.text();
  if (!verifyWebhookSignature(raw, c.req.header("x-razorpay-signature") ?? null)) {
    return c.json({ ok: false }, 401);
  }

  type Entity = { id?: string; order_id?: string };
  let event: { event?: string; payload?: { payment?: { entity?: Entity }; order?: { entity?: Entity } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return c.json({ ok: false }, 400);
  }
  if (!event || typeof event !== "object") return c.json({ ok: false }, 400);
  if (event.event !== "payment.captured" && event.event !== "order.paid") {
    return c.json({ ok: true, ignored: true });
  }
  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id ?? event.payload?.order?.entity?.id;
  if (!orderId) return c.json({ ok: true, ignored: true });

  const reg = await getRegistrationByOrderId(orderId);
  if (reg) {
    await fulfilPayment("workshop", reg.id, { provider: "razorpay", paymentId: payment?.id ?? null });
    return c.json({ ok: true });
  }
  const booking = await getTrainingBookingByOrderId(orderId);
  if (booking) {
    await fulfilPayment("training", booking.id, { provider: "razorpay", paymentId: payment?.id ?? null });
    return c.json({ ok: true });
  }
  const pass = await getPassByOrderId(orderId);
  if (pass) {
    await fulfilPayment("pass", pass.id, { provider: "razorpay", paymentId: payment?.id ?? null });
  }
  return c.json({ ok: true });
});
