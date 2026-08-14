import { chicagoDateKey } from "@/lib/market-data/bars-window";
import type { PortfolioPoint, PortfolioSummary, PositionsSnapshot } from "./types";

export const HIDE_VALUES_STORAGE_KEY = "ib-positions-hide-values";
export const PNL_WINDOW_STORAGE_KEY = "ib-positions-pnl-window";
export const CHART_PNL_WINDOW_STORAGE_KEY = "ib-positions-chart-pnl-window";

export const BOOK_PNL_WINDOWS = ["1d", "1w", "1m", "3m", "ytd", "max"] as const;
export type BookPnlWindow = (typeof BOOK_PNL_WINDOWS)[number];

export const BOOK_PNL_WINDOW_LABELS: Record<BookPnlWindow, string> = {
  "1d": "1D",
  "1w": "1W",
  "1m": "1M",
  "3m": "3M",
  ytd: "YTD",
  max: "Max",
};

const WINDOW_SESSIONS: Record<Exclude<BookPnlWindow, "1d" | "ytd" | "max">, number> = {
  "1w": 5,
  "1m": 21,
  "3m": 63,
};

export function isBookPnlWindow(value: unknown): value is BookPnlWindow {
  return (
    value === "1d" ||
    value === "1w" ||
    value === "1m" ||
    value === "3m" ||
    value === "ytd" ||
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
    if (raw === "1y") return "ytd";
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

export function readStoredChartPnlWindow(): BookPnlWindow {
  if (typeof window === "undefined") return "max";
  try {
    const raw = window.localStorage.getItem(CHART_PNL_WINDOW_STORAGE_KEY);
    return isBookPnlWindow(raw) ? raw : "max";
  } catch {
    return "max";
  }
}

export function storeChartPnlWindow(next: BookPnlWindow) {
  try {
    window.localStorage.setItem(CHART_PNL_WINDOW_STORAGE_KEY, next);
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
  /** `nav` when Max % is vs account value; `cost` / `premium` when vs closed cost. */
  percentBase: "nav" | "cost" | "premium" | null;
  hint: string;
};

function percentOfBase(
  pnl: number | null,
  base: number | null | undefined,
): number | null {
  if (pnl == null || !Number.isFinite(pnl)) return null;
  if (base == null || !(base > 0)) return null;
  return (pnl / base) * 100;
}

function maxReturn(
  summary: PortfolioSummary,
): Pick<WindowedBookPnl, "percent" | "percentBase"> {
  const pnl = summary.totalPnl;
  if (pnl == null) return { percent: null, percentBase: null };
  if (summary.accountValue != null && summary.accountValue > 0) {
    return {
      percent: percentOfBase(pnl, summary.accountValue),
      percentBase: "nav",
    };
  }
  if (summary.closedCostBasis != null && summary.closedCostBasis > 0) {
    return {
      percent: percentOfBase(pnl, summary.closedCostBasis),
      percentBase: summary.closedAllOptions ? "premium" : "cost",
    };
  }
  return { percent: null, percentBase: null };
}

export function bookPnlForWindow(
  snapshot: Pick<PositionsSnapshot, "series" | "summary" | "asOf">,
  window: BookPnlWindow,
): WindowedBookPnl {
  const summary = snapshot.summary;
  if (window === "max") {
    const { percent, percentBase } = maxReturn(summary);
    return {
      beforeFees: summary.pnlBeforeFees,
      afterFees: summary.totalPnl,
      percent,
      percentBase,
      hint:
        percentBase === "nav"
          ? "Net vs account NAV"
          : percentBase === "premium"
            ? "Net vs premium (not TWR)"
            : percentBase === "cost"
              ? "Net vs cost (not TWR)"
              : "Since entry, all open and closed lots",
    };
  }
  if (window === "1d") {
    const flat = summary.openCount === 0;
    const realizedToday = summary.realizedTodayPnl;
    if (flat) {
      const missing = realizedToday == null;
      return {
        beforeFees: missing ? null : realizedToday,
        afterFees: missing ? null : realizedToday,
        percent: percentOfBase(
          realizedToday,
          summary.accountValue != null && summary.accountValue > 0
            ? summary.accountValue
            : summary.closedCostBasis,
        ),
        percentBase:
          summary.accountValue != null && summary.accountValue > 0 ? "nav" : "cost",
        hint: missing ? "Flat · no closes today" : "Chicago today · realized after fees",
      };
    }
    const openDay = summary.dayPnl;
    const combined =
      realizedToday == null && openDay == null
        ? null
        : (realizedToday ?? 0) + (openDay ?? 0);
    return {
      beforeFees: combined,
      afterFees: combined,
      percent: summary.dayPercent,
      percentBase:
        summary.accountValue != null && summary.accountValue > 0 ? "nav" : null,
      hint: "Today realized + open vs prior close",
    };
  }
  const fromSeries =
    window === "ytd"
      ? sumSeriesSince(snapshot.series, `${chicagoDateKey(snapshot.asOf).slice(0, 4)}-01-01`)
      : sumSeriesPnl(snapshot.series, WINDOW_SESSIONS[window]);
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
    percent: percentOfBase(
      pnl,
      summary.accountValue != null && summary.accountValue > 0
        ? summary.accountValue
        : summary.grossExposure,
    ),
    percentBase:
      summary.accountValue != null && summary.accountValue > 0 ? "nav" : null,
    hint: bookPnlWindowHint(window),
  };
}

function sumSeriesSince(series: PortfolioPoint[], start: string): number | null {
  let total = 0;
  let seen = false;
  for (const point of series) {
    if (point.date < start) continue;
    if (point.dayPnl == null || !Number.isFinite(point.dayPnl)) continue;
    total += point.dayPnl;
    seen = true;
  }
  return seen ? total : null;
}

export function bookPnlWindowHint(window: BookPnlWindow): string {
  switch (window) {
    case "1d":
      return "Chicago today · realized + open day P&L";
    case "1w":
      return "Last 5 sessions";
    case "1m":
      return "Last 21 sessions";
    case "3m":
      return "Last 63 sessions";
    case "ytd":
      return "Year to date";
    case "max":
      return "Since entry, all open and closed lots";
  }
}
