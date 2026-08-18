import { describe, expect, it } from "vitest";
import { evaluateAlertQuality } from "@/lib/scanner/quality";

describe("scanner alert quality diagnostics", () => {
  it("computes continuation, MFE/MAE, and false-positive rates without claiming P&L", () => {
    const report = evaluateAlertQuality([
      {
        ticker: "ABCD",
        strategyId: "five_pillars",
        firedAt: "2026-08-17T14:00:00.000Z",
        entry: 8,
        forward: [
          { at: "2026-08-17T14:05:00.000Z", price: 8.6 },
          { at: "2026-08-17T14:20:00.000Z", price: 8.4 },
        ],
      },
      {
        ticker: "XYZ",
        strategyId: "five_pillars",
        firedAt: "2026-08-17T14:00:00.000Z",
        entry: 10,
        forward: [
          { at: "2026-08-17T14:10:00.000Z", price: 9.5 },
          { at: "2026-08-17T14:25:00.000Z", price: 9.2 },
        ],
      },
    ]);
    expect(report.sampleSize).toBe(2);
    expect(report.continuationRate).toBe(0.5);
    expect(report.falsePositiveRate).toBe(0.5);
    expect(report.medianForwardReturnPct).toBeCloseTo(((8.4 - 8) / 8 * 100 + (9.2 - 10) / 10 * 100) / 2);
    expect(report.note).toMatch(/not a profitability claim/i);
  });
});
