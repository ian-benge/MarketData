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
});
