import { fixturesEnabled } from "@/lib/api/http";
import { getEnv } from "@/lib/env";
import {
  getMarketDataCache,
  quoteObservationToLegacy,
} from "@/lib/market-data/cache";
import { licenseConfigFromEnv } from "@/lib/market-data/licensing";
import { createMarketDataRouter } from "@/lib/market-data/router";
import { latencyCoverageLabel } from "@/lib/market-data/schemas";
import { inferUsEquitySession } from "@/lib/market-data/us-session";
import { MockMarketDataProvider } from "@/lib/providers/mock/mock-market-data";
import type { NormalizedQuote } from "@/lib/providers/types";
import type { DailyClose, PositionQuote } from "./types";

const BARS_TTL_MS = 30 * 60 * 1000;
/** Coalesce rapid Positions polls; still well under the global stale-after window. */
const POSITION_QUOTE_TTL_MS = 10_000;
const BAR_LIMIT = 252;
const BAR_CONCURRENCY = 4;

type CacheEntry<T> = { expiresAt: number; value: T };

const barCache = new Map<string, CacheEntry<DailyClose[]>>();

type LiveQuoteBundle = {
  quotes: Map<string, PositionQuote>;
  asOf: string;
  feedCoverage: string;
  latencyClass: string;
  latencyCoverageLabel: string;
  marketSession: string | null;
};

const liveQuoteCache = new Map<string, CacheEntry<LiveQuoteBundle>>();

export type PositionMarketContext = {
  quotes: Map<string, PositionQuote>;
  closes: Map<string, DailyClose[]>;
  asOf: string;
  stale: boolean;
  latencyCoverageLabel: string;
  feedCoverage: string;
  latencyClass: string;
  marketSession: string | null;
  licenseWarning: string | null;
  error: string | null;
};

function quoteFromNormalized(
  quote: NormalizedQuote,
  stale = false,
): PositionQuote {
  return {
    ticker: quote.ticker.toUpperCase(),
    last: quote.last,
    priorClose: quote.priorClose ?? null,
    open: quote.open ?? null,
    changeAbsolute: quote.changeAbsolute ?? null,
    changePercent: quote.changePercent ?? null,
    currency: quote.currency ?? "USD",
    stale,
  };
}

function closesFromBars(
  bars: Array<{ barStart?: string; close?: number | null }>,
): DailyClose[] {
  const out: DailyClose[] = [];
  for (const bar of bars) {
    if (bar.close == null || !Number.isFinite(bar.close) || !bar.barStart) continue;
    out.push({ date: bar.barStart.slice(0, 10), close: bar.close });
  }
  return out;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) || 0 }, () => run()),
  );
  return results;
}

function quotesFromCache(tickers: string[]): Map<string, PositionQuote> {
  const cache = getMarketDataCache(getEnv());
  const quotes = new Map<string, PositionQuote>();
  for (const ticker of tickers) {
    const entry = cache.getQuote(ticker);
    if (entry?.observation.last == null) continue;
    quotes.set(
      ticker,
      quoteFromNormalized(quoteObservationToLegacy(entry.observation), entry.stale),
    );
  }
  return quotes;
}

async function loadLiveQuotes(tickers: string[]): Promise<{
  bundle: LiveQuoteBundle | null;
  error: string | null;
}> {
  const key = tickers.slice().sort().join(",");
  const now = Date.now();
  const cached = liveQuoteCache.get(key);
  if (cached && cached.expiresAt > now) {
    return { bundle: cached.value, error: null };
  }

  const router = createMarketDataRouter(getEnv());
  if (!router) {
    return { bundle: null, error: "No live market-data provider is configured." };
  }

  try {
    const batch = await router.fetchQuotes({
      symbols: tickers,
      surface: "server_calculations",
    });
    const quotes = new Map<string, PositionQuote>();
    for (const observation of batch.quotes) {
      if (observation.last == null) continue;
      quotes.set(
        observation.ticker.toUpperCase(),
        quoteFromNormalized(quoteObservationToLegacy(observation), false),
      );
    }
    const asOf = new Date().toISOString();
    const session = inferUsEquitySession();
    const bundle: LiveQuoteBundle = {
      quotes,
      asOf,
      feedCoverage: batch.feedCoverage,
      latencyClass: batch.latencyClass,
      latencyCoverageLabel: latencyCoverageLabel({
        feedCoverage: batch.feedCoverage,
        latencyClass: batch.latencyClass,
        marketSession: session,
      }),
      marketSession: session,
    };
    liveQuoteCache.set(key, {
      expiresAt: now + POSITION_QUOTE_TTL_MS,
      value: bundle,
    });
    return { bundle, error: null };
  } catch (error) {
    return {
      bundle: null,
      error:
        error instanceof Error
          ? error.message
          : "Live quotes could not be retrieved for this book.",
    };
  }
}

