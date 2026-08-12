import { describe, expect, it } from "vitest";
import {
  attachSettlementStats,
  mergeFedFundsQuotes,
  parseYahooSparkQuotes,
} from "@/lib/market-data/fedwatch/sources";

describe("parseYahooSparkQuotes", () => {
  it("reads last non-null close and trade time from the flat spark map", () => {
    const quotes = parseYahooSparkQuotes({
      "ZQU26.CBT": {
        symbol: "ZQU26.CBT",
        timestamp: [1_786_478_700, 1_786_478_824],
        close: [96.305, 96.31],
      },
      "ZQV26.CBT": {
        symbol: "ZQV26.CBT",
        timestamp: [1_786_478_700, 1_786_479_240],
        close: [96.235, null],
      },
    });
    expect(quotes).toEqual([
      {
        monthKey: "SEP 26",
        year: 2026,
        month: 9,
        price: 96.31,
        volume: null,
        openInterest: null,
        tradedAt: new Date(1_786_478_824 * 1000).toISOString(),
      },
      {
        monthKey: "OCT 26",
        year: 2026,
        month: 10,
        price: 96.235,
        volume: null,
        openInterest: null,
        tradedAt: new Date(1_786_478_700 * 1000).toISOString(),
      },
    ]);
  });
});

describe("mergeFedFundsQuotes", () => {
  it("lets live lasts overwrite history prices and keeps settlement OI", () => {
    const merged = attachSettlementStats(
      mergeFedFundsQuotes(
        [
          {
            monthKey: "SEP 26",
            year: 2026,
            month: 9,
            price: 96.3,
            volume: 18000,
            openInterest: null,
          },
        ],
        [
          {
            monthKey: "SEP 26",
            year: 2026,
            month: 9,
            price: 96.31,
            volume: null,
            openInterest: null,
            tradedAt: "2026-08-11T20:07:04.000Z",
          },
        ],
      ),
      [
        {
          monthKey: "SEP 26",
          year: 2026,
          month: 9,
          price: 96.28,
          volume: 21189,
          openInterest: 256475,
        },
      ],
    );
    expect(merged).toEqual([
      {
        monthKey: "SEP 26",
        year: 2026,
        month: 9,
        price: 96.31,
        volume: 18000,
        openInterest: 256475,
        tradedAt: "2026-08-11T20:07:04.000Z",
      },
    ]);
  });
});
