export const EARNINGS_REFRESH_MS = 5 * 60 * 1000;
/** Finnhub calendar dates change slowly; do not recache with every quote refresh. */
export const FINNHUB_CALENDAR_TTL_MS = 60 * 60 * 1000;
/**
 * Alpha Vantage free tier is typically 25 requests/day and 5/minute.
 * Cache the 6-month CSV well beyond the 5-minute quote loop.
 */
export const ALPHA_VANTAGE_CALENDAR_TTL_MS = 12 * 60 * 60 * 1000;
export const YAHOO_QUOTE_TTL_MS = EARNINGS_REFRESH_MS;
export const YAHOO_OPTIONS_TTL_MS = 15 * 60 * 1000;
export const MIN_EARNINGS_MARKET_CAP = 10_000_000_000;
export const MIN_EARNINGS_AVG_VOLUME = 750_000;
export const MIN_EARNINGS_DOLLAR_VOLUME = 25_000_000;
/** Option-chain lookups per refresh. Every name still appears; implied move may be blank. */
export const IMPLIED_MOVE_BUDGET = 120;
/**
 * Quote enrichment budget for the 6-month slate. Calendar rows outside the
 * budget still appear; price/cap/ADV stay null.
 */
export const QUOTE_ENRICHMENT_BUDGET = 400;

/**
 * Display/search window: America/Chicago yesterday through +6 months (~183 days).
 * Provider fetches may pad this; the assembled API is filtered back to this range.
 */
export const EARNINGS_LOOKBACK_DAYS = 1;
export const EARNINGS_LOOKAHEAD_DAYS = 183;
/** When fiscal period is missing, merge only if report dates are this close. */
export const EARNINGS_DATE_PROXIMITY_DAYS = 2;

export type EarningsSession = "bmo" | "amc" | "during" | "unknown";

export type EarningsCalendarProvider = "finnhub" | "alphaVantage";

export type EarningsConfidence = "high" | "medium" | "low";

export type EarningsQuoteStatus = "succeeded" | "missing";

export type EarningsOptionsStatus =
  | "succeeded"
  | "attempted_unavailable"
  | "skipped_budget";

export type EarningsImpliedMove = {
  percent: number;
  dollars: number;
  strike: number;
  callMid: number;
  putMid: number;
  straddle: number;
  expiry: string;
  spot: number;
  source: "yahoo_options";
};

export type EarningsCalendarEvent = {
  id: string;
  ticker: string;
  companyName: string | null;
  reportDate: string;
  session: EarningsSession;
  fiscalPeriod: string | null;
  epsEstimate: number | null;
  epsActual: number | null;
  epsSurprise: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  lastPrice: number | null;
  marketCap: number | null;
  avgVolume: number | null;
  impliedMove: EarningsImpliedMove | null;
  coverageNotes: string;
  sources: EarningsCalendarProvider[];
  providerTickers: Partial<Record<EarningsCalendarProvider, string>>;
  alternativeReportDate: string | null;
  conflicted: boolean;
  confidence: EarningsConfidence;
  quoteStatus: EarningsQuoteStatus;
  optionsStatus: EarningsOptionsStatus;
};

export type EarningsCalendarSource = "live" | "mock" | "unavailable";

export type EarningsSourceHealth = {
  configured: boolean;
  ok: boolean;
  eventCount: number;
  fetchedAt: string | null;
  stale: boolean;
  error: string | null;
};

export type EarningsCalendarMeta = {
  requestedWindow: {
    from: string;
    to: string;
  };
  sources: {
    finnhub: EarningsSourceHealth;
    alphaVantage: EarningsSourceHealth;
  };
  merge: {
    unionCount: number;
    matchedByBoth: number;
    finnhubOnly: number;
    alphaVantageOnly: number;
    conflicted: number;
  };
  enrichment: {
    quoteAttempted: number;
    quoteSucceeded: number;
    optionsBudget: number;
    optionsAttempted: number;
    expectedMoveSucceeded: number;
  };
  filtering: {
    serverRowsRemoved: number;
    emptySymbol: number;
    invalidDate: number;
    parseFailures: number;
  };
  usingFixtures: boolean;
};

export type EarningsCalendarSnapshot = {
  asOf: string;
  source: EarningsCalendarSource;
  sourceLabel: string;
  attribution: string;
  refreshSeconds: number;
  windowStart: string;
  windowEnd: string;
  events: EarningsCalendarEvent[];
  scanned: number;
  error: string | null;
  stale: boolean;
  meta: EarningsCalendarMeta;
};

export type YahooEquityQuote = {
  symbol: string;
  name: string | null;
  price: number | null;
  marketCap: number | null;
  avgVolume: number | null;
  quoteType: string | null;
  changePercent?: number | null;
  open?: number | null;
  volume?: number | null;
  previousClose?: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  preMarketChangePercent?: number | null;
  postMarketChangePercent?: number | null;
};

export type YahooOptionContract = {
  strike: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  impliedVolatility: number | null;
};

export type YahooOptionChain = {
  symbol: string;
  quote: YahooEquityQuote;
  expirationDates: number[];
  calls: YahooOptionContract[];
  puts: YahooOptionContract[];
  expiration: number | null;
};

/**
 * Provider-independent calendar observation. Calendar ingestion produces these
 * before Yahoo enrichment. Missing enrichment must not drop the row.
 */
export type CalendarSourceEvent = {
  provider: EarningsCalendarProvider;
  providerTicker: string;
  canonicalSymbol: string;
  companyName: string | null;
  reportDate: string;
  session: EarningsSession;
  fiscalPeriod: string | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  fetchedAt: string;
};

export type MergedCalendarEvent = {
  id: string;
  canonicalSymbol: string;
  providerTickers: Partial<Record<EarningsCalendarProvider, string>>;
  companyName: string | null;
  reportDate: string;
  session: EarningsSession;
  fiscalPeriod: string | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  sources: EarningsCalendarProvider[];
  observations: CalendarSourceEvent[];
  alternativeReportDate: string | null;
  conflicted: boolean;
  confidence: EarningsConfidence;
  lastSourceUpdate: string;
};

export type CalendarParseDiagnostics = {
  rawRows: number;
  parsed: number;
  emptySymbol: number;
  invalidDate: number;
  parseFailures: number;
};

export function emptySourceHealth(
  configured: boolean,
  error: string | null,
): EarningsSourceHealth {
  return {
    configured,
    ok: false,
    eventCount: 0,
    fetchedAt: null,
    stale: false,
    error,
  };
}

export function emptyCalendarMeta(window: {
  from: string;
  to: string;
}): EarningsCalendarMeta {
  return {
    requestedWindow: window,
    sources: {
      finnhub: emptySourceHealth(false, null),
      alphaVantage: emptySourceHealth(false, null),
    },
    merge: {
      unionCount: 0,
      matchedByBoth: 0,
      finnhubOnly: 0,
      alphaVantageOnly: 0,
      conflicted: 0,
    },
    enrichment: {
      quoteAttempted: 0,
      quoteSucceeded: 0,
      optionsBudget: IMPLIED_MOVE_BUDGET,
      optionsAttempted: 0,
      expectedMoveSucceeded: 0,
    },
    filtering: {
      serverRowsRemoved: 0,
      emptySymbol: 0,
      invalidDate: 0,
      parseFailures: 0,
    },
    usingFixtures: false,
  };
}
