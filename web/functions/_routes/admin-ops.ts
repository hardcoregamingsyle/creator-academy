import { Hono } from "hono";
import { formatDateLong, fromISTInputs } from "../../shared/format";
import {
  bulkEmailMessage,
  type AdminBookingsPageData,
  type AdminDemandPageData,
  type AdminEmailsPageData,
  type AdminFeedbackPageData,
  type AdminMessagesPageData,
  type AdminPassesPageData,
  type AdminSessionDetailData,
  type AdminSessionsPageData,
  type AdminTrainingPageData,
  type BookingStatusFilter,
  type BulkEmailResult,
  type RefundAllResult,
} from "../../shared/pages/admin-ops";
import { query } from "../_lib/db";
import { emailConfigured, sendEmail } from "../_lib/email";
import { feedbackRequestEmail, sessionReminderEmail, trainingLinkEmail } from "../_lib/email-templates";
import { site } from "../_lib/site";
import { deleteFeedback, feedbackStats, listFeedback, setFeedbackApproved } from "../_lib/data/feedback";
import { interestCounts, listContactMessages, listEmailLog, listInterest, setContactHandled } from "../_lib/data/misc";
import { listPasses, markPassPaid, passesOnSale, setPassStatus, type MonthlyPassStatus } from "../_lib/data/monthly-pass";
import {
  addManualRegistration,
  getRegistrationById,
  listPaidRegistrationIds,
  listRegistrations,
  markAllAttended,
  markRegistrationPaid,
  setAttendance,
  setRegistrationStatus,
  type RegistrationStatus,
} from "../_lib/data/registrations";
import { isAutoRefundable, refundTrainingBooking, refundWorkshopBooking } from "../_lib/refunds";
import { createSession, deleteSession, getSession, listSessions, updateSession, type SessionStatus } from "../_lib/data/sessions";
import { getSiteSettings } from "../_lib/data/site-settings";
import {
  createSlot,
  deleteSlot,
  getTrainingBookingById,
  listSlots,
  listTrainingBookings,
  setSlotOpen,
  setTrainingMeetingLink,
  setTrainingStatus,
  type TrainingBookingStatus,
} from "../_lib/data/training";
import { getWorkshop, listWorkshops } from "../_lib/data/workshops";
import type { AppEnv } from "./types";
import { fail, isEmail, normalisePhone, notFound, ok, readFormData, str } from "./util";

/**
 * Admin operations: sessions, bookings, monthly passes, personal training, feedback, demand, messages, email log
 * and the registrations CSV export. Everything lives under /admin/**, which the app already guards with the admin
 * cookie. Mutations return an ActionResult with HTTP 200, including for business-rule failures.
 */
export const routes = new Hono<AppEnv>();

const SESSION_STATUSES: SessionStatus[] = ["scheduled", "completed", "cancelled"];
const REGISTRATION_STATUSES: RegistrationStatus[] = ["pending", "paid", "failed", "refunded", "cancelled"];
const REG_STATUSES_SETTABLE = ["paid", "refunded", "cancelled"] as const;
const PASS_STATUSES_SETTABLE = ["paid", "refunded", "cancelled"] as const;
const TRAINING_STATUSES: TrainingBookingStatus[] = ["pending", "paid", "completed", "failed", "refunded", "cancelled"];
const BOOKING_FILTERS: BookingStatusFilter[] = ["all", ...REGISTRATION_STATUSES];
const MAX_REPEAT_WEEKS = 8;

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

// ───────────────────────── sessions ─────────────────────────

