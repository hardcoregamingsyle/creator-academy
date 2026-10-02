import type { ActionResult } from "@shared/api-types";

export type { ActionResult };

/** Thrown for any non-2xx response, a network failure (status 0) or an unreadable body. `message` is safe to show to people. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Fired on `window` when an /api/admin/** call (other than login/session) returns 401, so AdminLayout can send the user to the sign-in page. */
export const ADMIN_UNAUTHORIZED_EVENT = "createva:admin-unauthorized";

const NETWORK_MESSAGE = "Network error — please try again.";
const UNEXPECTED_MESSAGE = "Unexpected server response.";

function messageFrom(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as { message?: unknown; error?: unknown };
    if (typeof d.message === "string" && d.message) return d.message;
    if (typeof d.error === "string" && d.error) return d.error;
  }
  return fallback;
}

async function request<T>(method: "GET" | "POST", path: string, body?: BodyInit, headers?: HeadersInit, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, credentials: "same-origin", headers, body, signal });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }

  const text = await res.text().catch(() => "");
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && path.startsWith("/api/admin/") && path !== "/api/admin/session" && path !== "/api/admin/login") {
      window.dispatchEvent(new Event(ADMIN_UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, messageFrom(data, `Request failed (${res.status}). Please try again.`), data);
  }
  if (text && data === null) throw new ApiError(res.status, UNEXPECTED_MESSAGE);
  return data as T;
}

/**
 * Same-origin JSON client for the Pages Functions API. Every method throws
 * `ApiError` for non-2xx responses (using the `{ ok: false, message }` body when
 * present). Admin mutations return `ActionResult` with HTTP 200 even for
 * business-rule failures, so check `result.ok` on those instead of catching.
 */
export const api = {
  get<T>(path: string, options?: { signal?: AbortSignal }): Promise<T> {
    return request<T>("GET", path, undefined, undefined, options?.signal);
  },
  /** POSTs `body` as JSON (or sends no body when omitted). */
  post<T>(path: string, body?: unknown): Promise<T> {
    if (body === undefined) return request<T>("POST", path);
    return request<T>("POST", path, JSON.stringify(body), { "Content-Type": "application/json" });
  },
  /** POSTs multipart form data; the browser sets the Content-Type boundary. */
  postForm<T>(path: string, formData: FormData): Promise<T> {
    return request<T>("POST", path, formData);
  },
};

/** Best-effort message for anything caught from an api call. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
