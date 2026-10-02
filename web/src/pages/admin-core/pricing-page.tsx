import { useState } from "react";
import type { ActionResult } from "@shared/api-types";
import { formatINR } from "@shared/format";
import type { AdminPricingData } from "@shared/pages/admin-core";
import { anchorPaise } from "@shared/pricing";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/admin-ui";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { usePageMeta } from "@/lib/usePageMeta";

const post = (path: string) => (formData: FormData) => api.postForm<ActionResult>(`/api/admin/pricing/${path}`, formData);

/** What the struck-through price will look like for the price + markup currently typed in the form. */
function AnchorPreview({ workshopPrice, markup }: { workshopPrice: string; markup: string }) {
  const rupees = workshopPrice.trim() === "" ? Number.NaN : Number(workshopPrice);
  const percent = markup.trim() === "" ? Number.NaN : Number(markup);

  if (!Number.isInteger(percent) || percent < 0 || percent > 500) {
    return <span className="text-sm text-muted">Enter a whole number from 0 to 500.</span>;
  }
  if (percent === 0) {
    return <span className="text-sm text-muted">Hidden — no struck-through price is shown.</span>;
  }
  if (!Number.isFinite(rupees) || rupees < 0) return null;

  const price = Math.round(rupees * 100);
  const anchor = anchorPaise(price, percent);
  if (anchor === null) return null;
  return (
    <span className="text-sm text-ink-soft">
      {formatINR(price)} shows with <s className="text-muted">{formatINR(anchor)}</s> struck through
    </span>
  );
}

function SiteWidePricesForm({ settings, onDone }: { settings: AdminPricingData["settings"]; onDone: (r: ActionResult) => void }) {
  // Tracked only to drive the live preview; the inputs stay uncontrolled like the rest of the page.
  const [workshopPrice, setWorkshopPrice] = useState(String(settings.workshopPricePaise / 100));
  const [markup, setMarkup] = useState(String(settings.anchorMarkupPercent));

  return (
    <ActionForm action={post("settings")} onDone={onDone} className="grid gap-5 sm:grid-cols-3">
      <Field label="Group workshop price (₹)" htmlFor="workshopPrice">
        <Input
          id="workshopPrice"
          name="workshopPrice"
          onChange={(e) => setWorkshopPrice(e.target.value)}
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
      <Field
        label="Struck-through price markup (%)"
        htmlFor="anchorMarkupPercent"
        hint="Shows a higher struck-through regular price next to every price — price + this %. Set 0 to hide it."
        className="sm:col-span-3"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Input
            id="anchorMarkupPercent"
            name="anchorMarkupPercent"
            type="number"
            min={0}
            max={500}
            step="1"
            defaultValue={settings.anchorMarkupPercent}
            onChange={(e) => setMarkup(e.target.value)}
            required
            className="w-32"
          />
          <AnchorPreview workshopPrice={workshopPrice} markup={markup} />
        </div>
      </Field>
      <div className="sm:col-span-3">
        <SubmitButton pendingLabel="Saving…">Save prices</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function Component() {
  usePageMeta({ title: "Pricing", noindex: true });
  const { data, error, reload } = useApi<AdminPricingData>("/api/admin/pricing");

  if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton bare />;

  const { settings, durations, topics } = data;
  const onDone = (r: ActionResult) => {
    if (r.ok) reload();
  };

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Pricing</h1>
      <p className="mt-2 text-muted">Every site-wide price, editable in one place — changes apply everywhere immediately.</p>

      {/* ── site-wide prices ── */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Site-wide prices</h2>
        <Card className="mt-4 p-5">
          <SiteWidePricesForm settings={settings} onDone={onDone} />
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
                action={post(`durations/${encodeURIComponent(d.id)}/update`)}
                onDone={onDone}
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
              <ActionForm action={post(`durations/${encodeURIComponent(d.id)}/delete`)} onDone={onDone} quiet className="mt-3">
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
            action={post("durations")}
            onDone={onDone}
            resetOnSuccess
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
                <ActionForm action={post(`topics/${encodeURIComponent(t.id)}/delete`)} onDone={onDone} quiet>
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
          <ActionForm action={post("topics")} onDone={onDone} resetOnSuccess className="flex flex-col gap-4 sm:flex-row sm:items-end">
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
