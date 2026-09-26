"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { fromISTInputs } from "@/lib/format";
import { str } from "@/lib/validate";
import { sendEmail } from "@/lib/email";
import { trainingLinkEmail } from "@/lib/email-templates";
import {
  createSlot,
  deleteSlot,
  getTrainingBookingById,
  setSlotOpen,
  setTrainingMeetingLink,
  setTrainingStatus,
  type TrainingBookingStatus,
} from "@/lib/data/training";
import type { ActionResult } from "../admin-ui";

const MAX_REPEAT_WEEKS = 8;

/** Add one slot, or the same time weekly for up to 8 weeks. */
export async function createSlotsAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const date = str(formData.get("date"), 20);
  const time = str(formData.get("time"), 10);
  const repeatWeeks = Math.min(MAX_REPEAT_WEEKS, Math.max(1, Math.round(Number(formData.get("repeatWeeks")) || 1)));

  if (!date || !time) return { ok: false, message: "Please choose a date and time." };

  let startIso: string;
  try {
    startIso = fromISTInputs(date, time);
  } catch {
    return { ok: false, message: "That date/time isn't valid." };
  }

  for (let i = 0; i < repeatWeeks; i++) {
    const iso = new Date(new Date(startIso).getTime() + i * 7 * 24 * 3600_000).toISOString();
    await createSlot(iso);
  }

  revalidatePath("/admin/training");
  return {
    ok: true,
    message: repeatWeeks === 1 ? "Slot added." : `${repeatWeeks} weekly slots added, starting ${date}.`,
  };
}

export async function setSlotOpenAction(
  id: string,
  open: boolean,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  await setSlotOpen(id, open);
  revalidatePath("/admin/training");
  return { ok: true, message: open ? "Slot opened for booking." : "Slot closed." };
}

export async function deleteSlotAction(
  id: string,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const result = await deleteSlot(id);
  if (!result.ok) return { ok: false, message: result.reason ?? "This slot can't be deleted." };
  revalidatePath("/admin/training");
  return { ok: true, message: "Slot deleted." };
}

export async function setTrainingStatusAction(
  id: string,
  status: TrainingBookingStatus,
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  await setTrainingStatus(id, status);
  revalidatePath("/admin/training");
  return { ok: true, message: `Booking marked as ${status}.` };
}

export async function setMeetingLinkAction(
  id: string,
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const link = str(formData.get("link"), 500);
  const notify = formData.get("notify") === "on";

  await setTrainingMeetingLink(id, link || null);

  if (notify && link) {
    const booking = await getTrainingBookingById(id);
    if (booking) await sendEmail(trainingLinkEmail(booking));
  }

  revalidatePath("/admin/training");
  return { ok: true, message: notify && link ? "Link saved and emailed to the student." : "Link saved." };
}
