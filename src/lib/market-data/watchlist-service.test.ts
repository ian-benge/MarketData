import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "@/lib/env";
import type { NormalizedQuote } from "@/lib/providers/types";
import {
  getWatchlistSnapshot,
  resetWatchlistCache,
} from "@/lib/market-data/watchlist-service";

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    DEMO_MODE: false,
    ALLOW_MOCK_PROVIDERS: false,
    ...overrides,
  } as Env;
}

function quote(ticker: string, last: number, open: number, volume: number): NormalizedQuote {
  return {
    instrumentId: `test:${ticker}`,
    ticker,
    last,
    open,
    priorClose: open,
    changeAbsolute: last - open,
    changePercent: ((last - open) / open) * 100,
    volume,
    marketSession: "regular",
    providerName: "test",
    providerTimestamp: "2026-08-11T20:00:00.000Z",
    retrievalTimestamp: "2026-08-11T20:00:00.000Z",
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "secondary",
    value: last,
    units: "price",
  };
}

afterEach(() => {
  resetWatchlistCache();
});

describe("getWatchlistSnapshot", () => {
  it("joins tape quotes with Yahoo cap/rvol/1w and leaves gaps as null", async () => {
    const snapshot = await getWatchlistSnapshot(
      testEnv(),
      [quote("SPY", 110, 100, 20_000_000)],
      "wl-core",
      {
        useFixtures: false,
        yahooQuotes: async () =>
          new Map([
            ["SPY", { name: "SPDR S&P 500", marketCap: 500_000_000_000, avgVolume: 10_000_000 }],
          ]),
        yahooWeekCloses: async () => new Map([["SPY", 100]]),
      },
    );
    const spy = snapshot.rows.find((row) => row.ticker === "SPY");
    expect(spy).toMatchObject({
      last: 110,
      changeFromOpenPercent: 10,
      change1wPercent: 10,
      relativeVolume: 2,
      marketCap: 500_000_000_000,
    });
    const aapl = snapshot.rows.find((row) => row.ticker === "AAPL");
    expect(aapl?.last).toBeNull();
    expect(aapl?.missing).toContain("last");
  });

  it("serves fixture watchlists in demo mode", async () => {
    const snapshot = await getWatchlistSnapshot(testEnv(), [], "wl-ai", {
      useFixtures: true,
    });
    expect(snapshot.usingFixtures).toBe(true);
    expect(snapshot.listId).toBe("wl-ai");
    expect(snapshot.rows.map((row) => row.ticker)).toEqual([
      "NVDA",
      "AMD",
      "AVGO",
      "TSM",
      "PLTR",
      "CEG",
      "EQIX",
    ]);
    expect(snapshot.rows.every((row) => row.last != null)).toBe(true);
  });
});