routes.get("/admin/sessions", async (c) => {
  const scope = c.req.query("scope") === "past" ? "past" : "upcoming";
  const [sessions, workshops, settings] = await Promise.all([listSessions(scope), listWorkshops(), getSiteSettings()]);

  const option = (w: { slug: string; title: string }) => ({ slug: w.slug, title: w.title });
  const payload: AdminSessionsPageData = {
    scope,
    sessions: sessions.map((s) => ({
      id: s.id,
      workshopSlug: s.workshopSlug,
      workshopTitle: s.workshop?.title ?? s.workshopSlug,
      startsAt: s.startsAt,
      status: s.status,
      paidCount: s.paidCount,
      capacity: s.capacity,
      attendedCount: s.attendedCount,
      hasMeetingLink: Boolean(s.meetingLink),
    })),
    liveWorkshops: workshops.filter((w) => w.status === "live").map(option),
    plannedWorkshops: workshops.filter((w) => w.status === "planned").map(option),
    defaultCapacity: site.defaultCapacity,
    defaultPricePaise: settings.workshopPricePaise,
  };
  return c.json(payload);
});

routes.get("/admin/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const [session, registrations] = await Promise.all([getSession(id), listRegistrations({ sessionId: id })]);
  if (!session) return notFound(c);

  const payload: AdminSessionDetailData = {
    session: {
      id: session.id,
      workshopSlug: session.workshopSlug,
      workshopTitle: session.workshop?.title ?? null,
      startsAt: session.startsAt,
      durationMin: session.durationMin,
      capacity: session.capacity,
      pricePaise: session.pricePaise,
      meetingLink: session.meetingLink,
      notes: session.notes,
      status: session.status,
      paidCount: session.paidCount,
    },
    registrations: registrations.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      email: r.email,
      phone: r.phone,
      amountPaise: r.amountPaise,
      discountPaise: r.discountPaise,
      status: r.status,
      paidAt: r.paidAt,
      attended: r.attended,
    })),
  };
  return c.json(payload);
});

/** Schedule a new session. */
routes.post("/admin/sessions", async (c) => {
  const formData = await readFormData(c);

  const workshopSlug = str(formData.get("workshopSlug"), 100);
  const date = str(formData.get("date"), 20);
  const time = str(formData.get("time"), 10);
  const capacityRaw = str(formData.get("capacity"), 10);
  const priceRaw = str(formData.get("price"), 10);
  const meetingLinkRaw = str(formData.get("meetingLink"), 500);
  const notes = str(formData.get("notes"), 2000);

  const workshop = await getWorkshop(workshopSlug);
  if (!workshop || (workshop.status !== "live" && workshop.status !== "planned")) {
    return c.json(fail("Please choose a valid workshop."));
  }
  if (!date || !time) return c.json(fail("Please pick a date and time."));

  let startsAt: string;
  try {
    startsAt = fromISTInputs(date, time);
  } catch {
    return c.json(fail("That date/time doesn't look valid."));
  }

  const capacity = capacityRaw ? parseCapacity(capacityRaw) : site.defaultCapacity;
  if (capacity === null) return c.json(fail("Please enter a valid capacity."));

  const price = priceRaw ? parseRupeesToPaise(priceRaw) : (await getSiteSettings()).workshopPricePaise;
  if (price === null) return c.json(fail("Please enter a valid price."));

  const link = parseMeetingLink(meetingLinkRaw);
  if (!link.ok) return c.json(fail("That meeting link doesn't look like a valid URL."));

  await createSession({
    workshopSlug,
    startsAt,
    capacity,
    pricePaise: price,
    meetingLink: link.value,
    notes: notes || null,
  });

  return c.json(ok(`Session scheduled: ${workshop.title}, ${date} at ${time} IST.`));
});

