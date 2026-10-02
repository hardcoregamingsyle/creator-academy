import { api, type ActionResult } from "@/lib/api";
import type { AdminAction } from "@/components/admin-ui";

/** An `ActionForm` action that POSTs the form's fields to `url` and returns the server's `ActionResult`. */
export function postTo(url: string): AdminAction {
  return (formData: FormData) => api.postForm<ActionResult>(url, formData);
}

export const enc = encodeURIComponent;
