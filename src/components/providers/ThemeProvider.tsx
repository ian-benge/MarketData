"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  applyResolvedTheme,
  isThemePreference,
  resolveTheme,
  storeThemePreference,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeSystemTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getSystemPrefersLight() {
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

function getServerSystemPrefersLight() {
  return false;
}

const preferenceListeners = new Set<() => void>();

function emitPreferenceChange() {
  for (const listener of preferenceListeners) listener();
}

function subscribePreference(onStoreChange: () => void) {
  preferenceListeners.add(onStoreChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    preferenceListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readPreferenceSnapshot(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : "dark";
  } catch {
    return "dark";
  }
}

function getServerPreference(): ThemePreference {
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore(
    subscribePreference,
    readPreferenceSnapshot,
    getServerPreference,
  );
  const systemPrefersLight = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemPrefersLight,
    getServerSystemPrefersLight,
  );
  const resolved = resolveTheme(preference, systemPrefersLight);

  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    storeThemePreference(next);
    applyResolvedTheme(
      resolveTheme(
        next,
        window.matchMedia("(prefers-color-scheme: light)").matches,
      ),
    );
    emitPreferenceChange();
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
