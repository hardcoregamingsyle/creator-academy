import type { Metadata } from "next";
import { getRegistrationByCode } from "@/lib/data/registrations";
import { formatDateLong } from "@/lib/format";
import { liveWorkshops } from "@/content/workshops";
import { site } from "@/lib/site";
import { Container, Eyebrow, Notice } from "@/components/ui";
import { FeedbackForm } from "./feedback-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Class feedback",
  description: `Tell ${site.name} what worked, what didn't, and what to teach next.`,
};

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code: codeParam } = await searchParams;
  const code = codeParam?.trim() || null;
  const registration = code ? await getRegistrationByCode(code) : null;
  const lockedWorkshop = registration?.workshop ? { slug: registration.workshopSlug, title: registration.workshop.title } : null;

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <Eyebrow>Feedback</Eyebrow>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">How was your class?</h1>
        <p className="mt-4 text-lg text-muted">
          Two minutes of your time directly decides what we schedule next — thank you.
        </p>

        {code && lockedWorkshop && registration && (
          <Notice tone="success" title={`Feedback for ${lockedWorkshop.title}`} className="mt-8">
            Class on {formatDateLong(registration.sessionStartsAt)}.
          </Notice>
        )}
        {code && !registration && (
          <Notice tone="warning" title="We couldn't find that registration ID" className="mt-8">
            Double-check the code below, or leave it blank and pick the workshop instead — your feedback still
            counts either way.
          </Notice>
        )}

        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <FeedbackForm
            initialCode={code ?? ""}
            lockedWorkshop={lockedWorkshop}
            liveWorkshops={liveWorkshops.map((w) => ({ slug: w.slug, title: w.title }))}
          />
        </div>
      </div>
    </Container>
  );
}
