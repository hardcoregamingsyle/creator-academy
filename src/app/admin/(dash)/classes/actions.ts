"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { str } from "@/lib/validate";
import { categories, type CategorySlug, type Level, type WorkshopStatus } from "@/content/workshops";
import { createWorkshop, deleteWorkshop, updateWorkshop, type WorkshopInput } from "@/lib/data/workshops";
import type { ActionResult } from "../admin-ui";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STATUSES: WorkshopStatus[] = ["live", "planned", "future"];
const LEVELS: Level[] = ["Beginner", "Intermediate", "Advanced"];
const DEFAULT_DURATION = 90;

function lines(v: FormDataEntryValue | null): string[] {
  return str(v, 5000)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function revalidateAll(): void {
  revalidatePath("/admin/classes");
  revalidatePath("/classes");
  revalidatePath("/");
  revalidatePath("/schedule");
  revalidatePath("/admin/sessions");
  revalidatePath("/about");
  revalidatePath("/sitemap.xml");
}

/** Reads and validates every field except `slug` (create and edit share this). */
function readFields(formData: FormData): { ok: true; value: Omit<WorkshopInput, "slug"> } | { ok: false; message: string } {
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

export async function createWorkshopAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const slug = str(formData.get("slug"), 100).toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return { ok: false, message: "Slug must be lowercase letters, numbers and hyphens only (e.g. my-new-workshop)." };
  }

  const fields = readFields(formData);
  if (!fields.ok) return { ok: false, message: fields.message };

  const result = await createWorkshop({ slug, ...fields.value });
  if (!result.ok) return { ok: false, message: result.error ?? "Could not create workshop." };

  revalidateAll();
  return { ok: true, message: `"${fields.value.title}" created.` };
}

export async function updateWorkshopAction(
  slug: string,
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const fields = readFields(formData);
  if (!fields.ok) return { ok: false, message: fields.message };

  const result = await updateWorkshop(slug, fields.value);
  if (!result.ok) return { ok: false, message: result.error ?? "Could not update workshop." };

  revalidateAll();
  return { ok: true, message: `"${fields.value.title}" updated.` };
}

export async function deleteWorkshopAction(
  slug: string,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const result = await deleteWorkshop(slug);
  if (!result.ok) return { ok: false, message: result.error ?? "This workshop can't be deleted." };

  revalidateAll();
  return { ok: true, message: "Workshop deleted." };
}
