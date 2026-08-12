import { describe, expect, it } from "vitest";
import {
  computeGapPercent,
  computeSessionBaselines,
  withGap,
} from "@/lib/market-data/session-math";

describe("session-math", () => {
  it("premarket / regular change vs prior regular close", () => {
    const premkt = computeSessionBaselines({
      session: "premarket",
      last: 105,
      priorRegularClose: 100,
      officialClose: null,
    });
    expect(premkt.vsPriorRegularCloseAbsolute).toBe(5);
    expect(premkt.vsPriorRegularClosePercent).toBeCloseTo(5);
    expect(premkt.afterHoursAbsolute).toBeNull();

    const regular = computeSessionBaselines({
      session: "regular",
      last: 110,
      priorRegularClose: 100,
      officialClose: null,
    });
    expect(regular.vsPriorRegularClosePercent).toBeCloseTo(10);
  });

  it("after-hours reports both day and AH change", () => {
    const ah = computeSessionBaselines({
      session: "afterhours",
      last: 102,
      priorRegularClose: 100,
      officialClose: 101,
      regularSessionLast: 101,
    });
    expect(ah.vsPriorRegularCloseAbsolute).toBe(1);
    expect(ah.vsPriorRegularClosePercent).toBeCloseTo(1);
    expect(ah.afterHoursAbsolute).toBe(1);
    expect(ah.afterHoursPercent).toBeCloseTo(100 / 101);
  });

  it("never coerces null to zero", () => {
    const missing = computeSessionBaselines({
      session: "regular",
      last: null,
      priorRegularClose: 100,
      officialClose: null,
    });
    expect(missing.vsPriorRegularCloseAbsolute).toBeNull();
    expect(missing.vsPriorRegularClosePercent).toBeNull();
    expect(computeGapPercent(null, 100)).toBeNull();
    expect(computeGapPercent(105, null)).toBeNull();
  });

  it("computes gap percent from open vs prior close", () => {
    const base = computeSessionBaselines({
      session: "regular",
      last: 110,
      priorRegularClose: 100,
      officialClose: null,
    });
    const gapped = withGap(base, 102, 100);
    expect(gapped.gapPercent).toBeCloseTo(2);
  });
});
