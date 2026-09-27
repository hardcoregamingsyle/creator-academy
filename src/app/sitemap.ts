import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { listWorkshops } from "@/lib/data/workshops";

const POLICY_SLUGS = ["terms", "privacy", "refunds", "delivery"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const staticPaths = ["", "/classes", "/monthly-pass", "/schedule", "/personal-training", "/faq", "/about", "/contact"];
  const workshops = await listWorkshops();

  return [
    ...staticPaths.map((path) => ({ url: `${siteUrl}${path}`, lastModified })),
    ...workshops.map((w) => ({ url: `${siteUrl}/classes/${w.slug}`, lastModified })),
    ...POLICY_SLUGS.map((slug) => ({ url: `${siteUrl}/policies/${slug}`, lastModified })),
  ];
}
