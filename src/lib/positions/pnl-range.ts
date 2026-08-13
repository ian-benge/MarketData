import { chicagoDateKey } from "@/lib/market-data/bars-window";
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
