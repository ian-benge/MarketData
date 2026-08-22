import { describe, expect, it } from "vitest";
import { buildFeatureSnapshot } from "@/lib/scanner/features";
import { evaluateScan } from "@/lib/scanner/evaluate";
import { fivePillarsMatch, hodMomentumMatch, HOD_REGIMES, SCANNER_STRATEGIES } from "@/lib/scanner/strategies";
import { replaySyntheticSequence } from "@/lib/scanner/replay";
import type { FeatureBuildInput } from "@/lib/scanner/features";

function feature(overrides: Partial<FeatureBuildInput> = {}) {
  return buildFeatureSnapshot({
    ticker: "ABCD",
    asOf: "2026-08-17T14:42:00.000Z",
    session: "regular",
    sessionDate: "2026-08-17",
    last: 8.4,
    open: 6.9,
    high: 8.42,
    priorClose: 6.55,
    volume: 18_000_000,
    avgVolume20d: 2_000_000,
    floatShares: 12_000_000,
    bid: 8.38,
    ask: 8.42,
    providerName: "test",
    feedCoverage: "sip",
    latencyClass: "realtime",
    attributionKind: "confirmed_company",
    attributionHeadline: "FDA clearance",
    latestHeadlineAt: "2026-08-17T13:10:00.000Z",
    minuteBars: [
      { start: "2026-08-17T14:37:00.000Z", open: 7.9, high: 8.0, low: 7.9, close: 8.0, volume: 400_000 },
      { start: "2026-08-17T14:38:00.000Z", open: 8.0, high: 8.1, low: 8.0, close: 8.1, volume: 500_000 },
      { start: "2026-08-17T14:39:00.000Z", open: 8.1, high: 8.2, low: 8.1, close: 8.2, volume: 600_000 },
      { start: "2026-08-17T14:40:00.000Z", open: 8.2, high: 8.3, low: 8.2, close: 8.3, volume: 700_000 },
      { start: "2026-08-17T14:41:00.000Z", open: 8.3, high: 8.4, low: 8.3, close: 8.4, volume: 800_000 },
    ],
    ...overrides,
  });
}

describe("momentum strategies", () => {
  it("requires all five pillars including a catalyst and known float", () => {
    expect(fivePillarsMatch(feature())).toBe(true);
    expect(fivePillarsMatch(feature({ floatShares: null }))).toBe(false);
    expect(fivePillarsMatch(feature({ attributionKind: undefined, latestHeadlineAt: null }))).toBe(false);
    expect(fivePillarsMatch(feature({ last: 1.5, priorClose: 1.2 }))).toBe(false);
  });

  it("does not fire HOD on a quiet new high without acceleration and volume", () => {
    const quiet = feature({
      last: 10,
      high: 10,
      previousHigh: 9.9,
      volume: 100_000,
      avgVolume20d: 5_000_000,
      minuteBars: [
        { start: "2026-08-17T14:41:00.000Z", open: 9.99, high: 10, low: 9.99, close: 10, volume: 1_000 },
      ],
    });
    expect(hodMomentumMatch(quiet, HOD_REGIMES.small)).toBe(false);
  });

  it("fires small-cap HOD when high, acceleration, rvol, and liquidity all confirm", () => {
    const hot = feature({ previousHigh: 8.0 });
    expect(hodMomentumMatch(hot, HOD_REGIMES.small)).toBe(true);
  });

  it("replays a synthetic runner and consolidates instead of spamming", () => {
    const barsAt = (last: number, at: string) => {
      const end = Date.parse(at);
      return [0, 1, 2, 3, 4].map((offset) => {
        const close = last - (4 - offset) * 0.08;
        return {
          start: new Date(end - (4 - offset) * 60_000).toISOString(),
          open: close - 0.05,
          high: close + 0.04,
          low: close - 0.06,
          close,
          volume: 700_000,
        };
      });
    };
    const result = replaySyntheticSequence({
      ticker: "RUNR",
      sessionDate: "2026-08-17",
      strategyIds: ["hod_momentum_small", "running_up", "five_pillars"],
      prints: [
        { at: "2026-08-17T14:00:00.000Z", last: 7.2, high: 7.2, open: 6.2, priorClose: 6, volume: 8_000_000, avgVolume20d: 1_000_000, floatShares: 11_000_000, bars: barsAt(7.2, "2026-08-17T14:00:00.000Z") },
        { at: "2026-08-17T14:00:20.000Z", last: 7.25, high: 7.25, open: 6.2, priorClose: 6, volume: 8_400_000, avgVolume20d: 1_000_000, floatShares: 11_000_000, bars: barsAt(7.25, "2026-08-17T14:00:20.000Z") },
        { at: "2026-08-17T14:00:40.000Z", last: 7.3, high: 7.3, open: 6.2, priorClose: 6, volume: 8_800_000, avgVolume20d: 1_000_000, floatShares: 11_000_000, bars: barsAt(7.3, "2026-08-17T14:00:40.000Z") },
        { at: "2026-08-17T14:05:00.000Z", last: 8.1, high: 8.1, open: 6.2, priorClose: 6, volume: 12_000_000, avgVolume20d: 1_000_000, floatShares: 11_000_000, bars: barsAt(8.1, "2026-08-17T14:05:00.000Z") },
      ],
    });
    const hod = result.alerts.filter((alert) => alert.strategyId === "hod_momentum_small");
    expect(hod.length).toBeGreaterThan(0);
    const distinctIds = new Set(hod.filter((alert) => alert.status === "active").map((alert) => alert.id));
    expect(distinctIds.size).toBeLessThanOrEqual(2);
    expect(hod.some((alert) => alert.status === "consolidated" || alert.occurrenceCount > 1)).toBe(true);
  });

  it("keeps unexplained watchlist names out of five pillars", () => {
    const row = feature({
      ticker: "IREN",
      last: 7.1,
      high: 12,
      previousHigh: 12,
      volume: 1_200_000,
      avgVolume20d: 2_400_000,
      attributionKind: undefined,
      latestHeadlineAt: null,
      inWatchlist: true,
    });
    expect(fivePillarsMatch(row)).toBe(false);
    expect(row.catalystKind).toBe("unexplained");
    const scan = evaluateScan({
      features: [row],
      now: new Date("2026-08-17T14:42:00.000Z"),
      sessionDate: "2026-08-17",
    });
    expect(scan.lists.five_pillars?.some((item) => item.ticker === "IREN")).toBeFalsy();
    expect(
      scan.alerts.some(
        (item) => item.strategyId === "desk_watchlist_unexplained" && item.ticker === "IREN",
      ),
    ).toBe(true);
  });
});

describe("after-hours coverage after the official close", () => {
  it("still ranks after-hours movers when the tape is closed", () => {
    const ah = SCANNER_STRATEGIES.find((item) => item.id === "after_hours_movers");
    const gaps = SCANNER_STRATEGIES.find((item) => item.id === "desk_gaps");
    expect(ah?.sessions).toEqual(expect.arrayContaining(["afterhours", "closed"]));
    expect(gaps?.sessions).toEqual(expect.arrayContaining(["closed"]));
    const closedMover = feature({
      session: "closed",
      last: 12,
      priorClose: 10,
      open: 11,
      volume: 8_000_000,
      avgVolume20d: 3_000_000,
    });
    expect(ah?.match(closedMover)).toBe(true);
    expect(gaps?.match(closedMover)).toBe(true);
  });
});
