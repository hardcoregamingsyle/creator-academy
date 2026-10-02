import type { ActionResult } from "@shared/api-types";
import type { AdminSocialsData } from "@shared/pages/admin-core";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin-ui";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, EmptyState, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";

const post = (path: string) => (formData: FormData) => api.postForm<ActionResult>(`/api/admin/socials${path}`, formData);

export function Component() {
  usePageMeta({ title: "Socials", noindex: true });
  const { data, error, reload } = useApi<AdminSocialsData>("/api/admin/socials");

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton bare />;

  const { socials } = data;
  const onDone = (r: ActionResult) => {
    if (r.ok) reload();
  };

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Socials</h1>
      <p className="mt-2 text-muted">
        Social links shown in the site footer. Leave the URL blank to show the platform as &ldquo;launching soon&rdquo;.
      </p>

      {/* ── add new ── */}
      <Card className="mt-6 p-5">
        <h2 className="font-display text-lg font-bold">Add a social</h2>
        <ActionForm action={post("")} onDone={onDone} resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-3 sm:items-end">
          <Field label="Platform" htmlFor="new-platform">
            <Input id="new-platform" name="platform" placeholder="Instagram" required />
          </Field>
          <Field label="Handle" htmlFor="new-handle" optional>
            <Input id="new-handle" name="handle" placeholder="@handle" />
          </Field>
          <Field label="URL" htmlFor="new-url" optional>
            <Input id="new-url" name="url" type="url" placeholder="https://…" />
          </Field>
          <div className="sm:col-span-3">
            <SubmitButton pendingLabel="Adding…">Add social</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {/* ── existing ── */}
      <div className="mt-8 space-y-4">
        {socials.map((s) => (
          <Card key={s.id} className="p-5">
            <ActionForm
              action={post(`/${encodeURIComponent(s.id)}/update`)}
              onDone={onDone}
              className="grid gap-4 sm:grid-cols-[2fr_2fr_3fr_1fr] sm:items-end"
            >
              <Field label="Platform" htmlFor={`platform-${s.id}`}>
                <Input id={`platform-${s.id}`} name="platform" defaultValue={s.platform} required />
              </Field>
              <Field label="Handle" htmlFor={`handle-${s.id}`} optional>
                <Input id={`handle-${s.id}`} name="handle" defaultValue={s.handle} />
              </Field>
              <Field label="URL" htmlFor={`url-${s.id}`} optional>
                <Input id={`url-${s.id}`} name="url" type="url" defaultValue={s.url} />
              </Field>
              <Field label="Sort order" htmlFor={`sortOrder-${s.id}`}>
                <Input id={`sortOrder-${s.id}`} name="sortOrder" type="number" step="10" defaultValue={s.sortOrder} />
              </Field>
              <div className="sm:col-span-4">
                <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
                  Save
                </SubmitButton>
              </div>
            </ActionForm>
            <ActionForm action={post(`/${encodeURIComponent(s.id)}/delete`)} onDone={onDone} quiet className="mt-3">
              <ConfirmButton message={`Delete the ${s.platform} link?`} size="sm">
                Delete
              </ConfirmButton>
            </ActionForm>
          </Card>
        ))}
        {socials.length === 0 && (
          <EmptyState title="No socials yet">Add one above — it will show up in the site footer.</EmptyState>
        )}
      </div>
    </div>
  );
}
