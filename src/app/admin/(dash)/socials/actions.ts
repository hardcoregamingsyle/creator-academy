"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createSocial, deleteSocial, updateSocial } from "@/lib/data/socials";
import { str } from "@/lib/validate";
import type { ActionResult } from "../admin-ui";

function revalidateSocials(): void {
  revalidatePath("/admin/socials");
  revalidatePath("/");
  revalidatePath("/", "layout");
}

export async function createSocialAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const platform = str(formData.get("platform"), 60);
  const handle = str(formData.get("handle"), 120);
  const url = str(formData.get("url"), 500);

  if (!platform) return { ok: false, message: "Please enter a platform name." };

  const result = await createSocial({ platform, handle, url });
  if (!result.ok) return { ok: false, message: result.error ?? "Could not add this social link." };

  revalidateSocials();
  return { ok: true, message: "Social link added." };
}

export async function updateSocialAction(
  id: string,
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const platform = str(formData.get("platform"), 60);
  const handle = str(formData.get("handle"), 120);
  const url = str(formData.get("url"), 500);
  const sortOrder = Math.round(Number(formData.get("sortOrder")) || 0);

  if (!platform) return { ok: false, message: "Please enter a platform name." };

  const result = await updateSocial(id, { platform, handle, url, sortOrder });
  if (!result.ok) return { ok: false, message: result.error ?? "Could not update this social link." };

  revalidateSocials();
  return { ok: true, message: "Social link updated." };
}

export async function deleteSocialAction(
  id: string,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  await deleteSocial(id);

  revalidateSocials();
  return { ok: true, message: "Social link deleted." };
}
