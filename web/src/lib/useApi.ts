import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

/*
 * Page data pattern (no caching library — each page fetches its own JSON):
 *
 *   const { data, error, loading, reload } = useApi<ThingPage>(`/api/pages/thing/${slug}`);
 *   usePageMeta({ title: data?.thing.title });
 *   if (error?.status === 404) return <NotFound />;
 *   if (error) return <ApiErrorNotice error={error} onRetry={reload} />;
 *   if (!data) return <PageSkeleton />;
 *   return <Thing data={data} />;
 *
 * Admin mutations: after `<ActionForm onDone={(r) => r.ok && reload()}>` succeeds,
 * call `reload()` — the previous `data` stays on screen while it refetches.
 */

export type UseApiResult<T> = {
  /** Latest successful response for the current `path`. Cleared when `path` changes, kept while `reload()` runs. */
  data: T | undefined;
  /** Set when the latest request failed; cleared while a new request is in flight. */
  error: ApiError | undefined;
  /** True from the first render with a new `path` (or a `reload()` call) until a response lands. */
  loading: boolean;
  /** Refetches the current `path`. */
  reload: () => void;
};

type Settled<T> = { path: string; tick: number; data?: T; error?: ApiError };

/** GETs `path` as JSON and refetches whenever it changes. Pass `null` to skip (e.g. while a route param is missing). Stale responses are ignored. */
export function useApi<T>(path: string | null): UseApiResult<T> {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (path === null) return;
    const ctrl = new AbortController();
    api.get<T>(path, { signal: ctrl.signal }).then(
      (data) => {
        if (!ctrl.signal.aborted) setSettled({ path, tick, data });
      },
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        setSettled({ path, tick, error: err instanceof ApiError ? err : new ApiError(0, "Something went wrong. Please try again.") });
      },
    );
    return () => ctrl.abort();
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const forThisPath = settled !== null && settled.path === path ? settled : null;
  const loading = path !== null && (forThisPath === null || forThisPath.tick !== tick);
  return {
    data: forThisPath?.data,
    error: loading ? undefined : forThisPath?.error,
    loading,
    reload,
  };
}
