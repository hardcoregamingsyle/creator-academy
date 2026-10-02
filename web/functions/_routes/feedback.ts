import { Hono } from "hono";
import type { FeedbackPageData, FeedbackSubmitResult } from "../../shared/pages/feedback";
import { createFeedback, type AttendAgain } from "../_lib/data/feedback";
import { getRegistrationByCode } from "../_lib/data/registrations";
import { getSiteSettings } from "../_lib/data/site-settings";
import { liveWorkshops } from "../_lib/data/workshops";
import type { AppEnv } from "./types";
import { badRequest, str } from "./util";

export const routes = new Hono<AppEnv>();

const ATTEND_AGAIN_VALUES: AttendAgain[] = ["yes", "maybe", "no"];

routes.get("/pages/feedback", async (c) => {
  const code = c.req.query("code")?.trim() || null;
  const [registration, live, settings] = await Promise.all([
    code ? getRegistrationByCode(code) : Promise.resolve(null),
    liveWorkshops(),
    getSiteSettings(),
  ]);

  const body: FeedbackPageData = {
    registrationFound: registration !== null,
    lockedWorkshop: registration?.workshop ? { slug: registration.workshopSlug, title: registration.workshop.title } : null,
    sessionStartsAt: registration?.sessionStartsAt ?? null,
    liveWorkshops: live.map((w) => ({ slug: w.slug, title: w.title })),
    returningDiscountPercent: settings.returningDiscountPercent,
  };
  return c.json(body);
});

/** Post-class feedback. No email required — identified by an optional registration code or workshop. */
routes.post("/feedback", async (c) => {
  const parsed: unknown = await c.req.json().catch(() => null);
  const body = (parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}) as Record<string, unknown>;

  const rating = Number(body.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return badRequest(c, "Please choose a rating from 1 to 5 stars.");
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
  if (!result.ok) return badRequest(c, result.error);

  const done: FeedbackSubmitResult = { ok: true };
  return c.json(done);
});
