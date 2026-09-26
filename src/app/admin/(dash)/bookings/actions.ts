"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { markRegistrationPaid, setRegistrationStatus } from "@/lib/data/registrations";
import type { ActionResult } from "../admin-ui";

/**
 * Row actions for the bookings table. Bound with the registration id (and the
 * target status, for `setRegistrationStatusAction`) before being handed to
 * `ActionForm`, e.g. `setRegistrationStatusAction.bind(null, r.id, "refunded")`.
 */

const STATUS_LABEL: Record<"paid" | "refunded" | "cancelled", string> = {
  paid: "paid",
  refunded: "refunded",
  cancelled: "cancelled",
};

export async function setRegistrationStatusAction(
  id: string,
  status: "paid" | "refunded" | "cancelled",
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return { ok: false, message: "Missing registration." };

  if (status === "paid") {
    await markRegistrationPaid(id, { provider: "manual" });
  } else {
    await setRegistrationStatus(id, status);
  }

  revalidatePath("/admin/bookings");
  return { ok: true, message: `Registration marked as ${STATUS_LABEL[status]}.` };
}
