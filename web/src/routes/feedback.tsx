import type { RouteObject } from "react-router-dom";

export const routes: RouteObject[] = [{ path: "/feedback", lazy: () => import("@/pages/feedback/feedback-page") }];
