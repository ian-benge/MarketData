import { isDemoAuthEnabled } from "@/lib/auth/demo";
import type { Env } from "@/lib/env";
import { fetchAlphaVantageEarningsCalendar } from "@/lib/market-data/earnings/alpha-vantage";
import {
  logEarningsDiagnostics,
  sanitizeEarningsError,
} from "@/lib/market-data/earnings/diagnostics";
import { fixtureEarningsSnapshot } from "@/lib/market-data/earnings/fixtures";
import { classifyLargeCapLiquidity } from "@/lib/market-data/earnings/filter";
import { fetchFinnhubEarningsCalendar } from "@/lib/market-data/earnings/finnhub";
import {
  atmStraddleMove,
  isoFromUnixSeconds,
  pickEarningsExpiry,
} from "@/lib/market-data/earnings/implied-move";
import { mergeCalendarEvents } from "@/lib/market-data/earnings/merge";
import { LastGoodCache } from "@/lib/market-data/earnings/source-cache";
import { toYahooSymbol } from "@/lib/market-data/earnings/symbols";
import {
  ALPHA_VANTAGE_CALENDAR_TTL_MS,
  EARNINGS_REFRESH_MS,
  FINNHUB_CALENDAR_TTL_MS,
  IMPLIED_MOVE_BUDGET,
  QUOTE_ENRICHMENT_BUDGET,
  YAHOO_OPTIONS_TTL_MS,
  YAHOO_QUOTE_TTL_MS,
  emptyCalendarMeta,
  type CalendarParseDiagnostics,
  type CalendarSourceEvent,
  type EarningsCalendarEvent,
  type EarningsCalendarSnapshot,
  type EarningsImpliedMove,
  type EarningsOptionsStatus,
  type EarningsSession,
  type MergedCalendarEvent,
  type YahooEquityQuote,
  type YahooOptionChain,
} from "@/lib/market-data/earnings/types";
import {
  earningsCoverageWindow,
  earningsProviderFetchWindow,
  isDateInInclusiveWindow,
} from "@/lib/market-data/earnings/window";
import {
  fetchYahooEquityQuotes,
  fetchYahooOptionChain,
} from "@/lib/market-data/earnings/yahoo";

export type EarningsPipelineDeps = {
  now?: Date;
  useFixtures?: boolean;
  bypassAssembledCache?: boolean;
  forceCalendarRefresh?: boolean;
  finnhubFetch?: typeof fetch;
  alphaVantageFetch?: typeof fetch;
  fetchQuotes?: (symbols: string[]) => Promise<Map<string, YahooEquityQuote>>;
  fetchOptionChain?: (
    symbol: string,
    expirationUnix?: number,
  ) => Promise<YahooOptionChain | null>;
};

type QuoteCache = {
  expiresAt: number;
  quotes: Map<string, YahooEquityQuote>;
};

type OptionCacheEntry = {
  expiresAt: number;
  chain: YahooOptionChain | null;
};

const emptyDiagnostics = (): CalendarParseDiagnostics => ({
  rawRows: 0,
  parsed: 0,
  emptySymbol: 0,
  invalidDate: 0,
  parseFailures: 0,
});

const finnhubCache = new LastGoodCache<CalendarSourceEvent[]>(
  FINNHUB_CALENDAR_TTL_MS,
  (events) => events.length,
  () => [],
);
const alphaVantageCache = new LastGoodCache<CalendarSourceEvent[]>(
  ALPHA_VANTAGE_CALENDAR_TTL_MS,
  (events) => events.length,
  () => [],
);

let quoteCache: QuoteCache | null = null;
const optionCache = new Map<string, OptionCacheEntry>();
let assembledCache: {
  expiresAt: number;
  payload: EarningsCalendarSnapshot;
} | null = null;
let assembledInflight: Promise<EarningsCalendarSnapshot> | null = null;
let lastParse = {
  finnhub: emptyDiagnostics(),
  alphaVantage: emptyDiagnostics(),
};

