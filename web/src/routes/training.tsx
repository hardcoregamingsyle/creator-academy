import type { RouteObject } from "react-router-dom";

export const routes: RouteObject[] = [
  { path: "/personal-training", lazy: () => import("@/pages/training/personal-training-page") },
  { path: "/training/:code", lazy: () => import("@/pages/training/training-booking-page") },
];
