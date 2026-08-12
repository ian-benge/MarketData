import { describe, expect, it } from "vitest";
import {
  parseYahooOptionChain,
  parseYahooQuoteBatch,
  parseYahooSparkDailyCloses,
} from "@/lib/market-data/earnings/yahoo";

describe("yahoo earnings parsers", () => {
  it("reads market cap and 10-day volume from a quote batch", () => {
    const quotes = parseYahooQuoteBatch({
      quoteResponse: {
        result: [
          {
            symbol: "msft",
            quoteType: "EQUITY",
            shortName: "Microsoft Corporation",
            regularMarketPrice: 503.81,
            marketCap: 3_741_064_101_888,
            averageDailyVolume10Day: 49_765_410,
          },
        ],
      },
    });
    expect(quotes).toEqual([
      {
        symbol: "MSFT",
        name: "Microsoft Corporation",
        price: 503.81,
        marketCap: 3_741_064_101_888,
        avgVolume: 49_765_410,
        quoteType: "EQUITY",
      },
    ]);
  });

  it("reads ATM-ready calls and puts from an option chain", () => {
    const chain = parseYahooOptionChain({
      optionChain: {
        result: [
          {
            underlyingSymbol: "MSFT",
            expirationDates: [1_786_492_800, 1_786_665_600],
            quote: {
              symbol: "MSFT",
              quoteType: "EQUITY",
              shortName: "Microsoft Corporation",
              regularMarketPrice: 500,
              marketCap: 3_700_000_000_000,
              averageDailyVolume10Day: 20_000_000,
            },
            options: [
              {
                expirationDate: 1_786_492_800,
                calls: [{ strike: 500, bid: 8, ask: 8.4, lastPrice: 8.2 }],
                puts: [{ strike: 500, bid: 7.6, ask: 8, lastPrice: 7.8 }],
              },
            ],
          },
        ],
      },
    });
    expect(chain?.calls).toHaveLength(1);
    expect(chain?.puts[0]?.bid).toBe(7.6);
    expect(chain?.expirationDates).toHaveLength(2);
  });

  it("reads batched spark daily closes for 1w basis", () => {
    const closes = parseYahooSparkDailyCloses({
      spark: {
        result: [
          {
            symbol: "NVDA",
            response: [
              {
                timestamp: [1_700_000_000, 1_700_086_400],
                indicators: { quote: [{ close: [100, 104] }] },
              },
            ],
          },
        ],
      },
    });
    expect(closes.get("NVDA")).toEqual([
      { date: new Date(1_700_000_000 * 1000).toISOString().slice(0, 10), close: 100 },
      { date: new Date(1_700_086_400 * 1000).toISOString().slice(0, 10), close: 104 },
    ]);
  });
});