export function resetEarningsCalendarCache() {
  finnhubCache.reset();
  alphaVantageCache.reset();
  quoteCache = null;
  optionCache.clear();
  assembledCache = null;
  assembledInflight = null;
  lastParse = { finnhub: emptyDiagnostics(), alphaVantage: emptyDiagnostics() };
}

function surprise(actual: number | null | undefined, estimate: number | null | undefined) {
  if (actual == null || estimate == null) return null;
  return Math.round((actual - estimate) * 10000) / 10000;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) || 0 }, () => worker()),
  );
  return results;
}

/**
 * Options budget ranking: nearest report date, then known size/liquidity, then volume.
 */
export function optionsPriority(
  event: MergedCalendarEvent,
  quote: YahooEquityQuote | undefined,
  todayIso: string,
): number {
  const dayGap = Math.abs(
    (Date.parse(`${event.reportDate}T00:00:00.000Z`) -
      Date.parse(`${todayIso}T00:00:00.000Z`)) /
      86_400_000,
  );
  const near = Number.isFinite(dayGap) ? Math.max(0, 1_000_000 - dayGap * 10_000) : 0;
  const liquidity = quote
    ? classifyLargeCapLiquidity(quote)
    : "unknown_size";
  const knownSize = quote?.marketCap != null ? 100_000 : 0;
  const liquidBonus = liquidity === "liquid_large_cap" ? 50_000 : 0;
  return near + knownSize + liquidBonus + (quote?.avgVolume ?? 0);
}

async function impliedForEvent(
  ticker: string,
  reportDate: string,
  session: EarningsSession,
  fetchChain: NonNullable<EarningsPipelineDeps["fetchOptionChain"]>,
): Promise<EarningsImpliedMove | null> {
  const yahooSymbol = toYahooSymbol(ticker);
  const nearest = await fetchChain(yahooSymbol);
  if (!nearest) return null;
  const expiry = pickEarningsExpiry(nearest.expirationDates, reportDate, session);
  const chain =
    expiry != null && expiry !== nearest.expiration
      ? ((await fetchChain(yahooSymbol, expiry)) ?? nearest)
      : nearest;
  const spot = chain.quote.price;
  if (spot == null) return null;
  const move = atmStraddleMove(spot, chain.calls, chain.puts);
  const usedExpiry = chain.expiration ?? expiry;
  if (!move || usedExpiry == null) return null;
  return {
    percent: move.percent,
    dollars: move.dollars,
    strike: move.strike,
    callMid: move.callMid,
    putMid: move.putMid,
    straddle: move.straddle,
    expiry: isoFromUnixSeconds(usedExpiry),
    spot,
    source: "yahoo_options",
  };
}

function coverageNotes(event: MergedCalendarEvent, implied: EarningsImpliedMove | null) {
  const names = event.sources
    .map((source) => (source === "finnhub" ? "Finnhub" : "Alpha Vantage"))
    .join(" + ");
  const timing =
    event.sources.includes("finnhub") && event.session !== "unknown"
      ? " Session from Finnhub when Alpha Vantage omits timing."
      : "";
  const conflict = event.conflicted
    ? ` Providers disagree on the report date (showing ${event.reportDate}${event.alternativeReportDate ? `; also ${event.alternativeReportDate}` : ""}).`
    : "";
  const move = implied
    ? " Implied move is the ATM call+put mid over spot from delayed Yahoo options. Not a licensed OPRA feed."
    : " Implied move withheld — no usable delayed options chain.";
  return `Estimates from ${names}.${timing}${conflict}${move} Not affiliated with Earnings Whispers.`;
}

