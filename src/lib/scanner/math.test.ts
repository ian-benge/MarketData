import { describe, expect, it } from "vitest";
import {
  adjustPriceForSplit,
  distanceFromHighPct,
  fiveMinuteRelativeVolume,
  floatRotation,
  isNewHigh,
  isReverseSplit,
  newsFreshnessBucket,
  percentChange,
  relativeVolume,
  sessionRelativeVolume,
  velocityFromBars,
} from "@/lib/scanner/math";

describe("scanner math", () => {
  it("computes relative volume and does not coerce missing averages to zero", () => {
    expect(relativeVolume(5_000_000, 1_000_000)).toBe(5);
    expect(relativeVolume(5_000_000, null)).toBeNull();
    expect(relativeVolume(null, 1_000_000)).toBeNull();
    expect(relativeVolume(100, 0)).toBeNull();
  });

  it("time-adjusts session relative volume", () => {
    expect(sessionRelativeVolume(1_000_000, 4_000_000, 0.25)).toBe(1);
    expect(sessionRelativeVolume(1_000_000, 4_000_000, null)).toBe(0.25);
  });

  it("computes gap and percent change without zero-filling", () => {
    expect(percentChange(11, 10)).toBeCloseTo(10);
    expect(percentChange(11, null)).toBeNull();
    expect(percentChange(11, 0)).toBeNull();
  });

  it("measures five-minute relative volume vs a typical bar", () => {
    expect(fiveMinuteRelativeVolume(200_000, 7_800_000, 78)).toBeCloseTo(2);
  });

  it("computes velocity from a synthetic 5-minute window", () => {
    const bars = [
      { start: "2026-08-17T14:00:00.000Z", open: 10, high: 10.1, low: 9.9, close: 10, volume: 1 },
      { start: "2026-08-17T14:01:00.000Z", open: 10, high: 10.2, low: 10, close: 10.2, volume: 1 },
      { start: "2026-08-17T14:02:00.000Z", open: 10.2, high: 10.4, low: 10.2, close: 10.4, volume: 1 },
      { start: "2026-08-17T14:03:00.000Z", open: 10.4, high: 10.6, low: 10.4, close: 10.5, volume: 1 },
      { start: "2026-08-17T14:04:00.000Z", open: 10.5, high: 10.7, low: 10.5, close: 10.6, volume: 1 },
    ];
    expect(velocityFromBars(bars, 5, Date.parse("2026-08-17T14:04:00.000Z"))).toBeCloseTo(6);
  });

  it("computes float rotation and distance from HOD", () => {
    expect(floatRotation(20_000_000, 10_000_000)).toBe(2);
    expect(distanceFromHighPct(99, 100)).toBeCloseTo(-1);
  });

  it("detects reverse splits and split-adjusts history", () => {
    expect(isReverseSplit(10, 1)).toBe(true);
    expect(isReverseSplit(1, 4)).toBe(false);
    expect(adjustPriceForSplit(100, 1, 4)).toBe(25);
    expect(adjustPriceForSplit(10, 10, 1)).toBe(100);
  });

  it("buckets news freshness including no headline", () => {
    const now = new Date("2026-08-17T16:00:00.000Z");
    expect(newsFreshnessBucket("2026-08-17T15:00:00.000Z", now)).toBe("0_2h");
    expect(newsFreshnessBucket("2026-08-17T08:00:00.000Z", now)).toBe("2_12h");
    expect(newsFreshnessBucket("2026-08-16T20:00:00.000Z", now)).toBe("12_24h");
    expect(newsFreshnessBucket("2026-08-15T16:00:00.000Z", now)).toBe("none");
    expect(newsFreshnessBucket(null, now)).toBe("none");
  });

  it("requires a true new high rather than any print at the high", () => {
    expect(isNewHigh(10, 10, 9.8)).toBe(true);
    expect(isNewHigh(10, 10, 10)).toBe(false);
  });
});
