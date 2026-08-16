import { chicagoDateKey } from "@/lib/market-data/bars-window";
import { groupLotsForBlotter } from "./lot-groups";
import type {
  EnrichedPosition,
  NamedContributor,
  PortfolioPoint,
  PortfolioSummary,
  PositionsSnapshot,
} from "./types";

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

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.NaN;
  return Math.round((end - start) / 86_400_000);
}

export function contributorPnlForWindow(
  row: EnrichedPosition,
  window: BookPnlWindow,
  asOf: string,
): number | null {
  const chicagoAsOf = chicagoDateKey(asOf);
  const close = dateOnly(row.closeDate ?? row.closedAt);
  if (window === "1d") {
    if (row.status === "open") return row.dayPnl;
    return close === chicagoAsOf ? row.realizedPnl : null;
  }
  if (window === "max") return row.totalPnl;
  if (row.status === "open") {
    if (window === "1w") return row.change1w.pnl;
    if (window === "1m" || window === "3m") return row.change1m.pnl;
    return row.dayPnl;
  }
  if (!close) return null;
  const age = daysBetween(close, chicagoAsOf);
  if (!Number.isFinite(age) || age < 0) return null;
  if (window === "1w") return age <= 7 ? row.realizedPnl : null;
  if (window === "1m") return age <= 31 ? row.realizedPnl : null;
  if (window === "3m") return age <= 93 ? row.realizedPnl : null;
  if (window === "ytd") {
    return close.slice(0, 4) === chicagoAsOf.slice(0, 4) ? row.realizedPnl : null;
  }
  return row.realizedPnl;
}

export function contributorsForWindow(
  positions: EnrichedPosition[],
  window: BookPnlWindow,
  asOf: string,
): { winners: NamedContributor[]; losers: NamedContributor[] } {
  const scored = groupLotsForBlotter(positions)
    .map(({ row }) => ({
      row,
      pnl: contributorPnlForWindow(row, window, asOf),
    }))
    .filter(
      (item): item is { row: EnrichedPosition; pnl: number } =>
        item.pnl != null && Number.isFinite(item.pnl) && item.pnl !== 0,
    );
  const toContributor = (item: { row: EnrichedPosition; pnl: number }): NamedContributor => ({
    id: item.row.id,
    ticker: item.row.ticker,
    side: item.row.side,
    pnl: item.pnl,
    percent: item.row.returnPercent,
  });
  const winners = scored
    .filter((item) => item.pnl > 0)
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 3)
    .map(toContributor);
  const losers = scored
    .filter((item) => item.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 3)
    .map(toContributor);
  return { winners, losers };
}
