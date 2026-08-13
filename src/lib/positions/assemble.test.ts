import { describe, expect, it } from "vitest";
import { assemblePositionsSnapshot, emptyPositionsSnapshot, applyAccountValueToSnapshot } from "./assemble";
import type { DailyClose, PositionQuote, PositionRecord } from "./types";

function position(ticker: string): PositionRecord {
  return {
    id: `pos-${ticker}`,
    firmId: "firm-1",
    ticker,
    assetType: "equity",
    side: "long",
    quantity: 10,
    multiplier: 1,
    entryPrice: 100,
    entryDate: "2026-07-01",
    currency: "USD",
    strategy: "core",
    notes: null,
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
    createdBy: null,
    bookId: null,
    createdAt: "2026-07-01T14:00:00.000Z",
    updatedAt: "2026-07-01T14:00:00.000Z",
  };
}

describe("assemblePositionsSnapshot", () => {
  it("attaches daily history by ticker for inspector charts", () => {
    const closes: DailyClose[] = [
      { date: "2026-08-11", close: 100 },
      { date: "2026-08-12", close: 108 },
      { date: "2026-08-13", close: 110 },
    ];
    const quotes = new Map<string, PositionQuote>([
      [
        "NVDA",
        {
          ticker: "NVDA",
          last: 110,
          priorClose: 108,
          open: 108,
          changeAbsolute: 2,
          changePercent: 1.85,
          currency: "USD",
          stale: false,
        },
      ],
    ]);

    const snapshot = assemblePositionsSnapshot({
      positions: [position("NVDA")],
      quotes,
      closes: new Map([["NVDA", closes]]),
      asOf: "2026-08-13T15:00:00.000Z",
      persistence: "fixtures",
      usingFixtures: true,
      latencyCoverageLabel: "Mock data",
    });

    expect(snapshot.history.NVDA).toEqual(closes);
    expect(snapshot.positions[0]?.last).toBe(110);
    expect(snapshot.positions[0]?.sparkline.length).toBeGreaterThan(0);
    expect(snapshot.series.length).toBe(3);
  });

  it("keeps empty snapshots fixture-free", () => {
    const snapshot = emptyPositionsSnapshot("not connected");
    expect(snapshot.history).toEqual({});
    expect(snapshot.positions).toEqual([]);
    expect(snapshot.owners).toEqual([]);
    expect(snapshot.books).toEqual([]);
    expect(snapshot.bookId).toBe("");
    expect(snapshot.usingFixtures).toBe(false);
    expect(snapshot.persistence).toBe("unavailable");
  });

  it("applies account value to portfolio, cash, and weights without refetching marks", () => {
    const quotes = new Map<string, PositionQuote>([
      [
        "NVDA",
        {
          ticker: "NVDA",
          last: 110,
          priorClose: 108,
          open: 108,
          changeAbsolute: 2,
          changePercent: 1.85,
          currency: "USD",
          stale: false,
        },
      ],
    ]);
    const base = assemblePositionsSnapshot({
      positions: [position("NVDA")],
      quotes,
      closes: new Map(),
      asOf: "2026-08-13T15:00:00.000Z",
      persistence: "fixtures",
      usingFixtures: true,
      latencyCoverageLabel: "Mock data",
    });
    expect(base.accountValue).toBeNull();
    expect(base.summary.cash).toBeNull();

    const funded = applyAccountValueToSnapshot(base, 20_000);
    expect(funded.accountValue).toBe(20_000);
    expect(funded.summary.portfolioValue).toBe(20_000);
    expect(funded.summary.investedValue).toBeCloseTo(1_100);
    expect(funded.summary.cash).toBeCloseTo(18_900);
    expect(funded.summary.intradayBuyingPower).toBe(80_000);
    expect(funded.summary.overnightBuyingPower).toBe(40_000);
    expect(funded.summary.optionBuyingPower).toBeCloseTo(18_900);
    expect(funded.positions[0]?.weight).toBeCloseTo(5.5);
  });
});
