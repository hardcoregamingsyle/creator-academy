import type { RouteObject } from "react-router-dom";

export const routes: RouteObject[] = [
  { path: "/admin", lazy: () => import("@/pages/admin-core/overview-page") },
  { path: "/admin/pricing", lazy: () => import("@/pages/admin-core/pricing-page") },
  { path: "/admin/classes", lazy: () => import("@/pages/admin-core/classes-page") },
  { path: "/admin/socials", lazy: () => import("@/pages/admin-core/socials-page") },
];

/** Rendered outside AdminLayout (e.g. /admin/login). */
export const loginRoutes: RouteObject[] = [{ path: "/admin/login", lazy: () => import("@/pages/admin-core/login-page") }];
