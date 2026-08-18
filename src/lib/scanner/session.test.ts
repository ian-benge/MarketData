import { describe, expect, it } from "vitest";
import {
  inferScannerSession,
  isNyseTradingDayNy,
  readScannerClock,
  scannerSessionBounds,
} from "@/lib/scanner/session";

describe("scanner session clock", () => {
  it("opens premarket at 4:00 a.m. ET and regular at 9:30 a.m. ET", () => {
    expect(inferScannerSession(new Date("2026-08-17T08:00:00.000Z"))).toBe("premarket");
    expect(inferScannerSession(new Date("2026-08-17T13:29:00.000Z"))).toBe("premarket");
    expect(inferScannerSession(new Date("2026-08-17T13:30:00.000Z"))).toBe("regular");
  });

  it("keeps after-hours through 8:00 p.m. ET", () => {
    expect(inferScannerSession(new Date("2026-08-17T20:00:00.000Z"))).toBe("afterhours");
    expect(inferScannerSession(new Date("2026-08-17T23:59:00.000Z"))).toBe("afterhours");
    expect(inferScannerSession(new Date("2026-08-18T00:00:00.000Z"))).toBe("closed");
  });

  it("treats weekends and NYSE holidays as closed", () => {
    expect(isNyseTradingDayNy(new Date("2026-08-16T14:00:00.000Z"))).toBe(false);
    expect(inferScannerSession(new Date("2026-07-03T14:00:00.000Z"))).toBe("closed");
  });

  it("shortens the regular session on an early-close day", () => {
    const bounds = scannerSessionBounds(new Date("2026-11-27T16:00:00.000Z"));
    expect(bounds.isEarlyClose).toBe(true);
    expect(bounds.regularCloseHm).toBe("1300");
    expect(bounds.afterHoursCloseHm).toBe("1700");
    expect(inferScannerSession(new Date("2026-11-27T18:30:00.000Z"))).toBe("afterhours");
    expect(inferScannerSession(new Date("2026-11-27T22:01:00.000Z"))).toBe("closed");
  });

  it("resets the session date in Eastern Time", () => {
    const late = readScannerClock(new Date("2026-08-18T03:30:00.000Z"));
    expect(late.sessionDate).toBe("2026-08-17");
    const next = readScannerClock(new Date("2026-08-18T08:00:00.000Z"));
    expect(next.sessionDate).toBe("2026-08-18");
  });
});
