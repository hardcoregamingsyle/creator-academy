"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getWorkshop } from "@/content/workshops";
import { fromISTInputs } from "@/lib/format";
import { site } from "@/lib/site";
import { isEmail, normalisePhone, str } from "@/lib/validate";
import {
  createSession,
  deleteSession,
  getSession,
  updateSession,
  type SessionStatus,
} from "@/lib/data/sessions";
import {
  addManualRegistration,
  listRegistrations,
  markAllAttended,
  setAttendance,
  setRegistrationStatus,
  type RegistrationStatus,
} from "@/lib/data/registrations";
import { sendEmail } from "@/lib/email";
import { feedbackRequestEmail, sessionReminderEmail } from "@/lib/email-templates";
import type { ActionResult } from "../admin-ui";

/**
 * Server actions for the Sessions list + Sessions detail admin pages. Every
 * action re-checks `requireAdmin()` itself — these are public POST endpoints,
 * the (dash) layout's check alone is not enough.
 */

const SESSION_STATUSES: SessionStatus[] = ["scheduled", "completed", "cancelled"];
const REG_STATUSES_SETTABLE: RegistrationStatus[] = ["refunded", "cancelled"];

function parseRupeesToPaise(v: string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parseCapacity(v: string): number | null {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseMeetingLink(v: string): { ok: boolean; value: string | null } {
  const trimmed = v.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, value: null };
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, value: null };
  }
}

// ───────────────────────── schedule / edit ─────────────────────────

export async function createSessionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const workshopSlug = str(formData.get("workshopSlug"), 100);
  const date = str(formData.get("date"), 20);
  const time = str(formData.get("time"), 10);
  const capacityRaw = str(formData.get("capacity"), 10);
  const priceRaw = str(formData.get("price"), 10);
  const meetingLinkRaw = str(formData.get("meetingLink"), 500);
  const notes = str(formData.get("notes"), 2000);

  const workshop = getWorkshop(workshopSlug);
  if (!workshop || (workshop.status !== "live" && workshop.status !== "planned")) {
    return { ok: false, message: "Please choose a valid workshop." };
  }
  if (!date || !time) return { ok: false, message: "Please pick a date and time." };

  let startsAt: string;
  try {
    startsAt = fromISTInputs(date, time);
  } catch {
    return { ok: false, message: "That date/time doesn't look valid." };
  }

  const capacity = capacityRaw ? parseCapacity(capacityRaw) : site.defaultCapacity;
  if (capacity === null) return { ok: false, message: "Please enter a valid capacity." };

  const price = priceRaw ? parseRupeesToPaise(priceRaw) : site.pricing.workshopPaise;
  if (price === null) return { ok: false, message: "Please enter a valid price." };

  const link = parseMeetingLink(meetingLinkRaw);
  if (!link.ok) return { ok: false, message: "That meeting link doesn't look like a valid URL." };

  await createSession({
    workshopSlug,
    startsAt,
    capacity,
    pricePaise: price,
    meetingLink: link.value,
    notes: notes || null,
  });

  revalidatePath("/admin/sessions");
  revalidatePath("/admin");
  return { ok: true, message: `Session scheduled: ${workshop.title}, ${date} at ${time} IST.` };
}

export async function updateSessionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = str(formData.get("id"), 64);
  if (!id) return { ok: false, message: "Missing session." };
  const existing = await getSession(id);
  if (!existing) return { ok: false, message: "Session not found." };

  const date = str(formData.get("date"), 20);
  const time = str(formData.get("time"), 10);
  const capacityRaw = str(formData.get("capacity"), 10);
  const priceRaw = str(formData.get("price"), 10);
  const meetingLinkRaw = str(formData.get("meetingLink"), 500);
  const notes = str(formData.get("notes"), 2000);
  const status = str(formData.get("status"), 20) as SessionStatus;

  if (!SESSION_STATUSES.includes(status)) return { ok: false, message: "Invalid status." };

  let startsAt: string | undefined;
  if (date && time) {
    try {
      startsAt = fromISTInputs(date, time);
    } catch {
      return { ok: false, message: "That date/time doesn't look valid." };
    }
  }

  let capacity: number | undefined;
  if (capacityRaw) {
    const parsed = parseCapacity(capacityRaw);
    if (parsed === null) return { ok: false, message: "Please enter a valid capacity." };
    capacity = parsed;
  }

  let pricePaise: number | undefined;
  if (priceRaw) {
    const parsed = parseRupeesToPaise(priceRaw);
    if (parsed === null) return { ok: false, message: "Please enter a valid price." };
    pricePaise = parsed;
  }

  const link = parseMeetingLink(meetingLinkRaw);
  if (!link.ok) return { ok: false, message: "That meeting link doesn't look like a valid URL." };

  await updateSession(id, {
    ...(startsAt ? { startsAt } : {}),
    ...(capacity !== undefined ? { capacity } : {}),
    ...(pricePaise !== undefined ? { pricePaise } : {}),
    meetingLink: link.value,
    notes: notes || null,
    status,
  });

  revalidatePath(`/admin/sessions/${id}`);
  revalidatePath("/admin/sessions");
  revalidatePath("/admin");
  return { ok: true, message: "Session updated." };
}

