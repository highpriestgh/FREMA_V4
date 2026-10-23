/**
 * The single place the SPA talks to the server.
 *
 * There are no tokens here, and there is nothing to store. The session is an HttpOnly cookie
 * the browser attaches automatically, so this file never sees a credential. What it must do
 * is send the antiforgery header on every call, because a cross-site form post cannot set a
 * custom header and that is what makes the cookie safe to rely on.
 */

import { beginRequest, endRequest } from "./loading";

/** Matches AntiforgeryHeader.HeaderName / HeaderValue on the server. */
const ANTIFORGERY_HEADER = "X-CSRF";
const ANTIFORGERY_VALUE = "1";

/** Thrown for any non-2xx response, carrying the server's ProblemDetails when present. */
export class ApiError extends Error {
  // Assigned explicitly rather than as constructor parameter properties: the build runs
  // with `erasableSyntaxOnly`, which allows only TypeScript that erases to nothing.
  readonly status: number;
  readonly title: string;
  readonly traceId?: string;

  constructor(status: number, title: string, detail: string, traceId?: string) {
    super(detail || title);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.traceId = traceId;
  }

  /** The caller is signed out, or the session expired. */
  get isUnauthenticated() {
    return this.status === 401;
  }

  /** Signed in, but not allowed to do this. */
  get isForbidden() {
    return this.status === 403;
  }
}

interface ProblemDetails {
  title?: string;
  detail?: string;
  status?: number;
  traceId?: string;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function toQueryString(query?: Query): string {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function toError(response: Response): Promise<ApiError> {
  let problem: ProblemDetails = {};

  try {
    // The server emits RFC 9457 ProblemDetails for every handled failure, so the message
    // shown to the user is the one the domain actually wrote.
    if (response.headers.get("content-type")?.includes("json")) {
      problem = (await response.json()) as ProblemDetails;
    }
  } catch {
    // A body that is absent or unparseable is not itself worth reporting; fall through to
    // the status text below.
  }

  return new ApiError(
    response.status,
    problem.title ?? response.statusText ?? "Request failed",
    problem.detail ?? "",
    problem.traceId,
  );
}

interface RequestOptions {
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Left out of the loading bar. */
  background?: boolean;
  /** A 401 is an expected answer here, not a session that ran out. */
  quiet?: boolean;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  // Background polling is left out of the loading bar, or it would flicker every minute.
  if (!options.background) beginRequest();
  try {
    return await send<T>(method, path, options);
  } finally {
    if (!options.background) endRequest();
  }
}

/** Raised when the session has ended mid-use; the auth layer offers to sign in again. */
export const SESSION_EXPIRED_EVENT = "frema:session-expired";

async function send<T>(method: string, path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    [ANTIFORGERY_HEADER]: ANTIFORGERY_VALUE,
  };

  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
    // Deliberately no Content-Type: the browser must set it, because only it knows the
    // multipart boundary.
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${path}${toQueryString(options.query)}`, {
    method,
    headers,
    body,
    // Same-origin in both development (through the Vite proxy) and production, so the
    // session cookie travels without any CORS involvement.
    credentials: "same-origin",
    signal: options.signal,
  });

  if (!response.ok) {
    // A 401 from the application API means the session ran out while the page was open —
    // unless the caller asked, as the first session check does, where it just means "not yet".
    if (response.status === 401 && path.startsWith("/api/") && !options.quiet) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw await toError(response);
  }

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(
    path: string,
    query?: Query,
    signal?: AbortSignal,
    options?: { background?: boolean; quiet?: boolean },
  ) => request<T>("GET", path, { query, signal, ...options }),

  post: <T>(path: string, body?: unknown, query?: Query) =>
    request<T>("POST", path, { body, query }),

  put: <T>(path: string, body?: unknown, query?: Query) =>
    request<T>("PUT", path, { body, query }),

  delete: <T>(path: string, query?: Query) => request<T>("DELETE", path, { query }),

  /** Uploads a file as multipart — never base64, which is how the legacy API moved documents. */
  upload: <T>(path: string, file: File, field = "file") => {
    const form = new FormData();
    form.append(field, file);
    return request<T>("PUT", path, { body: form });
  },
};

/** Sends the browser to the sign-in page; it returns to `returnUrl` afterwards. */
export function login(returnUrl = window.location.pathname) {
  window.location.href = `/Account/Login?returnUrl=${encodeURIComponent(returnUrl)}`;
}

/**
 * Ends the session, then shows the sign-in page. A POST with the antiforgery header, so no
 * other site can sign people out with a link.
 */
export async function logout() {
  try {
    await api.post("/api/account/logout");
  } finally {
    // Even if the call failed (say the session had already ended), the sign-in page is right.
    window.location.href = "/Account/Login";
  }
}
