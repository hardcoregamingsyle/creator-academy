"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { markPassPaid, setPassStatus } from "@/lib/data/monthly-pass";
import type { ActionResult } from "../admin-ui";

const STATUS_LABEL: Record<"paid" | "refunded" | "cancelled", string> = {
  paid: "paid",
  refunded: "refunded",
  cancelled: "cancelled",
};

export async function setPassStatusAction(
  id: string,
  status: "paid" | "refunded" | "cancelled",
  _prevState: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return { ok: false, message: "Missing pass." };

  if (status === "paid") await markPassPaid(id, { provider: "manual" });
  else await setPassStatus(id, status);

  revalidatePath("/admin/passes");
  return { ok: true, message: `Pass marked as ${STATUS_LABEL[status]}.` };
}
