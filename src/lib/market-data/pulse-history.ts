import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  CHICAGO_TZ,
  chicagoDateKey,
  isUsRegularSession,
} from "@/lib/market-data/bars-window";
import {
  calculateMarketPulse,
  PULSE_INPUT_SYMBOLS,
  type MarketPulseRegime,
} from "@/lib/market-data/market-pulse";
import type { NormalizedQuote } from "@/lib/providers/types";

export const PULSE_HISTORY_RANGES = [
  "1D",
  "WTD",
  "MTD",
  "5D",
  "15D",
  "30D",
] as const;

export type PulseHistoryRange = (typeof PULSE_HISTORY_RANGES)[number];

/** Same frozen set as live Pulse. Do not fetch a different basket. */
export const PULSE_HISTORY_SYMBOLS = PULSE_INPUT_SYMBOLS;

export type PulseHistoryBar = {
  barStart: string;
  close: number | null;
};

export type PulseHistoryPoint = {
  at: string;
  score: number | null;
  provisional: boolean;
  coverage: number;
  regime: MarketPulseRegime;
  positiveCount: number;
  comparableCount: number;
};

export type PulseHistorySpec = {
  range: PulseHistoryRange;
  mode: "session" | "daily";
  interval: "5m" | "15m" | "1h" | "1d";
  start: string;
  limit: number;
  fromDate: string | null;
  takeLast: number | null;
  /** Exclusive upper bound for 1D 5m stamps (usually now). */
  through: string | null;
};

const NY_TZ = "America/New_York";

/** Session date for a daily bar. Midnight-UTC stamps must not shift back a Chicago day. */
export function tradingDateKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return chicagoDateKey(iso);
  if (date.getUTCHours() < 12) return date.toISOString().slice(0, 10);
  return formatInTimeZone(date, NY_TZ, "yyyy-MM-dd");
}

function addChicagoDays(yyyyMmDd: string, days: number): string {
  const noon = fromZonedTime(`${yyyyMmDd}T12:00:00`, CHICAGO_TZ);
  noon.setUTCDate(noon.getUTCDate() + days);
  return formatInTimeZone(noon, CHICAGO_TZ, "yyyy-MM-dd");
}

export function chicagoWeekStart(now = new Date()): string {
  const date = formatInTimeZone(now, CHICAGO_TZ, "yyyy-MM-dd");
  const weekday = Number(formatInTimeZone(now, CHICAGO_TZ, "i"));
  return addChicagoDays(date, 1 - weekday);
}

export function chicagoMonthStart(now = new Date()): string {
  return formatInTimeZone(now, CHICAGO_TZ, "yyyy-MM-01");
}

/**
 * NY session date for 1D reconstruction. Before the open (and on weekends)
 * this is the prior weekday so Pulse Path is not an empty Saturday/premarket
 * tape with a live overlay painted across the chart.
 */
export function pulseSessionDate(now = new Date()): string {
  let date = formatInTimeZone(now, NY_TZ, "yyyy-MM-dd");
  const open = fromZonedTime(`${date}T09:30:00`, NY_TZ);
  if (now.getTime() < open.getTime()) {
    date = addChicagoDays(date, -1);
  }
  for (let step = 0; step < 7; step += 1) {
    const weekday = Number(
      formatInTimeZone(
        fromZonedTime(`${date}T12:00:00`, NY_TZ),
        NY_TZ,
        "i",
      ),
    );
    if (weekday >= 1 && weekday <= 5) return date;
    date = addChicagoDays(date, -1);
  }
  return date;
}

