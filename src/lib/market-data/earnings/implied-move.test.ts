import { describe, expect, it } from "vitest";
import {
  atmStraddleMove,
  contractMid,
  pickAtmStrike,
  pickEarningsExpiry,
} from "@/lib/market-data/earnings/implied-move";
import { isUsCommonTicker, passesLargeCapVolume } from "@/lib/market-data/earnings/filter";

describe("atm straddle implied move", () => {
  it("uses bid/ask mid and reports percent of spot", () => {
    const move = atmStraddleMove(
      100,
      [{ strike: 100, bid: 4.8, ask: 5.2, last: 5, impliedVolatility: 0.4 }],
      [{ strike: 100, bid: 3.9, ask: 4.1, last: 4, impliedVolatility: 0.4 }],
    );
    expect(move).toEqual({
      strike: 100,
      callMid: 5,
      putMid: 4,
      straddle: 9,
      dollars: 9,
      percent: 9,
    });
  });

  it("picks the closest listed strike", () => {
    expect(pickAtmStrike(101.4, [95, 100, 105])).toBe(100);
    expect(contractMid({ strike: 1, bid: 0, ask: 0, last: 2.5, impliedVolatility: null })).toBe(
      2.5,
    );
  });

  it("selects the first expiry that still covers an AMC print", () => {
    const thursday = Date.parse("2026-08-13T00:00:00.000Z") / 1000;
    const friday = Date.parse("2026-08-14T00:00:00.000Z") / 1000;
    expect(pickEarningsExpiry([thursday, friday], "2026-08-13", "amc")).toBe(friday);
    expect(pickEarningsExpiry([thursday, friday], "2026-08-13", "bmo")).toBe(thursday);
  });
});

describe("ticker inclusion", () => {
  it("keeps common listed symbols including class shares", () => {
    expect(isUsCommonTicker("AAPL")).toBe(true);
    expect(isUsCommonTicker("BRK.B")).toBe(true);
    expect(isUsCommonTicker("BF-B")).toBe(true);
    expect(isUsCommonTicker("BF/B")).toBe(true);
  });
});

describe("optional large-cap volume filter", () => {
  it("identifies liquid mega-caps without dropping smaller names from the calendar", () => {
    expect(
      passesLargeCapVolume({
        symbol: "MSFT",
        name: "Microsoft",
        price: 500,
        marketCap: 3_700_000_000_000,
        avgVolume: 20_000_000,
        quoteType: "EQUITY",
      }),
    ).toBe(true);
    expect(
      passesLargeCapVolume({
        symbol: "TINY",
        name: "Tiny Co",
        price: 12,
        marketCap: 2_000_000_000,
        avgVolume: 5_000_000,
        quoteType: "EQUITY",
      }),
    ).toBe(false);
  });
});
