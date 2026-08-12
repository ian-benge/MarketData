import { describe, expect, it } from "vitest";
import {
  catalystSnapshotIsFresh,
  lastCatalystMorningAt,
  mapForexFactoryImpact,
  normalizeForexFactoryEvent,
} from "@/lib/providers/forex-factory/calendar";

describe("normalizeForexFactoryEvent", () => {
  it("keeps FF forecast strings and maps high-impact USD CPI", () => {
    const event = normalizeForexFactoryEvent(
      {
        title: "Core CPI m/m",
        country: "USD",
        date: "2026-08-12T08:30:00-04:00",
        impact: "High",
        forecast: "0.2%",
        previous: "0.0%",
        actual: "",
      },
      "2026-08-11T11:00:00.000Z",
    );
    expect(event).toMatchObject({
      title: "Core CPI m/m",
      country: "USD",
      importance: "high",
      category: "economic",
      consensus: "0.2%",
      previous: "0.0%",
      actual: null,
      providerName: "forex-factory",
    });
    expect(event?.scheduledAt).toBe("2026-08-12T12:30:00.000Z");
  });

  it("labels FOMC speeches as central bank and holidays as other", () => {
    expect(
      normalizeForexFactoryEvent({
        title: "FOMC Member Hammack Speaks",
        country: "USD",
        date: "2026-08-10T15:00:00-04:00",
        impact: "Low",
        forecast: "",
        previous: "",
      })?.category,
    ).toBe("central_bank");
    expect(
      mapForexFactoryImpact("Holiday"),
    ).toBeUndefined();
  });
});

describe("catalyst morning freshness", () => {
  it("treats a 6:00 CT snapshot as fresh until the next morning", () => {
    const morning = lastCatalystMorningAt(new Date("2026-08-11T12:00:00.000Z"));
    expect(catalystSnapshotIsFresh(morning.toISOString(), new Date("2026-08-11T20:00:00.000Z"))).toBe(
      true,
    );
    expect(catalystSnapshotIsFresh(morning.toISOString(), new Date("2026-08-12T12:00:00.000Z"))).toBe(
      false,
    );
  });
});
