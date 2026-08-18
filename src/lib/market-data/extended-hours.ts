import { absoluteChange, percentChange } from "@/lib/domain/market-math";
import type { YahooEquityQuote, YahooIntradayBar } from "@/lib/market-data/earnings/types";
import { computeSessionBaselines } from "@/lib/market-data/session-math";
import {
  NormalizedBarObservationSchema,
  type ExtendedMarketSession,
  type NormalizedBarObservation,
  type ProductSurface,
} from "@/lib/market-data/schemas";
import {
  inferUsEquitySession,
  isExtendedHoursSession,
} from "@/lib/market-data/us-session";
import { lookupWatchlistMap } from "@/lib/market-data/watchlist-assemble";

export { isExtendedHoursSession };

const IDLE_BPS = 5;

export function looksUnmovedFromClose(
  last: number | null | undefined,
  close: number | null | undefined,
  bps = IDLE_BPS,
): boolean {
  if (last == null || close == null) return true;
  if (!Number.isFinite(last) || !Number.isFinite(close) || close === 0) return true;
  return Math.abs(last - close) / Math.abs(close) < bps / 10_000;
}

type ExtendedQuoteFields = {
  ticker: string;
  last: number | null;
  priorClose?: number | null;
  changeAbsolute?: number | null;
  changePercent?: number | null;
  preMarketChangePercent?: number | null;
  afterHoursChangePercent?: number | null;
  coverageNotes?: string;
};

export type ExtendedSessionPercents = {
  preMarketChangePercent: number | null;
  afterHoursChangePercent: number | null;
};

type OverlayQuoteFields = {
  preMarketChangePercent?: number | null;
  afterHoursChangePercent?: number | null;
  coverageNotes?: string;
};

type PreviousSessionObservation = OverlayQuoteFields & {
  last?: number | null;
  priorClose?: number | null;
  changePercent?: number | null;
  marketSession?: ExtendedMarketSession;
};

function yahooForTicker(
  yahoo: Map<string, YahooEquityQuote>,
  ticker: string,
): YahooEquityQuote | undefined {
  return (
    yahoo.get(ticker) ??
    lookupWatchlistMap(yahoo, ticker) ??
    yahoo.get(ticker.toUpperCase())
  );
}

/**
 * When the primary feed (often IEX) still shows the prior close during
 * premarket or after-hours, overlay Yahoo's extended-hours last.
 */
export function overlayExtendedSessionQuotes<T extends ExtendedQuoteFields>(
  quotes: T[],
  yahoo: Map<string, YahooEquityQuote>,
  session: ExtendedMarketSession,
): Array<T & OverlayQuoteFields> {
  if (!yahoo.size || !isExtendedHoursSession(session)) return quotes;
  return quotes.map((quote) => {
    const hit = yahooForTicker(yahoo, quote.ticker);
    if (!hit) return quote;
    if (session === "afterhours") {
      const ahLast = hit.postMarketPrice ?? (hit.marketState === "POST" || hit.marketState === "POSTPOST" ? hit.price : null);
      const ahPct =
        hit.postMarketChangePercent ?? percentChange(ahLast, quote.priorClose);
      const next = {
        ...quote,
        afterHoursChangePercent: ahPct ?? quote.afterHoursChangePercent ?? null,
        preMarketChangePercent:
          hit.preMarketChangePercent ?? quote.preMarketChangePercent ?? null,
      };
      if (ahLast != null && looksUnmovedFromClose(quote.last, quote.priorClose)) {
        next.last = ahLast;
        next.changePercent = hit.changePercent ?? quote.changePercent;
        next.changeAbsolute = absoluteChange(ahLast, quote.priorClose);
        next.coverageNotes = appendNote(
          quote.coverageNotes,
          "After-hours last from Yahoo; primary feed had no extended print.",
        );
      }
      return next;
    }
    const preLast =
      hit.preMarketPrice ??
      (hit.marketState === "PRE" || hit.marketState === "PREPRE" ? hit.price : null);
    const prePct =
      hit.preMarketChangePercent ?? percentChange(preLast, quote.priorClose);
    const next = {
      ...quote,
      preMarketChangePercent: prePct ?? quote.preMarketChangePercent ?? quote.changePercent ?? null,
      afterHoursChangePercent: quote.afterHoursChangePercent ?? null,
    };
    if (preLast != null && looksUnmovedFromClose(quote.last, quote.priorClose)) {
      next.last = preLast;
      next.changePercent = prePct ?? hit.changePercent ?? quote.changePercent;
      next.changeAbsolute = absoluteChange(preLast, quote.priorClose);
      next.coverageNotes = appendNote(
        quote.coverageNotes,
        "Premarket last from Yahoo; primary feed had no extended print.",
      );
    }
    return next;
  });
}

