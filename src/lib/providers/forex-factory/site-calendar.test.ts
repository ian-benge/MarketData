import { describe, expect, it, vi } from "vitest";
import {
  extractJsonAfterKey,
  fetchForexFactoryUpcomingWeeks,
  forexFactoryUpcomingWindow,
  mapForexFactoryImpactClass,
  mergeForexFactoryEvents,
  parseForexFactorySitePayload,
  toForexFactoryLongDate,
  toForexFactoryWeekSlug,
} from "@/lib/providers/forex-factory/site-calendar";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";

const RETRIEVED = "2026-08-15T18:00:00.000Z";

function event(
  overrides: Partial<NormalizedCalendarEvent> &
    Pick<NormalizedCalendarEvent, "id" | "title" | "scheduledAt">,
): NormalizedCalendarEvent {
  return {
    category: "economic",
    country: "USD",
    providerName: "forex-factory",
    providerTimestamp: RETRIEVED,
    retrievalTimestamp: RETRIEVED,
    sourceQuality: "secondary",
    timeZone: "America/Chicago",
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const nextWeekCpi = {
  id: 441234,
  name: "Core CPI m/m",
  dateline: Math.floor(Date.parse("2026-08-17T08:30:00-04:00") / 1000),
  currency: "USD",
  impactClass: "icon icon--ff-impact-red",
  impactTitle: "High Impact Expected",
  forecast: "0.2%",
  previous: "0.0%",
  actual: "",
  url: "/calendar?day=aug17.2026#detail=441234",
};

describe("Forex Factory site calendar helpers", () => {
  it("formats week slugs and long dates the way the site expects", () => {
    expect(toForexFactoryWeekSlug("2026-08-16")).toBe("aug16.2026");
    expect(toForexFactoryLongDate("2026-08-16")).toBe("August 16, 2026");
    expect(toForexFactoryLongDate("2026-10-04")).toBe("October 4, 2026");
  });

  it("starts after the JSON export and covers this week plus eight more", () => {
    expect(
      forexFactoryUpcomingWindow(
        new Date("2026-08-15T18:00:00-05:00"),
        "2026-08-14",
      ),
    ).toEqual({ from: "2026-08-15", to: "2026-10-10" });
    expect(
      forexFactoryUpcomingWindow(new Date("2026-08-15T18:00:00-05:00")),
    ).toEqual({ from: "2026-08-09", to: "2026-10-10" });
    expect(
      forexFactoryUpcomingWindow(
        new Date("2026-08-15T18:00:00-05:00"),
        "2026-10-10",
      ),
    ).toBeNull();
  });

  it("maps FF impact classes from the week-view payload", () => {
    expect(
      mapForexFactoryImpactClass("icon--ff-impact-red", "High Impact Expected"),
    ).toBe("High");
    expect(mapForexFactoryImpactClass("icon--ff-impact-ora", undefined)).toBe(
      "Medium",
    );
    expect(mapForexFactoryImpactClass("icon--ff-impact-gra", "Holiday")).toBe(
      "Holiday",
    );
  });
});

describe("parseForexFactorySitePayload", () => {
  it("normalizes apply-settings JSON into calendar events", () => {
    const events = parseForexFactorySitePayload(
      { days: [{ events: [nextWeekCpi] }] },
      RETRIEVED,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Core CPI m/m",
      country: "USD",
      importance: "high",
      consensus: "0.2%",
      previous: "0.0%",
      providerName: "forex-factory",
    });
    expect(events[0]?.url).toContain("forexfactory.com/calendar");
  });

  it("extracts an embedded days array from HTML", () => {
    const html = `<html><script>window.__CAL__={"days":[${JSON.stringify({ events: [nextWeekCpi] })}]}</script></html>`;
    const days = extractJsonAfterKey(html, "days");
    const events = parseForexFactorySitePayload({ days }, RETRIEVED);
    expect(events[0]?.title).toBe("Core CPI m/m");
  });
});

describe("fetchForexFactoryUpcomingWeeks", () => {
  it("uses the apply-settings POST when it returns events", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ days: [{ events: [nextWeekCpi] }] }),
    );
    const events = await fetchForexFactoryUpcomingWeeks({
      now: new Date("2026-08-15T18:00:00-05:00"),
      lastExportDay: "2026-08-14",
      fetchImpl,
      delayMs: 0,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Core CPI m/m");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const request = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[0]).toContain("apply-settings");
    expect(request[1]?.method).toBe("POST");
    expect(String(request[1]?.body)).toContain("August 15, 2026");
    expect(String(request[1]?.body)).toContain("October 10, 2026");
  });

  it("falls back to week pages when Cloudflare blocks the POST", async () => {
    const html = `<html><script>{"days":[${JSON.stringify({ events: [nextWeekCpi] })}]}</script></html>`;
    let htmlPages = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("apply-settings")) {
        return new Response("Just a moment...", { status: 403 });
      }
      htmlPages += 1;
      if (htmlPages === 1) return new Response(html, { status: 200 });
      return new Response("Just a moment...", { status: 403 });
    });
    const events = await fetchForexFactoryUpcomingWeeks({
      now: new Date("2026-08-15T18:00:00-05:00"),
      lastExportDay: "2026-08-14",
      fetchImpl,
      delayMs: 0,
    });
    expect(events[0]?.title).toBe("Core CPI m/m");
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("week="))).toBe(
      true,
    );
  });

  it("returns an empty list when every site request is blocked", async () => {
    const fetchImpl = vi.fn(async () => new Response("Just a moment...", { status: 403 }));
    const events = await fetchForexFactoryUpcomingWeeks({
      now: new Date("2026-08-15T18:00:00-05:00"),
      lastExportDay: "2026-08-14",
      fetchImpl,
      delayMs: 0,
    });
    expect(events).toEqual([]);
    expect(fetchImpl.mock.calls.length).toBe(2);
  });
});

describe("mergeForexFactoryEvents", () => {
  it("prefers the official weekly export on overlapping titles", () => {
    const exportEvent = event({
      id: "ff-export",
      title: "Core CPI m/m",
      scheduledAt: "2026-08-17T12:30:00.000Z",
      consensus: "0.2%",
    });
    const siteEvent = event({
      id: "ff-site",
      title: "Core CPI m/m",
      scheduledAt: "2026-08-17T12:30:00.000Z",
      consensus: "0.3%",
    });
    const merged = mergeForexFactoryEvents([exportEvent], [siteEvent]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("ff-export");
    expect(merged[0]?.consensus).toBe("0.2%");
  });
});