routes.post("/admin/sessions/:id/update", async (c) => {
  const id = str(c.req.param("id"), 64);
  if (!id) return c.json(fail("Missing session."));
  const formData = await readFormData(c);

  const existing = await getSession(id);
  if (!existing) return c.json(fail("Session not found."));

  const date = str(formData.get("date"), 20);
  const time = str(formData.get("time"), 10);
  const capacityRaw = str(formData.get("capacity"), 10);
  const priceRaw = str(formData.get("price"), 10);
  const meetingLinkRaw = str(formData.get("meetingLink"), 500);
  const notes = str(formData.get("notes"), 2000);
  const status = str(formData.get("status"), 20) as SessionStatus;

  if (!SESSION_STATUSES.includes(status)) return c.json(fail("Invalid status."));

  let startsAt: string | undefined;
  if (date && time) {
    try {
      startsAt = fromISTInputs(date, time);
    } catch {
      return c.json(fail("That date/time doesn't look valid."));
    }
  }

  let capacity: number | undefined;
  if (capacityRaw) {
    const parsed = parseCapacity(capacityRaw);
    if (parsed === null) return c.json(fail("Please enter a valid capacity."));
    capacity = parsed;
  }

  let pricePaise: number | undefined;
  if (priceRaw) {
    const parsed = parseRupeesToPaise(priceRaw);
    if (parsed === null) return c.json(fail("Please enter a valid price."));
    pricePaise = parsed;
  }

  const link = parseMeetingLink(meetingLinkRaw);
  if (!link.ok) return c.json(fail("That meeting link doesn't look like a valid URL."));

  await updateSession(id, {
    ...(startsAt ? { startsAt } : {}),
    ...(capacity !== undefined ? { capacity } : {}),
    ...(pricePaise !== undefined ? { pricePaise } : {}),
    meetingLink: link.value,
    notes: notes || null,
    status,
  });

  return c.json(ok("Session updated."));
});

routes.post("/admin/sessions/:id/cancel", async (c) => {
  const id = str(c.req.param("id"), 64);
  if (!id) return c.json(fail("Missing session."));
  const existing = await getSession(id);
  if (!existing) return c.json(fail("Session not found."));

  await updateSession(id, { status: "cancelled" });
  return c.json(
    ok(
      "Session cancelled. Students can now choose a refund or a free move from their booking page, at any time. " +
        "You can also refund every paid booking yourself with \"Refund all paid bookings\" on this page, or one by one with the Refund via Razorpay buttons on the Bookings page.",
    ),
  );
});

const REFUND_ALL_MAX = 40;

/**
 * Refund the paid bookings of a CANCELLED session (admin override: no 24h rule, but the same claim-first safety).
 * Sequential, at most `limit` per call (default 3, hard cap 40); each refund costs several subrequests, so the SPA
 * calls this repeatedly while `remaining > 0` to stay inside a Worker's budget.
 */
