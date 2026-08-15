import { describe, expect, it } from "vitest";
import {
  pulseAreaPath,
  pulseLinePath,
  shouldOverlayLivePulse,
} from "@/components/dashboard/market-pulse/pulse-path-geometry";

describe("pulse path geometry", () => {
  it("does not emit an area fill for a single print", () => {
    expect(pulseAreaPath([0], [22], 13)).toBe("");
  });

  it("closes the area at the last printed x instead of the chart edge", () => {
    const area = pulseAreaPath([10, 40], [8, 22], 13);
    expect(area).toContain("L40.00 13.00");
    expect(area).toContain("L10.00 13.00");
    expect(area).not.toContain("L100");
    expect(area.endsWith("Z")).toBe(true);
  });

  it("keeps the line path open (no fill close)", () => {
    expect(pulseLinePath([10, 40], [8, 22])).toBe("M10.00 8.00 L40.00 22.00");
  });

  it("does not overlay a 1D live print from a different session", () => {
    expect(
      shouldOverlayLivePulse({
        range: "1D",
        liveAt: "2026-08-15T11:53:00.000Z",
        lastAt: "2026-08-14T20:00:00.000Z",
        tradingDateKey: (iso) => iso.slice(0, 10),
      }),
    ).toBe(false);
    expect(
      shouldOverlayLivePulse({
        range: "1D",
        liveAt: "2026-08-14T18:00:00.000Z",
        lastAt: "2026-08-14T17:55:00.000Z",
        tradingDateKey: (iso) => iso.slice(0, 10),
      }),
    ).toBe(true);
  });
});
