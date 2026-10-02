import type { RouteObject } from "react-router-dom";

export const routes: RouteObject[] = [
  { path: "/monthly-pass", lazy: () => import("@/pages/pass/monthly-pass-page") },
  { path: "/monthly-pass/:code", lazy: () => import("@/pages/pass/pass-confirmation-page") },
];
