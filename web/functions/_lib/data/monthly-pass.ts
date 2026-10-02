import { execute, newCode, newId, nowIso, query, queryOne } from "../db";
import { currentMonthKey, monthLabel, nextMonthKey } from "../../../shared/format";
import { getSiteSettings } from "./site-settings";
import { normaliseEmail } from "./registrations";
import { holdCutoffIso } from "./sessions";

/**
 * Monthly Creator Course / All-Access Pass.
 *
 * A pass covers every workshop session scheduled in `monthKey` (an IST
 * calendar month, "YYYY-MM") for the email that bought it — no separate
 * per-class payment. Matched by email, the same pattern already used for the
 * returning-student discount, so no login/account system is required.
 */

export type MonthlyPassStatus = "pending" | "paid" | "refunded" | "cancelled" | "failed";

export type MonthlyPass = {
  id: string;
  code: string;
  email: string;
  name: string;
  phone: string | null;
  monthKey: string;
  amountPaise: number;
  status: MonthlyPassStatus;
  paymentProvider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
};

type PassRow = {
  id: string;
  code: string;
  email: string;
  name: string;
  phone: string | null;
  month_key: string;
  amount_paise: number;
  status: MonthlyPassStatus;
  payment_provider: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  created_at: string;
  paid_at: string | null;
};

function mapPass(r: PassRow): MonthlyPass {
  return {
    id: r.id,
    code: r.code,
    email: r.email,
    name: r.name,
    phone: r.phone,
    monthKey: r.month_key,
    amountPaise: Number(r.amount_paise),
    status: r.status,
    paymentProvider: r.payment_provider,
    providerOrderId: r.provider_order_id,
    providerPaymentId: r.provider_payment_id,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  };
}

/** The month(s) currently on sale: this month, and next month once we're in its second half. */
export function passesOnSale(): { monthKey: string; label: string }[] {
  const now = currentMonthKey();
  const next = nextMonthKey(now);
  const dayOfMonth = new Date().getUTCDate(); // rough — good enough for "offer next month soon"
  const months = dayOfMonth >= 15 ? [now, next] : [now];
  return months.map((monthKey) => ({ monthKey, label: monthLabel(monthKey) }));
}

export function isValidMonthKey(v: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Does this email have an active (paid) pass covering this month? */
export async function hasActivePass(email: string, monthKey: string): Promise<MonthlyPass | null> {
  const row = await queryOne<PassRow>(
    `SELECT * FROM monthly_passes WHERE email = ? AND month_key = ? AND status = 'paid' LIMIT 1`,
    [normaliseEmail(email), monthKey],
  );
  return row ? mapPass(row) : null;
}

export type PassInput = { email: string; name: string; phone?: string | null; monthKey: string };
export type PassResult = { ok: true; pass: MonthlyPass; reused: boolean } | { ok: false; error: string };

/** Create (or reuse) a pending pass purchase for a month. */
export async function createPendingPass(input: PassInput): Promise<PassResult> {
  if (!isValidMonthKey(input.monthKey)) return { ok: false, error: "Please choose a valid month." };
  const email = normaliseEmail(input.email);
  const name = input.name.trim();
  const phone = input.phone?.trim() || null;

  // Independent lookups: one round trip instead of two.
  const [existingPaid, pending] = await Promise.all([
    hasActivePass(email, input.monthKey),
    queryOne<PassRow>(
      `SELECT * FROM monthly_passes WHERE email = ? AND month_key = ? AND status = 'pending' AND created_at > ? ORDER BY created_at DESC LIMIT 1`,
      [email, input.monthKey, holdCutoffIso()],
    ),
  ]);
  if (existingPaid) {
    return { ok: false, error: `You already have a pass for ${monthLabel(input.monthKey)}.` };
  }
  if (pending) {
    // Re-use the open purchase as it is. The stored name/phone are NOT overwritten: this request is
    // unauthenticated, so anyone typing the same email must not be able to rewrite someone else's pass.
    return { ok: true, pass: mapPass(pending), reused: true };
  }

  const settings = await getSiteSettings();
  const pass: MonthlyPass = {
    id: newId(),
    code: newCode("CV"),
    email,
    name,
    phone,
    monthKey: input.monthKey,
    amountPaise: settings.monthlyPassPricePaise,
    status: "pending",
    paymentProvider: null,
    providerOrderId: null,
    providerPaymentId: null,
    createdAt: nowIso(),
    paidAt: null,
  };
  await execute(
    `INSERT INTO monthly_passes (id, code, email, name, phone, month_key, amount_paise, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [pass.id, pass.code, pass.email, pass.name, pass.phone, pass.monthKey, pass.amountPaise, pass.createdAt],
  );
  return { ok: true, pass, reused: false };
}

export async function getPassByCode(code: string): Promise<MonthlyPass | null> {
  const row = await queryOne<PassRow>(`SELECT * FROM monthly_passes WHERE code = ?`, [code.trim().toUpperCase()]);
  return row ? mapPass(row) : null;
}

export async function getPassById(id: string): Promise<MonthlyPass | null> {
  const row = await queryOne<PassRow>(`SELECT * FROM monthly_passes WHERE id = ?`, [id]);
  return row ? mapPass(row) : null;
}

export async function getPassByOrderId(orderId: string): Promise<MonthlyPass | null> {
  const row = await queryOne<PassRow>(`SELECT * FROM monthly_passes WHERE provider_order_id = ?`, [orderId]);
  return row ? mapPass(row) : null;
}

export async function setPassOrderId(id: string, orderId: string): Promise<void> {
  await execute(`UPDATE monthly_passes SET provider_order_id = ?, payment_provider = 'razorpay' WHERE id = ?`, [
    orderId,
    id,
  ]);
}

/** Idempotent — returns true only the first time the pass becomes paid. */
export async function markPassPaid(
  id: string,
  payment: { provider: "razorpay" | "demo" | "manual"; paymentId?: string | null },
): Promise<boolean> {
  const changed = await execute(
    `UPDATE monthly_passes SET status = 'paid', payment_provider = ?, provider_payment_id = ?, paid_at = ?
     WHERE id = ? AND status != 'paid'`,
    [payment.provider, payment.paymentId ?? null, nowIso(), id],
  );
  return changed > 0;
}

export async function setPassStatus(id: string, status: MonthlyPassStatus): Promise<void> {
  await execute(`UPDATE monthly_passes SET status = ? WHERE id = ?`, [status, id]);
}

export async function listPasses(opts: { monthKey?: string; status?: MonthlyPassStatus | "all" } = {}): Promise<MonthlyPass[]> {
  const where: string[] = [];
  const args: string[] = [];
  if (opts.monthKey) {
    where.push("month_key = ?");
    args.push(opts.monthKey);
  }
  if (opts.status && opts.status !== "all") {
    where.push("status = ?");
    args.push(opts.status);
  }
  const sql = `SELECT * FROM monthly_passes${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  const rows = await query<PassRow>(sql, args);
  return rows.map(mapPass);
}

export async function passRevenuePaise(monthKey?: string): Promise<number> {
  const rows = monthKey
    ? await query<{ total: number | null }>(`SELECT SUM(amount_paise) AS total FROM monthly_passes WHERE status = 'paid' AND month_key = ?`, [monthKey])
    : await query<{ total: number | null }>(`SELECT SUM(amount_paise) AS total FROM monthly_passes WHERE status = 'paid'`);
  return Number(rows[0]?.total ?? 0);
}
