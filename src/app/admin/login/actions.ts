"use server";

import { redirect } from "next/navigation";
import { checkAdminPassword, clearAdminSession, createAdminSession } from "@/lib/auth";

/**
 * Admin login/logout server actions. Every admin page/action/route also calls
 * `requireAdmin()` itself — this file only owns the sign-in/out flow.
 */

export type LoginState = { error: string } | null;

const FAILED_ATTEMPT_DELAY_MS = 600;

/** Used by the login form via `useActionState`. */
export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  if (!checkAdminPassword(password)) {
    // Slow down brute-forcing a little; the password itself is the real defence.
    await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
    return { error: "Incorrect password. Please try again." };
  }

  await createAdminSession();
  redirect("/admin");
}

/** Bound directly to a `<form action={logoutAction}>` — no extra state needed. */
export async function logoutAction(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}