// ───────────────────────── danger zone ─────────────────────────

export async function cancelSessionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(formData.get("id"), 64);
  if (!id) return { ok: false, message: "Missing session." };
  const existing = await getSession(id);
  if (!existing) return { ok: false, message: "Session not found." };

  await updateSession(id, { status: "cancelled" });
  revalidatePath(`/admin/sessions/${id}`);
  revalidatePath("/admin/sessions");
  revalidatePath("/admin");
  return {
    ok: true,
    message: "Session cancelled. Remember: any refunds must be processed manually in the Razorpay dashboard.",
  };
}

export async function deleteSessionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(formData.get("id"), 64);
  if (!id) return { ok: false, message: "Missing session." };

  const result = await deleteSession(id);
  if (!result.ok) return { ok: false, message: result.reason ?? "This session couldn't be deleted." };

  revalidatePath("/admin/sessions");
  revalidatePath("/admin");
  redirect("/admin/sessions");
}

// ───────────────────────── registrations (per-row) ─────────────────────────

export async function toggleAttendanceAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(formData.get("id"), 64);
  const sessionId = str(formData.get("sessionId"), 64);
  const attended = str(formData.get("attended"), 5) === "1";
  if (!id) return { ok: false, message: "Missing registration." };

  await setAttendance(id, attended);
  if (sessionId) revalidatePath(`/admin/sessions/${sessionId}`);
  return { ok: true, message: attended ? "Marked as attended." : "Marked as not attended." };
}

export async function setRegistrationStatusAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(formData.get("id"), 64);
  const sessionId = str(formData.get("sessionId"), 64);
  const status = str(formData.get("status"), 20) as RegistrationStatus;
  if (!id) return { ok: false, message: "Missing registration." };
  if (!REG_STATUSES_SETTABLE.includes(status)) return { ok: false, message: "Invalid status." };

  await setRegistrationStatus(id, status);
  if (sessionId) revalidatePath(`/admin/sessions/${sessionId}`);
  return { ok: true, message: `Registration marked as ${status}.` };
}

export async function addManualRegistrationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const sessionId = str(formData.get("sessionId"), 64);
  const name = str(formData.get("name"), 120);
  const email = str(formData.get("email"), 200);
  const phone = normalisePhone(str(formData.get("phone"), 30));
  const amountRaw = str(formData.get("amount"), 10);

  if (!sessionId) return { ok: false, message: "Missing session." };
  if (name.length < 2) return { ok: false, message: "Please enter the student's name." };
  if (!isEmail(email)) return { ok: false, message: "Please enter a valid email address." };
  if (!phone.ok) return { ok: false, message: "Please enter a valid phone number (or leave it empty)." };

  let amountPaise: number | undefined;
  if (amountRaw) {
    const parsed = parseRupeesToPaise(amountRaw);
    if (parsed === null) return { ok: false, message: "Please enter a valid amount." };
    amountPaise = parsed;
  }

  const code = await addManualRegistration({ sessionId, name, email, phone: phone.value, amountPaise });
  revalidatePath(`/admin/sessions/${sessionId}`);
  return { ok: true, message: `Added ${name} — registration ${code}.` };
}

// ───────────────────────── bulk actions ─────────────────────────

export async function markAllAttendedAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const sessionId = str(formData.get("sessionId"), 64);
  if (!sessionId) return { ok: false, message: "Missing session." };

  await markAllAttended(sessionId);
  revalidatePath(`/admin/sessions/${sessionId}`);
  return { ok: true, message: "All paid registrations marked as attended." };
}

export async function sendReminderAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const sessionId = str(formData.get("sessionId"), 64);
  if (!sessionId) return { ok: false, message: "Missing session." };

  const session = await getSession(sessionId);
  if (!session) return { ok: false, message: "Session not found." };

  const regs = await listRegistrations({ sessionId, status: "paid" });
  if (regs.length === 0) return { ok: false, message: "No paid students to email yet." };

  let sent = 0;
  for (const r of regs) {
    const res = await sendEmail(sessionReminderEmail(r));
    if (res.ok) sent++;
  }

  const warning = session.meetingLink ? "" : " Note: no meeting link is set on this session yet.";
  return {
    ok: sent > 0,
    message: `Reminder sent to ${sent} of ${regs.length} student${regs.length === 1 ? "" : "s"}.${warning}`,
  };
}

export async function sendFeedbackRequestAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const sessionId = str(formData.get("sessionId"), 64);
  if (!sessionId) return { ok: false, message: "Missing session." };

  const regs = (await listRegistrations({ sessionId, status: "paid" })).filter((r) => r.attended);
  if (regs.length === 0) {
    return { ok: false, message: "No attended students to email yet — mark attendance first." };
  }

  let sent = 0;
  for (const r of regs) {
    const res = await sendEmail(feedbackRequestEmail(r));
    if (res.ok) sent++;
  }

  return { ok: sent > 0, message: `Feedback request sent to ${sent} of ${regs.length} attendee${regs.length === 1 ? "" : "s"}.` };
}
