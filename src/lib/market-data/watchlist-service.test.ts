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

  it("fills last/open/volume/1d from Yahoo when the refresh tape omits the name", async () => {
    const snapshot = await getWatchlistSnapshot(
      testEnv(),
      [quote("PLTR", 174.4, 174.07, 257_000)],
      "wl-research",
      {
        useFixtures: false,
        lists: [
          {
            id: "wl-research",
            name: "Research Queue",
            isDefault: false,
            symbols: ["PLTR", "NBIS", "SNDK", "LUNR", "USAR", "POET"],
            visibility: "shared",
          },
        ],
        yahooQuotes: async () =>
          new Map([
            [
              "PLTR",
              { name: "Palantir", price: 174.4, marketCap: 419_400_000_000, avgVolume: 40_000_000, changePercent: 0.22, open: 174.07, volume: 257_000 },
            ],
            [
              "NBIS",
              { name: "Nebius", price: 277.32, marketCap: 68_200_000_000, avgVolume: 12_000_000, changePercent: 8.85, open: 255, volume: 489_496 },
            ],
            [
              "SNDK",
              { name: "Sandisk", price: 1641.28, marketCap: 24_000_000_000, avgVolume: 8_000_000, changePercent: 7.43, open: 1527, volume: 452_418 },
            ],
            [
              "LUNR",
              { name: "Intuitive Machines", price: 12.4, marketCap: 2_100_000_000, avgVolume: 9_000_000, changePercent: 1.2, open: 12.2, volume: 4_200_000 },
            ],
            [
              "USAR",
              { name: "USA Rare Earth", price: 18.1, marketCap: 1_800_000_000, avgVolume: 3_000_000, changePercent: -0.8, open: 18.3, volume: 1_100_000 },
            ],
            [
              "POET",
              { name: "POET Technologies", price: 5.4, marketCap: 480_000_000, avgVolume: 2_000_000, changePercent: 2.1, open: 5.3, volume: 900_000 },
            ],
          ]),
        yahooWeekCloses: async () =>
          new Map([
            ["PLTR", 175.2],
            ["NBIS", 250],
            ["SNDK", 1500],
            ["LUNR", 12],
            ["USAR", 18],
            ["POET", 5],
          ]),
      },
    );
    expect(snapshot.quotedCount).toBe(6);
    expect(snapshot.rows.every((row) => row.last != null && row.volume != null)).toBe(true);
    expect(snapshot.rows.find((row) => row.ticker === "NBIS")).toMatchObject({
      last: 277.32,
      change1dPercent: 8.85,
      volume: 489_496,
      marketCap: 68_200_000_000,
      quoteSource: "yahoo",
    });
    expect(snapshot.rows.find((row) => row.ticker === "PLTR")?.quoteSource).toBe("tape");
  });

  it("keeps quoted names when Yahoo throws and records per-symbol provider errors", async () => {
    const snapshot = await getWatchlistSnapshot(
      testEnv(),
      [quote("PLTR", 174.4, 174.07, 257_000)],
      "wl-research",
      {
        useFixtures: false,
        lists: [
          {
            id: "wl-research",
            name: "Research Queue",
            isDefault: false,
            symbols: ["PLTR", "NBIS", "NOTREAL"],
            visibility: "shared",
          },
        ],
        yahooQuotes: async () => {
          throw new Error("Yahoo crumb handshake failed");
        },
        yahooWeekCloses: async () => new Map(),
      },
    );
    expect(snapshot.rows.find((row) => row.ticker === "PLTR")?.last).toBe(174.4);
    expect(snapshot.rows.find((row) => row.ticker === "NBIS")?.last).toBeNull();
    expect(snapshot.error).toMatch(/crumb handshake/i);
    expect(snapshot.diagnostics?.find((row) => row.ticker === "NBIS")?.reason).toBe(
      "provider_error",
    );
  });

  it("returns partial Yahoo hits on a large mixed-validity watchlist", async () => {
    const symbols = [
      ...Array.from({ length: 80 }, (_, index) => `T${String(index + 1).padStart(3, "0")}`),
      "BRK.B",
      "ZZZZZ",
    ];
    const snapshot = await getWatchlistSnapshot(testEnv(), [], "wl-wide", {
      useFixtures: false,
      lists: [
        {
          id: "wl-wide",
          name: "Wide",
          isDefault: true,
          symbols,
          visibility: "shared",
        },
      ],
      yahooQuotes: async (requested) => {
        const out = new Map<
          string,
          { name: string | null; price: number; marketCap: number; avgVolume: number; open: number; volume: number; changePercent: number }
        >();
        for (const symbol of requested) {
          if (symbol === "ZZZZZ") continue;
          const key = symbol === "BRK.B" ? "BRK.B" : symbol;
          out.set(key, {
            name: symbol,
            price: 10,
            marketCap: 1_000_000,
            avgVolume: 1_000,
            open: 9.5,
            volume: 2_000,
            changePercent: 5.26,
          });
        }
        return out;
      },
      yahooWeekCloses: async (requested) =>
        new Map(requested.filter((symbol) => symbol !== "ZZZZZ").map((symbol) => [symbol, 9])),
    });
    expect(snapshot.rows).toHaveLength(82);
    expect(snapshot.quotedCount).toBe(81);
    expect(snapshot.rows.find((row) => row.ticker === "T001")?.last).toBe(10);
    expect(snapshot.rows.find((row) => row.ticker === "BRK.B")?.last).toBe(10);
    expect(snapshot.rows.find((row) => row.ticker === "ZZZZZ")?.last).toBeNull();
    expect(snapshot.diagnostics?.find((row) => row.ticker === "ZZZZZ")?.reason).toBe(
      "unknown_symbol",
    );
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

  it("does not silently substitute the default list for an unknown id", async () => {
    const snapshot = await getWatchlistSnapshot(testEnv(), [], "missing-list", {
      useFixtures: false,
      lists: [
        {
          id: "wl-core",
          name: "Market Tape",
          isDefault: true,
          symbols: ["SPY"],
          visibility: "shared",
        },
      ],
      yahooQuotes: async () => new Map(),
      yahooWeekCloses: async () => new Map(),
    });
    expect(snapshot.listId).toBe("missing-list");
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.error).toMatch(/not found/i);
  });
});
