import { describe, expect, it } from "vitest";
import {
  absoluteChange,
  formatMove,
  percentChange,
} from "@/lib/domain/market-math";

describe("market-math", () => {
  it("computes percent and absolute change", () => {
    expect(percentChange(110, 100)).toBeCloseTo(10);
    expect(absoluteChange(110, 100)).toBe(10);
  });

  it("never coerces null to zero", () => {
    expect(percentChange(null, 100)).toBeNull();
    expect(percentChange(100, null)).toBeNull();
    expect(percentChange(undefined, 100)).toBeNull();
    expect(absoluteChange(null, 100)).toBeNull();
    expect(absoluteChange(100, null)).toBeNull();
  });

  it("returns null when previous is zero", () => {
    expect(percentChange(10, 0)).toBeNull();
  });

  it("formats moves and returns null when incomplete", () => {
    expect(formatMove(1.25, 0.82)).toBe("+1.25 (+0.82%)");
    expect(formatMove(-1.25, -0.82)).toBe("-1.25 (-0.82%)");
    expect(formatMove(null, 1)).toBeNull();
    expect(formatMove(1, null)).toBeNull();
  });
});
