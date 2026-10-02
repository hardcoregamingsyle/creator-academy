import { Hono } from "hono";
import { categories, type CategorySlug, type Level, type WorkshopStatus } from "../../shared/content";
import type {
  AdminClassesData,
  AdminOverviewData,
  AdminPricingData,
  AdminSocialsData,
} from "../../shared/pages/admin-core";
import { emailConfigured } from "../_lib/email";
import { dashboardStats } from "../_lib/data/misc";
import { listRegistrations } from "../_lib/data/registrations";
import { listSessions } from "../_lib/data/sessions";
import { getSiteSettings, updateSiteSettings } from "../_lib/data/site-settings";
import { activeSocials, createSocial, deleteSocial, listSocials, updateSocial } from "../_lib/data/socials";
import {
  createTrainingDuration,
  createTrainingTopic,
  deleteTrainingDuration,
  deleteTrainingTopic,
  listTrainingDurations,
  listTrainingTopics,
  updateTrainingDuration,
} from "../_lib/data/training";
import { createWorkshop, deleteWorkshop, listWorkshops, updateWorkshop, type WorkshopInput } from "../_lib/data/workshops";
import { paymentMode } from "../_lib/payments";
import { site, siteUrl } from "../_lib/site";
import type { AppEnv } from "./types";
import { fail, ok, readFormData, str } from "./util";

export const routes = new Hono<AppEnv>();

// ───────────────────────── overview ─────────────────────────

routes.get("/admin/overview", async (c) => {
  const [stats, upcoming, recent, settings, linkedSocials] = await Promise.all([
    dashboardStats(),
    listSessions("upcoming"),
    listRegistrations({ limit: 8 }),
    getSiteSettings(),
    activeSocials(),
  ]);

  const data: AdminOverviewData = {
    stats,
    nextSessions: upcoming.slice(0, 5).map((s) => ({
      id: s.id,
      title: s.workshop?.title ?? s.workshopSlug,
      startsAt: s.startsAt,
      capacity: s.capacity,
      paidCount: s.paidCount,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      workshopTitle: r.workshop?.title ?? r.workshopSlug,
      amountPaise: r.amountPaise,
      status: r.status,
      createdAt: r.createdAt,
    })),
    workshopPricePaise: settings.workshopPricePaise,
    milestones: site.milestones.map((m) => ({ label: m.label, paise: m.paise })),
    checklist: [
      { label: "Razorpay keys are set (live payments)", ok: paymentMode() === "razorpay" },
      { label: "SMTP email sending is set up", ok: emailConfigured() },
      { label: "Legal business name is filled in", ok: !site.legal.businessName.startsWith("[") },
      { label: "At least one social account is linked", ok: linkedSocials.length > 0 },
      { label: "SITE_URL points to your real domain", ok: Boolean(process.env.SITE_URL) && !siteUrl.includes("localhost") },
      { label: "At least one upcoming session is scheduled", ok: upcoming.length > 0 },
    ],
  };
  return c.json(data);
});

// ───────────────────────── pricing ─────────────────────────