export function toPublicEvent(
  raw: MergedCalendarEvent,
  extras: {
    companyName: string | null;
    lastPrice: number | null;
    marketCap: number | null;
    avgVolume: number | null;
    impliedMove: EarningsImpliedMove | null;
    quoteStatus: "succeeded" | "missing";
    optionsStatus: EarningsOptionsStatus;
  },
): EarningsCalendarEvent {
  return {
    id: raw.id,
    ticker: raw.canonicalSymbol,
    companyName: extras.companyName ?? raw.companyName ?? null,
    reportDate: raw.reportDate,
    session: raw.session,
    fiscalPeriod: raw.fiscalPeriod,
    epsEstimate: raw.epsEstimate,
    epsActual: raw.epsActual,
    epsSurprise: surprise(raw.epsActual, raw.epsEstimate),
    revenueEstimate: raw.revenueEstimate,
    revenueActual: raw.revenueActual,
    lastPrice: extras.lastPrice,
    marketCap: extras.marketCap,
    avgVolume: extras.avgVolume,
    impliedMove: extras.impliedMove,
    coverageNotes: coverageNotes(raw, extras.impliedMove),
    sources: raw.sources,
    providerTickers: raw.providerTickers,
    alternativeReportDate: raw.alternativeReportDate,
    conflicted: raw.conflicted,
    confidence: raw.confidence,
    quoteStatus: extras.quoteStatus,
    optionsStatus: extras.optionsStatus,
  };
}

function lookupQuote(
  quotes: Map<string, YahooEquityQuote>,
  canonical: string,
): YahooEquityQuote | undefined {
  return quotes.get(canonical) ?? quotes.get(toYahooSymbol(canonical));
}

