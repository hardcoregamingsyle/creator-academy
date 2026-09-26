"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { setContactHandled } from "@/lib/data/misc";
import type { ActionResult } from "../admin-ui";

export async function setContactHandledAction(
  id: string,
  handled: boolean,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  await setContactHandled(id, handled);
  revalidatePath("/admin/messages");
  return { ok: true, message: handled ? "Marked as handled." : "Marked as unhandled." };
}
