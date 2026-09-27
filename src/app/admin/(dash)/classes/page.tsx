import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getWorkshop, listWorkshops } from "@/lib/data/workshops";
import { categories, getCategory, type Workshop, type WorkshopStatus } from "@/content/workshops";
import { Badge, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, ConfirmButton, SubmitButton } from "../admin-ui";
import { createWorkshopAction, deleteWorkshopAction, updateWorkshopAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Classes", robots: { index: false, follow: false } };

const STATUS_SECTIONS: { status: WorkshopStatus; label: string }[] = [
  { status: "live", label: "Live" },
  { status: "planned", label: "Planned" },
  { status: "future", label: "Future" },
];

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

export default async function AdminClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireAdmin();
  const { edit } = await searchParams;

  const [workshops, editing] = await Promise.all([listWorkshops(), edit ? getWorkshop(edit) : Promise.resolve(null)]);

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
            <Link href="/admin/classes" className="text-sm font-medium text-accent-strong">
              Cancel
            </Link>
          </div>
          <ActionForm action={updateWorkshopAction.bind(null, editing.slug)} className="mt-4">
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
          <ActionForm action={createWorkshopAction} className="mt-4">
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
                            href={`/admin/classes?edit=${w.slug}`}
                            className="inline-flex items-center rounded-full border border-line-strong px-3 py-1.5 text-sm font-medium text-ink hover:border-ink"
                          >
                            Edit
                          </Link>
                          <ActionForm action={deleteWorkshopAction.bind(null, w.slug)} quiet>
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
