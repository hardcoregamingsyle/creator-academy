"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { deleteFeedback, setFeedbackApproved } from "@/lib/data/feedback";
import type { ActionResult } from "../admin-ui";

export async function setFeedbackApprovedAction(
  id: string,
  approved: boolean,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  await setFeedbackApproved(id, approved);
  revalidatePath("/admin/feedback");
  return { ok: true, message: approved ? "Now shown on the public site." : "Removed from the public site." };
}

export async function deleteFeedbackAction(
  id: string,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  await deleteFeedback(id);
  revalidatePath("/admin/feedback");
  return { ok: true, message: "Feedback deleted." };
}
