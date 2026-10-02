import { createBrowserRouter, Outlet, RouterProvider, type RouteObject } from "react-router-dom";
import { NotFound } from "@/components/not-found";
import { PageSkeleton } from "@/components/page-skeleton";
import { RouteAnnouncer } from "@/components/route-announcer";
import { RouteError } from "@/components/route-error";
import { ScrollManager } from "@/components/scroll-manager";
import { AdminLayout } from "@/layouts/AdminLayout";
import { LiveLayout } from "@/layouts/LiveLayout";
import { SiteLayout } from "@/layouts/SiteLayout";
import { SiteProvider } from "@/lib/site-context";
import { routes as adminCore, loginRoutes as adminLogin } from "@/routes/admin-core";
import { routes as adminOps } from "@/routes/admin-ops";
import { routes as booking } from "@/routes/booking";
import { routes as catalogue } from "@/routes/catalogue";
import { routes as feedback } from "@/routes/feedback";
import { routes as live } from "@/routes/live";
import { routes as pass } from "@/routes/pass";
import { routes as publicCore } from "@/routes/public-core";
import { routes as training } from "@/routes/training";

function Root() {
  return (
    <>
      <ScrollManager />
      <RouteAnnouncer />
      <Outlet />
    </>
  );
}

const siteChildren: RouteObject[] = [
  ...publicCore,
  ...catalogue,
  ...booking,
  ...training,
  ...pass,
  ...feedback,
  { path: "*", element: <NotFound /> },
];

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <PageSkeleton />,
    children: [
      { element: <LiveLayout />, children: live },
      { element: <SiteLayout />, children: siteChildren },
      { element: <AdminLayout />, children: [...adminCore, ...adminOps] },
      ...adminLogin,
    ],
  },
]);

export default function App() {
  return (
    <SiteProvider>
      <RouterProvider router={router} />
    </SiteProvider>
  );
}
