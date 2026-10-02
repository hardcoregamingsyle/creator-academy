import { Hono } from "hono";
import type { ClassDetailPageData, ClassesPageData, InterestResponse, PublicSession, SchedulePageData } from "../../shared/pages/catalogue";
import { listPublicTestimonials } from "../_lib/data/feedback";
import { registerInterest } from "../_lib/data/misc";
import { listUpcomingSessions, type ClassSession } from "../_lib/data/sessions";
import { getSiteSettings } from "../_lib/data/site-settings";
import { listWorkshops } from "../_lib/data/workshops";
import { getFaqGroups } from "../_lib/faq";
import { site } from "../_lib/site";
import type { AppEnv } from "./types";
import { badRequest, isEmail, notFound, readFormData, str } from "./util";

export const routes = new Hono<AppEnv>();

/** Only what the public pages render: no meeting link, admin notes or attendance numbers, and no embedded workshop. */
function toPublicSession(s: ClassSession): PublicSession {
  return {
    id: s.id,
    workshopSlug: s.workshopSlug,
    startsAt: s.startsAt,
    durationMin: s.durationMin,
    capacity: s.capacity,
    pricePaise: s.pricePaise,
    status: s.status,
    seatsTaken: s.seatsTaken,
    seatsLeft: s.seatsLeft,
  };
}

/** `upcoming` is soonest-first, so the first session with seats left wins. */
function nextSeatedByWorkshop(upcoming: ClassSession[]): Map<string, string> {
  const next = new Map<string, string>();
  for (const s of upcoming) {
    if (!next.has(s.workshopSlug) && s.seatsLeft > 0) next.set(s.workshopSlug, s.startsAt);
  }
  return next;
}

routes.get("/pages/classes", async (c) => {
  const [workshops, settings, upcoming] = await Promise.all([listWorkshops(), getSiteSettings(), listUpcomingSessions()]);
  const data: ClassesPageData = {
    workshops,
    workshopPricePaise: settings.workshopPricePaise,
    nextByWorkshop: Object.fromEntries(nextSeatedByWorkshop(upcoming)),
  };
  return c.json(data);
});

routes.get("/pages/classes/:slug", async (c) => {
  const slug = c.req.param("slug");

  const settingsPromise = getSiteSettings();
  const [allWorkshops, allUpcoming, testimonials, settings, faqGroups] = await Promise.all([
    listWorkshops(),
    listUpcomingSessions(),
    listPublicTestimonials({ workshopSlug: slug, limit: 6 }),
    settingsPromise,
    settingsPromise.then((settings) => getFaqGroups({ settings })),
  ]);

  const workshop = allWorkshops.find((w) => w.slug === slug);
  if (!workshop) return notFound(c);

  // A short, generically-relevant selection — every class page shows the same
  // core questions about how classes work and how booking/payment works.
  const faq = [
    faqGroups[0].items[0], // What happens in a class?
    faqGroups[0].items[1], // Do I have to take classes in order?
    faqGroups[1].items[3], // returning-student discount
    faqGroups[1].items[4], // cancel or reschedule
  ];

  const relatedPool = allWorkshops.filter((w) => w.slug !== slug && w.status === "live");
  const related = [
    ...relatedPool.filter((w) => w.category === workshop.category),
    ...relatedPool.filter((w) => w.category !== workshop.category),
  ].slice(0, 3);

  const nextByWorkshop = nextSeatedByWorkshop(allUpcoming);
  const data: ClassDetailPageData = {
    workshop,
    sessions: allUpcoming.filter((s) => s.workshopSlug === slug).map(toPublicSession),
    testimonials: testimonials.map((t) => ({ id: t.id, quote: t.quote, name: t.name, rating: t.rating })),
    faq,
    related,
    nextByWorkshop: Object.fromEntries(related.flatMap((w) => (nextByWorkshop.has(w.slug) ? [[w.slug, nextByWorkshop.get(w.slug)!]] : []))),
    workshopPricePaise: settings.workshopPricePaise,
    returningDiscountPercent: settings.returningDiscountPercent,
    defaultCapacity: site.defaultCapacity,
  };
  return c.json(data);
});

routes.get("/pages/schedule", async (c) => {
  const [upcoming, allWorkshops] = await Promise.all([listUpcomingSessions(), listWorkshops()]);
  const scheduledSlugs = new Set(upcoming.map((s) => s.workshopSlug));
  const data: SchedulePageData = {
    sessions: upcoming.map(toPublicSession),
    workshops: allWorkshops.filter((w) => scheduledSlugs.has(w.slug)),
  };
  return c.json(data);
});

/** Capture "notify me" / "vote for this workshop" interest for a class that isn't bookable yet. */
routes.post("/interest", async (c) => {
  const form = await readFormData(c);
  const workshopSlug = str(form.get("workshopSlug"), 200);
  const email = str(form.get("email"), 200);
  const name = str(form.get("name"), 120);
  const note = str(form.get("note"), 1000);

  if (!workshopSlug) return badRequest(c, "Missing workshop.");
  if (!isEmail(email)) return badRequest(c, "Please enter a valid email address.");

  const result = await registerInterest({ workshopSlug, email, name: name || null, note: note || null });
  if (!result.ok) return badRequest(c, result.error);
  const body: InterestResponse = { ok: true, alreadyRegistered: result.alreadyRegistered };
  return c.json(body);
});
