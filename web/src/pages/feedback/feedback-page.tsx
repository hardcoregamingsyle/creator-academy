import { useSearchParams } from "react-router-dom";
import { brand } from "@shared/brand";
import { formatDateLong } from "@shared/format";
import type { FeedbackPageData } from "@shared/pages/feedback";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { PageSkeleton } from "@/components/page-skeleton";
import { Container, Eyebrow, Notice } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";
import { FeedbackForm } from "./feedback-form";

export function Component() {
  usePageMeta({
    title: "Class feedback",
    description: `Tell ${brand.name} what worked, what didn't, and what to teach next.`,
  });

  const [searchParams] = useSearchParams();
  const code = searchParams.get("code")?.trim() || null;
  const { data, error, reload } = useApi<FeedbackPageData>(`/api/pages/feedback${code ? `?code=${encodeURIComponent(code)}` : ""}`);

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;

  const { lockedWorkshop, registrationFound, sessionStartsAt } = data;

  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <Eyebrow>Feedback</Eyebrow>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">How was your class?</h1>
        <p className="mt-4 text-lg text-muted">
          Two minutes of your time directly decides what we schedule next — thank you.
        </p>

        {code && lockedWorkshop && registrationFound && sessionStartsAt && (
          <Notice tone="success" title={`Feedback for ${lockedWorkshop.title}`} className="mt-8">
            Class on {formatDateLong(sessionStartsAt)}.
          </Notice>
        )}
        {code && !registrationFound && (
          <Notice tone="warning" title="We couldn't find that registration ID" className="mt-8">
            Double-check the code below, or leave it blank and pick the workshop instead — your feedback still
            counts either way.
          </Notice>
        )}

        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <FeedbackForm
            initialCode={code ?? ""}
            lockedWorkshop={lockedWorkshop}
            liveWorkshops={data.liveWorkshops}
            returningDiscountPercent={data.returningDiscountPercent}
          />
        </div>
      </div>
    </Container>
  );
}
