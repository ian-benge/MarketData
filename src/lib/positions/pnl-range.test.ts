import { describe, expect, it } from "vitest";
import { slicePortfolioSeries, ytdStart } from "./pnl-range";
import type { PortfolioPoint, PositionRecord } from "./types";

function point(date: string, extra: Partial<PortfolioPoint> = {}): PortfolioPoint {
  return {
    date,
    dayPnl: 1,
    cumulativePnl: 1,
    openCount: 1,
    events: [],
    carried: [],
    leader: null,
    ...extra,
  };
}

function position(ticker: string, entryDate: string): PositionRecord {
  return {
    id: `pos-${ticker}`,
    firmId: "firm-1",
    ticker,
    assetType: "equity",
    side: "long",
    quantity: 10,
    multiplier: 1,
    entryPrice: 100,
    entryDate,
    currency: "USD",
    strategy: null,
    notes: null,
    status: "open",
    closePrice: null,
    closeDate: null,
    closedAt: null,
    createdBy: null,
    bookId: null,
    createdAt: `${entryDate}T14:00:00.000Z`,
    updatedAt: `${entryDate}T14:00:00.000Z`,
  };
}

describe("portfolio P&L range", () => {
  const series = [
    point("2026-01-02"),
    point("2026-05-01"),
    point("2026-07-01"),
    point("2026-08-13"),
  ];

  it("uses the Chicago year for YTD", () => {
    expect(ytdStart("2026-08-13T18:00:00.000Z")).toBe("2026-01-01");
  });

  it("keeps Max as the full path and 1M as the last sessions", () => {
    const long = Array.from({ length: 30 }, (_, index) =>
      point(`2026-07-${String(index + 1).padStart(2, "0")}`),
    );
    expect(slicePortfolioSeries(long, "Max", "2026-08-13T12:00:00.000Z")).toHaveLength(30);
    expect(slicePortfolioSeries(long, "1M", "2026-08-13T12:00:00.000Z")).toHaveLength(22);
  });

  it("marks lots opened before the visible window as carried in", () => {
    const long = Array.from({ length: 30 }, (_, index) =>
      point(`2026-07-${String(index + 1).padStart(2, "0")}`),
    );
    const sliced = slicePortfolioSeries(
      long,
      "1M",
      "2026-08-13T12:00:00.000Z",
      [position("SPY", "2026-04-15"), position("IWM", "2026-07-28")],
    );
    expect(sliced).toHaveLength(22);
    expect(sliced[0]?.date).toBe("2026-07-09");
    expect(sliced[0]?.carried.map((event) => event.ticker)).toEqual(["SPY"]);
  });

  it("filters YTD from January 1 of the as-of year", () => {
    const sliced = slicePortfolioSeries(series, "YTD", "2026-08-13T12:00:00.000Z");
    expect(sliced[0]?.date).toBe("2026-01-02");
    expect(sliced).toHaveLength(4);
  });
});
