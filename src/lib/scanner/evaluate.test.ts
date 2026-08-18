import { describe, expect, it } from "vitest";
import { evaluateScan } from "@/lib/scanner/evaluate";
import { buildFeatureSnapshot } from "@/lib/scanner/features";
import { SCANNER_STRATEGIES } from "@/lib/scanner/strategies";
import { fixtureScannerSnapshot } from "@/lib/scanner/fixtures";
import { applyLayoutFilters } from "@/lib/scanner/filters";
import { DEFAULT_SCANNER_FILTERS } from "@/lib/scanner/types";

function runner(at: string, last: number) {
  return buildFeatureSnapshot({
    ticker: "ABCD",
    asOf: at,
    session: "regular",
    sessionDate: "2026-08-17",
    last,
    high: last,
    previousHigh: last - 0.4,
    open: 6.9,
    priorClose: 6.55,
    volume: 18_000_000,
    avgVolume20d: 2_000_000,
    floatShares: 12_000_000,
    bid: last - 0.02,
    ask: last + 0.02,
    minuteBars: [0, 1, 2, 3, 4].map((offset) => ({
      start: new Date(Date.parse(at) - (4 - offset) * 60_000).toISOString(),
      open: last - 0.4 + offset * 0.08,
      high: last - 0.3 + offset * 0.08,
      low: last - 0.45 + offset * 0.08,
      close: last - 0.32 + offset * 0.08,
      volume: 700_000,
    })),
    providerName: "test",
    feedCoverage: "sip",
    latencyClass: "realtime",
    attributionKind: "confirmed_company",
    attributionHeadline: "FDA clearance",
    latestHeadlineAt: at,
  });
}

describe("evaluateScan", () => {
  it("emits once then consolidates a heavy repeat stream", () => {
    const strategy = SCANNER_STRATEGIES.filter((item) => item.id === "hod_momentum_small");
    const first = evaluateScan({
      features: [runner("2026-08-17T14:00:00.000Z", 8.2)],
      now: new Date("2026-08-17T14:00:00.000Z"),
      sessionDate: "2026-08-17",
      strategies: strategy,
      idFactory: () => "alert-1",
    });
    expect(first.emitted).toBe(1);
    const second = evaluateScan({
      features: [runner("2026-08-17T14:00:20.000Z", 8.22)],
      now: new Date("2026-08-17T14:00:20.000Z"),
      sessionDate: "2026-08-17",
      priorAlerts: [
        {
          id: "alert-1",
          ticker: "ABCD",
          strategyId: "hod_momentum_small",
          sessionDate: "2026-08-17",
          firedAt: "2026-08-17T14:00:00.000Z",
          lastSeenAt: "2026-08-17T14:00:00.000Z",
          last: 8.2,
          occurrenceCount: 1,
          status: "active",
        },
      ],
      strategies: strategy,
    });
    expect(second.emitted).toBe(0);
    expect(second.consolidated).toBe(1);
    expect(second.alerts[0]?.status).toBe("consolidated");
    expect(second.alerts[0]?.occurrenceCount).toBe(2);
  });

  it("builds a dense demo tape without inventing live coverage", () => {
    const snapshot = fixtureScannerSnapshot(new Date("2026-08-17T14:42:00.000Z"));
    expect(snapshot.mocked).toBe(true);
    expect(snapshot.coverage.freshness).toBe("mock");
    expect(snapshot.alerts.length).toBeGreaterThan(10);
    expect(Object.keys(snapshot.features).length).toBeGreaterThan(20);
    expect(snapshot.lists.five_pillars?.some((row) => row.ticker === "ABCD")).toBe(true);
  });

  it("filters muted names out of the visible tape", () => {
    const snapshot = fixtureScannerSnapshot(new Date("2026-08-17T14:42:00.000Z"));
    const filtered = applyLayoutFilters(
      snapshot.lists,
      snapshot.alerts,
      { ...DEFAULT_SCANNER_FILTERS, hideMuted: true },
      new Set(["ABCD"]),
      ["five_pillars"],
    );
    expect(filtered.lists.five_pillars?.some((row) => row.ticker === "ABCD")).toBe(false);
    expect(filtered.alerts.some((alert) => alert.ticker === "ABCD")).toBe(false);
  });
});
