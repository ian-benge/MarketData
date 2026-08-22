import { describe, expect, it } from "vitest";
import {
  alertCountByStrategy,
  catalystLabel,
  coverageLine,
  displayRows,
  filtersFromQuick,
  formatElapsed,
  formatFloatShares,
  formatHodGap,
  freshnessLabel,
  haltMark,
  humanizeCoverageNote,
  neighboringStrategy,
  neighboringTicker,
  orderAlertsForTape,
  presetFitsSession,
  scoreWidth,
  strategyWithHits,
  summarizeScan,
  toggleSort,
  usefulHaltReason,
  wideSpread,
} from "@/lib/scanner/display";
import { fixtureScannerSnapshot } from "@/lib/scanner/fixtures";
import { DEFAULT_SCANNER_FILTERS, type RankedScannerRow } from "@/lib/scanner/types";

function row(partial: Partial<RankedScannerRow> & Pick<RankedScannerRow, "ticker">): RankedScannerRow {
  return {
    name: partial.name ?? partial.ticker,
    strategyId: "five_pillars",
    system: "momentum",
    rank: 1,
    last: 8,
    changeFromClosePct: 10,
    changeFromOpenPct: 4,
    gapPercent: 4,
    velocity5mPct: 1.2,
    volume: 1_000_000,
    dollarVolume: 8_000_000,
    relativeVolume: 5,
    fiveMinuteRelativeVolume: 3,
    floatShares: 12_000_000,
    floatRotation: 1.1,
    marketCap: 100_000_000,
    distanceFromHodPct: -0.4,
    vwap: 7.8,
    week52High: 9,
    atr: 0.4,
    spreadFraction: 0.004,
    shortInterestPct: 8,
    recentReverseSplit: false,
    ipoAgeDays: null,
    haltStatus: "open",
    haltReason: null,
    newsFreshness: "0_2h",
    catalystKind: "confirmed_company",
    catalystSummary: "Test",
    inWatchlist: false,
    inPosition: false,
    themes: [],
    opportunity: { total: 70, factors: [] },
    risk: { total: 20, factors: [] },
    asOf: "2026-08-17T14:42:00.000Z",
    stale: false,
    dataQuality: {
      price: true,
      volume: true,
      float: true,
      news: true,
      bars: true,
      fundamentals: true,
      options: false,
      halt: true,
    },
    coverageNotes: null,
    ...partial,
  };
}

