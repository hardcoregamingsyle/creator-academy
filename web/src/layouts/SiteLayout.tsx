import { Suspense, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { PageSkeleton } from "@/components/page-skeleton";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** Header + main + footer chrome around any content (also used by the router-level error screen). */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-deep focus:px-4 focus:py-2 focus:text-on-dark"
      >
        Skip to content
      </a>
      <SiteHeader />
      {/* tabIndex -1: lets the skip link and RouteAnnouncer move focus here; it is never a Tab stop, so no focus ring either. */}
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function SiteLayout() {
  return (
    <SiteShell>
      <Suspense fallback={<PageSkeleton />}>
        <Outlet />
      </Suspense>
    </SiteShell>
  );
}
