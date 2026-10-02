import { execute, newId, query, queryOne, seedOnce } from "../db";
import { site } from "../site";

/**
 * Social links, editable from /admin/socials. Seeded once from the static
 * defaults in functions/_lib/site.ts the first time the table is read — unlike
 * site.socials (a fixed 3-item Instagram/YouTube/Facebook array), any
 * number of platforms can be added here.
 */

export type Social = {
  id: string;
  platform: string;
  handle: string;
  url: string;
  sortOrder: number;
};

type Row = { id: string; platform: string; handle: string; url: string; sort_order: number };

function mapRow(r: Row): Social {
  return { id: r.id, platform: r.platform, handle: r.handle, url: r.url, sortOrder: Number(r.sort_order) };
}

function ensureSeeded(): Promise<void> {
  // INSERT OR IGNORE (keyed on the UNIQUE platform column) makes this safe if
  // two requests both see an empty table and race to seed it concurrently.
  // One atomic batch together with the seed marker (see seedOnce).
  return seedOnce("socials", "socials", () =>
    site.socials.map((s, i) => ({
      sql: `INSERT OR IGNORE INTO socials (id, platform, handle, url, sort_order) VALUES (?, ?, ?, ?, ?)`,
      args: [newId(), s.label, s.handle, s.url, i * 10],
    })),
  );
}

export async function listSocials(): Promise<Social[]> {
  await ensureSeeded();
  const rows = await query<Row>(`SELECT * FROM socials ORDER BY sort_order ASC`);
  return rows.map(mapRow);
}

/** Only socials with a URL set — what the public site should render. */
export async function activeSocials(): Promise<Social[]> {
  return (await listSocials()).filter((s) => s.url.trim().length > 0);
}

export async function createSocial(input: { platform: string; handle: string; url: string }): Promise<{ ok: boolean; error?: string }> {
  await ensureSeeded();
  const platform = input.platform.trim();
  const existing = await queryOne(`SELECT id FROM socials WHERE platform = ?`, [platform]);
  if (existing) return { ok: false, error: "A social link for this platform already exists — edit it instead." };
  const rows = await query<{ max_order: number | null }>(`SELECT MAX(sort_order) AS max_order FROM socials`);
  const nextOrder = (rows[0]?.max_order ?? -10) + 10;
  await execute(`INSERT INTO socials (id, platform, handle, url, sort_order) VALUES (?, ?, ?, ?, ?)`, [
    newId(),
    platform,
    input.handle.trim(),
    input.url.trim(),
    nextOrder,
  ]);
  return { ok: true };
}

export async function updateSocial(
  id: string,
  input: { platform: string; handle: string; url: string; sortOrder: number },
): Promise<{ ok: boolean; error?: string }> {
  const platform = input.platform.trim();
  const clash = await queryOne(`SELECT id FROM socials WHERE platform = ? AND id != ?`, [platform, id]);
  if (clash) return { ok: false, error: "A social link for this platform already exists." };
  await execute(`UPDATE socials SET platform = ?, handle = ?, url = ?, sort_order = ? WHERE id = ?`, [
    platform,
    input.handle.trim(),
    input.url.trim(),
    input.sortOrder,
    id,
  ]);
  return { ok: true };
}

export async function deleteSocial(id: string): Promise<void> {
  await execute(`DELETE FROM socials WHERE id = ?`, [id]);
}
