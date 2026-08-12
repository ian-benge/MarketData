import { describe, expect, it } from "vitest";
import { latencyCoverageLabel } from "@/lib/market-data/schemas";

describe("latencyCoverageLabel", () => {
  it("labels realtime IEX / SIP / FMV distinctly", () => {
    expect(
      latencyCoverageLabel({ feedCoverage: "iex", latencyClass: "realtime" }),
    ).toBe("Real-time — IEX");
    expect(
      latencyCoverageLabel({ feedCoverage: "sip", latencyClass: "realtime" }),
    ).toBe("Real-time — SIP");
    expect(
      latencyCoverageLabel({ feedCoverage: "fmv", latencyClass: "realtime" }),
    ).toBe("Real-time — FMV/aggregate");
  });

  it("never labels IEX as SIP or full market", () => {
    const label = latencyCoverageLabel({
      feedCoverage: "iex",
      latencyClass: "realtime",
    });
    expect(label).not.toMatch(/SIP|full.?market|NBBO/i);
    expect(label).toContain("IEX");
  });

  it("handles delayed, eod, stale, unavailable, mock", () => {
    expect(
      latencyCoverageLabel({
        feedCoverage: "delayed_15m",
        latencyClass: "delayed_15m",
      }),
    ).toBe("15-minute delayed");
    expect(
      latencyCoverageLabel({ feedCoverage: "eod", latencyClass: "eod" }),
    ).toBe("End of day");
    expect(
      latencyCoverageLabel({ feedCoverage: "iex", latencyClass: "stale" }),
    ).toBe("Stale");
    expect(
      latencyCoverageLabel({
        feedCoverage: "unknown",
        latencyClass: "unavailable",
      }),
    ).toBe("Unavailable");
    expect(
      latencyCoverageLabel({ feedCoverage: "unknown", latencyClass: "mock" }),
    ).toBe("Mock data");
  });
});
