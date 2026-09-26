import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { Logo } from "@/components/brand";
import { Card, Notice } from "@/components/ui";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">Admin sign in</h1>
          <p className="mt-1 text-sm text-muted">For the team running the academy — not for students.</p>

          {!adminConfigured() ? (
            <Notice tone="warning" title="Admin login isn't set up yet" className="mt-6">
              Set an <code className="font-mono">ADMIN_PASSWORD</code> environment variable (e.g. in{" "}
              <code className="font-mono">.env.local</code>) to enable admin sign-in.
            </Notice>
          ) : (
            <div className="mt-6">
              <LoginForm />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
