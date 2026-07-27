/**
 * Cross-origin sync helpers for the Capacitor APK and optional remote API base.
 * On the normal Next web app, base is empty (same-origin).
 */

const TOKEN_KEY = "momentum_device_token";
const API_BASE_KEY = "momentum_sync_api_url";

function readViteEnv(name: string): string | undefined {
  try {
    // Vite injects import.meta.env; Next may not.
    const meta = import.meta as { env?: Record<string, string | undefined> };
    return meta.env?.[name];
  } catch {
    return undefined;
  }
}

export function getSyncApiBase(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(API_BASE_KEY);
    if (stored) return stored.replace(/\/$/, "");
  }
  const fromVite = readViteEnv("VITE_SYNC_API_URL");
  if (fromVite) return fromVite.replace(/\/$/, "");
  const fromNext =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SYNC_API_URL : undefined;
  if (fromNext) return fromNext.replace(/\/$/, "");
  return "";
}

export function setSyncApiBase(url: string) {
  if (typeof window === "undefined") return;
  const cleaned = url.trim().replace(/\/$/, "");
  if (cleaned) window.localStorage.setItem(API_BASE_KEY, cleaned);
  else window.localStorage.removeItem(API_BASE_KEY);
}

export function apiUrl(path: string): string {
  const base = getSyncApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

export function getDeviceToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setDeviceToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    ...(extra instanceof Headers
      ? Object.fromEntries(extra.entries())
      : (extra as Record<string, string> | undefined) ?? {}),
  };
  const token = getDeviceToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const baseHeaders: Record<string, string> = {};
  if (init?.body != null) baseHeaders["Content-Type"] = "application/json";
  const headers = authHeaders({
    ...baseHeaders,
    ...(init?.headers as Record<string, string> | undefined),
  });
  return fetch(apiUrl(path), { ...init, headers });
}
