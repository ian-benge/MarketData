import {
  EARNINGS_REFRESH_MS,
  emptyCalendarMeta,
  type EarningsCalendarEvent,
  type EarningsCalendarSnapshot,
} from "@/lib/market-data/earnings/types";
import { earningsCoverageWindow } from "@/lib/market-data/earnings/window";

function mockEvent(
  event: Omit<
    EarningsCalendarEvent,
    | "sources"
    | "providerTickers"
    | "alternativeReportDate"
    | "conflicted"
    | "confidence"
    | "quoteStatus"
    | "optionsStatus"
  > &
    Partial<
      Pick<
        EarningsCalendarEvent,
        | "sources"
        | "providerTickers"
        | "alternativeReportDate"
        | "conflicted"
        | "confidence"
        | "quoteStatus"
        | "optionsStatus"
      >
    >,
): EarningsCalendarEvent {
  return {
    ...event,
    sources: event.sources ?? ["finnhub"],
    providerTickers: event.providerTickers ?? { finnhub: event.ticker },
    alternativeReportDate: event.alternativeReportDate ?? null,
    conflicted: event.conflicted ?? false,
    confidence: event.confidence ?? "medium",
    quoteStatus: event.quoteStatus ?? (event.lastPrice != null ? "succeeded" : "missing"),
    optionsStatus:
      event.optionsStatus ??
      (event.impliedMove ? "succeeded" : "attempted_unavailable"),
  };
}

