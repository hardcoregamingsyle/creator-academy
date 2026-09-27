"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { str } from "@/lib/validate";
import { updateSiteSettings } from "@/lib/data/site-settings";
import {
  createTrainingDuration,
  createTrainingTopic,
  deleteTrainingDuration,
  deleteTrainingTopic,
  updateTrainingDuration,
} from "@/lib/data/training";
import type { ActionResult } from "../admin-ui";

/**
 * Server actions for the Pricing admin page. Every action re-checks
 * requireAdmin() itself — these are public POST endpoints, the (dash)
 * layout's check alone is not enough.
 */

// Every page that displays a price this route can change.
const AFFECTED_PATHS = [
  "/admin/pricing",
  "/",
  "/classes",
  "/personal-training",
  "/monthly-pass",
  "/faq",
  "/about",
  "/admin",
  "/admin/passes",
  "/admin/sessions",
  "/admin/bookings",
] as const;

function revalidateAffectedPaths(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

/** Same rupees→paise rounding as sessions/actions.ts's parseRupeesToPaise. */
function parseRupeesToPaise(v: string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// ───────────────────────── site settings ─────────────────────────

export async function updateSiteSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const workshopPriceRaw = str(formData.get("workshopPrice"), 10);
  const discountRaw = str(formData.get("returningDiscountPercent"), 10);
  const monthlyPassPriceRaw = str(formData.get("monthlyPassPrice"), 10);

  const workshopPricePaise = parseRupeesToPaise(workshopPriceRaw);
  if (workshopPricePaise === null) return { ok: false, message: "Please enter a valid workshop price." };

  const monthlyPassPricePaise = parseRupeesToPaise(monthlyPassPriceRaw);
  if (monthlyPassPricePaise === null) return { ok: false, message: "Please enter a valid monthly pass price." };

  const returningDiscountPercent = Number(discountRaw);
  if (!Number.isInteger(returningDiscountPercent) || returningDiscountPercent < 0 || returningDiscountPercent > 100) {
    return { ok: false, message: "Returning-student discount must be a whole number between 0 and 100." };
  }

  await updateSiteSettings({ workshopPricePaise, returningDiscountPercent, monthlyPassPricePaise });

  revalidateAffectedPaths();
  return { ok: true, message: "Prices updated." };
}

// ───────────────────────── training durations ─────────────────────────

export async function createTrainingDurationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const minutes = Number(str(formData.get("minutes"), 10));
  const label = str(formData.get("label"), 80);
  const blurb = str(formData.get("blurb"), 300);
  const paise = parseRupeesToPaise(str(formData.get("price"), 10));

  if (!Number.isInteger(minutes) || minutes <= 0) return { ok: false, message: "Please enter a valid whole number of minutes." };
  if (!label) return { ok: false, message: "Please enter a label." };
  if (!blurb) return { ok: false, message: "Please enter a blurb." };
  if (paise === null) return { ok: false, message: "Please enter a valid price." };

  const result = await createTrainingDuration({ minutes, label, blurb, paise });
  if (!result.ok) return { ok: false, message: result.error ?? "Couldn't add that duration." };

  revalidateAffectedPaths();
  return { ok: true, message: `Added ${label} (${minutes} min).` };
}

export async function updateTrainingDurationAction(
  id: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return { ok: false, message: "Missing duration." };

  const minutes = Number(str(formData.get("minutes"), 10));
  const label = str(formData.get("label"), 80);
  const blurb = str(formData.get("blurb"), 300);
  const paise = parseRupeesToPaise(str(formData.get("price"), 10));

  if (!Number.isInteger(minutes) || minutes <= 0) return { ok: false, message: "Please enter a valid whole number of minutes." };
  if (!label) return { ok: false, message: "Please enter a label." };
  if (!blurb) return { ok: false, message: "Please enter a blurb." };
  if (paise === null) return { ok: false, message: "Please enter a valid price." };

  const result = await updateTrainingDuration(id, { minutes, label, blurb, paise });
  if (!result.ok) return { ok: false, message: result.error ?? "Couldn't update that duration." };

  revalidateAffectedPaths();
  return { ok: true, message: "Duration updated." };
}

export async function deleteTrainingDurationAction(
  id: string,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return { ok: false, message: "Missing duration." };

  await deleteTrainingDuration(id);
  revalidateAffectedPaths();
  return { ok: true, message: "Duration deleted." };
}

// ───────────────────────── training topics ─────────────────────────

export async function createTrainingTopicAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const label = str(formData.get("label"), 80);
  if (!label) return { ok: false, message: "Please enter a topic." };

  const result = await createTrainingTopic(label);
  if (!result.ok) return { ok: false, message: result.error ?? "Couldn't add that topic." };

  revalidateAffectedPaths();
  return { ok: true, message: `Added "${label}".` };
}

export async function deleteTrainingTopicAction(
  id: string,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return { ok: false, message: "Missing topic." };

  await deleteTrainingTopic(id);
  revalidateAffectedPaths();
  return { ok: true, message: "Topic deleted." };
}