describe("scanner display", () => {
  it("keeps coverage language that distinguishes polling from a live socket", () => {
    const snapshot = fixtureScannerSnapshot(new Date("2026-08-17T14:42:00.000Z"));
    expect(freshnessLabel(snapshot)).toMatch(/mock|not live/i);
    expect(coverageLine(snapshot)).toMatch(/mock/i);
  });

  it("formats elapsed time, float, and HOD distance for a tape", () => {
    const now = Date.parse("2026-08-17T14:42:30.000Z");
    expect(formatElapsed("2026-08-17T14:42:00.000Z", now)).toBe("30s");
    expect(formatElapsed("2026-08-17T14:10:00.000Z", now)).toBe("33m");
    expect(formatFloatShares(12_400_000)).toBe("12.4M");
    expect(formatFloatShares(850_000)).toBe("850K");
    expect(formatHodGap(0)).toBe("HOD");
    expect(formatHodGap(-1.25)).toBe("−1.25%");
    expect(catalystLabel("confirmed_company", true)).toBe("Confirmed");
    expect(haltMark("halted")).toBe("HALT");
    expect(haltMark("resumed")).toBe("RESUME");
    expect(usefulHaltReason("BRLS", "BRLS")).toBeNull();
    expect(usefulHaltReason("LULD pause — volatility", "HALT")).toMatch(/LULD/i);
    expect(wideSpread(0.39)).toBe(true);
    expect(wideSpread(0.004)).toBe(false);
    expect(scoreWidth(0)).toBe(4);
  });

  it("summarizes unique names rather than raw row duplicates", () => {
    const snapshot = fixtureScannerSnapshot(new Date("2026-08-17T14:42:00.000Z"));
    const glance = summarizeScan(snapshot.lists, snapshot.alerts, ["five_pillars", "halts"]);
    expect(glance.hits).toBeGreaterThan(0);
    expect(glance.names).toBeGreaterThan(0);
    expect(glance.names).toBeLessThanOrEqual(glance.hits);
    expect(glance.halted).toBeGreaterThanOrEqual(1);
    expect(glance.resumed).toBeGreaterThanOrEqual(0);
    expect(alertCountByStrategy(snapshot.alerts).five_pillars ?? 0).toBeGreaterThan(0);
  });

  it("pins names above rank order without dropping filters", () => {
    const rows = [
      row({ ticker: "BBB", rank: 1 }),
      row({ ticker: "AAA", rank: 2 }),
      row({ ticker: "CCC", rank: 3, inWatchlist: true }),
    ];
    const ranked = displayRows(rows, DEFAULT_SCANNER_FILTERS, { key: "rank", dir: "asc" }, ["CCC"]);
    expect(ranked.map((item) => item.ticker)).toEqual(["CCC", "BBB", "AAA"]);
    const watch = displayRows(
      rows,
      { ...DEFAULT_SCANNER_FILTERS, watchlistOnly: true },
      { key: "rank", dir: "asc" },
      [],
    );
    expect(watch.map((item) => item.ticker)).toEqual(["CCC"]);
  });

  it("walks tickers and strategies without wrapping off the ends of a list", () => {
    const rows = [row({ ticker: "A" }), row({ ticker: "B" }), row({ ticker: "C" })];
    expect(neighboringTicker(rows, "A", 1)).toBe("B");
    expect(neighboringTicker(rows, "A", -1)).toBe("A");
    expect(neighboringTicker(rows, "Z", 1)).toBe("A");
    expect(neighboringStrategy(["one", "two", "three"], "two", 1)).toBe("three");
    expect(neighboringStrategy(["one", "two", "three"], "three", 1)).toBe("one");
  });

  it("keeps the selected name at the top of the tape without dropping later events", () => {
    const alerts = fixtureScannerSnapshot(new Date("2026-08-17T14:42:00.000Z")).alerts;
    expect(alerts.length).toBeGreaterThan(2);
    const last = alerts.at(-1)!.ticker;
    const ordered = orderAlertsForTape(alerts, last);
    expect(ordered[0]?.ticker).toBe(last);
    expect(ordered.length).toBe(alerts.length);
  });

  it("maps quick chips onto the existing server filter contract", () => {
    const filters = filtersFromQuick({
      query: "nvda",
      watchlistOnly: true,
      inPositionOnly: false,
      hideHalted: true,
      newsOnly: true,
      lowFloat: true,
      hotRvol: true,
      showMuted: false,
    });
    expect(filters.query).toBe("nvda");
    expect(filters.watchlistOnly).toBe(true);
    expect(filters.hideHalted).toBe(true);
    expect(filters.minRvol).toBe(2);
    expect(filters.maxFloatMm).toBe(20);
    expect(filters.newsFreshness).toEqual(["0_2h", "2_12h", "12_24h"]);
    expect(filters.hideMuted).toBe(true);
  });

  it("toggles sort direction on the same column", () => {
    expect(toggleSort({ key: "rank", dir: "asc" }, "rvol")).toEqual({ key: "rvol", dir: "desc" });
    expect(toggleSort({ key: "rvol", dir: "desc" }, "rvol")).toEqual({ key: "rvol", dir: "asc" });
  });

  it("humanizes entitlement failures and prefers strategies that have hits", () => {
    expect(humanizeCoverageNote("Massive forbidden for /v2/snapshot")).toMatch(/not entitled/i);
    expect(presetFitsSession("open", "afterhours")).toBe(false);
    expect(presetFitsSession("after_hours", "afterhours")).toBe(true);
    expect(
      strategyWithHits(
        ["five_pillars", "halts"],
        { five_pillars: [], halts: [row({ ticker: "HALT" })] },
        "five_pillars",
      ),
    ).toBe("halts");
  });
});
