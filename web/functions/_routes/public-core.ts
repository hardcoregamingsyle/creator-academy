import { Hono } from "hono";
import { categories } from "../../shared/content";
import type {
  AboutPageData,
  ContactResult,
  FaqPageData,
  HomePageData,
  PublicSession,
} from "../../shared/pages/public-core";
import { getFaqGroups, getHomeFaq } from "../_lib/faq";
import { createContactMessage } from "../_lib/data/misc";
import { listPublicTestimonials } from "../_lib/data/feedback";
import { listUpcomingSessions, type ClassSession } from "../_lib/data/sessions";
import { getSiteSettings } from "../_lib/data/site-settings";
import { activeSocials } from "../_lib/data/socials";
import { listTrainingDurations, listTrainingTopics } from "../_lib/data/training";
import { listWorkshops } from "../_lib/data/workshops";
import { site } from "../_lib/site";
import type { AppEnv } from "./types";
import { badRequest, isEmail, str } from "./util";

export const routes = new Hono<AppEnv>();

const HOME_SESSION_COUNT = 4;

/** Blank the fields that are only for people who booked (join link, internal notes and counts). */
function publicSession(s: ClassSession): PublicSession {
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
    paidCount: 0,
    attendedCount: 0,
    workshop: s.workshop,
  };
}

routes.get("/pages/home", async (c) => {
  const [upcoming, testimonials, allWorkshops, socials, settings, durations] = await Promise.all([
    listUpcomingSessions(),
    listPublicTestimonials({ limit: 6 }),
    listWorkshops(),
    activeSocials(),
    getSiteSettings(),
    listTrainingDurations(),
  ]);
  const faq = await getHomeFaq({ settings, durations });

  const next = upcoming.find((s) => s.seatsLeft > 0) ?? upcoming[0] ?? null;
  const nextByWorkshop = new Map<string, string>();
  for (const s of upcoming) if (s.seatsLeft > 0 && !nextByWorkshop.has(s.workshopSlug)) nextByWorkshop.set(s.workshopSlug, s.startsAt);

  const body: HomePageData = {
    workshopPricePaise: settings.workshopPricePaise,
    returningDiscountPercent: settings.returningDiscountPercent,
    defaultCapacity: site.defaultCapacity,
    workshopCount: allWorkshops.length,
    categoryStats: categories.map((cat) => {
      const inCategory = allWorkshops.filter((w) => w.category === cat.slug);
      return { slug: cat.slug, total: inCategory.length, live: inCategory.filter((w) => w.status === "live").length };
    }),
    liveWorkshops: allWorkshops.filter((w) => w.status === "live"),
    upcomingCount: upcoming.length,
    upcoming: upcoming.slice(0, HOME_SESSION_COUNT).map(publicSession),
    nextSession: next ? publicSession(next) : null,
    nextByWorkshop: Object.fromEntries(nextByWorkshop),
    testimonials: testimonials.map((t) => ({ id: t.id, quote: t.quote, name: t.name, rating: t.rating, workshopTitle: t.workshopTitle })),
    durations: durations.map((d) => ({ minutes: d.minutes, label: d.label, blurb: d.blurb, paise: d.paise })),
    faq,
    socials: socials.map((s) => ({ id: s.id, platform: s.platform, handle: s.handle, url: s.url })),
  };
  return c.json(body);
});

routes.get("/pages/about", async (c) => {
  const [allWorkshops, settings, durations, topics] = await Promise.all([
    listWorkshops(),
    getSiteSettings(),
    listTrainingDurations(),
    listTrainingTopics(),
  ]);

  const body: AboutPageData = {
    workshopCount: allWorkshops.length,
    workshopPricePaise: settings.workshopPricePaise,
    returningDiscountPercent: settings.returningDiscountPercent,
    defaultCapacity: site.defaultCapacity,
    trainingMinutes: durations.map((d) => d.minutes),
    trainingTopics: topics.slice(0, 6).map((t) => t.label),
  };
  return c.json(body);
});

routes.get("/pages/faq", async (c) => {
  const groups = await getFaqGroups();
  const body: FaqPageData = { groups, contactEmail: site.contactEmail, replyTime: site.replyTime };
  return c.json(body);
});

/** Contact form submissions. A filled honeypot field pretends success without writing anything. */
routes.post("/contact", async (c) => {
  const parsed: unknown = await c.req.json().catch(() => null);
  const body = (parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}) as Record<string, unknown>;

  const done: ContactResult = { ok: true };

  // Honeypot: real visitors never see or fill this field.
  if (str(body.website, 200)) return c.json(done);

  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const topic = str(body.topic, 60);
  const message = str(body.message, 5000);

  if (name.length < 2) return badRequest(c, "Please enter your name.");
  if (!isEmail(email)) return badRequest(c, "Please enter a valid email address.");
  if (message.length < 10) return badRequest(c, "Please add a few more details to your message.");

  await createContactMessage({ name, email, topic: topic || null, message });
  return c.json(done);
});
