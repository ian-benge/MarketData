"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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

export function PositionsPrivacyProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [hideValues, setHideValues] = useState(false);
  const [pnlWindow, setPnlWindowState] = useState<BookPnlWindow>("max");

  useEffect(() => {
    setHideValues(readStoredHideValues());
    setPnlWindowState(readStoredPnlWindow());
  }, []);

  const toggleHideValues = useCallback(() => {
    setHideValues((current) => {
      const next = !current;
      storeHideValues(next);
      return next;
    });
  }, []);

  const setPnlWindow = useCallback((next: BookPnlWindow) => {
    setPnlWindowState(next);
    storePnlWindow(next);
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
