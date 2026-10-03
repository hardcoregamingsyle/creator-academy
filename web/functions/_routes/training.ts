import { Hono } from "hono";
import type { RefundBookingResponse } from "../../shared/pages/booking";
import type {
  PersonalTrainingPageData,
  TrainingBookResponse,
  TrainingBookingPageData,
  TrainingChangeOptions,
} from "../../shared/pages/training";
import { getSiteSettings } from "../_lib/data/site-settings";
import {
  createPendingTrainingBooking,
  getTrainingBookingByCode,
  listAvailableSlotsByDuration,
  listTrainingDurations,
  listTrainingTopics,
} from "../_lib/data/training";
import { getFaqGroups } from "../_lib/faq";
import { paymentMode } from "../_lib/payments";
import { clientKey, hitRateLimit, TOO_MANY_REQUESTS_MESSAGE } from "../_lib/rate-limit";
import { evaluateTrainingOptions, refundMethodNote, refundTrainingBooking } from "../_lib/refunds";
import { site, siteUrl } from "../_lib/site";
import type { AppEnv } from "./types";
import { badRequest, isEmail, normalisePhone, notFound, str } from "./util";

export const routes = new Hono<AppEnv>();

routes.get("/pages/personal-training", async (c) => {
  const [durations, topics, settings] = await Promise.all([
    listTrainingDurations(),
    listTrainingTopics(),
    getSiteSettings(),
  ]);
  const [slotsByDuration, faqGroups] = await Promise.all([
    listAvailableSlotsByDuration(durations),
    getFaqGroups({ settings, durations }),
  ]);

  const payload: PersonalTrainingPageData = {
    paymentMode: paymentMode(),
    contactEmail: site.contactEmail,
    workshopPaise: settings.workshopPricePaise,
    durations: durations.map(({ id, minutes, label, blurb, paise }) => ({ id, minutes, label, blurb, paise })),
    topics: topics.map(({ id, label }) => ({ id, label })),
    slotsByDuration,
    faq: faqGroups.find((g) => g.title === "Personal training")?.items ?? null,
  };
  return c.json(payload);
});

routes.get("/pages/training/:code", async (c) => {
  const b = await getTrainingBookingByCode(c.req.param("code"));
  if (!b) return notFound(c);

  let changeOptions: TrainingChangeOptions | null = null;
  if (b.status === "paid") {
    const options = evaluateTrainingOptions(b);
    changeOptions = { ...options, refundAmountPaise: b.amountPaise, refundMethodNote: refundMethodNote(b) };
  }

  const payload: TrainingBookingPageData = {
    booking: {
      code: b.code,
      status: b.status,
      startsAt: b.startsAt,
      topic: b.topic,
      durationMin: b.durationMin,
      name: b.name,
      email: b.email,
      amountPaise: b.amountPaise,
      demoPayment: b.paymentProvider === "demo",
      // The private session URL only goes to a paid booking (as on the workshop booking page); never pending/refunded/cancelled/failed.
      meetingLink: b.status === "paid" || b.status === "completed" ? b.meetingLink : null,
      refundAmountPaise: b.status === "refunded" ? b.refundAmountPaise : null,
      refundedAt: b.status === "refunded" ? b.refundedAt : null,
    },
    paymentMode: paymentMode(),
    sessionInFuture: new Date(b.startsAt).getTime() > Date.now(),
    contactEmail: site.contactEmail,
    siteUrl,
    changeOptions,
  };
  return c.json(payload);
});

/** Cancel a paid personal-training booking and refund it (24h or more before the session). The code is the credential. */
routes.post("/training/:code/refund", async (c) => {
  const reply = (payload: RefundBookingResponse, status: 200 | 404 | 409 | 429 | 502 = 200) => c.json(payload, status);
  const hit = await hitRateLimit("training-refund", clientKey(c), 10, 3600);
  if (!hit.allowed) return reply({ ok: false, message: TOO_MANY_REQUESTS_MESSAGE }, 429);

  const b = await getTrainingBookingByCode(c.req.param("code"));
  if (!b) return reply({ ok: false, message: "We couldn't find that booking." }, 404);

  const result = await refundTrainingBooking(b, { actor: "customer" });
  if (!result.ok) return reply({ ok: false, message: result.message }, result.httpStatus);
  return reply({ ok: true, message: result.message, status: result.status, amountPaise: result.amountPaise });
});

/** Create a pending 1:1 personal training booking. */
routes.post("/book/training", async (c) => {
  const parsed: unknown = await c.req.json().catch(() => null);
  const body = (parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}) as Record<string, unknown>;

  const slotId = str(body.slotId, 64);
  const topic = str(body.topic, 120);
  const durationMin = Number(body.durationMin);
  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const phone = normalisePhone(str(body.phone, 30));
  const goals = str(body.goals, 2000);

  if (!topic) return badRequest(c, "Please choose a topic.");
  if (!slotId) return badRequest(c, "Please choose a time.");
  if (name.length < 2) return badRequest(c, "Please enter your name.");
  if (!isEmail(email)) return badRequest(c, "Please enter a valid email address.");
  if (!phone.ok) return badRequest(c, "Please enter a valid phone number (or leave it empty).");
  if (body.acceptTerms !== true) return badRequest(c, "Please accept the terms and refund policy to continue.");

  const result = await createPendingTrainingBooking({ slotId, topic, durationMin, name, email, phone: phone.value, goals });
  if (!result.ok) return c.json({ ok: false as const, message: result.error }, 409);

  const payload: TrainingBookResponse = { ok: true, code: result.booking.code, amountPaise: result.booking.amountPaise };
  return c.json(payload);
});
