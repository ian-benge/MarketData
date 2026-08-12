import { fixtureWatchlistSnapshot } from "@/lib/market-data/watchlist-service";
import type { DashboardWatchlistSnapshot } from "@/lib/market-data/watchlist-types";
import type {
  NormalizedCalendarEvent,
  NormalizedMover,
  NormalizedNewsItem,
  NormalizedQuote,
} from "@/lib/providers/types";

const now = "2026-08-10T14:30:00.000Z";

export const fixtureQuotes: NormalizedQuote[] = [
  {
    instrumentId: "mock:SPY",
    ticker: "SPY",
    last: 562.4,
    priorClose: 560.1,
    changeAbsolute: 2.3,
    changePercent: 0.41,
    volume: 48_200_000,
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 562.4,
    units: "price",
  },
  {
    instrumentId: "mock:QQQ",
    ticker: "QQQ",
    last: 492.15,
    priorClose: 488.9,
    changeAbsolute: 3.25,
    changePercent: 0.66,
    volume: 32_100_000,
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 492.15,
    units: "price",
  },
  {
    instrumentId: "mock:IWM",
    ticker: "IWM",
    last: 221.3,
    priorClose: 219.8,
    changeAbsolute: 1.5,
    changePercent: 0.68,
    volume: 28_400_000,
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 221.3,
    units: "price",
  },
  {
    instrumentId: "mock:TLT",
    ticker: "TLT",
    last: 93.4,
    priorClose: 94.1,
    changeAbsolute: -0.7,
    changePercent: -0.74,
    volume: 22_000_000,
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 93.4,
    units: "price",
  },
  {
    instrumentId: "mock:GLD",
    ticker: "GLD",
    last: 238.5,
    priorClose: 236.9,
    changeAbsolute: 1.6,
    changePercent: 0.68,
    volume: 7_800_000,
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 238.5,
    units: "price",
  },
  {
    instrumentId: "mock:USO",
    ticker: "USO",
    last: 76.2,
    priorClose: 75.4,
    changeAbsolute: 0.8,
    changePercent: 1.06,
    volume: 4_500_000,
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 76.2,
    units: "price",
  },
  {
    instrumentId: "mock:UUP",
    ticker: "UUP",
    last: 29.8,
    priorClose: 29.65,
    changeAbsolute: 0.15,
    changePercent: 0.51,
    volume: 1_100_000,
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 29.8,
    units: "price",
  },
  {
    instrumentId: "mock:VIXY",
    ticker: "VIXY",
    last: 14.2,
    priorClose: 14.8,
    changeAbsolute: -0.6,
    changePercent: -4.05,
    volume: 6_700_000,
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 14.2,
    units: "price",
  },
];

export const fixtureMovers: NormalizedMover[] = [
  {
    instrumentId: "mock:NVDA",
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    last: 131.4,
    changeAbsolute: 2.5,
    changePercent: 1.94,
    volume: 210_000_000,
    direction: "up",
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 131.4,
  },
  {
    instrumentId: "mock:AMD",
    ticker: "AMD",
    name: "Advanced Micro Devices",
    last: 162.7,
    changeAbsolute: 4.5,
    changePercent: 2.84,
    volume: 55_000_000,
    direction: "up",
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 162.7,
  },
  {
    instrumentId: "mock:TLT",
    ticker: "TLT",
    name: "iShares 20+ Year Treasury",
    last: 93.4,
    changeAbsolute: -0.7,
    changePercent: -0.74,
    volume: 22_000_000,
    direction: "down",
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 93.4,
  },
  {
    instrumentId: "mock:VIXY",
    ticker: "VIXY",
    name: "ProShares VIX Short-Term",
    last: 14.2,
    changeAbsolute: -0.6,
    changePercent: -4.05,
    volume: 6_700_000,
    direction: "down",
    marketSession: "regular",
    providerName: "mock-market",
    providerTimestamp: now,
    retrievalTimestamp: now,
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "mock",
    value: 14.2,
  },
];