export function pulseHistorySpec(
  range: PulseHistoryRange,
  now = new Date(),
): PulseHistorySpec {
  if (range === "1D") {
    const sessionDate = pulseSessionDate(now);
    return {
      range,
      mode: "session",
      interval: "5m",
      // Include the prior session so each 5m print can be scored vs that close.
      start: fromZonedTime(`${addChicagoDays(sessionDate, -4)}T08:00:00`, CHICAGO_TZ).toISOString(),
      limit: 400,
      fromDate: sessionDate,
      takeLast: null,
      through: now.toISOString(),
    };
  }
  if (range === "WTD") {
    const fromDate = chicagoWeekStart(now);
    return {
      range,
      mode: "session",
      interval: "15m",
      start: fromZonedTime(`${addChicagoDays(fromDate, -4)}T08:00:00`, CHICAGO_TZ).toISOString(),
      limit: 220,
      fromDate,
      takeLast: null,
      through: now.toISOString(),
    };
  }
  if (range === "MTD") {
    const fromDate = chicagoMonthStart(now);
    return {
      range,
      mode: "session",
      interval: "1h",
      // Prior sessions so each 1h print can be scored vs that day's prior close.
      start: fromZonedTime(`${addChicagoDays(fromDate, -10)}T08:00:00`, CHICAGO_TZ).toISOString(),
      // ~22 RTH days × ~7 hourly bars + prior-session lookback.
      limit: 350,
      fromDate,
      takeLast: null,
      through: now.toISOString(),
    };
  }
  const takeLast = range === "5D" ? 5 : range === "15D" ? 15 : 30;
  return {
    range,
    mode: "daily",
    interval: "1d",
    start: new Date(now.getTime() - (takeLast + 18) * 86_400_000).toISOString(),
    limit: takeLast + 12,
    fromDate: null,
    takeLast,
    through: now.toISOString(),
  };
}

const RTH_STEP_MS: Record<"5m" | "15m", number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
};

/** Regular-session bar starts on a NY trading date, up to `through` (exclusive of the close). */
export function regularSessionStamps(
  dateKey: string,
  interval: "5m" | "15m",
  through?: string | Date | null,
): string[] {
  const step = RTH_STEP_MS[interval];
  const open = fromZonedTime(`${dateKey}T09:30:00`, NY_TZ);
  const close = fromZonedTime(`${dateKey}T16:00:00`, NY_TZ);
  const capMs = through
    ? Math.min(close.getTime(), new Date(through).getTime())
    : close.getTime();
  const stamps: string[] = [];
  for (let ms = open.getTime(); ms < capMs; ms += step) {
    stamps.push(new Date(ms).toISOString());
  }
  return stamps;
}

function syntheticQuote(
  ticker: string,
  changePercent: number,
  at: string,
): NormalizedQuote {
  return {
    instrumentId: `pulse-hist:${ticker}`,
    ticker,
    last: 100,
    changePercent,
    marketSession: "regular",
    providerName: "derived",
    providerTimestamp: at,
    retrievalTimestamp: at,
    delayStatus: "unknown",
    sourceQuality: "secondary",
    currency: "USD",
    coverageNotes:
      "Reconstructed pulse point from verified proxy bars. Not a stored live print.",
  };
}

function scoreQuotes(quotes: NormalizedQuote[], at: string): PulseHistoryPoint {
  const result = calculateMarketPulse({
    quotes,
    asOf: at,
    marketSession: "regular",
    latencyClass: "realtime",
    feedCoverage: "iex",
    now: new Date(at),
  });
  const raw =
    50 +
    result.drivers.reduce((sum, driver) => sum + (driver.contribution ?? 0), 0);
  const fallback = Math.round(Math.min(100, Math.max(0, raw)));
  return {
    at,
    score: result.score ?? (result.comparableCount >= 2 ? fallback : null),
    provisional: result.score == null,
    coverage: result.coverage,
    regime: result.regime,
    positiveCount: result.positiveCount,
    comparableCount: result.comparableCount,
  };
}

function sortedBars(bars: PulseHistoryBar[]) {
  return [...bars]
    .filter((bar) => bar.close != null && Number.isFinite(bar.close))
    .sort((a, b) => Date.parse(a.barStart) - Date.parse(b.barStart));
}

