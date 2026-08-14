import { describe, expect, it } from "vitest";
import { emptySummary } from "./math";
import {
  bookPnlForWindow,
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
