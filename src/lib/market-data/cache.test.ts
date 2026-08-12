import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  MarketDataCache,
  resetMarketDataCache,
} from "@/lib/market-data/cache";
import type { NormalizedQuoteObservation } from "@/lib/market-data/schemas";

function quote(
  ticker: string,
  last: number,
): NormalizedQuoteObservation {
  const ts = "2026-08-10T14:30:00.000Z";
  return {
    instrumentId: `test:${ticker}`,
    ticker,
    last,
    priorClose: last - 1,
    changeAbsolute: 1,
    changePercent: (1 / (last - 1)) * 100,
    marketSession: "regular",
    providerName: "alpaca",
    providerTimestamp: ts,
    retrievalTimestamp: ts,
    feedCoverage: "iex",
    latencyClass: "realtime",
    licenseScopeId: "alpaca:single_user_development",
    permittedSurfaces: ["dashboard_display"],
    valueKind: "normalized",
  };
}

describe("MarketDataCache", () => {
  beforeEach(() => {
    resetMarketDataCache();
  });

  it("serves dashboard snapshot from cache without provider calls", () => {
    const cache = new MarketDataCache({ staleAfterSeconds: 180 });
    const provider = { getQuotes: vi.fn() };
    cache.writeQuotes([quote("SPY", 560), quote("QQQ", 490)], {
      feedCoverage: "iex",
      latencyClass: "realtime",
      licenseScopeId: "alpaca:test",
      providerName: "alpaca",
      marketSession: "regular",
      universeSymbols: ["SPY", "QQQ"],
      at: new Date("2026-08-10T14:30:00.000Z"),
    });

    const snap = cache.getDashboardSnapshot(
      new Date("2026-08-10T14:31:00.000Z"),
    );
    expect(snap).not.toBeNull();
    expect(snap!.tape).toHaveLength(2);
    expect(snap!.latencyCoverageLabel).toMatch(/IEX/);
    expect(snap!.latencyCoverageLabel).not.toMatch(/SIP/);
    expect(provider.getQuotes).not.toHaveBeenCalled();
    expect(snap!.tape.every((row) => row.marketSession === "regular")).toBe(true);
  });

  it("stamps the refresh session onto quotes that arrived as closed", () => {
    const cache = new MarketDataCache({ staleAfterSeconds: 180 });
    cache.writeQuotes([quote("SPY", 560), { ...quote("QQQ", 490), marketSession: "closed" }], {
      feedCoverage: "iex",
      latencyClass: "realtime",
      marketSession: "regular",
      at: new Date("2026-08-10T14:30:00.000Z"),
    });
    const snap = cache.getDashboardSnapshot(new Date("2026-08-10T14:31:00.000Z"));
    expect(snap!.tape.map((row) => row.marketSession)).toEqual(["regular", "regular"]);
  });

  it("preserves last valid on refresh failure and marks stale", () => {
    const cache = new MarketDataCache({ staleAfterSeconds: 60 });
    cache.writeQuotes([quote("SPY", 560)], {
      feedCoverage: "iex",
      latencyClass: "realtime",
      at: new Date("2026-08-10T14:30:00.000Z"),
    });
    cache.markRefreshFailed(
      "upstream 500",
      new Date("2026-08-10T14:31:00.000Z"),
    );
    const entry = cache.getQuote("SPY", new Date("2026-08-10T14:31:00.000Z"));
    expect(entry?.observation.last).toBe(560);
    expect(entry?.stale).toBe(true);
    const snap = cache.getDashboardSnapshot(
      new Date("2026-08-10T14:31:00.000Z"),
    );
    expect(snap?.stale).toBe(true);
    expect(snap?.tape[0]?.last).toBe(560);
  });

  it("never zero-fills missing symbols", () => {
    const cache = new MarketDataCache();
    cache.writeQuotes([quote("SPY", 560)]);
    cache.writeQuotes([quote("QQQ", 490)]);
    expect(cache.getQuote("SPY")?.observation.last).toBe(560);
    expect(cache.getQuote("MSFT")).toBeNull();
  });
});