export function withExtendedSessionPercents<T extends {
  last: number | null;
  priorClose?: number | null;
  officialClose?: number | null;
  dailyClose?: number | null;
  changePercent?: number | null;
  preMarketChangePercent?: number | null;
  afterHoursChangePercent?: number | null;
  marketSession: ExtendedMarketSession;
}>(
  obs: T,
  session: ExtendedMarketSession,
  previous?: PreviousSessionObservation | null,
): T & ExtendedSessionPercents {
  const official = obs.officialClose ?? obs.dailyClose ?? null;
  const baselines = computeSessionBaselines({
    session,
    last: obs.last,
    priorRegularClose: obs.priorClose,
    officialClose: official,
  });
  let pre = obs.preMarketChangePercent ?? null;
  let ah = obs.afterHoursChangePercent ?? null;
  if (session === "premarket" || session === "overnight") {
    pre = pre ?? baselines.vsPriorRegularClosePercent ?? obs.changePercent ?? null;
  }
  if (session === "afterhours") {
    ah = ah ?? baselines.afterHoursPercent ?? null;
  }
  if (
    pre == null &&
    previous?.preMarketChangePercent != null &&
    (session === "regular" || session === "afterhours")
  ) {
    pre = previous.preMarketChangePercent;
  }
  if (
    ah == null &&
    previous?.afterHoursChangePercent != null &&
    (session === "closed" || session === "overnight")
  ) {
    ah = previous.afterHoursChangePercent;
  }
  return {
    ...obs,
    marketSession: session,
    preMarketChangePercent: pre,
    afterHoursChangePercent: ah,
  };
}

export function mergeBarSeries<T extends { barStart: string }>(
  primary: T[],
  extra: T[],
  intervalMs: number,
): T[] {
  const byBucket = new Map<string, T>();
  const bucket = (iso: string) => {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || intervalMs <= 0) return iso;
    return new Date(Math.floor(ms / intervalMs) * intervalMs).toISOString();
  };
  for (const bar of extra) byBucket.set(bucket(bar.barStart), bar);
  for (const bar of primary) byBucket.set(bucket(bar.barStart), bar);
  return [...byBucket.values()].sort((a, b) => a.barStart.localeCompare(b.barStart));
}

const INTERVAL_MS: Record<"1m" | "5m" | "15m" | "1h" | "1d", number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

const YAHOO_CHART_SURFACES: ProductSurface[] = [
  "dashboard_display",
  "derived_charts",
];

export function yahooIntradayToNormalizedBars(
  symbol: string,
  interval: "1m" | "5m" | "15m" | "1h",
  bars: YahooIntradayBar[],
): NormalizedBarObservation[] {
  const ticker = symbol.toUpperCase();
  const now = new Date().toISOString();
  return bars.map((bar) =>
    NormalizedBarObservationSchema.parse({
      instrumentId: `yahoo:${ticker}`,
      ticker,
      interval,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume ?? null,
      barStart: bar.barStart,
      marketSession: inferUsEquitySession(new Date(bar.barStart)),
      providerName: "yahoo",
      providerTimestamp: bar.barStart,
      retrievalTimestamp: now,
      feedCoverage: "delayed_15m",
      latencyClass: "delayed_15m",
      licenseScopeId: "yahoo:public-chart",
      permittedSurfaces: YAHOO_CHART_SURFACES,
      valueKind: "normalized",
      currency: "USD",
      sourceQuality: "secondary",
      coverageNotes: "Yahoo Finance chart bars with includePrePost (delayed).",
    }),
  );
}

export function barIntervalMs(
  interval: "1m" | "5m" | "15m" | "1h" | "1d",
): number {
  return INTERVAL_MS[interval];
}

function appendNote(existing: string | undefined, note: string): string {
  if (!existing) return note;
  if (existing.includes(note)) return existing;
  return `${existing} ${note}`;
}
