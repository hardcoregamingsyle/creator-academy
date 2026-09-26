import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { feedbackStats, listFeedback } from "@/lib/data/feedback";
import { formatDateShort } from "@/lib/format";
import { Badge, Card, EmptyState, Notice, Stars } from "@/components/ui";
import { ActionForm, ConfirmButton, SubmitButton } from "../admin-ui";
import { deleteFeedbackAction, setFeedbackApprovedAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Feedback", robots: { index: false, follow: false } };

const ANSWER_FIELDS = [
  { key: "learned", label: "What they learned" },
  { key: "unclear", label: "What was unclear" },
  { key: "improve", label: "What we could improve" },
  { key: "teachNext", label: "What to teach next" },
] as const;

const attendAgainTone = { yes: "success", maybe: "warning", no: "danger" } as const;

export default async function FeedbackPage() {
  await requireAdmin();
  const [stats, feedback] = await Promise.all([feedbackStats(), listFeedback()]);

  const attendTotal = stats.wouldAttendAgain.yes + stats.wouldAttendAgain.maybe + stats.wouldAttendAgain.no;

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Feedback</h1>
      <p className="mt-2 text-muted">What students actually said after class — real answers only.</p>

      <Notice tone="info" className="mt-6">
        Only real, consented feedback is ever shown on the public site. Never edit a student&apos;s words.
      </Notice>

      {/* ── stats ── */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Average rating</p>
          {stats.averageRating !== null ? (
            <div className="mt-2 flex items-center gap-2">
              <Stars rating={stats.averageRating} size="size-5" />
              <span className="font-display text-2xl font-bold">{stats.averageRating.toFixed(1)}</span>
            </div>
          ) : (
            <p className="mt-2 text-muted">No ratings yet.</p>
          )}
          <p className="mt-1 text-sm text-muted">from {stats.count} {stats.count === 1 ? "response" : "responses"}</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Would attend again</p>
          {attendTotal === 0 ? (
            <p className="mt-2 text-muted">No answers yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {(["yes", "maybe", "no"] as const).map((k) => {
                const n = stats.wouldAttendAgain[k];
                const pct = Math.round((n / attendTotal) * 100);
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize text-ink-soft">{k}</span>
                      <span className="text-muted">
                        {n} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken">
                      <div
                        className={
                          k === "yes" ? "h-full bg-success" : k === "maybe" ? "h-full bg-warning" : "h-full bg-danger"
                        }
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Per-workshop average</p>
          {stats.byWorkshop.length === 0 ? (
            <p className="mt-2 text-muted">No workshop-linked feedback yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {stats.byWorkshop
                .slice()
                .sort((a, b) => b.averageRating - a.averageRating)
                .map((w) => (
                  <li key={w.workshopSlug} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-ink-soft">{w.workshopTitle}</span>
                    <span className="shrink-0 font-semibold text-ink">
                      {w.averageRating.toFixed(1)} <span className="font-normal text-muted">({w.count})</span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── all feedback ── */}
      <h2 className="mt-10 font-display text-xl font-bold">All feedback</h2>

      {feedback.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No feedback yet">Feedback submitted after classes will show up here.</EmptyState>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {feedback.map((f) => {
            const live = f.consentPublic && f.approved;
            return (
              <Card key={f.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Stars rating={f.rating} />
                      {f.workshopTitle && <Badge tone="neutral">{f.workshopTitle}</Badge>}
                      {f.attendAgain && <Badge tone={attendAgainTone[f.attendAgain]}>would attend again: {f.attendAgain}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted">{formatDateShort(f.createdAt)}</p>
                  </div>
                  {live && <Badge tone="accent">Live on site</Badge>}
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {ANSWER_FIELDS.map(({ key, label }) => {
                    const value = f[key];
                    if (!value) return null;
                    return (
                      <div key={key}>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-sm text-ink-soft">{value}</dd>
                      </div>
                    );
                  })}
                </dl>

                {f.publicComment && (
                  <div className="mt-4 rounded-xl border border-line bg-sunken/50 p-3.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Public comment</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">&ldquo;{f.publicComment}&rdquo;</p>
                    <p className="mt-1 text-xs text-muted">— {f.displayName || "Anonymous"}</p>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  {f.consentPublic ? (
                    <ActionForm action={setFeedbackApprovedAction.bind(null, f.id, !f.approved)} quiet>
                      <SubmitButton variant={f.approved ? "outline" : "primary"} size="sm" pendingLabel="Saving…">
                        {f.approved ? "Unapprove" : "Approve for site"}
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    <span className="text-xs text-muted">No consent — private</span>
                  )}
                  <ActionForm action={deleteFeedbackAction.bind(null, f.id)}>
                    <ConfirmButton message="Delete this feedback? This can't be undone." size="sm">
                      Delete
                    </ConfirmButton>
                  </ActionForm>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
