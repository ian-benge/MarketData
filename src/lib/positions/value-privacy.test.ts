import { describe, expect, it } from "vitest";
import { emptySummary } from "./math";
import {
  bookPnlForWindow,
  isBookPnlWindow,
  sumSeriesPnl,
} from "./value-privacy";
import type { PortfolioPoint, PositionsSnapshot } from "./types";

function point(dayPnl: number | null): PortfolioPoint {
  return {
    date: "2026-08-01",
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
  } = {},
): Pick<PositionsSnapshot, "series" | "summary"> {
  const { series = [], ...summary } = extra;
  return {
    series,
    summary: { ...emptySummary(), ...summary },
  };
}

describe("book P&L windows", () => {
  it("accepts the supported window ids", () => {
    expect(isBookPnlWindow("1d")).toBe(true);
    expect(isBookPnlWindow("1y")).toBe(true);
    expect(isBookPnlWindow("max")).toBe(true);
    expect(isBookPnlWindow("ytd")).toBe(false);
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

  it("uses live day P&L for 1D and lifetime totals for Max", () => {
    const snap = snapshot({
      dayPnl: 12,
      dayPercent: 0.5,
      pnlBeforeFees: 100,
      totalPnl: 80,
      bookReturnPercent: 4,
    });
    expect(bookPnlForWindow(snap, "1d")).toEqual({
      beforeFees: 12,
      afterFees: 12,
      percent: 0.5,
    });
    expect(bookPnlForWindow(snap, "max")).toEqual({
      beforeFees: 100,
      afterFees: 80,
      percent: 4,
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
    expect(bookPnlForWindow(fallback, "1w")).toEqual({
      beforeFees: 15,
      afterFees: 15,
      percent: 10,
    });
  });
});
