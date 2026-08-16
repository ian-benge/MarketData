import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "@/lib/env";
import {
  assembleEarningsSnapshot,
  getEarningsCalendarSnapshot,
  resetEarningsCalendarCache,
} from "@/lib/market-data/earnings/service";
import type {
  CalendarSourceEvent,
  YahooEquityQuote,
} from "@/lib/market-data/earnings/types";

const NOW = new Date("2026-08-11T20:00:00.000Z");

function source(
  overrides: Partial<CalendarSourceEvent> &
    Pick<CalendarSourceEvent, "provider" | "canonicalSymbol" | "reportDate">,
): CalendarSourceEvent {
  return {
    providerTicker: overrides.canonicalSymbol,
    companyName: null,
    session: "unknown",
    fiscalPeriod: "Q2 2026",
    epsEstimate: 1,
    epsActual: null,
    revenueEstimate: null,
    revenueActual: null,
    fetchedAt: "2026-08-11T15:00:00.000Z",
    ...overrides,
  };
}

function quote(symbol: string, overrides: Partial<YahooEquityQuote> = {}): YahooEquityQuote {
  return {
    symbol,
    name: symbol,
    price: 100,
    marketCap: 50_000_000_000,
    avgVolume: 5_000_000,
    quoteType: "EQUITY",
    ...overrides,
  };
}

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    DEMO_MODE: false,
    ALLOW_MOCK_PROVIDERS: false,
    FINNHUB_API_KEY: "test-finnhub",
    ALPHA_VANTAGE_API_KEY: "test-av",
    ...overrides,
  } as Env;
}

afterEach(() => {
  resetEarningsCalendarCache();
});

