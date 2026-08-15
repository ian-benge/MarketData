import { describe, expect, it } from "vitest";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";
import {
  catalystFillWindows,
  catalystWeekBounds,
  chicagoEventDay,
  mergePreferredCalendarEvents,
  sundayOfChicagoDate,
} from "@/lib/market-data/catalyst-calendar";

function event(
  overrides: Partial<NormalizedCalendarEvent> &
    Pick<NormalizedCalendarEvent, "id" | "title" | "scheduledAt">,
): NormalizedCalendarEvent {
  return {
    category: "economic",
    country: "USD",
    providerName: "forex-factory",
    providerTimestamp: "2026-08-11T11:00:00.000Z",
    retrievalTimestamp: "2026-08-11T11:00:00.000Z",
    sourceQuality: "secondary",
    timeZone: "America/Chicago",
    ...overrides,
  };
}

describe("sundayOfChicagoDate", () => {
  it("maps Saturday and Sunday onto the same Chicago week", () => {
    expect(sundayOfChicagoDate("2026-08-15")).toBe("2026-08-09");
    expect(sundayOfChicagoDate("2026-08-09")).toBe("2026-08-09");
    expect(sundayOfChicagoDate("2026-08-16")).toBe("2026-08-16");
  });
});

describe("catalystWeekBounds", () => {
  it("always includes this week and expands to event weeks", () => {
    expect(catalystWeekBounds([], "2026-08-15")).toEqual({
      earliest: "2026-08-09",
      latest: "2026-08-09",
    });
    expect(
      catalystWeekBounds(["2026-07-31", "2026-08-20"], "2026-08-15"),
    ).toEqual({
      earliest: "2026-07-26",
      latest: "2026-08-16",
    });
  });
});

describe("mergePreferredCalendarEvents", () => {
  it("keeps preferred prints on overlapping days and fill on other days", () => {
    const preferred = [
      event({
        id: "ff-cpi",
        title: "Core CPI m/m",
        scheduledAt: "2026-08-12T12:30:00.000Z",
      }),
    ];
    const fill = [
      event({
        id: "fh-cpi",
        title: "CPI YoY",
        scheduledAt: "2026-08-12T12:30:00.000Z",
        providerName: "finnhub",
      }),
      event({
        id: "fh-nfp",
        title: "Nonfarm Payrolls",
        scheduledAt: "2026-08-07T12:30:00.000Z",
        providerName: "finnhub",
      }),
    ];
    const merged = mergePreferredCalendarEvents(preferred, fill);
    expect(merged.map((item) => item.id)).toEqual(["fh-nfp", "ff-cpi"]);
    expect(chicagoEventDay(merged[1]!)).toBe("2026-08-12");
  });
});

describe("catalystFillWindows", () => {
  it("covers one year back and 90 days forward in 90-day chunks", () => {
    const windows = catalystFillWindows(new Date("2026-08-15T17:00:00.000Z"));
    expect(windows[0]?.start).toBe("2025-08-15");
    expect(windows.at(-1)?.end).toBe("2026-11-13");
    expect(windows.length).toBeGreaterThanOrEqual(5);
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index]!.start > windows[index - 1]!.end).toBe(true);
    }
  });
});
