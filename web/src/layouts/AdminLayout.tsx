import { Suspense, useEffect } from "react";
import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { ExternalLink, LogOut } from "lucide-react";
import { brand } from "@shared/brand";
import { AdminNavLinks } from "@/components/admin-nav";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { Logo } from "@/components/brand";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge } from "@/components/ui";
import { ADMIN_UNAUTHORIZED_EVENT, api } from "@/lib/api";
import { useSite, useSiteReady } from "@/lib/site-context";
import type { AdminSessionInfo } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useLayoutMeta } from "@/lib/usePageMeta";
import type { PaymentMode } from "@shared/api-types";

function PaymentPill({ mode }: { mode: PaymentMode }) {
  if (mode === "razorpay") return <Badge tone="success">Live payments</Badge>;
  if (mode === "demo") return <Badge tone="warning">Demo payments</Badge>;
  return <Badge tone="danger">Payments off</Badge>;
}

function EmailPill({ configured }: { configured: boolean }) {
  return configured ? <Badge tone="success">Email sending on</Badge> : <Badge tone="neutral">Emails logged only</Badge>;
}

function LogoutButton({ compact }: { compact?: boolean }) {
  const navigate = useNavigate();
  async function logout() {
    try {
      await api.post("/api/admin/logout");
    } catch {
      /* the cookie may already be gone — leave either way */
    }
    navigate("/admin/login", { replace: true });
  }
  return (
    <button
      type="button"
      onClick={logout}
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
  );
}

/**
 * Admin shell: checks the session on mount (GET /api/admin/session), sends
 * visitors who aren't signed in to /admin/login, then renders a left sidebar on
 * desktop and a top bar with a horizontally scrollable nav on mobile.
 */
export function AdminLayout() {
  useLayoutMeta({ defaultTitle: "Admin", titleTemplate: `%s · Admin · ${brand.name}`, noindex: true });

  const navigate = useNavigate();
  const site = useSite();
  const siteReady = useSiteReady();
  const { data, error, reload } = useApi<AdminSessionInfo>("/api/admin/session");

  useEffect(() => {
    const onUnauthorized = () => navigate("/admin/login", { replace: true });
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate]);

  if (error?.status === 401 || data?.admin === false) return <Navigate to="/admin/login" replace />;
  if (error) {
    return (
      <div className="min-h-dvh bg-paper">
        <ApiErrorNotice error={error} onRetry={reload} title="We couldn't check your admin session" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-dvh bg-paper">
        <PageSkeleton />
      </div>
    );
  }

  const paymentMode = data.paymentMode ?? (siteReady ? site.paymentMode : undefined);
  const pills = (
    <>
      {paymentMode && <PaymentPill mode={paymentMode} />}
      {data.emailConfigured !== undefined && <EmailPill configured={data.emailConfigured} />}
    </>
  );

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
            <div className="flex flex-wrap gap-1.5">{pills}</div>
            <Link
              to="/"
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
                <Link to="/" target="_blank" rel="noreferrer" className="text-muted hover:text-ink" aria-label="View site">
                  <ExternalLink className="size-5" aria-hidden />
                </Link>
                <LogoutButton compact />
              </div>
            </div>
            <div className="border-t border-line py-2">
              <AdminNavLinks variant="topbar" />
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">{pills}</div>
          </header>

          {/* id + tabIndex -1: the target RouteAnnouncer moves focus to after each navigation. */}
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-8 focus:outline-none sm:px-6 sm:py-10 lg:px-8">
            <Suspense fallback={<PageSkeleton bare />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
