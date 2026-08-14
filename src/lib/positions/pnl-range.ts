import { chicagoDateKey } from "@/lib/market-data/bars-window";
import type { BookPnlWindow } from "./value-privacy";
import type { PortfolioEvent, PortfolioPoint, PositionRecord } from "./types";

export const PORTFOLIO_PNL_RANGES = ["1M", "3M", "6M", "YTD", "Max"] as const;
export type PortfolioPnlRange = (typeof PORTFOLIO_PNL_RANGES)[number];
export const DEFAULT_PORTFOLIO_PNL_RANGE: PortfolioPnlRange = "3M";

const SESSION_COUNTS: Record<Exclude<PortfolioPnlRange, "YTD" | "Max">, number> = {
  "1M": 22,
  "3M": 66,
  "6M": 126,
};

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function ytdStart(asOf: string): string {
  const key = /^\d{4}-\d{2}-\d{2}/.test(asOf) ? asOf.slice(0, 10) : chicagoDateKey(asOf);
  return `${key.slice(0, 4)}-01-01`;
}

export function visiblePortfolioPoints(
  series: PortfolioPoint[],
  range: PortfolioPnlRange,
  asOf: string,
): PortfolioPoint[] {
  if (range === "Max") return series;
  if (range === "YTD") {
    const start = ytdStart(asOf);
    return series.filter((point) => point.date >= start);
  }
  return series.slice(-SESSION_COUNTS[range]);
}

function carriedInto(
  positions: PositionRecord[],
  firstDate: string,
): PortfolioEvent[] {
  const carried: PortfolioEvent[] = [];
  for (const position of positions) {
    const entry = dateOnly(position.entryDate);
    const close =
      position.status === "closed"
        ? dateOnly(position.closeDate ?? position.closedAt)
        : null;
    if (!entry || entry >= firstDate) continue;
    if (close && close < firstDate) continue;
    carried.push({
      kind: "opened",
      id: position.id,
      ticker: position.ticker,
      side: position.side,
    });
  }
  return carried;
}

const BOOK_WINDOW_SESSIONS: Record<
  Exclude<BookPnlWindow, "1d" | "ytd" | "max">,
  number
> = {
  "1w": 5,
  "1m": 21,
  "3m": 63,
};

export function visiblePointsForBookWindow(
  series: PortfolioPoint[],
  window: BookPnlWindow,
  asOf: string,
): PortfolioPoint[] {
  if (window === "max") return series;
  if (window === "ytd") {
    const start = ytdStart(asOf);
    return series.filter((point) => point.date >= start);
  }
  if (window === "1d") {
    const today = /^\d{4}-\d{2}-\d{2}/.test(asOf)
      ? asOf.slice(0, 10)
      : chicagoDateKey(asOf);
    const todayPoints = series.filter((point) => point.date === today);
    return todayPoints.length ? todayPoints : series.slice(-1);
  }
  return series.slice(-BOOK_WINDOW_SESSIONS[window]);
}

export function sliceSeriesForBookWindow(
  series: PortfolioPoint[],
  window: BookPnlWindow,
  asOf: string,
  positions: PositionRecord[] = [],
): PortfolioPoint[] {
  const visible = visiblePointsForBookWindow(series, window, asOf);
  const firstDate = visible[0]?.date;
  if (!firstDate) return visible;
  const carried = carriedInto(positions, firstDate);
  return visible.map((point, index) => ({
    ...point,
    carried: index === 0 ? carried : [],
  }));
}

export function slicePortfolioSeries(
  series: PortfolioPoint[],
  range: PortfolioPnlRange,
  asOf: string,
  positions: PositionRecord[] = [],
): PortfolioPoint[] {
  const visible = visiblePortfolioPoints(series, range, asOf);
  const firstDate = visible[0]?.date;
  if (!firstDate) return visible;
  const carried = carriedInto(positions, firstDate);
  return visible.map((point, index) => ({
    ...point,
    carried: index === 0 ? carried : [],
  }));
}