export function assembleEarningsSnapshot(input: {
  now?: Date;
  finnhub: {
    configured: boolean;
    ok: boolean;
    stale: boolean;
    fetchedAt: string | null;
    error: string | null;
    events: CalendarSourceEvent[];
    diagnostics?: CalendarParseDiagnostics;
  };
  alphaVantage: {
    configured: boolean;
    ok: boolean;
    stale: boolean;
    fetchedAt: string | null;
    error: string | null;
    events: CalendarSourceEvent[];
    diagnostics?: CalendarParseDiagnostics;
  };
  quotes: Map<string, YahooEquityQuote>;
  quoteAttempted?: number;
  quoteTargetSymbols?: string[];
  impliedBySymbol: Map<string, EarningsImpliedMove | null>;
  optionsAttempted: Set<string>;
  usingFixtures?: boolean;
}): EarningsCalendarSnapshot {
  const now = input.now ?? new Date();
  const window = earningsCoverageWindow(now);
  const finnhubInWindow = input.finnhub.events.filter((event) =>
    isDateInInclusiveWindow(event.reportDate, window.from, window.to),
  );
  const alphaInWindow = input.alphaVantage.events.filter((event) =>
    isDateInInclusiveWindow(event.reportDate, window.from, window.to),
  );
  const { events: inWindow, stats } = mergeCalendarEvents(
    finnhubInWindow,
    alphaInWindow,
  );

  const events = inWindow.map((event) => {
    const quote = lookupQuote(input.quotes, event.canonicalSymbol);
    const implied = input.impliedBySymbol.get(event.canonicalSymbol) ?? null;
    const attempted = input.optionsAttempted.has(event.canonicalSymbol);
    const optionsStatus: EarningsOptionsStatus = implied
      ? "succeeded"
      : attempted
        ? "attempted_unavailable"
        : "skipped_budget";
    return toPublicEvent(event, {
      companyName: quote?.name ?? event.companyName ?? null,
      lastPrice: quote?.price ?? null,
      marketCap: quote?.marketCap ?? null,
      avgVolume: quote?.avgVolume ?? null,
      impliedMove: implied,
      quoteStatus: quote ? "succeeded" : "missing",
      optionsStatus,
    });
  });

  events.sort((a, b) => {
    const date = a.reportDate.localeCompare(b.reportDate);
    if (date !== 0) return date;
    return a.ticker.localeCompare(b.ticker);
  });

  const fhDiag = input.finnhub.diagnostics ?? emptyDiagnostics();
  const avDiag = input.alphaVantage.diagnostics ?? emptyDiagnostics();
  const attemptedSymbols = input.quoteTargetSymbols
    ? new Set(input.quoteTargetSymbols)
    : null;
  const quoteAttempted = attemptedSymbols?.size ?? input.quoteAttempted ?? inWindow.length;
  const quoteSucceeded = events.filter((event) => {
    if (event.quoteStatus !== "succeeded") return false;
    if (attemptedSymbols && !attemptedSymbols.has(event.ticker)) {
      return false;
    }
    return true;
  }).length;
  const live = input.finnhub.ok || input.alphaVantage.ok || events.length > 0;
  const bothUnconfigured = !input.finnhub.configured && !input.alphaVantage.configured;
  const source = input.usingFixtures
    ? "mock"
    : live
      ? "live"
      : "unavailable";
  const sourceLabel = input.usingFixtures
    ? "Mock earnings"
    : input.finnhub.configured && input.alphaVantage.configured
      ? "Finnhub + Alpha Vantage"
      : input.finnhub.configured
        ? "Finnhub earnings calendar"
        : input.alphaVantage.configured
          ? "Alpha Vantage earnings calendar"
          : "Unavailable";
  const errors = [input.finnhub.error, input.alphaVantage.error].filter(Boolean);
  const stale = input.finnhub.stale || input.alphaVantage.stale;

  const snapshot: EarningsCalendarSnapshot = {
    asOf: now.toISOString(),
    source,
    sourceLabel,
    attribution: input.usingFixtures
      ? "DEMO mock earnings — not live estimates or options. For local development only."
      : "Union of Finnhub and Alpha Vantage earnings calendars. Implied move = ATM straddle / spot from delayed Yahoo options for the most active near-term names. Not OPRA. Not affiliated with Earnings Whispers.",
    refreshSeconds: EARNINGS_REFRESH_MS / 1000,
    windowStart: window.from,
    windowEnd: window.to,
    events,
    scanned: input.finnhub.events.length + input.alphaVantage.events.length,
    error: bothUnconfigured
      ? "Earnings calendar needs FINNHUB_API_KEY and/or ALPHA_VANTAGE_API_KEY."
      : errors.length
        ? errors.join(" ")
        : null,
    stale,
    meta: {
      requestedWindow: window,
      sources: {
        finnhub: {
          configured: input.finnhub.configured,
          ok: input.finnhub.ok,
          eventCount: finnhubInWindow.length,
          fetchedAt: input.finnhub.fetchedAt,
          stale: input.finnhub.stale,
          error: input.finnhub.error,
        },
        alphaVantage: {
          configured: input.alphaVantage.configured,
          ok: input.alphaVantage.ok,
          eventCount: alphaInWindow.length,
          fetchedAt: input.alphaVantage.fetchedAt,
          stale: input.alphaVantage.stale,
          error: input.alphaVantage.error,
        },
      },
      merge: stats,
      enrichment: {
        quoteAttempted,
        quoteSucceeded,
        optionsBudget: IMPLIED_MOVE_BUDGET,
        optionsAttempted: input.optionsAttempted.size,
        expectedMoveSucceeded: events.filter((event) => event.impliedMove != null).length,
      },
      filtering: {
        serverRowsRemoved: 0,
        emptySymbol: fhDiag.emptySymbol + avDiag.emptySymbol,
        invalidDate: fhDiag.invalidDate + avDiag.invalidDate,
        parseFailures: fhDiag.parseFailures + avDiag.parseFailures,
      },
      usingFixtures: Boolean(input.usingFixtures),
    },
  };
  return snapshot;
}

async function loadQuotes(
  symbols: string[],
  deps: EarningsPipelineDeps,
): Promise<Map<string, YahooEquityQuote>> {
  if (quoteCache && quoteCache.expiresAt > Date.now()) {
    return quoteCache.quotes;
  }
  const fetchQuotes = deps.fetchQuotes ?? fetchYahooEquityQuotes;
  let quotes = new Map<string, YahooEquityQuote>();
  try {
    quotes = await fetchQuotes(symbols);
  } catch {
    quotes = quoteCache?.quotes ?? new Map();
  }
  quoteCache = { expiresAt: Date.now() + YAHOO_QUOTE_TTL_MS, quotes };
  return quotes;
}