function sessionTimes(
  prepared: Array<{ symbol: string; bars: PulseHistoryBar[] }>,
  spec: PulseHistorySpec,
): string[] {
  if (spec.range === "1D" && spec.fromDate) {
    const lastBar = prepared.reduce((latest, item) => {
      const at = item.bars.at(-1)?.barStart;
      if (!at) return latest;
      return !latest || Date.parse(at) > Date.parse(latest) ? at : latest;
    }, spec.through);
    return regularSessionStamps(
      spec.fromDate,
      spec.interval === "15m" ? "15m" : "5m",
      spec.through ?? lastBar,
    );
  }

  const stamps = new Set<string>();
  for (const item of prepared) {
    for (const bar of item.bars) {
      if (!isUsRegularSession(bar.barStart)) continue;
      const day = tradingDateKey(bar.barStart);
      if (spec.fromDate && day < spec.fromDate) continue;
      stamps.add(bar.barStart);
    }
  }
  return [...stamps].sort((a, b) => Date.parse(a) - Date.parse(b));
}

export function reconstructPulseHistory(
  series: Record<string, PulseHistoryBar[]>,
  spec: PulseHistorySpec,
): PulseHistoryPoint[] {
  const symbols = Object.keys(series);
  if (!symbols.length) return [];

  let points: PulseHistoryPoint[] = [];
  if (spec.mode === "daily") {
    const bySymbolDate = new Map<string, Map<string, number>>();
    const dates = new Set<string>();
    for (const symbol of symbols) {
      const map = new Map<string, number>();
      for (const bar of sortedBars(series[symbol] ?? [])) {
        const key = tradingDateKey(bar.barStart);
        map.set(key, bar.close as number);
        dates.add(key);
      }
      bySymbolDate.set(symbol, map);
    }
    const ordered = [...dates].sort();
    for (let index = 1; index < ordered.length; index += 1) {
      const date = ordered[index]!;
      const prior = ordered[index - 1]!;
      const at = fromZonedTime(`${date}T15:00:00`, CHICAGO_TZ).toISOString();
      const quotes: NormalizedQuote[] = [];
      for (const symbol of symbols) {
        const closes = bySymbolDate.get(symbol);
        const last = closes?.get(date);
        const prev = closes?.get(prior);
        if (last == null || prev == null || prev === 0) continue;
        quotes.push(syntheticQuote(symbol, ((last - prev) / prev) * 100, at));
      }
      if (quotes.length) points.push(scoreQuotes(quotes, at));
    }
  } else {
    const prepared = symbols.map((symbol) => ({
      symbol,
      bars: sortedBars(series[symbol] ?? []),
    }));
    const times = sessionTimes(prepared, spec);
    for (const at of times) {
      const t = Date.parse(at);
      const day = tradingDateKey(at);
      const quotes: NormalizedQuote[] = [];
      for (const item of prepared) {
        let prior: number | null = null;
        let close: number | null = null;
        for (const bar of item.bars) {
          const barDay = tradingDateKey(bar.barStart);
          if (barDay < day) prior = bar.close;
          else if (barDay === day && Date.parse(bar.barStart) <= t) close = bar.close;
          else if (Date.parse(bar.barStart) > t) break;
        }
        if (prior == null || prior === 0 || close == null) continue;
        quotes.push(
          syntheticQuote(item.symbol, ((close - prior) / prior) * 100, at),
        );
      }
      if (quotes.length) points.push(scoreQuotes(quotes, at));
    }
  }

  if (spec.fromDate) {
    const keepPriorDay = spec.range !== "1D";
    const first = points.findIndex(
      (point) => tradingDateKey(point.at) >= spec.fromDate!,
    );
    if (first === -1) points = [];
    else points = points.slice(keepPriorDay ? Math.max(0, first - 1) : first);
  }
  if (spec.takeLast != null) points = points.slice(-spec.takeLast);
  return points.filter((point) => point.score != null);
}
