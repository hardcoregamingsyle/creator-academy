import type { RouteObject } from "react-router-dom";

export const routes: RouteObject[] = [
  { path: "/admin/sessions", lazy: () => import("@/pages/admin-ops/sessions-page") },
  { path: "/admin/sessions/:id", lazy: () => import("@/pages/admin-ops/session-detail-page") },
  { path: "/admin/bookings", lazy: () => import("@/pages/admin-ops/bookings-page") },
  { path: "/admin/passes", lazy: () => import("@/pages/admin-ops/passes-page") },
  { path: "/admin/training", lazy: () => import("@/pages/admin-ops/training-page") },
  { path: "/admin/feedback", lazy: () => import("@/pages/admin-ops/feedback-page") },
  { path: "/admin/demand", lazy: () => import("@/pages/admin-ops/demand-page") },
  { path: "/admin/messages", lazy: () => import("@/pages/admin-ops/messages-page") },
  { path: "/admin/emails", lazy: () => import("@/pages/admin-ops/emails-page") },
];