/** Same rupees→paise rounding as the sessions admin's parseRupeesToPaise. */
function parseRupeesToPaise(v: string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

routes.get("/admin/pricing", async (c) => {
  const [settings, durations, topics] = await Promise.all([getSiteSettings(), listTrainingDurations(), listTrainingTopics()]);
  const data: AdminPricingData = { settings, durations, topics };
  return c.json(data);
});

routes.post("/admin/pricing/settings", async (c) => {
  const formData = await readFormData(c);

  const workshopPriceRaw = str(formData.get("workshopPrice"), 10);
  const discountRaw = str(formData.get("returningDiscountPercent"), 10);
  const monthlyPassPriceRaw = str(formData.get("monthlyPassPrice"), 10);
  const anchorMarkupRaw = str(formData.get("anchorMarkupPercent"), 10);

  const workshopPricePaise = parseRupeesToPaise(workshopPriceRaw);
  if (workshopPricePaise === null) return c.json(fail("Please enter a valid workshop price."));

  const monthlyPassPricePaise = parseRupeesToPaise(monthlyPassPriceRaw);
  if (monthlyPassPricePaise === null) return c.json(fail("Please enter a valid monthly pass price."));

  const returningDiscountPercent = Number(discountRaw);
  if (!Number.isInteger(returningDiscountPercent) || returningDiscountPercent < 0 || returningDiscountPercent > 100) {
    return c.json(fail("Returning-student discount must be a whole number between 0 and 100."));
  }

  // Blank is invalid (Number("") would silently be 0 and hide the struck-through prices).
  const anchorMarkupPercent = anchorMarkupRaw === "" ? Number.NaN : Number(anchorMarkupRaw);
  if (!Number.isInteger(anchorMarkupPercent) || anchorMarkupPercent < 0 || anchorMarkupPercent > 500) {
    return c.json(fail("Struck-through price markup must be a whole number between 0 and 500."));
  }

  await updateSiteSettings({ workshopPricePaise, returningDiscountPercent, monthlyPassPricePaise, anchorMarkupPercent });
  return c.json(ok("Prices updated."));
});

type DurationFields = { minutes: number; label: string; blurb: string; paise: number };

function readDurationFields(formData: FormData): { ok: true; value: DurationFields } | { ok: false; message: string } {
  const minutes = Number(str(formData.get("minutes"), 10));
  const label = str(formData.get("label"), 80);
  const blurb = str(formData.get("blurb"), 300);
  const paise = parseRupeesToPaise(str(formData.get("price"), 10));

  if (!Number.isInteger(minutes) || minutes <= 0) return { ok: false, message: "Please enter a valid whole number of minutes." };
  if (!label) return { ok: false, message: "Please enter a label." };
  if (!blurb) return { ok: false, message: "Please enter a blurb." };
  if (paise === null) return { ok: false, message: "Please enter a valid price." };
  return { ok: true, value: { minutes, label, blurb, paise } };
}

routes.post("/admin/pricing/durations", async (c) => {
  const fields = readDurationFields(await readFormData(c));
  if (!fields.ok) return c.json(fail(fields.message));

  const result = await createTrainingDuration(fields.value);
  if (!result.ok) return c.json(fail(result.error ?? "Couldn't add that duration."));

  return c.json(ok(`Added ${fields.value.label} (${fields.value.minutes} min).`));
});

routes.post("/admin/pricing/durations/:id/update", async (c) => {
  const fields = readDurationFields(await readFormData(c));
  if (!fields.ok) return c.json(fail(fields.message));

  const result = await updateTrainingDuration(c.req.param("id"), fields.value);
  if (!result.ok) return c.json(fail(result.error ?? "Couldn't update that duration."));

  return c.json(ok("Duration updated."));
});

routes.post("/admin/pricing/durations/:id/delete", async (c) => {
  await deleteTrainingDuration(c.req.param("id"));
  return c.json(ok("Duration deleted."));
});

routes.post("/admin/pricing/topics", async (c) => {
  const formData = await readFormData(c);
  const label = str(formData.get("label"), 80);
  if (!label) return c.json(fail("Please enter a topic."));

  const result = await createTrainingTopic(label);
  if (!result.ok) return c.json(fail(result.error ?? "Couldn't add that topic."));

  return c.json(ok(`Added "${label}".`));
});

routes.post("/admin/pricing/topics/:id/delete", async (c) => {
  await deleteTrainingTopic(c.req.param("id"));
  return c.json(ok("Topic deleted."));
});

// ───────────────────────── classes (workshop catalogue) ─────────────────────────

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STATUSES: WorkshopStatus[] = ["live", "planned", "future"];
const LEVELS: Level[] = ["Beginner", "Intermediate", "Advanced"];
const DEFAULT_DURATION = 90;

function lines(v: unknown): string[] {
  return str(v, 5000)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Reads and validates every field except `slug` (create and edit share this). */
function readWorkshopFields(formData: FormData): { ok: true; value: Omit<WorkshopInput, "slug"> } | { ok: false; message: string } {
  const title = str(formData.get("title"), 200);
  const category = str(formData.get("category"), 50) as CategorySlug;
  const status = str(formData.get("status"), 20) as WorkshopStatus;
  const level = str(formData.get("level"), 20) as Level;
  const durationMin = Math.max(1, Math.round(Number(formData.get("durationMin")) || DEFAULT_DURATION));

  if (!title) return { ok: false, message: "Title is required." };
  if (!categories.some((c) => c.slug === category)) return { ok: false, message: "Please choose a category." };
  if (!STATUSES.includes(status)) return { ok: false, message: "Please choose a status." };
  if (!LEVELS.includes(level)) return { ok: false, message: "Please choose a level." };

  return {
    ok: true,
    value: {
      title,
      category,
      status,
      level,
      durationMin,
      promise: str(formData.get("promise"), 300),
      summary: str(formData.get("summary"), 3000),
      learn: lines(formData.get("learn")),
      outcome: str(formData.get("outcome"), 200),
      outcomeDetail: str(formData.get("outcomeDetail"), 1000),
      forWho: lines(formData.get("forWho")),
      bring: lines(formData.get("bring")),
    },
  };
}

routes.get("/admin/classes", async (c) => {
  const edit = c.req.query("edit");
  const workshops = await listWorkshops();
  const data: AdminClassesData = { workshops, editing: edit ? (workshops.find((w) => w.slug === edit) ?? null) : null };
  return c.json(data);
});

routes.post("/admin/classes", async (c) => {
  const formData = await readFormData(c);

  const slug = str(formData.get("slug"), 100).toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return c.json(fail("Slug must be lowercase letters, numbers and hyphens only (e.g. my-new-workshop)."));
  }

  const fields = readWorkshopFields(formData);
  if (!fields.ok) return c.json(fail(fields.message));

  const result = await createWorkshop({ slug, ...fields.value });
  if (!result.ok) return c.json(fail(result.error ?? "Could not create workshop."));

  return c.json(ok(`"${fields.value.title}" created.`));
});

routes.post("/admin/classes/:slug/update", async (c) => {
  const fields = readWorkshopFields(await readFormData(c));
  if (!fields.ok) return c.json(fail(fields.message));

  const result = await updateWorkshop(c.req.param("slug"), fields.value);
  if (!result.ok) return c.json(fail(result.error ?? "Could not update workshop."));

  return c.json(ok(`"${fields.value.title}" updated.`));
});

routes.post("/admin/classes/:slug/delete", async (c) => {
  const result = await deleteWorkshop(c.req.param("slug"));
  if (!result.ok) return c.json(fail(result.error ?? "This workshop can't be deleted."));

  return c.json(ok("Workshop deleted."));
});

// ───────────────────────── socials ─────────────────────────

routes.get("/admin/socials", async (c) => {
  const data: AdminSocialsData = { socials: await listSocials() };
  return c.json(data);
});

routes.post("/admin/socials", async (c) => {
  const formData = await readFormData(c);
  const platform = str(formData.get("platform"), 60);
  const handle = str(formData.get("handle"), 120);
  const url = str(formData.get("url"), 500);

  if (!platform) return c.json(fail("Please enter a platform name."));

  const result = await createSocial({ platform, handle, url });
  if (!result.ok) return c.json(fail(result.error ?? "Could not add this social link."));

  return c.json(ok("Social link added."));
});

routes.post("/admin/socials/:id/update", async (c) => {
  const formData = await readFormData(c);
  const platform = str(formData.get("platform"), 60);
  const handle = str(formData.get("handle"), 120);
  const url = str(formData.get("url"), 500);
  const sortOrder = Math.round(Number(formData.get("sortOrder")) || 0);

  if (!platform) return c.json(fail("Please enter a platform name."));

  const result = await updateSocial(c.req.param("id"), { platform, handle, url, sortOrder });
  if (!result.ok) return c.json(fail(result.error ?? "Could not update this social link."));

  return c.json(ok("Social link updated."));
});

routes.post("/admin/socials/:id/delete", async (c) => {
  await deleteSocial(c.req.param("id"));
  return c.json(ok("Social link deleted."));
});