async function loadImpliedMoves(
  targets: MergedCalendarEvent[],
  deps: EarningsPipelineDeps,
): Promise<Map<string, EarningsImpliedMove | null>> {
  const fetchChain =
    deps.fetchOptionChain ??
    (async (symbol: string, expirationUnix?: number) => {
      const cacheKey = `${symbol}:${expirationUnix ?? "nearest"}`;
      const cached = optionCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return cached.chain;
      const chain = await fetchYahooOptionChain(symbol, expirationUnix);
      optionCache.set(cacheKey, {
        expiresAt: Date.now() + YAHOO_OPTIONS_TTL_MS,
        chain,
      });
      return chain;
    });

  const impliedByTicker = new Map<string, EarningsImpliedMove | null>();
  await mapPool(targets, 6, async (event) => {
    try {
      impliedByTicker.set(
        event.canonicalSymbol,
        await impliedForEvent(
          event.canonicalSymbol,
          event.reportDate,
          event.session,
          fetchChain,
        ),
      );
    } catch {
      impliedByTicker.set(event.canonicalSymbol, null);
    }
    return null;
  });
  return impliedByTicker;
}

async function loadLive(
  env: Env,
  deps: EarningsPipelineDeps,
): Promise<EarningsCalendarSnapshot> {
  const now = deps.now ?? new Date();
  const window = earningsCoverageWindow(now);
  const fetchWindow = earningsProviderFetchWindow(window);

  const [finnhub, alphaVantage] = await Promise.all([
    finnhubCache.resolve({
      configured: Boolean(env.FINNHUB_API_KEY),
      notConfiguredError: "FINNHUB_API_KEY is not set",
      force: deps.forceCalendarRefresh,
      load: async () => {
        const parsed = await fetchFinnhubEarningsCalendar({
          apiKey: env.FINNHUB_API_KEY!,
          window: fetchWindow,
          fetchImpl: deps.finnhubFetch,
        });
        lastParse.finnhub = parsed.diagnostics;
        return parsed.events;
      },
    }),
    alphaVantageCache.resolve({
      configured: Boolean(env.ALPHA_VANTAGE_API_KEY),
      notConfiguredError: "ALPHA_VANTAGE_API_KEY is not set",
      force: deps.forceCalendarRefresh,
      load: async () => {
        const parsed = await fetchAlphaVantageEarningsCalendar({
          apiKey: env.ALPHA_VANTAGE_API_KEY!,
          fetchImpl: deps.alphaVantageFetch,
        });
        lastParse.alphaVantage = parsed.diagnostics;
        return parsed.events;
      },
    }),
  ]);

  const { events: merged } = mergeCalendarEvents(finnhub.data, alphaVantage.data);
  const inWindow = merged.filter((event) =>
    isDateInInclusiveWindow(event.reportDate, window.from, window.to),
  );
  const today = now.toISOString().slice(0, 10);
  const quoteTargets = [...inWindow]
    .sort(
      (a, b) =>
        optionsPriority(b, undefined, today) - optionsPriority(a, undefined, today),
    )
    .slice(0, QUOTE_ENRICHMENT_BUDGET);
  const quotes = await loadQuotes(
    quoteTargets.map((event) => event.canonicalSymbol),
    deps,
  );
  const ranked = [...inWindow].sort(
    (a, b) =>
      optionsPriority(b, lookupQuote(quotes, b.canonicalSymbol), today) -
      optionsPriority(a, lookupQuote(quotes, a.canonicalSymbol), today),
  );
  const budgeted = ranked.slice(0, IMPLIED_MOVE_BUDGET);
  const optionsAttempted = new Set(budgeted.map((event) => event.canonicalSymbol));
  const impliedBySymbol = await loadImpliedMoves(budgeted, deps);

  const snapshot = assembleEarningsSnapshot({
    now,
    finnhub: {
      configured: finnhub.configured,
      ok: finnhub.ok,
      stale: finnhub.stale,
      fetchedAt: finnhub.fetchedAt,
      error: finnhub.error,
      events: finnhub.data,
      diagnostics: lastParse.finnhub,
    },
    alphaVantage: {
      configured: alphaVantage.configured,
      ok: alphaVantage.ok,
      stale: alphaVantage.stale,
      fetchedAt: alphaVantage.fetchedAt,
      error: alphaVantage.error,
      events: alphaVantage.data,
      diagnostics: lastParse.alphaVantage,
    },
    quotes,
    quoteAttempted: quoteTargets.length,
    quoteTargetSymbols: quoteTargets.map((event) => event.canonicalSymbol),
    impliedBySymbol,
    optionsAttempted,
  });

  logEarningsDiagnostics({
    window,
    finnhub: snapshot.meta.sources.finnhub,
    alphaVantage: snapshot.meta.sources.alphaVantage,
    merge: snapshot.meta.merge,
    enrichment: snapshot.meta.enrichment,
    filtering: snapshot.meta.filtering,
    visible: snapshot.events.length,
    usingFixtures: false,
  });

  return snapshot;
}

