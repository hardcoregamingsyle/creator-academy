import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { listRegistrations, type RegistrationStatus } from "@/lib/data/registrations";
import { formatDateLong } from "@/lib/format";

export const dynamic = "force-dynamic";

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

const STATUSES: RegistrationStatus[] = ["pending", "paid", "failed", "refunded", "cancelled"];

const HEADER = [
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
 * GET /api/admin/export — CSV of workshop registrations.
 * Optional filters: ?sessionId=<id>  ?status=paid|pending|…  ?q=<name/email/code/phone search>
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId") || undefined;
  const statusParam = searchParams.get("status") as RegistrationStatus | null;
  const status = statusParam && STATUSES.includes(statusParam) ? statusParam : "all";
  const search = searchParams.get("q")?.trim().slice(0, 100) || undefined;
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

  const csv = [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  // UTF-8 BOM so Excel opens the file with correct encoding (e.g. the ₹ symbols in names/notes).
  const body = "﻿" + csv;
  const filename = sessionId
    ? `registrations-${sessionId}.csv`
    : `registrations-${status}${search ? "-search" : ""}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
