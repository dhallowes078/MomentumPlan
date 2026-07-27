import { apiUrl, authHeaders, getDeviceToken } from "@/lib/sync-api";

/** Rewrite same-origin /api fetches to the configured sync server + bearer token. */
export function installApiFetchBridge() {
  if (typeof window === "undefined") return;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const isRelativeApi = url.startsWith("/api/");
    const isAbsoluteApi =
      !isRelativeApi &&
      (() => {
        try {
          const u = new URL(url, window.location.href);
          return u.pathname.startsWith("/api/");
        } catch {
          return false;
        }
      })();

    if (isRelativeApi || isAbsoluteApi) {
      if (isRelativeApi) {
        url = apiUrl(url);
      } else {
        try {
          const u = new URL(url);
          url = apiUrl(u.pathname + u.search);
        } catch {
          // keep
        }
      }

      const headers = new Headers(init?.headers ?? (typeof input !== "string" && !(input instanceof URL) ? input.headers : undefined));
      const auth = authHeaders() as Record<string, string>;
      for (const [k, v] of Object.entries(auth)) {
        if (!headers.has(k)) headers.set(k, v);
      }
      // Capacitor can't send NextAuth cookies cross-origin — bearer only.
      if (getDeviceToken() && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${getDeviceToken()}`);
      }

      return original(url, { ...init, headers });
    }

    return original(input, init);
  };
}
