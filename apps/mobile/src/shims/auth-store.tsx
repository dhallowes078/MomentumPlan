import { createContext, useContext, type ReactNode } from "react";
import { getDeviceToken, setDeviceToken as persistToken } from "@/lib/sync-api";

type Session = {
  user?: { id?: string; name?: string | null; email?: string | null };
} | null;

const SessionCtx = createContext<{
  data: Session;
  status: "loading" | "authenticated" | "unauthenticated";
}>({
  data: null,
  status: "unauthenticated",
});

export function setDeviceToken(token: string | null) {
  persistToken(token);
}

export function signOutLocal() {
  persistToken(null);
  localStorage.removeItem("momentum_offline_ok");
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const token = typeof window !== "undefined" ? getDeviceToken() : null;
  const value = {
    data: token ? { user: { id: "device", name: "Linked account", email: null } } : null,
    status: (token ? "authenticated" : "unauthenticated") as
      | "loading"
      | "authenticated"
      | "unauthenticated",
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  return useContext(SessionCtx);
}

export async function signIn(
  _provider?: string,
  _opts?: Record<string, unknown>
): Promise<{ error?: string; ok?: boolean; url?: string }> {
  return { ok: true };
}