describe("assembleEarningsSnapshot fail-soft enrichment", () => {
  it("keeps a Finnhub-only event visible", () => {
    const snapshot = assembleEarningsSnapshot({
      now: NOW,
      finnhub: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [source({ provider: "finnhub", canonicalSymbol: "NVDA", reportDate: "2026-08-12", session: "amc" })],
      },
      alphaVantage: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [],
      },
      quotes: new Map(),
      impliedBySymbol: new Map(),
      optionsAttempted: new Set(),
    });
    expect(snapshot.events.map((event) => event.ticker)).toEqual(["NVDA"]);
    expect(snapshot.meta.merge.finnhubOnly).toBe(1);
    expect(snapshot.meta.filtering.serverRowsRemoved).toBe(0);
  });

  it("keeps an Alpha Vantage-only event visible", () => {
    const snapshot = assembleEarningsSnapshot({
      now: NOW,
      finnhub: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [],
      },
      alphaVantage: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [
          source({
            provider: "alphaVantage",
            canonicalSymbol: "CAVA",
            reportDate: "2026-08-12",
            companyName: "CAVA Group Inc",
          }),
        ],
      },
      quotes: new Map(),
      impliedBySymbol: new Map(),
      optionsAttempted: new Set(),
    });
    expect(snapshot.events[0]).toMatchObject({
      ticker: "CAVA",
      companyName: "CAVA Group Inc",
      sources: ["alphaVantage"],
    });
    expect(snapshot.meta.merge.alphaVantageOnly).toBe(1);
  });

  it("does not drop a row when the Yahoo quote is missing", () => {
    const snapshot = assembleEarningsSnapshot({
      now: NOW,
      finnhub: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [source({ provider: "finnhub", canonicalSymbol: "NEW", reportDate: "2026-08-12" })],
      },
      alphaVantage: {
        configured: false,
        ok: false,
        stale: false,
        fetchedAt: null,
        error: "ALPHA_VANTAGE_API_KEY is not set",
        events: [],
      },
      quotes: new Map(),
      impliedBySymbol: new Map(),
      optionsAttempted: new Set(),
    });
    expect(snapshot.events[0]).toMatchObject({
      ticker: "NEW",
      lastPrice: null,
      marketCap: null,
      avgVolume: null,
      companyName: null,
      quoteStatus: "missing",
    });
  });

  it("does not drop a row when market cap is missing", () => {
    const quotes = new Map<string, YahooEquityQuote>([
      ["NEW", quote("NEW", { marketCap: null, avgVolume: null })],
    ]);
    const snapshot = assembleEarningsSnapshot({
      now: NOW,
      finnhub: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [source({ provider: "finnhub", canonicalSymbol: "NEW", reportDate: "2026-08-12" })],
      },
      alphaVantage: {
        configured: false,
        ok: false,
        stale: false,
        fetchedAt: null,
        error: null,
        events: [],
      },
      quotes,
      impliedBySymbol: new Map(),
      optionsAttempted: new Set(),
    });
    expect(snapshot.events[0]?.marketCap).toBeNull();
    expect(snapshot.events).toHaveLength(1);
  });

  it("keeps the row when options are missing and renders no expected move", () => {
    const snapshot = assembleEarningsSnapshot({
      now: NOW,
      finnhub: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [source({ provider: "finnhub", canonicalSymbol: "HD", reportDate: "2026-08-18", session: "bmo" })],
      },
      alphaVantage: {
        configured: false,
        ok: false,
        stale: false,
        fetchedAt: null,
        error: null,
        events: [],
      },
      quotes: new Map([["HD", quote("HD")]]),
      impliedBySymbol: new Map([["HD", null]]),
      optionsAttempted: new Set(["HD"]),
    });
    expect(snapshot.events[0]).toMatchObject({
      ticker: "HD",
      impliedMove: null,
      optionsStatus: "attempted_unavailable",
    });
  });

  it("keeps a symbol outside the 120-name options budget visible", () => {
    const snapshot = assembleEarningsSnapshot({
      now: NOW,
      finnhub: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [source({ provider: "finnhub", canonicalSymbol: "TINY", reportDate: "2026-08-20" })],
      },
      alphaVantage: {
        configured: false,
        ok: false,
        stale: false,
        fetchedAt: null,
        error: null,
        events: [],
      },
      quotes: new Map(),
      impliedBySymbol: new Map(),
      optionsAttempted: new Set(),
    });
    expect(snapshot.events[0]).toMatchObject({
      ticker: "TINY",
      impliedMove: null,
      optionsStatus: "skipped_budget",
    });
  });

  it("does not apply $10B+ liquid filtering on the server", () => {
    const snapshot = assembleEarningsSnapshot({
      now: NOW,
      finnhub: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [
          source({ provider: "finnhub", canonicalSymbol: "MSFT", reportDate: "2026-08-12" }),
          source({ provider: "finnhub", canonicalSymbol: "TINY", reportDate: "2026-08-12" }),
        ],
      },
      alphaVantage: {
        configured: false,
        ok: false,
        stale: false,
        fetchedAt: null,
        error: null,
        events: [],
      },
      quotes: new Map([
        ["MSFT", quote("MSFT", { marketCap: 3_700_000_000_000, avgVolume: 20_000_000 })],
        ["TINY", quote("TINY", { marketCap: 2_000_000_000, avgVolume: 100_000 })],
      ]),
      impliedBySymbol: new Map(),
      optionsAttempted: new Set(),
    });
    expect(snapshot.events.map((event) => event.ticker)).toEqual(["MSFT", "TINY"]);
    expect(snapshot.meta.filtering.serverRowsRemoved).toBe(0);
  });

  it("does not count cached quotes as more successes than attempts", () => {
    const snapshot = assembleEarningsSnapshot({
      now: NOW,
      finnhub: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [
          source({ provider: "finnhub", canonicalSymbol: "MSFT", reportDate: "2026-08-12" }),
          source({ provider: "finnhub", canonicalSymbol: "TINY", reportDate: "2026-08-12" }),
        ],
      },
      alphaVantage: {
        configured: false,
        ok: false,
        stale: false,
        fetchedAt: null,
        error: null,
        events: [],
      },
      quotes: new Map([
        ["MSFT", quote("MSFT")],
        ["TINY", quote("TINY")],
      ]),
      quoteAttempted: 1,
      quoteTargetSymbols: ["MSFT"],
      impliedBySymbol: new Map(),
      optionsAttempted: new Set(),
    });
    expect(snapshot.meta.enrichment.quoteAttempted).toBe(1);
    expect(snapshot.meta.enrichment.quoteSucceeded).toBe(1);
    expect(snapshot.meta.enrichment.quoteSucceeded).toBeLessThanOrEqual(
      snapshot.meta.enrichment.quoteAttempted,
    );
  });

  it("serves Finnhub data when Alpha Vantage fails", () => {
    const snapshot = assembleEarningsSnapshot({
      now: NOW,
      finnhub: {
        configured: true,
        ok: true,
        stale: false,
        fetchedAt: "2026-08-11T15:00:00.000Z",
        error: null,
        events: [source({ provider: "finnhub", canonicalSymbol: "NVDA", reportDate: "2026-08-12" })],
      },
      alphaVantage: {
        configured: true,
        ok: false,
        stale: false,
        fetchedAt: null,
        error: "Alpha Vantage earnings calendar failed: HTTP 429",
        events: [],
      },
      quotes: new Map(),
      impliedBySymbol: new Map(),
      optionsAttempted: new Set(),
    });
    expect(snapshot.events.map((event) => event.ticker)).toEqual(["NVDA"]);
    expect(snapshot.meta.sources.alphaVantage.ok).toBe(false);
    expect(snapshot.meta.sources.finnhub.ok).toBe(true);
  });
});

