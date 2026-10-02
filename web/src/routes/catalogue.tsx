import type { RouteObject } from "react-router-dom";

export const routes: RouteObject[] = [
  { path: "/classes", lazy: () => import("@/pages/catalogue/classes-page") },
  { path: "/classes/:slug", lazy: () => import("@/pages/catalogue/class-detail-page") },
  { path: "/schedule", lazy: () => import("@/pages/catalogue/schedule-page") },
];
