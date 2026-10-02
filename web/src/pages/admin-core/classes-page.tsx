import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ActionResult } from "@shared/api-types";
import { categories, getCategory, type Workshop, type WorkshopStatus } from "@shared/content";
import type { AdminClassesData } from "@shared/pages/admin-core";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin-ui";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";

const STATUS_SECTIONS: { status: WorkshopStatus; label: string }[] = [
  { status: "live", label: "Live" },
  { status: "planned", label: "Planned" },
  { status: "future", label: "Future" },
];

const post = (path: string) => (formData: FormData) => api.postForm<ActionResult>(`/api/admin/classes${path}`, formData);

/** Shared fields between the create and edit forms (everything except `slug`, which is immutable). */
function WorkshopFields({ workshop }: { workshop?: Workshop }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={workshop?.title} required />
        </Field>
        <Field label="Category" htmlFor="category">
          <Select id="category" name="category" defaultValue={workshop?.category ?? categories[0]?.slug} required>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={workshop?.status ?? "planned"} required>
            <option value="live">Live</option>
            <option value="planned">Planned</option>
            <option value="future">Future</option>
          </Select>
        </Field>
        <Field label="Level" htmlFor="level">
          <Select id="level" name="level" defaultValue={workshop?.level ?? "Beginner"} required>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </Select>
        </Field>
        <Field label="Duration (minutes)" htmlFor="durationMin">
          <Input id="durationMin" name="durationMin" type="number" min={1} defaultValue={workshop?.durationMin ?? 90} required />
        </Field>
      </div>

      <Field label="Promise" htmlFor="promise" hint="The transformation, in one sentence — the headline." className="mt-4">
        <Input id="promise" name="promise" defaultValue={workshop?.promise} />
      </Field>

      <Field label="Summary" htmlFor="summary" hint="Two–three sentence description." className="mt-4">
        <Textarea id="summary" name="summary" defaultValue={workshop?.summary} />
      </Field>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Outcome" htmlFor="outcome" hint="The finished thing students leave with — short.">
          <Input id="outcome" name="outcome" defaultValue={workshop?.outcome} />
        </Field>
        <Field label="Outcome detail" htmlFor="outcomeDetail" hint="A sentence expanding on the outcome.">
          <Input id="outcomeDetail" name="outcomeDetail" defaultValue={workshop?.outcomeDetail} />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="What you'll learn" htmlFor="learn" hint="One topic per line.">
          <Textarea id="learn" name="learn" defaultValue={workshop?.learn.join("\n")} />
        </Field>
        <Field label="Who it's for" htmlFor="forWho" hint="One line per audience.">
          <Textarea id="forWho" name="forWho" defaultValue={workshop?.forWho.join("\n")} />
        </Field>
        <Field label="What to bring" htmlFor="bring" hint="One item per line.">
          <Textarea id="bring" name="bring" defaultValue={workshop?.bring.join("\n")} />
        </Field>
      </div>
    </>
  );
}

export function Component() {
  usePageMeta({ title: "Classes", noindex: true });
  const [searchParams] = useSearchParams();
  const editSlug = searchParams.get("edit");
  const { data, error, reload } = useApi<AdminClassesData>("/api/admin/classes");

  // The edit form sits at the top of the page but its "Edit" links are far down the table.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [editSlug]);

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton bare />;

  const { workshops } = data;
  const editing = editSlug ? (workshops.find((w) => w.slug === editSlug) ?? null) : null;
  const onDone = (r: ActionResult) => {
    if (r.ok) reload();
  };

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Classes</h1>
      <p className="mt-2 text-muted">
        The workshop catalogue — feeds <code className="font-mono text-xs">/classes</code>, the homepage and the session
        scheduler.
      </p>

      {editing ? (
        <Card className="mt-8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-xl font-bold">Edit workshop</h2>
            <Link to="/admin/classes" className="text-sm font-medium text-accent-strong">
              Cancel
            </Link>
          </div>
          <ActionForm key={editing.slug} action={post(`/${encodeURIComponent(editing.slug)}/update`)} onDone={onDone} className="mt-4">
            <Field label="Slug" hint="Immutable once created.">
              <p className="rounded-xl border border-line bg-sunken px-3.5 py-2.5 font-mono text-sm text-ink-soft">
                {editing.slug}
              </p>
            </Field>
            <div className="mt-4">
              <WorkshopFields workshop={editing} />
            </div>
            <SubmitButton className="mt-5" pendingLabel="Saving…">
              Save changes
            </SubmitButton>
          </ActionForm>
        </Card>
      ) : (
        <Card className="mt-8 p-5">
          <h2 className="font-display text-xl font-bold">Add a new workshop</h2>
          <ActionForm action={post("")} onDone={onDone} resetOnSuccess className="mt-4">
            <Field label="Slug" htmlFor="slug" hint="Lowercase letters, numbers and hyphens only, e.g. my-new-workshop.">
              <Input id="slug" name="slug" placeholder="my-new-workshop" required />
            </Field>
            <div className="mt-4">
              <WorkshopFields />
            </div>
            <SubmitButton className="mt-5" pendingLabel="Creating…">
              Create workshop
            </SubmitButton>
          </ActionForm>
        </Card>
      )}

      {STATUS_SECTIONS.map(({ status, label }) => {
        const rows = workshops.filter((w) => w.status === status);
        return (
          <section key={status} className="mt-10">
            <h2 className="font-display text-xl font-bold">{label}</h2>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-line bg-sunken/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Workshop</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Level</th>
                    <th className="px-4 py-3 font-semibold">Duration</th>
                    <th className="px-4 py-3 font-semibold">Summary</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((w) => (
                    <tr key={w.slug} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{w.title}</p>
                        <code className="text-xs text-muted">{w.slug}</code>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{getCategory(w.category)?.name ?? w.category}</td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">{w.level}</Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{w.durationMin} min</td>
                      <td className="px-4 py-3 max-w-[320px]">
                        <p className="line-clamp-2 text-ink-soft">{w.summary}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Link
                            to={`/admin/classes?edit=${encodeURIComponent(w.slug)}`}
                            className="inline-flex items-center rounded-full border border-line-strong px-3 py-1.5 text-sm font-medium text-ink hover:border-ink"
                          >
                            Edit
                          </Link>
                          <ActionForm action={post(`/${encodeURIComponent(w.slug)}/delete`)} onDone={onDone} quiet>
                            <ConfirmButton message={`Delete "${w.title}"? This can't be undone.`} size="sm">
                              Delete
                            </ConfirmButton>
                          </ActionForm>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <p className="px-4 py-10 text-center text-muted">No {label.toLowerCase()} workshops.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
