"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { applyTheme, readStoredTheme } from "@/lib/theme";

type ThemeState = {
  themeColor: string;
  darkMode: boolean;
  tinyMinutes: number;
  smallMinutes: number;
  mediumMinutes: number;
  bigMinutes: number;
  setThemeLocal: (next: Partial<ThemeState>) => void;
  refresh: () => Promise<void>;
};

const ThemeContext = createContext<ThemeState | null>(null);

const defaults = {
  themeColor: "#1f4d3a",
  darkMode: false,
  tinyMinutes: 15,
  smallMinutes: 30,
  mediumMinutes: 60,
  bigMinutes: 120,
};

function initialThemeState() {
  const stored = readStoredTheme();
  return {
    ...defaults,
    ...(stored ?? {}),
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(initialThemeState);

  const refresh = useCallback(async () => {
    try {
      const local = await import("@/lib/local/repo").then((m) => m.getPrefs()).catch(() => null);
      if (local) {
        const fromLocal = {
          themeColor: local.themeColor ?? defaults.themeColor,
          darkMode: Boolean(local.darkMode),
          tinyMinutes: local.tinyMinutes ?? defaults.tinyMinutes,
          smallMinutes: local.smallMinutes ?? defaults.smallMinutes,
          mediumMinutes: local.mediumMinutes ?? defaults.mediumMinutes,
          bigMinutes: local.bigMinutes ?? defaults.bigMinutes,
        };
        setState(fromLocal);
        applyTheme(fromLocal.themeColor, fromLocal.darkMode);
      }

      const res = await fetch("/api/prefs");
      if (!res.ok) return;
      const { prefs } = await res.json();
      const next = {
        themeColor: prefs.themeColor ?? defaults.themeColor,
        darkMode: Boolean(prefs.darkMode),
        tinyMinutes: prefs.tinyMinutes ?? defaults.tinyMinutes,
        smallMinutes: prefs.smallMinutes ?? defaults.smallMinutes,
        mediumMinutes: prefs.mediumMinutes ?? defaults.mediumMinutes,
        bigMinutes: prefs.bigMinutes ?? defaults.bigMinutes,
      };
      setState(next);
      applyTheme(next.themeColor, next.darkMode);
    } catch {
      const stored = readStoredTheme();
      if (stored) applyTheme(stored.themeColor, stored.darkMode);
      else applyTheme(defaults.themeColor, defaults.darkMode);
    }
  }, []);

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored) applyTheme(stored.themeColor, stored.darkMode);
    void refresh();
  }, [refresh]);

  const setThemeLocal = useCallback((next: Partial<ThemeState>) => {
    setState((prev) => {
      const merged = { ...prev, ...next };
      applyTheme(merged.themeColor, merged.darkMode);
      return merged;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ ...state, setThemeLocal, refresh }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemePrefs() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      ...defaults,
      setThemeLocal: () => undefined,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
