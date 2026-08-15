import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  InMemoryRefreshLock,
  isRefreshActive,
  runMarketDataRefresh,
  setLastRefreshAt,
} from "@/lib/market-data/refresh-service";
import {
  MarketDataCache,
  resetMarketDataCache,
} from "@/lib/market-data/cache";
import { InMemoryUsageStore } from "@/lib/market-data/usage";
import type { Env } from "@/lib/env";
import type { MarketDataRouter } from "@/lib/market-data/router";
import type { NormalizedQuoteObservation } from "@/lib/market-data/schemas";

const env = {
  NODE_ENV: "test",
  MARKET_DATA_PRIMARY: "alpaca",
  MARKET_DATA_FALLBACK: "none",
  MARKET_DATA_LICENSE_SCOPE: "single_user_development",
  MARKET_DATA_LICENSE_ACKNOWLEDGED: false,
  MARKET_DATA_REFRESH_OPEN_SECONDS: 60,
  MARKET_DATA_REFRESH_EXTENDED_SECONDS: 120,
  MARKET_DATA_REFRESH_CLOSED_SECONDS: 300,
  MARKET_DATA_STALE_AFTER_SECONDS: 180,
  MARKET_DATA_MAX_UNIVERSE_SIZE: 20,
  ALPACA_STOCK_FEED: "iex",
} as Env;

function makeQuote(ticker: string): NormalizedQuoteObservation {
  const ts = "2026-08-10T14:30:00.000Z";
  return {
    instrumentId: `t:${ticker}`,
    ticker,
    last: 100,
    priorClose: 99,
    changeAbsolute: 1,
    changePercent: 1.01,
    marketSession: "regular",
    providerName: "alpaca",
    providerTimestamp: ts,
    retrievalTimestamp: ts,
    feedCoverage: "iex",
    latencyClass: "realtime",
    licenseScopeId: "alpaca:test",
    permittedSurfaces: ["dashboard_display"],
    valueKind: "normalized",
  };
}

function mockRouter(delayMs = 50): MarketDataRouter {
  return {
    fetchSnapshots: vi.fn(async ({ symbols }: { symbols: string[] }) => {
      await new Promise((r) => setTimeout(r, delayMs));
      return {
        providerName: "alpaca",
        retrievalTimestamp: new Date().toISOString(),
        feedCoverage: "iex" as const,
        latencyClass: "realtime" as const,
        licenseScopeId: "alpaca:test",
        permittedSurfaces: ["dashboard_display" as const],
        snapshots: symbols.map(makeQuote),
      };
    }),
    fetchQuotes: vi.fn(async ({ symbols }: { symbols: string[] }) => ({
      providerName: "alpaca",
      retrievalTimestamp: new Date().toISOString(),
      feedCoverage: "iex" as const,
      latencyClass: "realtime" as const,
      licenseScopeId: "alpaca:test",
      permittedSurfaces: ["dashboard_display" as const],
      quotes: symbols.map(makeQuote),
    })),
    fetchMovers: vi.fn(async () => ({
      providerName: "alpaca",
      retrievalTimestamp: new Date().toISOString(),
      feedCoverage: "iex" as const,
      latencyClass: "realtime" as const,
      licenseScopeId: "alpaca:test",
      permittedSurfaces: ["dashboard_display" as const],
      movers: [],
    })),
  } as unknown as MarketDataRouter;
}

describe("refresh lock", () => {
  beforeEach(() => {
    resetMarketDataCache();
    setLastRefreshAt(null);
  });

  it("only one of two overlapping refreshes is active", async () => {
    const cache = new MarketDataCache();
    const usage = new InMemoryUsageStore();
    const lock = new InMemoryRefreshLock();
    const router = mockRouter(80);

    const a = runMarketDataRefresh({
      env,
      router,
      cache,
      usage,
      lock,
      force: true,
      watchlistSymbols: ["SPY"],
      now: new Date("2026-08-10T15:00:00.000Z"),
    });
    // Let first acquire mutex
    await new Promise((r) => setTimeout(r, 10));
    expect(isRefreshActive()).toBe(true);

    const b = runMarketDataRefresh({
      env,
      router,
      cache,
      usage,
      lock,
      force: true,
      watchlistSymbols: ["SPY"],
      now: new Date("2026-08-10T15:00:00.000Z"),
    });

    const [ra, rb] = await Promise.all([a, b]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toContain("completed");
    expect(statuses).toContain("skipped");
    expect(router.fetchSnapshots).toHaveBeenCalledTimes(1);
  });

  it("does not label IEX as SIP and disables breadth", async () => {
    const cache = new MarketDataCache();
    const result = await runMarketDataRefresh({
      env,
      router: mockRouter(0),
      cache,
      usage: new InMemoryUsageStore(),
      lock: new InMemoryRefreshLock(),
      force: true,
      watchlistSymbols: ["SPY"],
      now: new Date("2026-08-10T15:00:00.000Z"),
    });
    expect(result.status).toBe("completed");
    expect(result.feedCoverage).toBe("iex");
    expect(result.breadth.supported).toBe(false);
    expect(result.moversCoverageNotes).toMatch(/IEX/i);
    expect(result.moversCoverageNotes).not.toMatch(/SIP full/i);
    const snap = cache.getDashboardSnapshot(
      new Date("2026-08-10T15:00:30.000Z"),
    );
    expect(snap?.latencyCoverageLabel).toBe("Real-time — IEX");
  });
});
