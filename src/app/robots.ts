import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/admin", "/api", "/book", "/booking", "/training", "/monthly-pass/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
