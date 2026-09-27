import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { env } from "@/config/env";
import { STORAGE_KEYS } from "@/constants/storage-keys";
import { storage } from "@/lib/storage";

export interface ApiErrorPayload {
  message: string;
  code?: string;
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

/**
 * Translate a raw axios error into a user-friendly message. The backend's
 * `{ success:false, message }` envelope is preferred when present; we only
 * fall back to a generic message for transport-level failures (no response,
 * timeouts, CORS) and unhelpful server messages.
 */
function deriveMessage(error: AxiosError<ApiErrorPayload>): string {
  const serverMessage = error.response?.data?.message;
  if (serverMessage && serverMessage.trim().length > 0) {
    return serverMessage;
  }

  // No response → transport problem.
  if (!error.response) {
    if (error.code === "ECONNABORTED") {
      return "The request took too long. Please try again.";
    }
    return "Could not reach the server. Check your connection and try again.";
  }

  const status = error.response.status;
  if (status >= 500) {
    return "The server is having trouble right now. Please try again in a moment.";
  }
  if (status === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (status === 403) {
    return "You don't have permission to do that.";
  }
  if (status === 404) {
    return "We couldn't find what you were looking for.";
  }
  if (status === 409) {
    return "That action conflicts with the current state — please refresh and try again.";
  }

  return error.message || "Something went wrong. Please try again.";
}

/**
 * Catalog reads are PUBLIC endpoints that the backend makes STAFF-AWARE
 * (`attachStaffIfPresent` + `buildVisibilityWhere`): a request carrying an
 * admin/manager token bypasses the PUBLISHED filter and the ENTIRE_STORE
 * draft-category filter, so it returns DRAFT content.
 *
 * That is correct for the admin panel, but wrong on the STOREFRONT. The Shop
 * listing is fetched CLIENT-side (so it would carry the staff token and show
 * drafts), while a product page is rendered SERVER-side with no token at all
 * (anonymous -> 404). A signed-in admin therefore saw draft products in Shop
 * that 404'd the moment they clicked one.
 *
 * Fix: on the storefront, send catalog reads ANONYMOUSLY so staff browse
 * exactly what customers see. The admin panel lives at an UNPREFIXED /admin/*
 * path (the storefront is always /:region/:locale/*), so it keeps its token and
 * still sees drafts. Server-side catalog fetches were already anonymous.
 */
const PUBLIC_CATALOG_PATHS = [
  "/products",
  "/categories",
  "/sections",
  "/banners",
];

function isStorefrontCatalogRead(config: InternalAxiosRequestConfig): boolean {
  // Server rendering never attaches a token anyway — leave that path untouched.
  if (typeof window === "undefined") return false;
  // Admin panel: keep the token so staff screens still list DRAFT content.
  if (window.location.pathname.startsWith("/admin")) return false;
  const method = (config.method ?? "get").toLowerCase();
  if (method !== "get") return false;
  // `url` is relative to baseURL (e.g. "/products/123"); strip any query string.
  const path = (config.url ?? "").split("?")[0];
  return PUBLIC_CATALOG_PATHS.some(
    (base) => path === base || path.startsWith(`${base}/`)
  );
}

function createHttpClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: env.NEXT_PUBLIC_API_URL,
    timeout: 15_000,
    headers: { "Content-Type": "application/json" },
  });

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = storage.get<string>(STORAGE_KEYS.authToken);
    if (token && config.headers && !isStorefrontCatalogRead(config)) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Region scoping: the backend reads `X-Region` (a region code) to decide
    // which catalog the storefront sees. Read it from the cookie on the client.
    // (Server Components can't see this cookie here — they pass `?region=`
    // explicitly via getServerRegion(); the header always wins if both present.)
    if (typeof document !== "undefined" && config.headers) {
      const match = document.cookie.match(/(?:^|;\s*)region=([^;]+)/);
      const region = match ? decodeURIComponent(match[1]) : null;
      if (region && !config.headers["X-Region"]) {
        config.headers["X-Region"] = region;
      }
    }
    // Server-side only: identify as the trusted first-party renderer so the
    // backend's per-IP public rate limit doesn't throttle SSR/ISR — every
    // visitor's server-rendered catalog reads share this one server IP and
    // would otherwise exhaust the public bucket for the whole site. The guard
    // (`typeof window === "undefined"`) makes this dead code in the browser
    // bundle, and a non-public env var is never exposed to the client, so the
    // secret can't leak. No-op when INTERNAL_API_KEY is unset.
    if (typeof window === "undefined" && config.headers) {
      const internalKey = process.env.INTERNAL_API_KEY;
      if (internalKey) {
        config.headers["X-Internal-Key"] = internalKey;
      }
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiErrorPayload>) => {
      // Bounded retry with short backoff for transient throttling (429) or
      // unavailability (503) on IDEMPOTENT GETs only — smooths brief rate-limit
      // bursts and backend restarts without duplicating any side effects
      // (mutations are never retried). Uses a small fixed backoff, deliberately
      // ignoring the limiter's `Retry-After` (which is the whole 15-min window
      // and useless for an inline render). Defence-in-depth; the real SSR fix is
      // the trusted-caller bypass above.
      const status = error.response?.status ?? 0;
      const cfg = error.config as
        | (InternalAxiosRequestConfig & { _retryCount?: number })
        | undefined;
      const method = (cfg?.method ?? "get").toLowerCase();
      if (cfg && method === "get" && (status === 429 || status === 503)) {
        const MAX_RETRIES = 2;
        cfg._retryCount = cfg._retryCount ?? 0;
        if (cfg._retryCount < MAX_RETRIES) {
          cfg._retryCount += 1;
          const backoffMs = 300 * 2 ** (cfg._retryCount - 1); // 300ms, 600ms
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          return instance(cfg);
        }
      }

      // A `responseType: "blob"` request (file downloads) gets its error body
      // back as a Blob too, not parsed JSON — deriveMessage would otherwise
      // silently lose the backend's specific message (e.g. "narrow the date
      // range") behind a generic status-code fallback. Parse it back to JSON
      // first so blob-download errors surface exactly like any other request.
      if (error.response?.data instanceof Blob && error.response.data.type.includes("json")) {
        try {
          const text = await error.response.data.text();
          error.response.data = JSON.parse(text) as ApiErrorPayload;
        } catch {
          // Malformed/non-JSON blob body — fall through to the generic message.
        }
      }

      const message = deriveMessage(error);
      const payload: ApiErrorPayload = {
        message,
        code: error.response?.data?.code,
        details: error.response?.data?.details,
      };

      // 401 from a real response means the token is no longer valid — clear
      // it so the next render-cycle redirects unauthenticated. We don't
      // touch storage on transport errors (status 0); a temporary network
      // hiccup shouldn't sign the user out. Crucially, only clear when the 401
      // was for the CURRENT token: a stale in-flight request racing a fresh
      // login must never wipe the just-issued token (that logged admins out
      // immediately after signing in).
      if (status === 401 && typeof window !== "undefined") {
        const sentAuth = String(cfg?.headers?.Authorization ?? "");
        const sentToken = sentAuth.startsWith("Bearer ") ? sentAuth.slice(7) : "";
        const currentToken = storage.get<string>(STORAGE_KEYS.authToken);
        if (sentToken && currentToken && sentToken === currentToken) {
          storage.remove(STORAGE_KEYS.authToken);
        }
      }

      return Promise.reject(new ApiError(status, payload));
    }
  );

  return instance;
}

export const http = createHttpClient();