describe("getEarningsCalendarSnapshot", () => {
  it("does not let a failed provider erase the other source", async () => {
    const snapshot = await getEarningsCalendarSnapshot(testEnv(), {
      now: NOW,
      useFixtures: false,
      finnhubFetch: async () =>
        new Response(
          JSON.stringify({
            earningsCalendar: [
              { symbol: "NVDA", date: "2026-08-12", hour: "amc", quarter: 2, year: 2026 },
            ],
          }),
          { status: 200 },
        ),
      alphaVantageFetch: async () => {
        throw new Error("AV down");
      },
      fetchQuotes: async () => new Map(),
      fetchOptionChain: async () => null,
    });
    expect(snapshot.events.map((event) => event.ticker)).toEqual(["NVDA"]);
    expect(snapshot.meta.sources.finnhub.ok).toBe(true);
    expect(snapshot.meta.sources.alphaVantage.ok).toBe(false);
    expect(snapshot.meta.usingFixtures).toBe(false);
  });

  it("preserves the last assembled snapshot and marks it stale after a failed refresh", async () => {
    let failFinnhub = false;
    const deps = {
      now: NOW,
      useFixtures: false,
      finnhubFetch: async () => {
        if (failFinnhub) throw new Error("finnhub refresh failed");
        return new Response(
          JSON.stringify({
            earningsCalendar: [{ symbol: "NVDA", date: "2026-08-12", hour: "amc" }],
          }),
          { status: 200 },
        );
      },
      alphaVantageFetch: async () =>
        new Response(
          [
            "symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay",
            "CAVA,CAVA Group,2026-08-12,2026-06-30,0.14,USD,post-market",
          ].join("\n"),
          { status: 200 },
        ),
      fetchQuotes: async () => new Map(),
      fetchOptionChain: async () => null,
    };

    const first = await getEarningsCalendarSnapshot(testEnv(), deps);
    expect(first.events.map((event) => event.ticker).sort()).toEqual(["CAVA", "NVDA"]);

    failFinnhub = true;
    const second = await getEarningsCalendarSnapshot(testEnv(), {
      ...deps,
      bypassAssembledCache: true,
      forceCalendarRefresh: true,
    });
    expect(second.events.map((event) => event.ticker).sort()).toEqual(["CAVA", "NVDA"]);
    expect(second.meta.sources.finnhub.stale).toBe(true);
    expect(second.stale).toBe(true);
  });

  it("does not use fixtures in production even when demo flags are set", async () => {
    const production = await getEarningsCalendarSnapshot(
      testEnv({
        NODE_ENV: "production",
        FINNHUB_API_KEY: undefined,
        ALPHA_VANTAGE_API_KEY: undefined,
        DEMO_MODE: true,
        ALLOW_MOCK_PROVIDERS: true,
      }),
      { now: NOW, useFixtures: true },
    );
    expect(production.meta.usingFixtures).toBe(false);
    expect(production.source).toBe("unavailable");
    expect(production.events).toEqual([]);
  });

  it("uses fixtures only when explicitly enabled outside production", async () => {
    const explicit = await getEarningsCalendarSnapshot(testEnv(), {
      now: NOW,
      useFixtures: true,
    });
    expect(explicit.meta.usingFixtures).toBe(true);
    expect(explicit.source).toBe("mock");
    expect(explicit.events.length).toBeGreaterThan(0);
  });

  it("maps share-class symbols to Yahoo hyphen form when enriching", async () => {
    const requested: string[] = [];
    await getEarningsCalendarSnapshot(testEnv({ ALPHA_VANTAGE_API_KEY: undefined }), {
      now: NOW,
      useFixtures: false,
      finnhubFetch: async () =>
        new Response(
          JSON.stringify({
            earningsCalendar: [{ symbol: "BRK.B", date: "2026-08-12", hour: "bmo" }],
          }),
          { status: 200 },
        ),
      fetchQuotes: async (symbols) => {
        requested.push(...symbols);
        return new Map([
          ["BRK.B", quote("BRK-B", { name: "Berkshire Hathaway" })],
          ["BRK-B", quote("BRK-B", { name: "Berkshire Hathaway" })],
        ]);
      },
      fetchOptionChain: async (symbol) => {
        expect(symbol).toBe("BRK-B");
        return null;
      },
    });
    expect(requested).toContain("BRK.B");
  });
});
