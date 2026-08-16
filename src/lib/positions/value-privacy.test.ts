import { describe, expect, it } from "vitest";
import { emptySummary, enrichPosition } from "./math";
import {
  bookPnlForWindow,
  contributorsForWindow,
  isBookPnlWindow,
  sumSeriesPnl,
} from "./value-privacy";
import type { PortfolioPoint, PositionsSnapshot } from "./types";

function point(dayPnl: number | null, date = "2026-08-01"): PortfolioPoint {
  return {
    date,
    dayPnl,
    cumulativePnl: dayPnl,
    openCount: 1,
    events: [],
    carried: [],
    leader: null,
  };
}

function snapshot(
  extra: Partial<PositionsSnapshot["summary"]> & {
    series?: PortfolioPoint[];
    asOf?: string;
  } = {},
): Pick<PositionsSnapshot, "series" | "summary" | "asOf"> {
  const { series = [], asOf = "2026-08-13T15:00:00.000Z", ...summary } = extra;
  return {
    series,
    asOf,
    summary: { ...emptySummary(), ...summary },
  };
}

describe("book P&L windows", () => {
  it("accepts the unified window ids including YTD", () => {
    expect(isBookPnlWindow("1d")).toBe(true);
    expect(isBookPnlWindow("ytd")).toBe(true);
    expect(isBookPnlWindow("max")).toBe(true);
    expect(isBookPnlWindow("1y")).toBe(false);
  });

  it("sums the last N session P&Ls and skips gaps", () => {
    expect(
      sumSeriesPnl(
        [point(10), point(null), point(-3), point(5), point(2)],
        3,
      ),
    ).toBe(4);
    expect(sumSeriesPnl([point(null), point(null)], 5)).toBeNull();
  });

  it("uses realized-today for 1D on a flat book and NAV for Max percent", () => {
    const snap = snapshot({
      openCount: 0,
      closedCount: 4,
      realizedTodayPnl: null,
      dayPnl: 12,
      dayPercent: 0.5,
      pnlBeforeFees: 100,
      totalPnl: -4594.48,
      accountValue: 1.28,
      bookReturnPercent: 4,
    });
    expect(bookPnlForWindow(snap, "1d")).toMatchObject({
      beforeFees: null,
      afterFees: null,
      hint: "Flat · no closes today",
    });
    const max = bookPnlForWindow(snap, "max");
    expect(max.afterFees).toBeCloseTo(-4594.48);
    expect(max.percentBase).toBe("nav");
    expect(max.percent).toBeCloseTo((-4594.48 / 1.28) * 100);
  });

  it("labels Max percent vs premium when NAV is missing and the book is options", () => {
    const snap = snapshot({
      openCount: 0,
      totalPnl: -10,
      closedCostBasis: 100,
      closedAllOptions: true,
    });
    expect(bookPnlForWindow(snap, "max")).toMatchObject({
      percent: -10,
      percentBase: "premium",
    });
  });

  it("windows 1W from the series and falls back to open-lot 1W", () => {
    const fromSeries = snapshot({
      series: [point(1), point(2), point(3), point(4), point(5), point(6)],
      grossExposure: 100,
    });
    expect(bookPnlForWindow(fromSeries, "1w").beforeFees).toBe(20);
    expect(bookPnlForWindow(fromSeries, "1w").percent).toBe(20);

    const fallback = snapshot({ change1wPnl: 15, accountValue: 150 });
    expect(bookPnlForWindow(fallback, "1w").beforeFees).toBe(15);
    expect(bookPnlForWindow(fallback, "1w").percent).toBe(10);
  });
});

describe("contributorsForWindow", () => {
  it("uses day P&L for 1D and collapses same-day OCC fills", () => {
    const base = {
      firmId: "firm-1",
      ticker: "MSFT260202C00430000",
      assetType: "option" as const,
      side: "short" as const,
      quantity: 1,
      multiplier: 100,
      entryPrice: 1,
      entryDate: "2026-02-02",
      currency: "USD",
      strategy: null,
      notes: null,
      status: "closed" as const,
      closeDate: "2026-08-13",
      closedAt: "2026-08-13T20:00:00.000Z",
      createdBy: "user-1",
      bookId: "book-1",
      source: "snaptrade" as const,
      createdAt: "2026-08-13T14:00:00.000Z",
      updatedAt: "2026-08-13T20:00:00.000Z",
    };
    const winner = enrichPosition(
      { ...base, id: "a", closePrice: 0.4, fees: 1 },
      undefined,
      undefined,
      "2026-08-13T21:00:00.000Z",
    );
    const loser = enrichPosition(
      { ...base, id: "b", closePrice: 2.2, fees: 1 },
      undefined,
      undefined,
      "2026-08-13T21:00:00.000Z",
    );
    const grouped = contributorsForWindow(
      [winner, loser],
      "1d",
      "2026-08-13T21:00:00.000Z",
    );
    const all = [...grouped.winners, ...grouped.losers];
    expect(all).toHaveLength(1);
    expect(all[0]?.ticker).toBe("MSFT260202C00430000");
  });
});