routes.post("/admin/sessions/:id/refund-all", async (c) => {
  const sessionId = str(c.req.param("id"), 64);
  const fail2 = (message: string): RefundAllResult => ({ ok: false, message, attempted: 0, refunded: 0, manual: 0, failed: 0, remaining: 0 });
  if (!sessionId) return c.json(fail2("Missing session."));
  const formData = await readFormData(c);
  const limit = Math.min(REFUND_ALL_MAX, Math.max(1, Math.floor(Number(formData.get("limit")) || 3)));

  const session = await getSession(sessionId);
  if (!session) return c.json(fail2("Session not found."));
  if (session.status !== "cancelled") return c.json(fail2("Cancel the session first: refunding everyone only makes sense for a cancelled class."));

  const ids = await listPaidRegistrationIds(sessionId, limit);
  let refunded = 0;
  let manual = 0;
  let failed = 0;
  let lastError = "";
  for (const id of ids) {
    const reg = await getRegistrationById(id);
    if (!reg) continue;
    const res = await refundWorkshopBooking(reg, { actor: "admin" });
    if (!res.ok) {
      failed++;
      lastError = res.message;
    } else if (res.outcome === "razorpay" || res.outcome === "demo") refunded++;
    else manual++;
  }
  const rows = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM registrations WHERE session_id = ? AND status = 'paid'`, [sessionId]);
  const remaining = Number(rows[0]?.n ?? 0);

  const result: RefundAllResult = {
    ok: failed === 0,
    message:
      `${refunded} refunded through Razorpay` +
      (manual ? `, ${manual} cancelled for a manual refund` : "") +
      (failed ? `, ${failed} could not be refunded and are still paid (${lastError})` : "") +
      `. ${remaining} paid booking${remaining === 1 ? "" : "s"} left on this session.`,
    attempted: ids.length,
    refunded,
    manual,
    failed,
    remaining,
  };
  return c.json(result);
});

/** The client navigates back to /admin/sessions when this succeeds (the old action redirected there). */
routes.post("/admin/sessions/:id/delete", async (c) => {
  const id = str(c.req.param("id"), 64);
  if (!id) return c.json(fail("Missing session."));

  const result = await deleteSession(id);
  if (!result.ok) return c.json(fail(result.reason ?? "This session couldn't be deleted."));
  return c.json(ok("Session deleted."));
});

routes.post("/admin/sessions/:id/registrations", async (c) => {
  const sessionId = str(c.req.param("id"), 64);
  const formData = await readFormData(c);
  const name = str(formData.get("name"), 120);
  const email = str(formData.get("email"), 200);
  const phone = normalisePhone(str(formData.get("phone"), 30));
  const amountRaw = str(formData.get("amount"), 10);

  if (!sessionId) return c.json(fail("Missing session."));
  if (name.length < 2) return c.json(fail("Please enter the student's name."));
  if (!isEmail(email)) return c.json(fail("Please enter a valid email address."));
  if (!phone.ok) return c.json(fail("Please enter a valid phone number (or leave it empty)."));

  let amountPaise: number | undefined;
  if (amountRaw) {
    const parsed = parseRupeesToPaise(amountRaw);
    if (parsed === null) return c.json(fail("Please enter a valid amount."));
    amountPaise = parsed;
  }

  let code: string;
  try {
    code = await addManualRegistration({ sessionId, name, email, phone: phone.value, amountPaise });
  } catch (err) {
    if (err instanceof Error && err.message === "Session not found") return c.json(fail("Session not found."));
    throw err;
  }
  return c.json(ok(`Added ${name} — registration ${code}.`));
});

routes.post("/admin/sessions/:id/mark-all-attended", async (c) => {
  const sessionId = str(c.req.param("id"), 64);
  if (!sessionId) return c.json(fail("Missing session."));

  await markAllAttended(sessionId);
  return c.json(ok("All paid registrations marked as attended."));
});

function bulkFailure(message: string): BulkEmailResult {
  return { ok: false, message, sent: 0, attempted: 0, total: 0, done: true };
}

/** `offset`/`limit` (optional form fields) pick the slice of recipients to email in this call. */
function sliceOf<T>(list: T[], formData: FormData): { part: T[]; done: boolean } {
  const offset = Math.max(0, Math.floor(Number(formData.get("offset")) || 0));
  const limit = Math.floor(Number(formData.get("limit")) || 0);
  const part = limit > 0 ? list.slice(offset, offset + limit) : list.slice(offset);
  return { part, done: offset + part.length >= list.length };
}

routes.post("/admin/sessions/:id/send-reminder", async (c) => {
  const sessionId = str(c.req.param("id"), 64);
  if (!sessionId) return c.json(bulkFailure("Missing session."));
  const formData = await readFormData(c);

  const [session, regs] = await Promise.all([getSession(sessionId), listRegistrations({ sessionId, status: "paid" })]);
  if (!session) return c.json(bulkFailure("Session not found."));
  if (regs.length === 0) return c.json(bulkFailure("No paid students to email yet."));

  const { part, done } = sliceOf(regs, formData);
  let sent = 0;
  for (const r of part) {
    const res = await sendEmail(sessionReminderEmail(r));
    if (res.ok) sent++;
  }

  const result: BulkEmailResult = {
    ok: sent > 0,
    message: bulkEmailMessage("reminder", sent, part.length, Boolean(session.meetingLink)),
    sent,
    attempted: part.length,
    total: regs.length,
    done,
  };
  return c.json(result);
});

routes.post("/admin/sessions/:id/send-feedback-request", async (c) => {
  const sessionId = str(c.req.param("id"), 64);
  if (!sessionId) return c.json(bulkFailure("Missing session."));
  const formData = await readFormData(c);

  const regs = (await listRegistrations({ sessionId, status: "paid" })).filter((r) => r.attended);
  if (regs.length === 0) return c.json(bulkFailure("No attended students to email yet — mark attendance first."));

  const { part, done } = sliceOf(regs, formData);
  let sent = 0;
  for (const r of part) {
    const res = await sendEmail(await feedbackRequestEmail(r));
    if (res.ok) sent++;
  }

  const result: BulkEmailResult = {
    ok: sent > 0,
    message: bulkEmailMessage("feedback", sent, part.length),
    sent,
    attempted: part.length,
    total: regs.length,
    done,
  };
  return c.json(result);
});

// ───────────────────────── registrations (shared by Sessions and Bookings) ─────────────────────────

routes.post("/admin/registrations/:id/attendance", async (c) => {
  const id = str(c.req.param("id"), 64);
  if (!id) return c.json(fail("Missing registration."));
  const formData = await readFormData(c);
  const attended = str(formData.get("attended"), 5) === "1";

  await setAttendance(id, attended);
  return c.json(ok(attended ? "Marked as attended." : "Marked as not attended."));
});

/** `status` is paid (recorded as a manual payment), refunded or cancelled. */
routes.post("/admin/registrations/:id/status", async (c) => {
  const id = str(c.req.param("id"), 64);
  if (!id) return c.json(fail("Missing registration."));
  const formData = await readFormData(c);
  const status = str(formData.get("status"), 20);
  if (!(REG_STATUSES_SETTABLE as readonly string[]).includes(status)) return c.json(fail("Invalid status."));

  if (status === "paid") await markRegistrationPaid(id, { provider: "manual", force: true });
  else await setRegistrationStatus(id, status as RegistrationStatus);

  return c.json(ok(`Registration marked as ${status}.`));
});

/** Refund a paid booking through Razorpay from the dashboard. Admin override: skips the 24h rule (e.g. a technical failure on our side). */
routes.post("/admin/bookings/:id/refund", async (c) => {
  const reg = await getRegistrationById(str(c.req.param("id"), 64));
  if (!reg) return c.json(fail("Booking not found."));
  const res = await refundWorkshopBooking(reg, { actor: "admin" });
  return c.json(res.ok ? ok(res.message) : fail(res.message));
});

// ───────────────────────── bookings ─────────────────────────

routes.get("/admin/bookings", async (c) => {
  const q = (c.req.query("q") ?? "").slice(0, 100);
  const statusParam = c.req.query("status") ?? "all";
  const status = (BOOKING_FILTERS as string[]).includes(statusParam) ? (statusParam as BookingStatusFilter) : "all";

  const [bookings, countRows, settings] = await Promise.all([
    listRegistrations({ search: q || undefined, status }),
    query<{ status: string; n: number; total: number | null }>(
      `SELECT r.status AS status, COUNT(*) AS n, SUM(r.amount_paise) AS total
       FROM registrations r JOIN class_sessions s ON s.id = r.session_id
       GROUP BY r.status`,
    ),
    getSiteSettings(),
  ]);

  const counts: Record<string, number> = { all: 0 };
  let totalPaidPaise = 0;
  for (const row of countRows) {
    const n = Number(row.n);
    counts[row.status] = n;
    counts.all += n;
    if (row.status === "paid") totalPaidPaise = Number(row.total ?? 0);
  }

  const holdMs = site.seatHoldMinutes * 60_000;
  const now = Date.now();
  const payload: AdminBookingsPageData = {
    status,
    q,
    counts,
    totalPaidPaise,
    returningDiscountPercent: settings.returningDiscountPercent,
    bookings: bookings.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      workshopTitle: r.workshop?.title ?? r.workshopSlug,
      sessionStartsAt: r.sessionStartsAt,
      code: r.code,
      amountPaise: r.amountPaise,
      discountPaise: r.discountPaise,
      paymentProvider: r.paymentProvider,
      status: r.status,
      createdAt: r.createdAt,
      abandoned: r.status === "pending" && now - new Date(r.createdAt).getTime() > holdMs,
      autoRefundable: isAutoRefundable(r),
    })),
  };
  return c.json(payload);
});

/** CSV of workshop registrations. Optional filters: ?sessionId=<id>  ?status=paid|pending|…  ?q=<name/email/code/phone search> */
routes.get("/admin/export", async (c) => {
  const sessionId = c.req.query("sessionId") || undefined;
  const statusParam = c.req.query("status") as RegistrationStatus | undefined;
  const status = statusParam && REGISTRATION_STATUSES.includes(statusParam) ? statusParam : "all";
  const search = c.req.query("q")?.trim().slice(0, 100) || undefined;
  const registrations = await listRegistrations({ sessionId, status, search });

  const rows = registrations.map((r) => [
    r.code,
    r.name,
    r.email,
    r.phone ?? "",
    r.workshop?.title ?? r.workshopSlug,
    formatDateLong(r.sessionStartsAt),
    r.status,
    (r.amountPaise / 100).toFixed(2),
    (r.discountPaise / 100).toFixed(2),
    r.paymentProvider ?? "",
    r.providerPaymentId ?? "",
    r.attended ? "yes" : "no",
    r.createdAt,
    r.paidAt ?? "",
  ]);

  const csv = [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  // UTF-8 BOM so Excel opens the file with correct encoding (e.g. the ₹ symbols in names/notes).
  const body = "﻿" + csv;
  const filename = sessionId
    ? `registrations-${sessionId.replace(/[^\w.-]/g, "_")}.csv`
    : `registrations-${status}${search ? "-search" : ""}.csv`;

  return c.body(body, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

const CSV_HEADER = [
  "code",
  "name",
  "email",
  "phone",
  "workshop",
  "session_date",
  "status",
  "amount_inr",
  "discount_inr",
  "provider",
  "payment_id",
  "attended",
  "created_at",
  "paid_at",
];

/**
 * Quote a CSV cell only when it needs it, doubling any embedded quotes.
 * Text starting with = + - @ is prefixed with ' so spreadsheet apps don't run
 * it as a formula (names and emails come from a public form).
 */
function csvCell(value: string | number | boolean | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ───────────────────────── monthly passes ─────────────────────────

routes.get("/admin/passes", async (c) => {
  const [passes, settings] = await Promise.all([listPasses({}), getSiteSettings()]);
  const monthKey = passesOnSale()[0]?.monthKey ?? null;

  let revenuePaise = 0;
  let paidCount = 0;
  let monthCount = 0;
  for (const p of passes) {
    if (p.status !== "paid") continue;
    revenuePaise += p.amountPaise;
    paidCount++;
    if (p.monthKey === monthKey) monthCount++;
  }

  const payload: AdminPassesPageData = {
    monthlyPassPricePaise: settings.monthlyPassPricePaise,
    revenuePaise,
    paidCount,
    monthKey,
    monthCount,
    passes: passes.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      monthKey: p.monthKey,
      code: p.code,
      amountPaise: p.amountPaise,
      status: p.status,
      demo: p.paymentProvider === "demo",
      createdAt: p.createdAt,
    })),
  };
  return c.json(payload);
});

routes.post("/admin/passes/:id/status", async (c) => {
  const id = str(c.req.param("id"), 64);
  if (!id) return c.json(fail("Missing pass."));
  const formData = await readFormData(c);
  const status = str(formData.get("status"), 20);
  if (!(PASS_STATUSES_SETTABLE as readonly string[]).includes(status)) return c.json(fail("Invalid status."));

  if (status === "paid") await markPassPaid(id, { provider: "manual" });
  else await setPassStatus(id, status as MonthlyPassStatus);

  return c.json(ok(`Pass marked as ${status}.`));
});

// ───────────────────────── personal training ─────────────────────────

routes.get("/admin/training", async (c) => {
  const scope = c.req.query("tab") === "past" ? "past" : "upcoming";
  const [slots, bookings] = await Promise.all([listSlots("upcoming"), listTrainingBookings({ scope })]);

  const payload: AdminTrainingPageData = {
    scope,
    slots: slots.map((s) => ({
      id: s.id,
      startsAt: s.startsAt,
      isOpen: s.isOpen,
      bookingCode: s.bookingCode,
      bookingStatus: s.bookingStatus,
    })),
    bookings: bookings.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      email: b.email,
      phone: b.phone,
      topic: b.topic,
      durationMin: b.durationMin,
      startsAt: b.startsAt,
      amountPaise: b.amountPaise,
      status: b.status,
      goals: b.goals,
      meetingLink: b.meetingLink,
      autoRefundable: isAutoRefundable(b),
    })),
  };
  return c.json(payload);
});

/** Add one slot, or the same time weekly for up to 8 weeks. */
routes.post("/admin/training/slots", async (c) => {
  const formData = await readFormData(c);
  const date = str(formData.get("date"), 20);
  const time = str(formData.get("time"), 10);
  const repeatWeeks = Math.min(MAX_REPEAT_WEEKS, Math.max(1, Math.round(Number(formData.get("repeatWeeks")) || 1)));

  if (!date || !time) return c.json(fail("Please choose a date and time."));

  let startIso: string;
  try {
    startIso = fromISTInputs(date, time);
  } catch {
    return c.json(fail("That date/time isn't valid."));
  }

  const starts = Array.from({ length: repeatWeeks }, (_, i) =>
    new Date(new Date(startIso).getTime() + i * 7 * 24 * 3600_000).toISOString(),
  );
  await Promise.all(starts.map((iso) => createSlot(iso)));

  return c.json(ok(repeatWeeks === 1 ? "Slot added." : `${repeatWeeks} weekly slots added, starting ${date}.`));
});

routes.post("/admin/training/slots/:id/open", async (c) => {
  const id = str(c.req.param("id"), 64);
  const formData = await readFormData(c);
  const open = str(formData.get("open"), 5) === "1";

  await setSlotOpen(id, open);
  return c.json(ok(open ? "Slot opened for booking." : "Slot closed."));
});

routes.post("/admin/training/slots/:id/delete", async (c) => {
  const result = await deleteSlot(str(c.req.param("id"), 64));
  if (!result.ok) return c.json(fail(result.reason ?? "This slot can't be deleted."));
  return c.json(ok("Slot deleted."));
});

routes.post("/admin/training/bookings/:id/status", async (c) => {
  const id = str(c.req.param("id"), 64);
  const formData = await readFormData(c);
  const status = str(formData.get("status"), 20) as TrainingBookingStatus;
  if (!TRAINING_STATUSES.includes(status)) return c.json(fail("Invalid status."));

  await setTrainingStatus(id, status);
  return c.json(ok(`Booking marked as ${status}.`));
});

/** Refund a paid training booking through Razorpay from the dashboard (admin override: skips the 24h rule). */
routes.post("/admin/training/bookings/:id/refund", async (c) => {
  const booking = await getTrainingBookingById(str(c.req.param("id"), 64));
  if (!booking) return c.json(fail("Booking not found."));
  const res = await refundTrainingBooking(booking, { actor: "admin" });
  return c.json(res.ok ? ok(res.message) : fail(res.message));
});

routes.post("/admin/training/bookings/:id/meeting-link", async (c) => {
  const id = str(c.req.param("id"), 64);
  const formData = await readFormData(c);
  const link = str(formData.get("link"), 500);
  const notify = formData.get("notify") === "on";

  await setTrainingMeetingLink(id, link || null);

  if (notify && link) {
    const booking = await getTrainingBookingById(id);
    if (booking) await sendEmail(trainingLinkEmail(booking));
  }

  return c.json(ok(notify && link ? "Link saved and emailed to the student." : "Link saved."));
});

// ───────────────────────── feedback ─────────────────────────

routes.get("/admin/feedback", async (c) => {
  const [stats, feedback] = await Promise.all([feedbackStats(), listFeedback()]);

  const payload: AdminFeedbackPageData = {
    stats,
    feedback: feedback.map((f) => ({
      id: f.id,
      rating: f.rating,
      workshopTitle: f.workshopTitle,
      attendAgain: f.attendAgain,
      createdAt: f.createdAt,
      learned: f.learned,
      unclear: f.unclear,
      improve: f.improve,
      teachNext: f.teachNext,
      publicComment: f.publicComment,
      displayName: f.displayName,
      consentPublic: f.consentPublic,
      approved: f.approved,
    })),
  };
  return c.json(payload);
});

routes.post("/admin/feedback/:id/approved", async (c) => {
  const id = str(c.req.param("id"), 64);
  const formData = await readFormData(c);
  const approved = str(formData.get("approved"), 5) === "1";

  await setFeedbackApproved(id, approved);
  return c.json(ok(approved ? "Now shown on the public site." : "Removed from the public site."));
});

routes.post("/admin/feedback/:id/delete", async (c) => {
  await deleteFeedback(str(c.req.param("id"), 64));
  return c.json(ok("Feedback deleted."));
});

// ───────────────────────── demand ─────────────────────────

routes.get("/admin/demand", async (c) => {
  const [counts, allInterest, allFeedback, paidRows] = await Promise.all([
    interestCounts(),
    listInterest(),
    listFeedback(),
    query<{ workshop_slug: string; n: number }>(
      `SELECT s.workshop_slug AS workshop_slug, COUNT(*) AS n
       FROM registrations r JOIN class_sessions s ON s.id = r.session_id
       WHERE r.status = 'paid'
       GROUP BY s.workshop_slug`,
    ),
  ]);

  const emailsByWorkshop = new Map<string, { email: string; name: string | null }[]>();
  for (const i of allInterest) {
    const list = emailsByWorkshop.get(i.workshopSlug) ?? [];
    list.push({ email: i.email, name: i.name });
    emailsByWorkshop.set(i.workshopSlug, list);
  }
  const paidSeatsByWorkshop = new Map(paidRows.map((r) => [r.workshop_slug, Number(r.n)]));

  const payload: AdminDemandPageData = {
    rows: counts.map((cnt) => ({
      workshopSlug: cnt.workshopSlug,
      workshopTitle: cnt.workshopTitle,
      status: cnt.status,
      count: cnt.count,
      paidSeats: paidSeatsByWorkshop.get(cnt.workshopSlug) ?? 0,
      emails: emailsByWorkshop.get(cnt.workshopSlug) ?? [],
    })),
    teachNext: allFeedback
      .filter((f) => f.teachNext && f.teachNext.trim())
      .map((f) => ({ id: f.id, text: f.teachNext as string, workshopTitle: f.workshopTitle, createdAt: f.createdAt })),
  };
  return c.json(payload);
});

// ───────────────────────── messages ─────────────────────────

routes.get("/admin/messages", async (c) => {
  const messages = await listContactMessages();
  const sorted = [...messages].sort((a, b) => {
    if (a.handled !== b.handled) return a.handled ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const payload: AdminMessagesPageData = {
    messages: sorted.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      topic: m.topic,
      message: m.message,
      handled: m.handled,
      createdAt: m.createdAt,
    })),
    openCount: messages.filter((m) => !m.handled).length,
  };
  return c.json(payload);
});

routes.post("/admin/messages/:id/handled", async (c) => {
  const id = str(c.req.param("id"), 64);
  const formData = await readFormData(c);
  const handled = str(formData.get("handled"), 5) === "1";

  await setContactHandled(id, handled);
  return c.json(ok(handled ? "Marked as handled." : "Marked as unhandled."));
});

// ───────────────────────── email log ─────────────────────────

routes.get("/admin/emails", async (c) => {
  const emails = await listEmailLog();
  const payload: AdminEmailsPageData = {
    emails: emails.map((e) => ({
      id: e.id,
      toEmail: e.toEmail,
      subject: e.subject,
      bodyText: e.bodyText,
      kind: e.kind,
      status: e.status,
      error: e.error,
      createdAt: e.createdAt,
    })),
    configured: emailConfigured(),
  };
  return c.json(payload);
});
