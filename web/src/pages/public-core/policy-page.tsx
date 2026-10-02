import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { NotFound } from "@/components/not-found";
import { PageSkeleton } from "@/components/page-skeleton";
import { Container, Eyebrow, cn } from "@/components/ui";
import { useSite, useSiteReady } from "@/lib/site-context";
import { usePageMeta } from "@/lib/usePageMeta";
import { LAST_UPDATED, POLICY_SLUGS, PolicyContent, isPolicySlug, policyMeta } from "./policy-content";

const SITE_WAIT_MS = 8000;

/** The policies quote the legal name and address from /api/site, so hold the page back until those have arrived. */
function useSiteLoadState(): "ready" | "loading" | "failed" {
  const ready = useSiteReady();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setTimedOut(true), SITE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [ready]);
  return ready ? "ready" : timedOut ? "failed" : "loading";
}

export function Component() {
  const { slug } = useParams<{ slug: string }>();
  const site = useSite();
  const siteState = useSiteLoadState();
  const valid = isPolicySlug(slug);
  const meta = valid ? policyMeta(site)[slug] : undefined;
  usePageMeta({ title: meta?.title, description: meta?.description });

  if (!valid) return <NotFound />;
  if (siteState === "failed") {
    return (
      <ApiErrorNotice
        error={new Error("We couldn't load our business details. Please check your connection and try again.")}
        onRetry={() => window.location.reload()}
      />
    );
  }
  if (siteState === "loading") return <PageSkeleton />;

  const titles = policyMeta(site);
  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Policies</Eyebrow>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{titles[slug].title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {LAST_UPDATED}</p>

        <nav aria-label="Policies" className="mt-8 flex flex-wrap gap-2 border-b border-line pb-8">
          {POLICY_SLUGS.map((s) => (
            <Link
              key={s}
              to={`/policies/${s}`}
              aria-current={s === slug ? "page" : undefined}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                s === slug ? "border-deep bg-deep text-on-dark" : "border-line-strong bg-surface text-ink-soft hover:border-ink",
              )}
            >
              {titles[s].title}
            </Link>
          ))}
        </nav>

        <div className="prose-academy mt-8">
          <PolicyContent slug={slug} site={site} />
        </div>
      </div>
    </Container>
  );
}
