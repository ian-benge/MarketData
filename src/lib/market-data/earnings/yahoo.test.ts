import { describe, expect, it } from "vitest";
import {
  parseYahooChartBars,
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
            regularMarketChangePercent: 1.25,
            regularMarketPreviousClose: 497.6,
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
        changePercent: 1.25,
        open: null,
        volume: null,
        previousClose: 497.6,
        dayHigh: null,
        dayLow: null,
        marketState: null,
        preMarketPrice: null,
        postMarketPrice: null,
        preMarketChangePercent: null,
        postMarketChangePercent: null,
        preMarketVolume: null,
        floatShares: null,
        sharesOutstanding: null,
        shortPercentOfFloat: null,
        fiftyTwoWeekHigh: null,
        firstTradeDateMs: null,
      },
    ]);
  });

  it("keeps share-class tickers from a mixed batch", () => {
    const quotes = parseYahooQuoteBatch({
      quoteResponse: {
        result: [
          { symbol: "BRK-B", regularMarketPrice: 502.24, regularMarketChangePercent: -0.36 },
          { symbol: "AAPL", regularMarketPrice: 227.3 },
        ],
      },
    });
    expect(quotes.map((row) => row.symbol)).toEqual(["BRK-B", "AAPL"]);
    expect(quotes[0]?.price).toBe(502.24);
  });

  it("uses preMarketPrice as last during PRE and keeps the premarket percent", () => {
    const quotes = parseYahooQuoteBatch({
      quoteResponse: {
        result: [
          {
            symbol: "NVDA",
            shortName: "NVIDIA",
            marketState: "PRE",
            regularMarketPrice: 100,
            regularMarketPreviousClose: 100,
            regularMarketChangePercent: 0,
            preMarketPrice: 103.5,
            preMarketChangePercent: 3.5,
          },
        ],
      },
    });
    expect(quotes[0]?.price).toBe(103.5);
    expect(quotes[0]?.changePercent).toBe(3.5);
    expect(quotes[0]?.preMarketPrice).toBe(103.5);
    expect(quotes[0]?.preMarketChangePercent).toBe(3.5);
    expect(quotes[0]?.marketState).toBe("PRE");
  });

  it("captures preMarketVolume from a quote batch", () => {
    const quotes = parseYahooQuoteBatch({
      quoteResponse: {
        result: [
          {
            symbol: "ABCD",
            marketState: "PRE",
            regularMarketPrice: 6.5,
            regularMarketPreviousClose: 6.5,
            preMarketPrice: 7.8,
            preMarketVolume: 4_000_000,
          },
        ],
      },
    });
    expect(quotes[0]?.preMarketVolume).toBe(4_000_000);
  });

  it("derives premarket percent from price vs prior close when Yahoo omits it", () => {
    const quotes = parseYahooQuoteBatch({
      quoteResponse: {
        result: [
          {
            symbol: "AMD",
            marketState: "PRE",
            regularMarketPrice: 160,
            regularMarketPreviousClose: 160,
            preMarketPrice: 164,
          },
        ],
      },
    });
    expect(quotes[0]?.preMarketChangePercent).toBeCloseTo(2.5);
    expect(quotes[0]?.price).toBe(164);
  });

  it("reads includePrePost chart bars", () => {
    const bars = parseYahooChartBars({
      chart: {
        result: [
          {
            timestamp: [1_786_900_800, 1_786_901_100],
            indicators: {
              quote: [
                {
                  open: [100, 101],
                  high: [101, 102],
                  low: [99.5, 100.5],
                  close: [100.8, 101.4],
                  volume: [1_200, 800],
                },
              ],
            },
          },
        ],
      },
    });
    expect(bars).toHaveLength(2);
    expect(bars[0]?.open).toBe(100);
    expect(bars[1]?.close).toBe(101.4);
    expect(bars[0]?.barStart).toBe(new Date(1_786_900_800 * 1000).toISOString());
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
