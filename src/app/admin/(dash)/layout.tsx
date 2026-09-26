import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { paymentMode } from "@/lib/payments";
import { site } from "@/lib/site";
import { Logo } from "@/components/brand";
import { Badge } from "@/components/ui";
import { logoutAction } from "../login/actions";
import { AdminNavLinks } from "./admin-nav";

export const metadata: Metadata = {
  title: { default: "Admin", template: `%s · Admin · ${site.name}` },
  robots: { index: false, follow: false },
};

function PaymentPill() {
  const mode = paymentMode();
  if (mode === "razorpay") return <Badge tone="success">Live payments</Badge>;
  if (mode === "demo") return <Badge tone="warning">Demo payments</Badge>;
  return <Badge tone="danger">Payments off</Badge>;
}

function EmailPill() {
  return emailConfigured() ? (
    <Badge tone="success">Email sending on</Badge>
  ) : (
    <Badge tone="neutral">Emails logged only</Badge>
  );
}

function LogoutButton({ compact }: { compact?: boolean }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={
          compact
            ? "text-muted hover:text-ink"
            : "flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[15px] font-medium text-ink-soft hover:bg-sunken"
        }
        aria-label="Log out"
      >
        <LogOut className="size-4" aria-hidden />
        {!compact && "Log out"}
      </button>
    </form>
  );
}

/**
 * Admin shell: requires a signed-in admin, then renders a left sidebar on
 * desktop and a top bar with a horizontally scrollable nav on mobile.
 */
export default async function AdminDashLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto flex w-full max-w-[1400px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
          <Logo />
          <div className="mt-8 flex-1 overflow-y-auto">
            <AdminNavLinks variant="sidebar" />
          </div>
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex flex-wrap gap-1.5">
              <PaymentPill />
              <EmailPill />
            </div>
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[15px] font-medium text-ink-soft hover:bg-sunken"
            >
              <ExternalLink className="size-4" aria-hidden /> View site
            </Link>
            <LogoutButton />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur-sm lg:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <Logo />
              <div className="flex items-center gap-4">
                <Link href="/" target="_blank" rel="noreferrer" className="text-muted hover:text-ink" aria-label="View site">
                  <ExternalLink className="size-5" aria-hidden />
                </Link>
                <LogoutButton compact />
              </div>
            </div>
            <div className="border-t border-line py-2">
              <AdminNavLinks variant="topbar" />
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              <PaymentPill />
              <EmailPill />
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
