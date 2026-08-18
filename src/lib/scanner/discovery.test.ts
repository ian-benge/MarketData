import { describe, expect, it } from "vitest";
import {
  mergeDiscoveredMovers,
  parseNasdaqMarketMovers,
} from "@/lib/scanner/discovery";
import { parseYahooScreenerSymbols } from "@/lib/market-data/earnings/yahoo";

describe("scanner discovery merge", () => {
  it("round-robins sources so Yahoo/Nasdaq premarket names are not starved by Massive", () => {
    const merged = mergeDiscoveredMovers(
      [
        {
          tickers: ["AAA", "AAB", "AAC"],
          details: [
            { ticker: "AAA", source: "massive", coverage: "full_market" },
            { ticker: "AAB", source: "massive", coverage: "full_market" },
            { ticker: "AAC", source: "massive", coverage: "full_market" },
          ],
          notes: ["massive"],
        },
        {
          tickers: ["PM1"],
          details: [{ ticker: "PM1", source: "nasdaq", coverage: "delayed_unofficial" }],
          notes: ["nasdaq"],
        },
        {
          tickers: ["PM2"],
          details: [{ ticker: "PM2", source: "yahoo", coverage: "delayed_unofficial" }],
          notes: ["yahoo"],
        },
      ],
      4,
    );
    expect(merged.tickers).toEqual(["AAA", "PM1", "PM2", "AAB"]);
  });
});

describe("screener parsers", () => {
  it("reads Yahoo screener quote symbols", () => {
    expect(
      parseYahooScreenerSymbols({
        finance: { result: [{ quotes: [{ symbol: "abcd" }, { symbol: "ABCD" }, { symbol: "efgh" }] }] },
      }),
    ).toEqual(["ABCD", "EFGH"]);
  });

  it("walks Nasdaq market-movers JSON for ticker fields", () => {
    expect(
      parseNasdaqMarketMovers({
        data: {
          PREMARKET: {
            GAINERS: { table: { rows: [{ symbol: "xyz" }, { ticker: "UVW" }] } },
          },
        },
      }),
    ).toEqual(["XYZ", "UVW"]);
  });
});
