import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/data/site-settings";
import { listTrainingDurations, listTrainingTopics } from "@/lib/data/training";
import { Card, Field, Input } from "@/components/ui";
import { ActionForm, ConfirmButton, SubmitButton } from "../admin-ui";
import {
  createTrainingDurationAction,
  createTrainingTopicAction,
  deleteTrainingDurationAction,
  deleteTrainingTopicAction,
  updateSiteSettingsAction,
  updateTrainingDurationAction,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pricing", robots: { index: false, follow: false } };

export default async function AdminPricingPage() {
  await requireAdmin();
  const [settings, durations, topics] = await Promise.all([
    getSiteSettings(),
    listTrainingDurations(),
    listTrainingTopics(),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Pricing</h1>
      <p className="mt-2 text-muted">Every site-wide price, editable in one place — changes apply everywhere immediately.</p>

      {/* ── site-wide prices ── */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Site-wide prices</h2>
        <Card className="mt-4 p-5">
          <ActionForm action={updateSiteSettingsAction} className="grid gap-5 sm:grid-cols-3">
            <Field label="Group workshop price (₹)" htmlFor="workshopPrice">
              <Input
                id="workshopPrice"
                name="workshopPrice"
                type="number"
                min={0}
                step="1"
                defaultValue={settings.workshopPricePaise / 100}
                required
              />
            </Field>
            <Field label="Returning-student discount (%)" htmlFor="returningDiscountPercent" hint="Whole number, 0–100">
              <Input
                id="returningDiscountPercent"
                name="returningDiscountPercent"
                type="number"
                min={0}
                max={100}
                step="1"
                defaultValue={settings.returningDiscountPercent}
                required
              />
            </Field>
            <Field label="Monthly pass price (₹)" htmlFor="monthlyPassPrice">
              <Input
                id="monthlyPassPrice"
                name="monthlyPassPrice"
                type="number"
                min={0}
                step="1"
                defaultValue={settings.monthlyPassPricePaise / 100}
                required
              />
            </Field>
            <div className="sm:col-span-3">
              <SubmitButton pendingLabel="Saving…">Save prices</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </section>

      {/* ── personal training durations ── */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-bold">Personal training durations</h2>
        <p className="mt-1 text-sm text-muted">Session lengths students can book, with their label, blurb and price.</p>

        <div className="mt-4 space-y-4">
          {durations.map((d) => (
            <Card key={d.id} className="p-5">
              <ActionForm
                action={updateTrainingDurationAction.bind(null, d.id)}
                className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
              >
                <Field label="Minutes" htmlFor={`minutes-${d.id}`} className="w-full sm:w-28">
                  <Input id={`minutes-${d.id}`} name="minutes" type="number" min={1} step="1" defaultValue={d.minutes} required />
                </Field>
                <Field label="Label" htmlFor={`label-${d.id}`} className="w-full sm:w-48">
                  <Input id={`label-${d.id}`} name="label" defaultValue={d.label} required />
                </Field>
                <Field label="Blurb" htmlFor={`blurb-${d.id}`} className="w-full sm:flex-1">
                  <Input id={`blurb-${d.id}`} name="blurb" defaultValue={d.blurb} required />
                </Field>
                <Field label="Price (₹)" htmlFor={`price-${d.id}`} className="w-full sm:w-32">
                  <Input id={`price-${d.id}`} name="price" type="number" min={0} step="1" defaultValue={d.paise / 100} required />
                </Field>
                <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">
                  Save
                </SubmitButton>
              </ActionForm>
              <ActionForm action={deleteTrainingDurationAction.bind(null, d.id)} quiet className="mt-3">
                <ConfirmButton message={`Delete the "${d.label}" (${d.minutes} min) duration?`} size="sm">
                  Delete duration
                </ConfirmButton>
              </ActionForm>
            </Card>
          ))}
          {durations.length === 0 && <p className="text-muted">No durations yet — add one below.</p>}
        </div>

        <Card className="mt-4 p-5">
          <h3 className="font-display text-lg font-bold text-ink">Add a new duration</h3>
          <ActionForm
            action={createTrainingDurationAction}
            className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
          >
            <Field label="Minutes" htmlFor="new-duration-minutes" className="w-full sm:w-28">
              <Input id="new-duration-minutes" name="minutes" type="number" min={1} step="1" required />
            </Field>
            <Field label="Label" htmlFor="new-duration-label" className="w-full sm:w-48">
              <Input id="new-duration-label" name="label" required />
            </Field>
            <Field label="Blurb" htmlFor="new-duration-blurb" className="w-full sm:flex-1">
              <Input id="new-duration-blurb" name="blurb" required />
            </Field>
            <Field label="Price (₹)" htmlFor="new-duration-price" className="w-full sm:w-32">
              <Input id="new-duration-price" name="price" type="number" min={0} step="1" required />
            </Field>
            <SubmitButton pendingLabel="Adding…">Add duration</SubmitButton>
          </ActionForm>
        </Card>
      </section>

      {/* ── personal training topics ── */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-bold">Personal training topics</h2>
        <p className="mt-1 text-sm text-muted">Topics a student can pick when booking a 1:1 session.</p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="divide-y divide-line">
            {topics.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-ink-soft">{t.label}</span>
                <ActionForm action={deleteTrainingTopicAction.bind(null, t.id)} quiet>
                  <ConfirmButton message={`Delete the "${t.label}" topic?`} size="sm">
                    Delete
                  </ConfirmButton>
                </ActionForm>
              </div>
            ))}
          </div>
          {topics.length === 0 && <p className="px-4 py-10 text-center text-muted">No topics yet — add one below.</p>}
        </div>

        <Card className="mt-4 p-5">
          <ActionForm action={createTrainingTopicAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Field label="New topic" htmlFor="new-topic" className="w-full sm:flex-1">
              <Input id="new-topic" name="label" required />
            </Field>
            <SubmitButton pendingLabel="Adding…">Add topic</SubmitButton>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
