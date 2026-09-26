import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { workshops } from "@/content/workshops";

const POLICY_SLUGS = ["terms", "privacy", "refunds", "delivery"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const staticPaths = ["", "/classes", "/schedule", "/personal-training", "/faq", "/about", "/contact"];

  return [
    ...staticPaths.map((path) => ({ url: `${siteUrl}${path}`, lastModified })),
    ...workshops.map((w) => ({ url: `${siteUrl}/classes/${w.slug}`, lastModified })),
    ...POLICY_SLUGS.map((slug) => ({ url: `${siteUrl}/policies/${slug}`, lastModified })),
  ];
}
