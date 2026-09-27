import { execute, nowIso, queryOne } from "@/lib/db";
import { site } from "@/lib/site";

/**
 * Top-level pricing knobs, editable from /admin/pricing. A singleton row
 * (id = 'singleton'), seeded once from the defaults in src/lib/site.ts the
 * first time it's read.
 */

export type SiteSettings = {
  workshopPricePaise: number;
  returningDiscountPercent: number;
  monthlyPassPricePaise: number;
};

type Row = {
  workshop_price_paise: number;
  returning_discount_percent: number;
  monthly_pass_price_paise: number;
};

function mapRow(r: Row): SiteSettings {
  return {
    workshopPricePaise: Number(r.workshop_price_paise),
    returningDiscountPercent: Number(r.returning_discount_percent),
    monthlyPassPricePaise: Number(r.monthly_pass_price_paise),
  };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const row = await queryOne<Row>(`SELECT * FROM site_settings WHERE id = 'singleton'`);
  if (row) return mapRow(row);

  // First read ever — seed from the static defaults, then re-read so a
  // concurrent seed from another request loses the race gracefully.
  await execute(
    `INSERT OR IGNORE INTO site_settings (id, workshop_price_paise, returning_discount_percent, monthly_pass_price_paise, updated_at)
     VALUES ('singleton', ?, ?, ?, ?)`,
    [site.pricing.workshopPaise, site.pricing.returningDiscountPercent, site.pricing.monthlyPassPaise, nowIso()],
  );
  const seeded = await queryOne<Row>(`SELECT * FROM site_settings WHERE id = 'singleton'`);
  return seeded
    ? mapRow(seeded)
    : {
        workshopPricePaise: site.pricing.workshopPaise,
        returningDiscountPercent: site.pricing.returningDiscountPercent,
        monthlyPassPricePaise: site.pricing.monthlyPassPaise,
      };
}

export async function updateSiteSettings(input: SiteSettings): Promise<void> {
  await execute(
    `INSERT INTO site_settings (id, workshop_price_paise, returning_discount_percent, monthly_pass_price_paise, updated_at)
     VALUES ('singleton', ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       workshop_price_paise = excluded.workshop_price_paise,
       returning_discount_percent = excluded.returning_discount_percent,
       monthly_pass_price_paise = excluded.monthly_pass_price_paise,
       updated_at = excluded.updated_at`,
    [input.workshopPricePaise, input.returningDiscountPercent, input.monthlyPassPricePaise, nowIso()],
  );
}
