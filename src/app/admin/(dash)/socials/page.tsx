import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { listSocials } from "@/lib/data/socials";
import { Card, EmptyState, Field, Input } from "@/components/ui";
import { ActionForm, ConfirmButton, SubmitButton } from "../admin-ui";
import { createSocialAction, deleteSocialAction, updateSocialAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Socials", robots: { index: false, follow: false } };

export default async function AdminSocialsPage() {
  await requireAdmin();
  const socials = await listSocials();

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Socials</h1>
      <p className="mt-2 text-muted">
        Social links shown in the site footer. Leave the URL blank to show the platform as &ldquo;launching soon&rdquo;.
      </p>

      {/* ── add new ── */}
      <Card className="mt-6 p-5">
        <h2 className="font-display text-lg font-bold">Add a social</h2>
        <ActionForm action={createSocialAction} className="mt-4 grid gap-4 sm:grid-cols-3 sm:items-end">
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
            <ActionForm action={updateSocialAction.bind(null, s.id)} className="grid gap-4 sm:grid-cols-[2fr_2fr_3fr_1fr] sm:items-end">
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
            <ActionForm action={deleteSocialAction.bind(null, s.id)} quiet className="mt-3">
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
