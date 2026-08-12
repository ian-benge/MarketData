import { chicagoDateKey, sliceLastTradingDays } from "@/lib/market-data/bars-window";
import type { NormalizedBar } from "@/lib/providers/types";

export const CHART_RANGES = {
  "1D": {
    interval: "5m",
    fetchLimit: 2000,
    tradingDays: 1,
    barLabel: "Intraday",
    seriesKind: "intraday",
    lookbackDays: 5,
  },
  "5D": {
    interval: "5m",
    fetchLimit: 2000,
    tradingDays: 5,
    barLabel: "Intraday",
    seriesKind: "intraday",
    lookbackDays: 14,
  },
  "1M": {
    interval: "1d",
    fetchLimit: 90,
    tradingDays: null,
    barLabel: "Daily",
    seriesKind: "daily",
    lookbackDays: 45,
  },
  "3M": {
    interval: "1d",
    fetchLimit: 90,
    tradingDays: null,
    barLabel: "Daily",
    seriesKind: "daily",
    lookbackDays: 120,
  },
  "6M": {
    interval: "1d",
    fetchLimit: 90,
    tradingDays: null,
    barLabel: "Daily",
    seriesKind: "daily",
    lookbackDays: 220,
  },
} as const;

export const DAILY_SLICE = {
  "1M": 22,
  "3M": 66,
  "6M": 90,
} as const;

export const CHART_INTERVALS = ["1m", "5m", "15m", "1h", "1d"] as const;

export type ChartRange = keyof typeof CHART_RANGES;
export type ChartInterval = (typeof CHART_INTERVALS)[number];
export type ChartStyle =
  | "candles"
  | "hollow"
  | "bars"
  | "line"
  | "area"
  | "heikin";
export type ChartTool = "cursor" | "hline";

export type PlotBar = {
  ticker: string;
  interval: ChartInterval;
  barStart: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function seriesKey(symbol: string, interval: string) {
  return `${symbol}:${interval}`;
}

export function hydrateInitialSeries(initial: Record<string, NormalizedBar[]>) {
  const next: Record<string, NormalizedBar[]> = {};
  for (const [key, bars] of Object.entries(initial)) {
    next[key.includes(":") ? key : seriesKey(key, "1d")] = bars;
  }
  return next;
}

export function symbolsFromSeries(series: Record<string, NormalizedBar[]>) {
  return new Set(Object.keys(series).map((key) => key.split(":")[0] ?? key));
}

export function rangeStartIso(range: ChartRange): string {
  const days = CHART_RANGES[range].lookbackDays;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function fetchLimitFor(interval: ChartInterval, range: ChartRange) {
  if (interval === "1d") return 90;
  if (interval === "1h") return range === "6M" ? 2000 : 1200;
  return 2000;
}

export function intervalLabel(interval: ChartInterval) {
  if (interval === "1d") return "Daily bars";
  if (interval === "1h") return "60-minute bars";
  if (interval === "15m") return "15-minute bars";
  if (interval === "5m") return "5-minute bars";
  return "1-minute bars";
}

export function toPlotBars(bars: NormalizedBar[]): PlotBar[] {
  return bars.flatMap((bar) => {
    if (
      bar.open == null ||
      bar.high == null ||
      bar.low == null ||
      bar.close == null
    ) {
      return [];
    }
    return [
      {
        ticker: bar.ticker,
        interval: bar.interval,
        barStart: bar.barStart,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 0,
      },
    ];
  });
}

export function barsForRange(
  all: NormalizedBar[],
  range: ChartRange,
  interval: ChartInterval,
  extendedHours: boolean,
): PlotBar[] {
  const spec = CHART_RANGES[range];
  let sliced: NormalizedBar[];
  if (spec.tradingDays) {
    const regular = sliceLastTradingDays(all, spec.tradingDays, !extendedHours);
    sliced =
      regular.length >= 8 || extendedHours
        ? regular
        : sliceLastTradingDays(all, spec.tradingDays, false);
  } else if (interval === "1d") {
    sliced = all.slice(-DAILY_SLICE[range as keyof typeof DAILY_SLICE]);
  } else {
    const days = range === "1M" ? 22 : range === "3M" ? 66 : 90;
    sliced = sliceLastTradingDays(all, days, !extendedHours);
  }
  return toPlotBars(sliced);
}

export function sessionKeyFor(bar: PlotBar) {
  return chicagoDateKey(bar.barStart);
}
