import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "@/lib/env";
import type { NormalizedQuote } from "@/lib/providers/types";
import { fixtureWatchlists } from "@/lib/fixtures/watchlists";
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
        lists: fixtureWatchlists.map((list) => ({
          id: list.id,
          name: list.name,
          isDefault: list.isDefault,
          symbols: list.symbols,
          visibility: list.visibility ?? "shared",
        })),
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
    const iwm = snapshot.rows.find((row) => row.ticker === "IWM");
    expect(iwm?.last).toBeNull();
    expect(iwm?.missing).toContain("last");
  });

  it("serves fixture watchlists in demo mode", async () => {
    const snapshot = await getWatchlistSnapshot(testEnv(), [], "wl-research", {
      useFixtures: true,
    });
    expect(snapshot.usingFixtures).toBe(true);
    expect(snapshot.listId).toBe("wl-research");
    expect(snapshot.rows.map((row) => row.ticker)).toEqual([
      "NVDA",
      "AMD",
      "AVGO",
      "TSM",
      "PLTR",
      "CEG",
      "EQIX",
      "IREN",
    ]);
    expect(snapshot.rows.every((row) => row.last != null)).toBe(true);
  });

  it("does not fall back to fixture names when persisted lists are empty", async () => {
    const snapshot = await getWatchlistSnapshot(testEnv(), [], undefined, {
      useFixtures: false,
      lists: [],
    });
    expect(snapshot.usingFixtures).toBe(false);
    expect(snapshot.lists).toEqual([]);
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.error).toMatch(/no watchlists are configured/i);
  });

  it("includes personal lists for the owner in the picker", async () => {
    const snapshot = await getWatchlistSnapshot(testEnv(), [], "wl-desk", {
      useFixtures: false,
      lists: [
        {
          id: "wl-core",
          name: "Market Tape",
          isDefault: true,
          symbols: ["SPY"],
          visibility: "shared",
        },
        {
          id: "wl-desk",
          name: "My desk",
          isDefault: false,
          symbols: ["NVDA"],
          visibility: "personal",
        },
      ],
      yahooQuotes: async () => new Map(),
      yahooWeekCloses: async () => new Map(),
    });
    expect(snapshot.listId).toBe("wl-desk");
    expect(snapshot.lists.map((row) => row.visibility)).toEqual([
      "shared",
      "personal",
    ]);
    expect(snapshot.rows.map((row) => row.ticker)).toEqual(["NVDA"]);
  });
});