export const fixtureHeadlines: NormalizedNewsItem[] = [
  {
    id: "news-1",
    title: "Chipmakers advance as AI spending outlook firms",
    summary:
      "Semiconductor names led gains after a major cloud provider reiterated capex guidance.",
    url: "https://example.com/news/chips-ai",
    publisher: "Wire Desk",
    publishedAt: "2026-08-10T13:10:00.000Z",
    retrievedAt: now,
    tickers: ["NVDA", "AMD", "AVGO"],
    sourceClass: "wire",
    providerName: "mock-news",
    sourceQuality: "mock",
  },
  {
    id: "news-2",
    title: "Treasury yields ease ahead of inflation print",
    summary:
      "Long-duration bonds firmed as traders pared rate-cut bets for the next FOMC.",
    url: "https://example.com/news/treasuries",
    publisher: "Rates Brief",
    publishedAt: "2026-08-10T12:45:00.000Z",
    retrievedAt: now,
    tickers: ["TLT", "IEF"],
    sourceClass: "secondary",
    providerName: "mock-news",
    sourceQuality: "mock",
  },
  {
    id: "news-3",
    title: "Crude climbs on inventory draw",
    summary: "WTI proxies rose after weekly stocks fell more than consensus.",
    url: "https://example.com/news/crude",
    publisher: "Energy Wire",
    publishedAt: "2026-08-10T11:20:00.000Z",
    retrievedAt: now,
    tickers: ["USO", "XLE"],
    sourceClass: "wire",
    providerName: "mock-news",
    sourceQuality: "mock",
  },
];

export const fixtureCalendar: NormalizedCalendarEvent[] = [
  {
    id: "cal-1",
    title: "CPI (YoY)",
    category: "economic",
    country: "US",
    importance: "high",
    scheduledAt: "2026-08-12T12:30:00.000Z",
    timeZone: "America/Chicago",
    consensus: 2.8,
    previous: 2.7,
    units: "%",
    providerName: "mock-macro",
    providerTimestamp: now,
    retrievalTimestamp: now,
    sourceQuality: "mock",
  },
  {
    id: "cal-2",
    title: "FOMC minutes",
    category: "central_bank",
    country: "US",
    importance: "high",
    scheduledAt: "2026-08-13T18:00:00.000Z",
    timeZone: "America/Chicago",
    providerName: "mock-macro",
    providerTimestamp: now,
    retrievalTimestamp: now,
    sourceQuality: "mock",
  },
  {
    id: "cal-3",
    title: "Retail sales",
    category: "economic",
    country: "US",
    importance: "medium",
    scheduledAt: "2026-08-14T12:30:00.000Z",
    timeZone: "America/Chicago",
    consensus: 0.3,
    previous: 0.1,
    units: "% m/m",
    providerName: "mock-macro",
    providerTimestamp: now,
    retrievalTimestamp: now,
    sourceQuality: "mock",
  },
];

export type DashboardSnapshot = {
  asOf: string;
  dataCutoff: string;
  stale: boolean;
  tape: NormalizedQuote[];
  movers: NormalizedMover[];
  watchlist?: DashboardWatchlistSnapshot;
  headlines: NormalizedNewsItem[];
  calendar: NormalizedCalendarEvent[];
  providers: Array<{
    id: string;
    name: string;
    category: string;
    health: string;
    lastSuccessAt: string | null;
  }>;
  latestReport: {
    id: string;
    edition: "premarket" | "midday" | "close_postmarket";
    tradingDate: string;
    status: string;
    headlineSummary: string;
    completedAt: string;
  } | null;
  /** Functional feed/latency label for UI (not visual polish). */
  latencyCoverageLabel?: string;
  feedCoverage?: string;
  latencyClass?: string;
  marketSession?: string | null;
  licenseWarning?: string | null;
  breadthSupported?: boolean;
  breadthExplanation?: string | null;
};

export const fixtureDashboard: DashboardSnapshot = {
  asOf: now,
  dataCutoff: "2026-08-10T14:15:00.000Z",
  stale: false,
  tape: fixtureQuotes,
  movers: fixtureMovers,
  watchlist: fixtureWatchlistSnapshot(),
  headlines: fixtureHeadlines,
  calendar: fixtureCalendar,
  providers: [
    {
      id: "mock",
      name: "Mock providers",
      category: "market_data",
      health: "healthy",
      lastSuccessAt: now,
    },
    {
      id: "finnhub",
      name: "Finnhub",
      category: "market_data",
      health: "disabled",
      lastSuccessAt: null,
    },
    {
      id: "fred",
      name: "FRED",
      category: "macro",
      health: "disabled",
      lastSuccessAt: null,
    },
  ],
  latestReport: {
    id: "rpt-demo-001",
    edition: "midday",
    tradingDate: "2026-08-10",
    status: "completed",
    headlineSummary:
      "Risk assets firmed with semis leading; duration recovered as yields eased into the inflation print.",
    completedAt: "2026-08-10T16:35:00.000Z",
  },
};
