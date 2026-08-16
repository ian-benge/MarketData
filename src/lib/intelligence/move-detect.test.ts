import { describe, expect, it } from "vitest";
import { detectSignificantMove, newsWindowForSession } from "./move-detect";

describe("move detection", () => {
  it("flags 3% session moves, 1.8x RVOL, and extended-hours prints", () => {
    expect(
      detectSignificantMove({
        ticker: "IREN",
        changePercent: -3.2,
        relativeVolume: 1.1,
        flags: [],
        session: "regular",
      }).significant,
    ).toBe(true);
    expect(
      detectSignificantMove({
        ticker: "NVDA",
        changePercent: 0.4,
        relativeVolume: 1.9,
        flags: [],
        session: "regular",
      }).significant,
    ).toBe(true);
    expect(
      detectSignificantMove({
        ticker: "SMCI",
        changePercent: 0.2,
        relativeVolume: 1,
        preMarketChangePercent: -1.8,
        flags: [],
        session: "premarket",
      }).significant,
    ).toBe(true);
    expect(
      detectSignificantMove({
        ticker: "SPY",
        changePercent: 0.4,
        relativeVolume: 1.1,
        flags: [],
        session: "regular",
      }).significant,
    ).toBe(false);
  });

  it("does not treat weekend residual volume as unusual tape", () => {
    const closed = detectSignificantMove({
      ticker: "IWM",
      changePercent: 0.2,
      relativeVolume: 0.1,
      flags: ["rvol"],
      session: "closed",
    });
    expect(closed.significant).toBe(false);
    expect(closed.reasons).toEqual([]);
  });

  it("widens premarket Why to overnight copy since the prior close", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    expect(newsWindowForSession("premarket", now).label).toMatch(/prior close/i);
    expect(newsWindowForSession("afterhours", now).label).toMatch(/After-hours/i);
    expect(newsWindowForSession("regular", now).label).toBe("Today (America/Chicago)");
  });
});