export function fixtureEarningsSnapshot(
  now = new Date("2026-08-11T20:00:00.000Z"),
): EarningsCalendarSnapshot {
  const asOf = now.toISOString();
  const window = earningsCoverageWindow(now);
  const events: EarningsCalendarEvent[] = [
    mockEvent({
      id: "mock-earn-nvda",
      ticker: "NVDA",
      companyName: "NVIDIA Corp",
      reportDate: "2026-08-12",
      session: "amc",
      fiscalPeriod: "Q2 2027",
      epsEstimate: 1.01,
      epsActual: null,
      epsSurprise: null,
      revenueEstimate: 46_200_000_000,
      revenueActual: null,
      lastPrice: 182.4,
      marketCap: 4_460_000_000_000,
      avgVolume: 168_000_000,
      impliedMove: {
        percent: 6.4,
        dollars: 11.68,
        strike: 182.5,
        callMid: 6.1,
        putMid: 5.58,
        straddle: 11.68,
        expiry: "2026-08-14",
        spot: 182.4,
        source: "yahoo_options",
      },
      coverageNotes: "DEMO mock data — not live market data.",
    }),
    mockEvent({
      id: "mock-earn-amzn",
      ticker: "AMZN",
      companyName: "Amazon.com Inc",
      reportDate: "2026-08-13",
      session: "amc",
      fiscalPeriod: "Q2 2026",
      epsEstimate: 1.32,
      epsActual: null,
      epsSurprise: null,
      revenueEstimate: 167_400_000_000,
      revenueActual: null,
      lastPrice: 218.55,
      marketCap: 2_310_000_000_000,
      avgVolume: 42_000_000,
      impliedMove: {
        percent: 5.1,
        dollars: 11.15,
        strike: 220,
        callMid: 5.7,
        putMid: 5.45,
        straddle: 11.15,
        expiry: "2026-08-14",
        spot: 218.55,
        source: "yahoo_options",
      },
      coverageNotes: "DEMO mock data — not live market data.",
    }),
    mockEvent({
      id: "mock-earn-wmt",
      ticker: "WMT",
      companyName: "Walmart Inc",
      reportDate: "2026-08-14",
      session: "bmo",
      fiscalPeriod: "Q2 2026",
      epsEstimate: 0.61,
      epsActual: 0.64,
      epsSurprise: 0.03,
      revenueEstimate: 174_800_000_000,
      revenueActual: 177_400_000_000,
      lastPrice: 98.2,
      marketCap: 786_000_000_000,
      avgVolume: 18_400_000,
      impliedMove: {
        percent: 3.2,
        dollars: 3.14,
        strike: 98,
        callMid: 1.62,
        putMid: 1.52,
        straddle: 3.14,
        expiry: "2026-08-14",
        spot: 98.2,
        source: "yahoo_options",
      },
      coverageNotes: "DEMO mock data — not live market data.",
    }),
    mockEvent({
      id: "mock-earn-hd",
      ticker: "HD",
      companyName: "Home Depot Inc",
      reportDate: "2026-08-18",
      session: "bmo",
      fiscalPeriod: "Q2 2026",
      epsEstimate: 4.72,
      epsActual: null,
      epsSurprise: null,
      revenueEstimate: 45_100_000_000,
      revenueActual: null,
      lastPrice: 412.3,
      marketCap: 409_000_000_000,
      avgVolume: 3_600_000,
      impliedMove: null,
      coverageNotes: "DEMO — implied move withheld because no chain was supplied.",
    }),
    mockEvent({
      id: "mock-earn-dg",
      ticker: "DG",
      companyName: "Dollar General Corp",
      reportDate: "2026-08-12",
      session: "bmo",
      fiscalPeriod: "Q2 2026",
      epsEstimate: 1.42,
      epsActual: null,
      epsSurprise: null,
      revenueEstimate: 10_400_000_000,
      revenueActual: null,
      lastPrice: 112.4,
      marketCap: 24_700_000_000,
      avgVolume: 3_100_000,
      impliedMove: {
        percent: 7.8,
        dollars: 8.77,
        strike: 112.5,
        callMid: 4.5,
        putMid: 4.27,
        straddle: 8.77,
        expiry: "2026-08-14",
        spot: 112.4,
        source: "yahoo_options",
      },
      coverageNotes: "DEMO mock data — not live market data.",
    }),
    mockEvent({
      id: "mock-earn-cava",
      ticker: "CAVA",
      companyName: "CAVA Group Inc",
      reportDate: "2026-08-12",
      session: "amc",
      fiscalPeriod: "Q2 2026",
      epsEstimate: 0.14,
      epsActual: null,
      epsSurprise: null,
      revenueEstimate: 280_000_000,
      revenueActual: null,
      lastPrice: 68.2,
      marketCap: 7_900_000_000,
      avgVolume: 4_200_000,
      impliedMove: {
        percent: 11.2,
        dollars: 7.64,
        strike: 67.5,
        callMid: 3.9,
        putMid: 3.74,
        straddle: 7.64,
        expiry: "2026-08-14",
        spot: 68.2,
        source: "yahoo_options",
      },
      coverageNotes: "DEMO mock data — not live market data.",
    }),
    mockEvent({
      id: "mock-earn-rkt",
      ticker: "RKT",
      companyName: "Rocket Companies Inc",
      reportDate: "2026-08-12",
      session: "unknown",
      fiscalPeriod: "Q2 2026",
      epsEstimate: 0.08,
      epsActual: null,
      epsSurprise: null,
      revenueEstimate: 1_350_000_000,
      revenueActual: null,
      lastPrice: 19.4,
      marketCap: 38_600_000_000,
      avgVolume: 12_000_000,
      impliedMove: null,
      coverageNotes: "DEMO — time not confirmed.",
    }),
  ];

  const meta = emptyCalendarMeta(window);
  meta.usingFixtures = true;
  meta.merge.unionCount = events.length;
  meta.merge.finnhubOnly = events.length;
  meta.enrichment.quoteAttempted = events.length;
  meta.enrichment.quoteSucceeded = events.filter((event) => event.quoteStatus === "succeeded").length;
  meta.enrichment.optionsAttempted = events.length;
  meta.enrichment.expectedMoveSucceeded = events.filter((event) => event.impliedMove != null).length;

  return {
    asOf,
    source: "mock",
    sourceLabel: "Mock earnings",
    attribution:
      "DEMO mock earnings — not live estimates or options. For local development only.",
    refreshSeconds: EARNINGS_REFRESH_MS / 1000,
    windowStart: window.from,
    windowEnd: window.to,
    scanned: events.length,
    error: null,
    stale: false,
    events,
    meta,
  };
}
