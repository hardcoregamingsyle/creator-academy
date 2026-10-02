import { listWorkshops } from "./_lib/data/workshops";
import { siteUrl } from "./_lib/site";

const POLICY_SLUGS = ["terms", "privacy", "refunds", "delivery"] as const;
const STATIC_PATHS = ["", "/classes", "/monthly-pass", "/schedule", "/personal-training", "/faq", "/about", "/contact"];

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export const onRequestGet: PagesFunction = async () => {
  let workshops: Awaited<ReturnType<typeof listWorkshops>>;
  try {
    workshops = await listWorkshops();
  } catch (err) {
    console.error("[sitemap] failed to list workshops:", err);
    return new Response("Sitemap temporarily unavailable.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const lastModified = new Date().toISOString();
  const urls = [
    ...STATIC_PATHS.map((path) => `${siteUrl}${path}`),
    ...workshops.map((w) => `${siteUrl}/classes/${w.slug}`),
    ...POLICY_SLUGS.map((slug) => `${siteUrl}/policies/${slug}`),
  ];

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((url) => `<url><loc>${escapeXml(url)}</loc><lastmod>${lastModified}</lastmod></url>\n`).join("") +
    "</urlset>\n";

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
