import { describe, expect, it } from "vitest";
import {
  coveragePickValue,
  initialCoveragePick,
  parseCoveragePick,
  sameCoveragePick,
  watchlistForPick,
} from "@/lib/dashboard/coverage-pick";
import type { DashboardWatchlistSnapshot } from "@/lib/market-data/watchlist-types";

function snapshot(
  listId: string,
  listName = listId,
): DashboardWatchlistSnapshot {
  return {
    listId,
    listName,
    symbols: [],
    rows: [],
    lists: [],
    asOf: "2026-08-16T14:00:00.000Z",
    stale: false,
    usingFixtures: false,
    error: null,
  };
}

describe("coverage pick", () => {
  it("parses watchlist and sector option values", () => {
    expect(parseCoveragePick("watchlist:wl-core")).toEqual({
      type: "watchlist",
      id: "wl-core",
    });
    expect(parseCoveragePick("sector:volatility-breadth")).toEqual({
      type: "sector",
      id: "volatility-breadth",
    });
    expect(parseCoveragePick("wl-core")).toBeNull();
  });

  it("prefers an explicit sector query over a watchlist id", () => {
    expect(initialCoveragePick("sec-vol", "wl-core", "wl-fallback")).toEqual({
      type: "sector",
      id: "sec-vol",
    });
    expect(initialCoveragePick(undefined, undefined, "wl-core")).toEqual({
      type: "watchlist",
      id: "wl-core",
    });
  });

  it("keeps the selected snapshot when a slower dashboard poll still has the previous list", () => {
    const pick = { type: "sector" as const, id: "sec-vol" };
    const override = snapshot("sec-vol", "Volatility, Breadth & Positioning");
    const dashboard = snapshot("wl-core", "Market Tape");
    expect(watchlistForPick(pick, override, dashboard)?.listName).toBe(
      "Volatility, Breadth & Positioning",
    );
    expect(sameCoveragePick(pick, { type: "watchlist", id: "sec-vol" })).toBe(
      false,
    );
    expect(coveragePickValue(pick)).toBe("sector:sec-vol");
  });
});
