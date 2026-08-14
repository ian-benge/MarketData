import type { PortfolioPoint, PortfolioSummary, PositionsSnapshot } from "./types";

export const HIDE_VALUES_STORAGE_KEY = "ib-positions-hide-values";
export const PNL_WINDOW_STORAGE_KEY = "ib-positions-pnl-window";

export const BOOK_PNL_WINDOWS = ["1d", "1w", "1m", "3m", "1y", "max"] as const;
export type BookPnlWindow = (typeof BOOK_PNL_WINDOWS)[number];

export const BOOK_PNL_WINDOW_LABELS: Record<BookPnlWindow, string> = {
  "1d": "1D",
  "1w": "1W",
  "1m": "1M",
  "3m": "3M",
  "1y": "1Y",
  max: "Max",
};

const WINDOW_SESSIONS: Record<Exclude<BookPnlWindow, "1d" | "max">, number> = {
  "1w": 5,
  "1m": 21,
  "3m": 63,
  "1y": 252,
};

export function isBookPnlWindow(value: unknown): value is BookPnlWindow {
  return (
    value === "1d" ||
    value === "1w" ||
    value === "1m" ||
    value === "3m" ||
    value === "1y" ||
    value === "max"
  );
}

export function readStoredHideValues(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIDE_VALUES_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function storeHideValues(hidden: boolean) {
  try {
    window.localStorage.setItem(HIDE_VALUES_STORAGE_KEY, hidden ? "1" : "0");
  } catch {
    /* private mode / blocked storage */
  }
}

export function readStoredPnlWindow(): BookPnlWindow {
  if (typeof window === "undefined") return "max";
  try {
    const raw = window.localStorage.getItem(PNL_WINDOW_STORAGE_KEY);
    return isBookPnlWindow(raw) ? raw : "max";
  } catch {
    return "max";
  }
}

export function storePnlWindow(next: BookPnlWindow) {
  try {
    window.localStorage.setItem(PNL_WINDOW_STORAGE_KEY, next);
  } catch {
    /* private mode / blocked storage */
  }
}

export function sumSeriesPnl(
  series: PortfolioPoint[],
  sessions: number,
): number | null {
  const slice = series.slice(-sessions);
  let total = 0;
  let seen = false;
  for (const point of slice) {
    if (point.dayPnl == null || !Number.isFinite(point.dayPnl)) continue;
    total += point.dayPnl;
    seen = true;
  }
  return seen ? total : null;
}

export type WindowedBookPnl = {
  beforeFees: number | null;
  afterFees: number | null;
  percent: number | null;
};

function percentOfBook(
  pnl: number | null,
  summary: PortfolioSummary,
): number | null {
  if (pnl == null || !Number.isFinite(pnl)) return null;
  const base =
    summary.accountValue != null && summary.accountValue > 0
      ? summary.accountValue
      : summary.grossExposure;
  if (base == null || !(base > 0)) return null;
  return (pnl / base) * 100;
}

export function bookPnlForWindow(
  snapshot: Pick<PositionsSnapshot, "series" | "summary">,
  window: BookPnlWindow,
): WindowedBookPnl {
  const summary = snapshot.summary;
  if (window === "max") {
    return {
      beforeFees: summary.pnlBeforeFees,
      afterFees: summary.totalPnl,
      percent: summary.bookReturnPercent,
    };
  }
  if (window === "1d") {
    return {
      beforeFees: summary.dayPnl,
      afterFees: summary.dayPnl,
      percent: summary.dayPercent,
    };
  }
  const sessions = WINDOW_SESSIONS[window];
  const fromSeries = sumSeriesPnl(snapshot.series, sessions);
  const fallback =
    window === "1w"
      ? summary.change1wPnl
      : window === "1m"
        ? summary.change1mPnl
        : null;
  const pnl = fromSeries ?? fallback;
  return {
    beforeFees: pnl,
    afterFees: pnl,
    percent: percentOfBook(pnl, summary),
  };
}

export function bookPnlWindowHint(window: BookPnlWindow): string {
  switch (window) {
    case "1d":
      return "Open lots vs prior close";
    case "1w":
      return "Last 5 sessions";
    case "1m":
      return "Last 21 sessions";
    case "3m":
      return "Last 63 sessions";
    case "1y":
      return "Last 252 sessions";
    case "max":
      return "Since entry, all open and closed lots";
  }
}
