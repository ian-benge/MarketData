import { describe, expect, it } from "vitest";
import { chicagoDayStart, easternAt, newsWindowForSession, parseTimeWindow } from "./windows";

describe("news time windows", () => {
  it("uses America/Chicago midnight for today and 4:00 ET for session chips", () => {
    const now = new Date("2026-08-14T18:00:00.000Z");
    const today = parseTimeWindow("today", now);
    expect(today?.label).toBe("Today (America/Chicago)");
    expect(today?.start).toBe(chicagoDayStart(now).toISOString());

    const pre = parseTimeWindow("premarket", now);
    expect(pre?.label).toBe("Premarket (4:00 a.m. ET)");
    expect(pre?.start).toBe(easternAt(now, 4, 0).toISOString());

    const ah = parseTimeWindow("after-hours", now);
    expect(ah?.label).toBe("After-hours (4:00 p.m. ET)");
    expect(ah?.start).toBe(easternAt(now, 16, 0).toISOString());
  });

  it("aligns regular-session Why with the today search chip", () => {
    const now = new Date("2026-08-14T18:00:00.000Z");
    const session = newsWindowForSession("regular", now);
    const today = parseTimeWindow("today", now);
    expect(session.start).toBe(today?.start);
    expect(session.label).toBe("Today (America/Chicago)");
  });

  it("starts premarket Why at the prior 4:00 p.m. ET close", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const window = newsWindowForSession("premarket", now);
    expect(window.label).toMatch(/prior close/i);
    expect(Date.parse(window.start)).toBe(easternAt(now, 16, 0, 1).getTime());
  });

  it("does not treat Saturday 4:00 p.m. as a regular close", () => {
    const now = new Date("2026-08-15T20:45:00.000Z");
    const window = newsWindowForSession("closed", now);
    const fridayClose = easternAt(now, 16, 0, 1);
    const saturdayClose = easternAt(now, 16, 0);
    expect(Date.parse(window.start)).toBe(fridayClose.getTime());
    expect(Date.parse(window.start)).toBeLessThan(saturdayClose.getTime());
    expect(Date.parse("2026-08-15T19:10:00.000Z")).toBeGreaterThan(Date.parse(window.start));
  });
});
