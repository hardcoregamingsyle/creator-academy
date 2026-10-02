import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Logo } from "@/components/brand";
import { PageSkeleton } from "@/components/page-skeleton";
import { ThemeToggle } from "@/components/theme-toggle";

/** Minimal chrome for the student live room: logo + theme toggle, no marketing footer, so the room gets the whole screen. */
export function LiveLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-deep focus:px-4 focus:py-2 focus:text-on-dark"
      >
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between px-4 sm:px-6">
          <Logo />
          <ThemeToggle />
        </div>
      </header>
      {/* tabIndex -1: the target RouteAnnouncer moves focus to after navigation; never a Tab stop. */}
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
