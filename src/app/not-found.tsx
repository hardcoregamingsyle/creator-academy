import { Compass } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink, Container } from "@/components/ui";

/**
 * Global 404. This lives outside the (site) route group's layout, so it
 * includes the header and footer itself.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-deep focus:px-4 focus:py-2 focus:text-on-dark"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Container className="flex flex-col items-center gap-5 py-24 text-center sm:py-32">
          <span className="flex size-14 items-center justify-center rounded-full bg-sunken text-ink">
            <Compass className="size-6" aria-hidden />
          </span>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted">404</p>
          <h1 className="text-3xl font-bold sm:text-4xl">We couldn&apos;t find that page</h1>
          <p className="max-w-md text-muted">
            The page you&apos;re looking for may have moved, or the link might be off. Try one of these instead.
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/classes">Explore classes</ButtonLink>
            <ButtonLink href="/schedule" variant="outline">
              See the schedule
            </ButtonLink>
            <ButtonLink href="/" variant="ghost">
              Go home
            </ButtonLink>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
