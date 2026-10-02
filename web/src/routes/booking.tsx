import type { RouteObject } from "react-router-dom";

export const routes: RouteObject[] = [
  { path: "/book/:sessionId", lazy: () => import("@/pages/booking/book-page") },
  { path: "/booking", lazy: () => import("@/pages/booking/find-booking-page") },
  { path: "/booking/:code", lazy: () => import("@/pages/booking/booking-page") },
];
