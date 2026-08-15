import { describe, expect, it } from "vitest";
import { emptyCoverageQuote } from "@/lib/watchlists/assemble";
import { runScreen } from "@/lib/watchlists/screens";
import type { CoverageQuote } from "@/lib/watchlists/types";

function quote(ticker: string, extras: Partial<CoverageQuote> = {}): CoverageQuote {
  return {
    ...emptyCoverageQuote(ticker),
    last: 10,
    missing: [],
    ...extras,
  };
}

describe("coverage screens", () => {
  it("ranks premarket movers by absolute move and ignores quiet names", () => {
    const rows = [
      quote("NVDA", { preMarketChangePercent: 2.4 }),
      quote("MSFT", { preMarketChangePercent: 0.2 }),
      quote("AMD", { preMarketChangePercent: -3.1 }),
    ];
    expect(runScreen("premarket_movers", rows)).toEqual(["AMD", "NVDA"]);
  });

  it("keeps relative-volume leaders above the 1.8x threshold", () => {
    const rows = [
      quote("AAOI", { relativeVolume: 2.4 }),
      quote("FN", { relativeVolume: 1.2 }),
      quote("COHR", { relativeVolume: 1.9 }),
    ];
    expect(runScreen("relative_volume", rows)).toEqual(["AAOI", "COHR"]);
  });

  it("uses the earnings calendar for today and this week", () => {
    const rows = [quote("NVDA"), quote("AMD"), quote("MSFT")];
    const earningsDates = new Map([
      ["NVDA", "2026-08-14"],
      ["AMD", "2026-08-18"],
      ["MSFT", "2026-09-01"],
    ]);
    const now = new Date("2026-08-14T18:00:00.000Z");
    expect(runScreen("earnings_today", rows, { earningsDates, now })).toEqual(["NVDA"]);
    expect(runScreen("earnings_week", rows, { earningsDates, now })).toEqual([
      "NVDA",
      "AMD",
    ]);
  });

  it("limits high-beta oil to the oil universe and a move/rvol hurdle", () => {
    const rows = [
      quote("XLE", { change1dPercent: 1 }),
      quote("XOP", { change1dPercent: 4.2, relativeVolume: 1.1 }),
      quote("NVDA", { change1dPercent: 8, relativeVolume: 3 }),
    ];
    expect(runScreen("high_beta_oil", rows)).toEqual(["XOP"]);
  });
});
