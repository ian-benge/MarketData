import { describe, expect, it } from "vitest";
import {
  freezeReportMarketSnapshot,
  isDeeplyFrozen,
} from "@/lib/market-data/report-snapshot";
import type { NormalizedQuote } from "@/lib/providers/types";

const quote: NormalizedQuote = {
  instrumentId: "t:SPY",
  ticker: "SPY",
  last: 560,
  priorClose: 558,
  open: 559,
  changeAbsolute: 2,
  changePercent: 0.36,
  marketSession: "regular",
  providerName: "alpaca",
  providerTimestamp: "2026-08-10T14:30:00.000Z",
  retrievalTimestamp: "2026-08-10T14:30:00.000Z",
  delayStatus: "realtime",
  currency: "USD",
  sourceQuality: "secondary",
  coverageNotes: "IEX feed",
};

describe("report freeze", () => {
  it("freezes observations + baselines immutably", () => {
    const freeze = freezeReportMarketSnapshot({
      quotes: [quote],
      asOf: "2026-08-10T14:30:00.000Z",
      feedCoverage: "iex",
      latencyClass: "realtime",
      licenseScopeId: "alpaca:test",
      now: new Date("2026-08-10T14:31:00.000Z"),
    });

    expect(isDeeplyFrozen(freeze)).toBe(true);
    expect(freeze.observations[0]!.baselines.vsPriorRegularCloseAbsolute).toBe(2);
    expect(freeze.provenance.latencyCoverageLabel).toBe("Real-time — IEX");
    expect(freeze.breadth.included).toBe(false);
    expect(freeze.watchlistTickers).toEqual([]);

    expect(() => {
      (freeze.observations as { ticker: string }[]).push({ ticker: "X" });
    }).toThrow();
    expect(() => {
      (freeze.provenance as { feedCoverage: string }).feedCoverage = "sip";
    }).toThrow();
  });

  it("does not label closed-session IEX prints as Real-time", () => {
    const freeze = freezeReportMarketSnapshot({
      quotes: [{ ...quote, marketSession: "closed" }],
      marketSession: "closed",
      feedCoverage: "iex",
      latencyClass: "realtime",
    });
    expect(freeze.provenance.latencyClass).toBe("eod");
    expect(freeze.provenance.latencyCoverageLabel).not.toMatch(/Real-time/i);
    expect(freeze.provenance.latencyCoverageLabel).toBe("End of day — IEX");
  });

  it("uses today's official close for after-hours %, not prior close", () => {
    const freeze = freezeReportMarketSnapshot({
      quotes: [
        {
          ...quote,
          last: 101,
          priorClose: 100,
          officialClose: 102,
          marketSession: "afterhours",
        },
      ],
      marketSession: "afterhours",
    });
    const baselines = freeze.observations[0]!.baselines;
    expect(baselines.afterHoursPercent).toBeCloseTo((101 - 102) / 102 * 100);
    expect(baselines.vsPriorRegularClosePercent).not.toBe(
      baselines.afterHoursPercent,
    );
  });
});
