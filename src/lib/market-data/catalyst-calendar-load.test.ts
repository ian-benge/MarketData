import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";

const ffEvents: NormalizedCalendarEvent[] = [];
const storedEvents: NormalizedCalendarEvent[] = [];
const finnhubEvents: NormalizedCalendarEvent[] = [];

vi.mock("@/lib/providers/forex-factory/calendar", () => ({
  getCatalystCalendar: async () => ({
    events: ffEvents,
    fetchedAt: "2026-08-11T11:00:00.000Z",
  }),
}));

vi.mock("@/lib/market-data/catalyst-store", () => ({
  loadStoredCatalystEvents: async () => storedEvents,
  persistForexFactoryWeek: async () => {},
}));

vi.mock("@/lib/providers/finnhub/calendar", () => ({
  fetchFinnhubEconomicCalendar: async () => finnhubEvents,
}));

import { loadDashboardCatalystCalendar } from "@/lib/market-data/catalyst-calendar-load";

function event(
  overrides: Partial<NormalizedCalendarEvent> &
    Pick<NormalizedCalendarEvent, "id" | "title" | "scheduledAt" | "providerName">,
): NormalizedCalendarEvent {
  return {
    category: "economic",
    country: "USD",
    providerTimestamp: "2026-08-11T11:00:00.000Z",
    retrievalTimestamp: "2026-08-11T11:00:00.000Z",
    sourceQuality: "secondary",
    timeZone: "America/Chicago",
    ...overrides,
  };
}

describe("loadDashboardCatalystCalendar", () => {
  beforeEach(() => {
    ffEvents.length = 0;
    storedEvents.length = 0;
    finnhubEvents.length = 0;
  });

  it("prefers live Forex Factory days and fills other weeks", async () => {
    ffEvents.push(
      event({
        id: "ff-cpi",
        title: "Core CPI m/m",
        scheduledAt: "2026-08-12T12:30:00.000Z",
        providerName: "forex-factory",
      }),
    );
    storedEvents.push(
      event({
        id: "stored-nfp",
        title: "Nonfarm Payrolls",
        scheduledAt: "2026-08-07T12:30:00.000Z",
        providerName: "forex-factory",
      }),
    );
    finnhubEvents.push(
      event({
        id: "fh-cpi",
        title: "CPI YoY",
        scheduledAt: "2026-08-12T12:30:00.000Z",
        providerName: "finnhub",
      }),
      event({
        id: "fh-homes",
        title: "Existing Home Sales",
        scheduledAt: "2026-08-20T14:00:00.000Z",
        providerName: "finnhub",
      }),
    );

    const calendar = await loadDashboardCatalystCalendar({
      FINNHUB_API_KEY: "test-key",
    });
    expect(calendar.map((item) => item.id)).toEqual([
      "stored-nfp",
      "ff-cpi",
      "fh-homes",
    ]);
  });
});
