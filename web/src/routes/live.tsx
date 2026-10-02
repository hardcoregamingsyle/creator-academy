import type { RouteObject } from "react-router-dom";

export const routes: RouteObject[] = [{ path: "/live/:code", lazy: () => import("@/pages/live/live-page") }];