async function loadDailyCloses(tickers: string[]): Promise<Map<string, DailyClose[]>> {
  const closes = new Map<string, DailyClose[]>();
  const now = Date.now();
  const toFetch: string[] = [];
  for (const ticker of tickers) {
    const cached = barCache.get(`${ticker}:${BAR_LIMIT}`);
    if (cached && cached.expiresAt > now) {
      closes.set(ticker, cached.value);
    } else {
      toFetch.push(ticker);
    }
  }

  const router = createMarketDataRouter(getEnv());
  if (toFetch.length && router) {
    await mapPool(toFetch, BAR_CONCURRENCY, async (ticker) => {
      try {
        const batch = await router.fetchBars({
          symbol: ticker,
          interval: "1d",
          limit: BAR_LIMIT,
          surface: "server_calculations",
        });
        const daily = closesFromBars(batch.bars);
        barCache.set(`${ticker}:${BAR_LIMIT}`, {
          expiresAt: now + BARS_TTL_MS,
          value: daily,
        });
        closes.set(ticker, daily);
      } catch {
        closes.set(ticker, []);
      }
    });
  } else {
    for (const ticker of toFetch) closes.set(ticker, []);
  }

  return closes;
}

export async function loadPositionMarketContext(
  symbols: string[],
  options: { includeBars?: boolean } = {},
): Promise<PositionMarketContext> {
  const unique = [
    ...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
  ];
  const includeBars = options.includeBars !== false;
  const env = getEnv();
  const license = licenseConfigFromEnv(env);
  const licenseWarning =
    license.scope === "single_user_development"
      ? "License scope is single_user_development — shared production surfaces are not authorized."
      : null;
  const session = inferUsEquitySession();

  if (unique.length === 0) {
    return {
      quotes: new Map(),
      closes: new Map(),
      asOf: new Date().toISOString(),
      stale: false,
      latencyCoverageLabel: fixturesEnabled()
        ? "Mock data"
        : "Flat · no live marks required",
      feedCoverage: "unknown",
      latencyClass: fixturesEnabled() ? "mock" : "unavailable",
      marketSession: session,
      licenseWarning,
      error: null,
    };
  }

  if (fixturesEnabled()) {
    const provider = new MockMarketDataProvider();
    const quotes = await provider.getQuotes(unique);
    const closes = new Map<string, DailyClose[]>();
    if (includeBars) {
      await mapPool(unique, BAR_CONCURRENCY, async (ticker) => {
        const bars = await provider.getTimeSeries({
          symbol: ticker,
          interval: "1d",
          limit: BAR_LIMIT,
        });
        closes.set(ticker, closesFromBars(bars));
      });
    }
    return {
      quotes: new Map(
        quotes.map((quote) => [quote.ticker.toUpperCase(), quoteFromNormalized(quote)]),
      ),
      closes,
      asOf: new Date().toISOString(),
      stale: false,
      latencyCoverageLabel: "Mock data",
      feedCoverage: "unknown",
      latencyClass: "mock",
      marketSession: "regular",
      licenseWarning,
      error: null,
    };
  }

  const live = await loadLiveQuotes(unique);
  const closes = includeBars ? await loadDailyCloses(unique) : new Map<string, DailyClose[]>();

  if (live.bundle) {
    const covered = unique.filter(
      (ticker) => live.bundle!.quotes.get(ticker)?.last != null,
    ).length;
    // Fill gaps from the shared cache only when the live batch missed a name.
    if (covered < unique.length) {
      const fallback = quotesFromCache(unique);
      for (const ticker of unique) {
        if (live.bundle.quotes.has(ticker)) continue;
        const cached = fallback.get(ticker);
        if (cached) live.bundle.quotes.set(ticker, cached);
      }
    }
    const coveredAfter = unique.filter(
      (ticker) => live.bundle!.quotes.get(ticker)?.last != null,
    ).length;
    const stale = [...live.bundle.quotes.values()].some((quote) => quote.stale);
    return {
      quotes: live.bundle.quotes,
      closes,
      asOf: live.bundle.asOf,
      stale,
      latencyCoverageLabel:
        coveredAfter === 0
          ? "No live marks"
          : live.bundle.latencyCoverageLabel || "Partial coverage",
      feedCoverage: live.bundle.feedCoverage,
      latencyClass: coveredAfter === 0 ? "unavailable" : live.bundle.latencyClass,
      marketSession: live.bundle.marketSession ?? session,
      licenseWarning,
      error:
        coveredAfter === 0
          ? "No live marks are available for this book. Cost basis remains visible; P&L stays blank until quotes arrive."
          : coveredAfter < unique.length
            ? `Partial coverage · ${coveredAfter} of ${unique.length} open`
            : null,
    };
  }

  // Live fetch failed — serve last cache values and surface the stale banner.
  const cache = getMarketDataCache(env);
  const meta = cache.getMeta();
  const quotes = quotesFromCache(unique);
  const covered = unique.filter((ticker) => quotes.get(ticker)?.last != null).length;
  const noMarks = unique.length > 0 && covered === 0;
  const anyStale = [...quotes.values()].some((quote) => quote.stale) || covered > 0;
  return {
    quotes,
    closes,
    asOf: meta.lastSuccessfulRefreshAt ?? new Date().toISOString(),
    stale: anyStale || noMarks,
    latencyCoverageLabel:
      meta.latencyCoverageLabel || (noMarks ? "Unavailable" : "Partial coverage"),
    feedCoverage: meta.feedCoverage,
    latencyClass: noMarks ? "unavailable" : "stale",
    marketSession: meta.marketSession ?? session,
    licenseWarning,
    error:
      live.error ??
      (noMarks
        ? "No live marks are available for this book. Cost basis remains visible; P&L stays blank until quotes arrive."
        : covered < unique.length
          ? `Partial coverage · ${covered} of ${unique.length} symbols`
          : "Serving last cached marks after a live refresh failure."),
  };
}