function emptyUnavailable(env: Env, now: Date, error: string): EarningsCalendarSnapshot {
  const window = earningsCoverageWindow(now);
  return {
    asOf: now.toISOString(),
    source: "unavailable",
    sourceLabel: "Unavailable",
    attribution: "Earnings calendar refresh failed. Values are not invented.",
    refreshSeconds: EARNINGS_REFRESH_MS / 1000,
    windowStart: window.from,
    windowEnd: window.to,
    events: [],
    scanned: 0,
    error,
    stale: false,
    meta: {
      ...emptyCalendarMeta(window),
      sources: {
        finnhub: {
          configured: Boolean(env.FINNHUB_API_KEY),
          ok: false,
          eventCount: 0,
          fetchedAt: null,
          stale: false,
          error: env.FINNHUB_API_KEY ? error : "FINNHUB_API_KEY is not set",
        },
        alphaVantage: {
          configured: Boolean(env.ALPHA_VANTAGE_API_KEY),
          ok: false,
          eventCount: 0,
          fetchedAt: null,
          stale: false,
          error: env.ALPHA_VANTAGE_API_KEY ? error : "ALPHA_VANTAGE_API_KEY is not set",
        },
      },
    },
  };
}

export async function getEarningsCalendarSnapshot(
  env: Env,
  deps: EarningsPipelineDeps = {},
): Promise<EarningsCalendarSnapshot> {
  const useFixtures =
    env.NODE_ENV !== "production" &&
    (deps.useFixtures ?? isDemoAuthEnabled(env));
  if (useFixtures) {
    return fixtureEarningsSnapshot(deps.now);
  }
  if (
    !deps.bypassAssembledCache &&
    assembledCache &&
    assembledCache.expiresAt > Date.now()
  ) {
    return assembledCache.payload;
  }
  if (assembledInflight) return assembledInflight;

  const pending = loadLive(env, deps)
    .then((payload) => {
      assembledCache = { expiresAt: Date.now() + EARNINGS_REFRESH_MS, payload };
      return payload;
    })
    .catch((error): EarningsCalendarSnapshot => {
      if (assembledCache) {
        return {
          ...assembledCache.payload,
          stale: true,
          error: sanitizeEarningsError(
            error instanceof Error
              ? error.message
              : "Earnings refresh failed; showing last valid snapshot.",
          ),
        };
      }
      return emptyUnavailable(
        env,
        deps.now ?? new Date(),
        sanitizeEarningsError(
          error instanceof Error ? error.message : "Earnings refresh failed.",
        ),
      );
    })
    .finally(() => {
      assembledInflight = null;
    });

  assembledInflight = pending;
  return pending;
}
