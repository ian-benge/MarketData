"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  readStoredHideValues,
  readStoredPnlWindow,
  storeHideValues,
  storePnlWindow,
  type BookPnlWindow,
} from "@/lib/positions/value-privacy";

type PositionsPrivacyValue = {
  hideValues: boolean;
  toggleHideValues: () => void;
  pnlWindow: BookPnlWindow;
  setPnlWindow: (window: BookPnlWindow) => void;
};

const PositionsPrivacyContext = createContext<PositionsPrivacyValue | null>(
  null,
);

const privacyListeners = new Set<() => void>();

function emitPrivacyChange() {
  for (const listener of privacyListeners) listener();
}

function subscribePrivacy(listener: () => void) {
  privacyListeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    privacyListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

function hideSnapshot() {
  return readStoredHideValues();
}

function hideServerSnapshot() {
  return false;
}

function windowSnapshot() {
  return readStoredPnlWindow();
}

function windowServerSnapshot(): BookPnlWindow {
  return "max";
}

export function PositionsPrivacyProvider({
  children,
}: {
  children: ReactNode;
}) {
  const hideValues = useSyncExternalStore(
    subscribePrivacy,
    hideSnapshot,
    hideServerSnapshot,
  );
  const pnlWindow = useSyncExternalStore(
    subscribePrivacy,
    windowSnapshot,
    windowServerSnapshot,
  );

  const toggleHideValues = useCallback(() => {
    storeHideValues(!hideValues);
    emitPrivacyChange();
  }, [hideValues]);

  const setPnlWindow = useCallback((next: BookPnlWindow) => {
    storePnlWindow(next);
    emitPrivacyChange();
  }, []);

  const value = useMemo(
    () => ({ hideValues, toggleHideValues, pnlWindow, setPnlWindow }),
    [hideValues, pnlWindow, setPnlWindow, toggleHideValues],
  );

  return (
    <PositionsPrivacyContext.Provider value={value}>
      {children}
    </PositionsPrivacyContext.Provider>
  );
}

export function usePositionsPrivacy(): PositionsPrivacyValue {
  const value = useContext(PositionsPrivacyContext);
  if (!value) {
    throw new Error("usePositionsPrivacy must be used within PositionsPrivacyProvider");
  }
  return value;
}

export function useHideValues(): boolean {
  return useContext(PositionsPrivacyContext)?.hideValues ?? false;
}
