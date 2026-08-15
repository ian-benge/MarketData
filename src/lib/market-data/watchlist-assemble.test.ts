import { describe, expect, it } from "vitest";
import {
  assembleWatchlistRows,
  weekAgoClose,
} from "@/lib/market-data/watchlist-assemble";

describe("assembleWatchlistRows", () => {
  it("computes from-open, 1w, and rvol without inventing missing fields", () => {
    const [row] = assembleWatchlistRows(
      ["NVDA"],
      new Map([
        [
          "NVDA",
          { ticker: "NVDA", last: 110, open: 100, changePercent: 4.76, volume: 20_000_000 },
        ],
      ]),
      new Map([
        [
          "NVDA",
          { name: "NVIDIA", marketCap: 3_000_000_000_000, avgVolume: 10_000_000, weekAgoClose: 100 },
        ],
      ]),
    );
    expect(row).toMatchObject({
      last: 110,
      change1dPercent: 4.76,
      changeFromOpenPercent: 10,
      change1wPercent: 10,
      relativeVolume: 2,
      marketCap: 3_000_000_000_000,
      volume: 20_000_000,
      missing: [],
    });
  });

  it("keeps partial rows and lists missing fields as — sources", () => {
    const [row] = assembleWatchlistRows(
      ["ABC"],
      new Map([["ABC", { ticker: "ABC", last: 10, volume: 1_000 }]]),
    );
    expect(row?.changeFromOpenPercent).toBeNull();
    expect(row?.change1wPercent).toBeNull();
    expect(row?.relativeVolume).toBeNull();
    expect(row?.marketCap).toBeNull();
    expect(row?.missing).toEqual(
      expect.arrayContaining(["change1d", "changeFromOpen", "change1w", "rvol", "marketCap"]),
    );
  });

  it("derives 1D from previous close when the tape omits changePercent", () => {
    const [row] = assembleWatchlistRows(
      ["AMAT"],
      new Map([["AMAT", { ticker: "AMAT", last: 188, volume: 1_000 }]]),
      new Map([["AMAT", { previousClose: 180 }]]),
    );
    expect(row?.change1dPercent).toBeCloseTo(4.44, 2);
    expect(row?.missing).not.toContain("change1d");
  });

  it("preserves watchlist order including names with no quote", () => {
    const rows = assembleWatchlistRows(
      ["MSFT", "ZZZ"],
      new Map([["MSFT", { ticker: "MSFT", last: 400, open: 398, changePercent: 0.4, volume: 1 }]]),
    );
    expect(rows.map((row) => row.ticker)).toEqual(["MSFT", "ZZZ"]);
    expect(rows[1]?.last).toBeNull();
    expect(rows[1]?.missing).toContain("last");
  });
});

describe("weekAgoClose", () => {
  it("uses the close from five sessions before the latest bar", () => {
    const close = weekAgoClose([
      { date: "2026-08-03", close: 100 },
      { date: "2026-08-04", close: 101 },
      { date: "2026-08-05", close: 102 },
      { date: "2026-08-06", close: 103 },
      { date: "2026-08-07", close: 104 },
      { date: "2026-08-10", close: 110 },
    ]);
    expect(close).toBe(100);
  });

  it("returns null instead of inventing a 1w basis", () => {
    expect(weekAgoClose([{ date: "2026-08-10", close: 110 }])).toBeNull();
  });
});
