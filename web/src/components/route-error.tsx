import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { SiteShell } from "@/layouts/SiteLayout";
import { ApiErrorNotice } from "./api-error-notice";
import { NotFound } from "./not-found";

/** Router-level errorElement: a failed lazy route chunk (usually a stale tab after a deploy) or an uncaught render error. */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <SiteShell>
        <NotFound />
      </SiteShell>
    );
  }
  return (
    <SiteShell>
      <ApiErrorNotice
        error={new Error("Something unexpected happened while loading this page. Reloading usually fixes it.")}
        title="Something went wrong"
        onRetry={() => window.location.reload()}
      />
    </SiteShell>
  );
}
