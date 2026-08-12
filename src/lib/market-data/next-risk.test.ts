import { describe, expect, it } from "vitest";
import {
  isUsdMarketEvent,
  selectNextHighImpactRisk,
  selectUpcomingUsdHighImpactRisks,
} from "@/lib/market-data/next-risk";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";

const asOf = "2026-08-12T15:00:00.000Z";

function event(
  partial: Pick<
    NormalizedCalendarEvent,
    "id" | "title" | "scheduledAt" | "importance"
  > &
    Partial<NormalizedCalendarEvent>,
): NormalizedCalendarEvent {
  return {
    category: "economic",
    timeZone: "America/Chicago",
    providerName: "test",
    providerTimestamp: asOf,
    retrievalTimestamp: asOf,
    sourceQuality: "mock",
    country: "USD",
    ...partial,
  };
}

describe("isUsdMarketEvent", () => {
  it("treats USD and US as USD-market codes", () => {
    expect(isUsdMarketEvent(event({ id: "a", title: "a", scheduledAt: asOf, importance: "high", country: "USD" }))).toBe(true);
    expect(isUsdMarketEvent(event({ id: "b", title: "b", scheduledAt: asOf, importance: "high", country: "US" }))).toBe(true);
    expect(isUsdMarketEvent(event({ id: "c", title: "c", scheduledAt: asOf, importance: "high", country: "GBP" }))).toBe(false);
    expect(isUsdMarketEvent(event({ id: "d", title: "d", scheduledAt: asOf, importance: "high", country: undefined }))).toBe(false);
  });
});

describe("selectUpcomingUsdHighImpactRisks", () => {
  it("returns all upcoming high-impact USD events, soonest first", () => {
    const events = [
      event({
        id: "gbp-high",
        title: "GDP m/m",
        importance: "high",
        country: "GBP",
        scheduledAt: "2026-08-12T16:00:00.000Z",
      }),
      event({
        id: "usd-later",
        title: "FOMC decision",
        importance: "high",
        country: "USD",
        scheduledAt: "2026-08-13T18:00:00.000Z",
      }),
      event({
        id: "us-soon",
        title: "CPI (YoY)",
        importance: "high",
        country: "US",
        scheduledAt: "2026-08-12T18:00:00.000Z",
      }),
      event({
        id: "usd-low",
        title: "Building permits",
        importance: "low",
        country: "USD",
        scheduledAt: "2026-08-12T16:30:00.000Z",
      }),
    ];

    expect(selectUpcomingUsdHighImpactRisks(events, asOf).map((e) => e.id)).toEqual([
      "us-soon",
      "usd-later",
    ]);
  });

  it("returns nullish next when only non-USD highs exist", () => {
    const events = [
      event({
        id: "gbp-high",
        title: "GDP m/m",
        importance: "high",
        country: "GBP",
        scheduledAt: "2026-08-12T16:00:00.000Z",
      }),
    ];

    expect(selectUpcomingUsdHighImpactRisks(events, asOf)).toEqual([]);
    expect(selectNextHighImpactRisk(events, asOf)).toBeNull();
  });
});

describe("selectNextHighImpactRisk", () => {
  it("returns the soonest upcoming high-impact USD event", () => {
    const events = [
      event({
        id: "low-soon",
        title: "RICS House Price Balance",
        importance: "low",
        country: "GBP",
        scheduledAt: "2026-08-12T16:00:00.000Z",
      }),
      event({
        id: "high-later",
        title: "CPI (YoY)",
        importance: "high",
        country: "USD",
        scheduledAt: "2026-08-13T12:30:00.000Z",
      }),
      event({
        id: "high-soonest",
        title: "FOMC decision",
        importance: "high",
        country: "USD",
        scheduledAt: "2026-08-12T18:00:00.000Z",
      }),
      event({
        id: "medium",
        title: "Retail sales",
        importance: "medium",
        country: "USD",
        scheduledAt: "2026-08-12T17:00:00.000Z",
      }),
    ];

    expect(selectNextHighImpactRisk(events, asOf)?.id).toBe("high-soonest");
  });

  it("skips past high-impact events", () => {
    const events = [
      event({
        id: "past-high",
        title: "Past CPI",
        importance: "high",
        scheduledAt: "2026-08-12T14:00:00.000Z",
      }),
      event({
        id: "future-high",
        title: "Future CPI",
        importance: "high",
        scheduledAt: "2026-08-14T12:30:00.000Z",
      }),
    ];

    expect(selectNextHighImpactRisk(events, asOf)?.id).toBe("future-high");
  });

  it("returns null when only low/medium upcoming events exist", () => {
    const events = [
      event({
        id: "low",
        title: "RICS House Price Balance",
        importance: "low",
        scheduledAt: "2026-08-12T16:00:00.000Z",
      }),
      event({
        id: "medium",
        title: "Retail sales",
        importance: "medium",
        scheduledAt: "2026-08-13T12:30:00.000Z",
      }),
    ];

    expect(selectNextHighImpactRisk(events, asOf)).toBeNull();
  });

  it("returns null for empty input or invalid asOf", () => {
    expect(selectNextHighImpactRisk([], asOf)).toBeNull();
    expect(
      selectNextHighImpactRisk(
        [
          event({
            id: "high",
            title: "CPI",
            importance: "high",
            scheduledAt: "2026-08-13T12:30:00.000Z",
          }),
        ],
        "not-a-date",
      ),
    ).toBeNull();
  });

  it("ignores events without high importance", () => {
    const events = [
      event({
        id: "unrated",
        title: "Unrated print",
        scheduledAt: "2026-08-12T16:00:00.000Z",
      }),
    ];

    expect(selectNextHighImpactRisk(events, asOf)).toBeNull();
  });
});
