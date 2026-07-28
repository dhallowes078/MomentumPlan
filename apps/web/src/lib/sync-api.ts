/**
 * Cross-origin sync helpers for the Capacitor APK.
 * On the normal Next web app, base is empty (same-origin).
 * On the Android app, always the live Cloudflare site — no custom URLs.
 */

const TOKEN_KEY = "momentum_device_token";
const API_BASE_KEY = "momentum_sync_api_url";
const LIVE_SYNC_URL = "https://momentum.momentum-app.workers.dev";

/** True for the Capacitor / Vite mobile bundle (not the Next.js website). */
export function isMobileAppBundle(): boolean {
  try {
    const meta = import.meta as { env?: Record<string, string | undefined> };
    if (meta.env?.VITE_MOBILE === "1") return true;
    if (typeof meta.env?.VITE_SYNC_API_URL === "string") return true;
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    const cap = (
      window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
    if (document.documentElement.classList.contains("is-native")) return true;
  }
  return false;
}

/** Drop any old tunnel/LAN URL saved from earlier builds. */
export function clearStoredSyncApiBase() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(API_BASE_KEY);
}

export function getSyncApiBase(): string {
  if (isMobileAppBundle()) {
    clearStoredSyncApiBase();
    return LIVE_SYNC_URL;
  }
  // Next.js website: same-origin (ignore stale localStorage / env).
  return "";
}

/** @deprecated Custom sync URLs are no longer supported. */
export function setSyncApiBase(_url: string) {
  clearStoredSyncApiBase();
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

/**
 * Absolute media URL for img/CSS backgrounds.
 * On mobile, attachments need the sync host + device token (img tags can't send Authorization).
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return appendDeviceTokenIfNeeded(url);
  }
  const absolute = apiUrl(url);
  return appendDeviceTokenIfNeeded(absolute);
}

function appendDeviceTokenIfNeeded(url: string): string {
  if (!url.includes("/api/attachments/")) return url;
  const token = getDeviceToken();
  if (!token) return url;
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : LIVE_SYNC_URL);
    if (!u.searchParams.has("token")) u.searchParams.set("token", token);
    return u.toString();
  } catch {
    return url;
  }
}

