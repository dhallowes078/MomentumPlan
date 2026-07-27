import { createContext, useContext, type ReactNode } from "react";
import { getDeviceToken } from "@/lib/sync-api";

type Session = {
  user?: { id?: string; name?: string | null; email?: string | null };
} | null;

const SessionCtx = createContext<{ data: Session; status: string }>({
  data: null,
  status: "unauthenticated",
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const token = typeof window !== "undefined" ? getDeviceToken() : null;
  const value = {
    data: token ? { user: { id: "device", name: "Linked" } } : null,
    status: token ? "authenticated" : "unauthenticated",
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  return useContext(SessionCtx);
}

export async function signIn(
  _provider?: string,
  _opts?: Record<string, unknown>
): Promise<{ error?: string; ok?: boolean }> {
  return { ok: true };
}

export async function signOut(_opts?: { callbackUrl?: string }) {
  return undefined;
}
