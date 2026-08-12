import { describe, expect, it } from "vitest";
import {
  chicagoDateKey,
  defaultBarsStart,
  isUsRegularSession,
  sliceLastTradingDays,
} from "@/lib/market-data/bars-window";

describe("defaultBarsStart", () => {
  it("pads daily lookbacks for weekends and holidays", () => {
    const start = new Date(defaultBarsStart("1d", 90)).getTime();
    expect(Date.now() - start).toBeGreaterThan(100 * 86_400_000);
  });

  it("looks back enough calendar days for a 5-day 5-minute window", () => {
    const start = new Date(defaultBarsStart("5m", 2000)).getTime();
    expect(Date.now() - start).toBeGreaterThan(12 * 86_400_000);
    expect(Date.now() - start).toBeLessThan(40 * 86_400_000);
  });
});

describe("regular session and trading-day slice", () => {
  it("treats 09:30–15:59 ET weekdays as regular session", () => {
    expect(isUsRegularSession("2026-08-10T13:30:00.000Z")).toBe(true);
    expect(isUsRegularSession("2026-08-10T19:55:00.000Z")).toBe(true);
    expect(isUsRegularSession("2026-08-10T20:00:00.000Z")).toBe(false);
    expect(isUsRegularSession("2026-08-08T14:00:00.000Z")).toBe(false);
  });

  it("keeps the latest N Chicago trading days and prefers RTH", () => {
    const bars = [
      { barStart: "2026-08-06T14:00:00.000Z" },
      { barStart: "2026-08-07T14:00:00.000Z" },
      { barStart: "2026-08-07T20:30:00.000Z" },
      { barStart: "2026-08-10T13:35:00.000Z" },
      { barStart: "2026-08-10T20:15:00.000Z" },
    ];
    const sliced = sliceLastTradingDays(bars, 2, true);
    expect(sliced.map((bar) => chicagoDateKey(bar.barStart))).toEqual([
      "2026-08-07",
      "2026-08-10",
    ]);
  });
});
