import type { RouteObject } from "react-router-dom";

export const routes: RouteObject[] = [
  { path: "/", lazy: () => import("@/pages/public-core/home-page") },
  { path: "/about", lazy: () => import("@/pages/public-core/about-page") },
  { path: "/faq", lazy: () => import("@/pages/public-core/faq-page") },
  { path: "/policies/:slug", lazy: () => import("@/pages/public-core/policy-page") },
  { path: "/contact", lazy: () => import("@/pages/public-core/contact-page") },
];
