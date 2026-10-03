import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarDays, UserRound } from "lucide-react";
import { categories, type Workshop } from "@shared/content";
import { formatINR } from "@shared/format";
import type { ClassesPageData } from "@shared/pages/catalogue";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { CategoryIcon } from "@/components/brand";
import { PageSkeleton } from "@/components/page-skeleton";
import { ButtonLink, Container, Eyebrow, Notice, cn } from "@/components/ui";
import { SoftwareNotice } from "@/components/software-notice";
import { WorkshopCard } from "@/components/workshop-card";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { nextSessionAt } from "./helpers";

export function Component() {
  const [searchParams] = useSearchParams();
  const { data, error, reload } = useApi<ClassesPageData>("/api/pages/classes");
  usePageMeta({ title: "Classes" });

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;

  const categoryParam = searchParams.get("category");
  const activeCategoryMeta = categories.find((c) => c.slug === categoryParam);
  const activeCategory = activeCategoryMeta?.slug;
  const { workshopPricePaise, nextByWorkshop } = data;

  const filtered: Workshop[] = activeCategory ? data.workshops.filter((w) => w.category === activeCategory) : data.workshops;
  const live = filtered.filter((w) => w.status === "live");
  const planned = filtered.filter((w) => w.status === "planned");
  const future = filtered.filter((w) => w.status === "future");

  return (
    <Container className="py-10 sm:py-14">
      <Eyebrow>Explore classes</Eyebrow>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Pick exactly the skill you want</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        Every workshop below is standalone and open-entry — there&apos;s no course to complete first and no fixed
        order. Join any class for {formatINR(workshopPricePaise)}, spend 90 minutes live with an instructor,
        and leave with something finished.
      </p>
      <SoftwareNotice className="mt-6 max-w-2xl" />

      {/* ── category filter ── */}
      <nav aria-label="Filter by category" className="mt-8 flex flex-wrap gap-2">
        <Link
          to="/classes"
          aria-current={!activeCategory ? "page" : undefined}
          className={chipClass(!activeCategory)}
        >
          All classes
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            to={`/classes?category=${c.slug}`}
            aria-current={activeCategory === c.slug ? "page" : undefined}
            className={chipClass(activeCategory === c.slug)}
          >
            <CategoryIcon category={c.slug} className="size-4" />
            {c.name}
          </Link>
        ))}
      </nav>

      {/* ── groups ── */}
      <div className="mt-12 space-y-14">
        <WorkshopGroup
          title="Open for booking"
          description="Scheduled and ready to join."
          workshops={live}
          nextByWorkshop={nextByWorkshop}
          workshopPricePaise={workshopPricePaise}
          emptyNote={
            activeCategoryMeta && (
              <Notice tone="info" title={`No ${activeCategoryMeta.name} classes are open for booking yet`}>
                {planned.length || future.length
                  ? "Take a look below — an outline is ready or it's on our roadmap. Ask to be notified and we'll email you when a date is scheduled."
                  : "Browse another category, or check back soon — we schedule new classes regularly."}
              </Notice>
            )
          }
        />
        <WorkshopGroup
          title="Coming soon"
          description="The outline is ready — these will open for booking once a date is scheduled."
          workshops={planned}
          nextByWorkshop={nextByWorkshop}
          workshopPricePaise={workshopPricePaise}
        />
        <WorkshopGroup
          title="On the roadmap"
          description="Planned, but not yet scheduled. Vote on a class page to help us prioritise it."
          workshops={future}
          nextByWorkshop={nextByWorkshop}
          workshopPricePaise={workshopPricePaise}
        />
      </div>

      {/* ── callout ── */}
      <div className="mt-16 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-6">
          <div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-sunken text-ink">
              <UserRound className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-display text-lg font-bold text-ink">Want one-on-one help?</h2>
            <p className="mt-1.5 text-[15px] text-muted">
              Bring your own project for a personal training session focused entirely on you.
            </p>
          </div>
          <ButtonLink href="/personal-training" variant="outline" className="mt-6 self-start">
            Personal training <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
        <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-6">
          <div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-sunken text-ink">
              <CalendarDays className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-display text-lg font-bold text-ink">Looking for a specific date?</h2>
            <p className="mt-1.5 text-[15px] text-muted">See every upcoming session across all workshops.</p>
          </div>
          <ButtonLink href="/schedule" variant="outline" className="mt-6 self-start">
            Full schedule <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}

function chipClass(active: boolean): string {
  return cn(
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
    active ? "border-deep bg-deep text-on-dark" : "border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink",
  );
}

function WorkshopGroup({
  title,
  description,
  workshops: list,
  nextByWorkshop,
  workshopPricePaise,
  emptyNote,
}: {
  title: string;
  description: string;
  workshops: Workshop[];
  nextByWorkshop: Record<string, string>;
  workshopPricePaise: number;
  emptyNote?: ReactNode;
}) {
  if (list.length === 0) return emptyNote ? <section>{emptyNote}</section> : null;
  return (
    <section>
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-ink">{title}</h2>
        <p className="mt-1 text-[15px] text-muted">{description}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {list.map((w) => (
          <WorkshopCard key={w.slug} workshop={w} workshopPricePaise={workshopPricePaise} nextSessionAt={nextSessionAt(nextByWorkshop, w.slug)} />
        ))}
      </div>
    </section>
  );
}
