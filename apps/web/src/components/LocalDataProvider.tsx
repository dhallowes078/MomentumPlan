"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLocalBoot, useSyncIndicator } from "@/lib/local/hooks";

const SyncCtx = createContext<ReturnType<typeof useSyncIndicator> | null>(null);

export function LocalDataProvider({ children }: { children: ReactNode }) {
  useLocalBoot();
  const sync = useSyncIndicator();

  return <SyncCtx.Provider value={sync}>{children}</SyncCtx.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncCtx);
  if (!ctx) {
    return {
      status: "idle" as const,
      pending: 0,
      lastError: undefined as string | undefined,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
