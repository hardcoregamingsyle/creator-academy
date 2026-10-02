import { Compass } from "lucide-react";
import { usePageMeta } from "@/lib/usePageMeta";
import { ButtonLink, Container } from "./ui";

/** 404 content. Render it inside a layout (SiteLayout supplies the header and footer). */
export function NotFound() {
  usePageMeta({ noindex: true });
  return (
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
  );
}
