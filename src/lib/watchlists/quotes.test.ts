import { afterEach, describe, expect, it } from "vitest";
import type { NormalizedQuote } from "@/lib/providers/types";
import {
  loadCoverageQuotes,
  resetCoverageQuoteCache,
} from "@/lib/watchlists/quotes";

function tapeQuote(
  ticker: string,
  last: number,
  extras: Partial<NormalizedQuote> = {},
): NormalizedQuote {
  return {
    instrumentId: `test:${ticker}`,
    ticker,
    last,
    open: extras.open ?? null,
    priorClose: extras.priorClose ?? null,
    changeAbsolute: extras.changeAbsolute ?? null,
    changePercent: extras.changePercent ?? null,
    volume: extras.volume ?? 1_000,
    marketSession: "regular",
    providerName: "test",
    providerTimestamp: "2026-08-14T20:00:00.000Z",
    retrievalTimestamp: "2026-08-14T20:00:00.000Z",
    delayStatus: "delayed",
    currency: "USD",
    sourceQuality: "secondary",
    value: last,
    units: "price",
    ...extras,
  };
}

afterEach(() => {
  resetCoverageQuoteCache();
});

describe("loadCoverageQuotes", () => {
  it("keeps tape last and fills 1D from Yahoo when IEX omits changePercent", async () => {
    const result = await loadCoverageQuotes(["AMAT"], {
      tape: [tapeQuote("AMAT", 188, { changePercent: null, volume: 5_400_000 })],
      yahooQuotes: async () =>
        new Map([
          [
            "AMAT",
            {
              name: "Applied Materials",
              price: 187.4,
              marketCap: 156_000_000_000,
              avgVolume: 5_100_000,
              changePercent: 4.44,
              previousClose: 180,
            },
          ],
        ]),
      yahooSpark: async () => new Map(),
    });
    const row = result.rows.find((item) => item.ticker === "AMAT");
    expect(row?.last).toBe(188);
    expect(row?.change1dPercent).toBe(4.44);
    expect(row?.name).toBe("Applied Materials");
  });

  it("uses spark last close when tape and Yahoo quotes are missing", async () => {
    const result = await loadCoverageQuotes(["LITE"], {
      tape: [],
      yahooQuotes: async () => new Map(),
      yahooSpark: async () =>
        new Map([
          [
            "LITE",
            [
              { date: "2026-08-12", close: 50 },
              { date: "2026-08-13", close: 52 },
              { date: "2026-08-14", close: 55 },
            ],
          ],
        ]),
    });
    const row = result.rows.find((item) => item.ticker === "LITE");
    expect(row?.last).toBe(55);
    expect(row?.change1dPercent).toBeCloseTo(5.77, 2);
  });

  it("reuses cached spark last close without refetching history", async () => {
    const sparkCloses = [
      { date: "2026-08-12", close: 50 },
      { date: "2026-08-13", close: 52 },
      { date: "2026-08-14", close: 55 },
    ];
    await loadCoverageQuotes(["COHR"], {
      tape: [],
      yahooQuotes: async () => new Map(),
      yahooSpark: async () => new Map([["COHR", sparkCloses]]),
    });
    const second = await loadCoverageQuotes(["COHR"], {
      tape: [],
      yahooQuotes: async () => new Map(),
      yahooSpark: async () => {
        throw new Error("spark should be served from cache");
      },
    });
    expect(second.rows[0]?.last).toBe(55);
    expect(second.rows[0]?.change1dPercent).toBeCloseTo(5.77, 2);
  });

  it("fills session fields from Yahoo when the tape only has one name", async () => {
    const result = await loadCoverageQuotes(
      ["PLTR", "NBIS", "LUNR"],
      {
        tape: [tapeQuote("PLTR", 174.4, { open: 174.07, changePercent: 0.22, volume: 257_000 })],
        yahooQuotes: async () =>
          new Map([
            [
              "PLTR",
              {
                name: "Palantir",
                price: 174.4,
                marketCap: 419_400_000_000,
                avgVolume: 40_000_000,
                changePercent: 0.22,
                open: 174.07,
                volume: 257_000,
              },
            ],
            [
              "NBIS",
              {
                name: "Nebius",
                price: 277.32,
                marketCap: 68_200_000_000,
                avgVolume: 12_000_000,
                changePercent: 8.85,
                open: 255,
                volume: 489_496,
              },
            ],
            [
              "LUNR",
              {
                name: "Intuitive Machines",
                price: 12.4,
                marketCap: 2_100_000_000,
                avgVolume: 9_000_000,
                changePercent: 1.2,
                open: 12.2,
                volume: 4_200_000,
              },
            ],
          ]),
        yahooSpark: async () => new Map(),
      },
    );
    expect(result.quotedCount).toBe(3);
    expect(result.rows.find((row) => row.ticker === "NBIS")?.last).toBe(277.32);
    expect(result.rows.find((row) => row.ticker === "LUNR")?.volume).toBe(4_200_000);
    expect(result.rows.find((row) => row.ticker === "PLTR")?.quoteSource).toBe("tape");
    expect(result.rows.find((row) => row.ticker === "NBIS")?.quoteSource).toBe("yahoo");
  });

  it("does not drop the rest of a batch when one symbol is missing from Yahoo", async () => {
    const result = await loadCoverageQuotes(["AAPL", "ZZZZZ", "MSFT"], {
      tape: [],
      yahooQuotes: async () =>
        new Map([
          [
            "AAPL",
            {
              name: "Apple",
              price: 227,
              marketCap: 3_000_000_000_000,
              avgVolume: 40_000_000,
              open: 226,
              volume: 1_000,
              changePercent: 0.4,
            },
          ],
          [
            "MSFT",
            {
              name: "Microsoft",
              price: 428,
              marketCap: 3_000_000_000_000,
              avgVolume: 20_000_000,
              open: 426,
              volume: 2_000,
              changePercent: 0.5,
            },
          ],
        ]),
      yahooSpark: async () => new Map(),
    });
    expect(result.rows.find((row) => row.ticker === "AAPL")?.last).toBe(227);
    expect(result.rows.find((row) => row.ticker === "MSFT")?.last).toBe(428);
    expect(result.rows.find((row) => row.ticker === "ZZZZZ")?.last).toBeNull();
    expect(result.diagnostics.find((row) => row.ticker === "ZZZZZ")?.reason).toBe(
      "unknown_symbol",
    );
  });

  it("reuses cached Yahoo session prints without refetching quotes", async () => {
    await loadCoverageQuotes(["NBIS"], {
      tape: [],
      yahooQuotes: async () =>
        new Map([
          [
            "NBIS",
            {
              name: "Nebius",
              price: 277.32,
              marketCap: 68_200_000_000,
              avgVolume: 12_000_000,
              open: 255,
              volume: 489_496,
              changePercent: 8.85,
            },
          ],
        ]),
      yahooSpark: async () => new Map(),
    });
    const second = await loadCoverageQuotes(["NBIS"], {
      tape: [],
      yahooQuotes: async () => {
        throw new Error("yahoo quotes should be served from cache");
      },
      yahooSpark: async () => new Map(),
    });
    expect(second.rows[0]?.last).toBe(277.32);
    expect(second.rows[0]?.volume).toBe(489_496);
    expect(second.rows[0]?.change1dPercent).toBe(8.85);
  });

  it("uses Yahoo premarket last when the tape is still the prior close", async () => {
    const result = await loadCoverageQuotes(["NVDA"], {
      session: "premarket",
      tape: [tapeQuote("NVDA", 100, { changePercent: 0, priorClose: 100 })],
      yahooQuotes: async () =>
        new Map([
          [
            "NVDA",
            {
              name: "NVIDIA",
              price: 103.5,
              marketCap: 3_000_000_000_000,
              avgVolume: 180_000_000,
              changePercent: 3.5,
              previousClose: 100,
              preMarketPrice: 103.5,
              preMarketChangePercent: 3.5,
            },
          ],
        ]),
      yahooSpark: async () => new Map(),
    });
    const row = result.rows.find((item) => item.ticker === "NVDA");
    expect(row?.last).toBe(103.5);
    expect(row?.preMarketChangePercent).toBe(3.5);
    expect(row?.change1dPercent).toBe(3.5);
  });
});
