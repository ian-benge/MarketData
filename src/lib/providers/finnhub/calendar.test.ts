import { describe, expect, it } from "vitest";
import { normalizeFinnhubEconomicEvent } from "@/lib/providers/finnhub/calendar";

describe("normalizeFinnhubEconomicEvent", () => {
  it("maps a US print into a calendar event", () => {
    const event = normalizeFinnhubEconomicEvent(
      {
        country: "US",
        event: "CPI YoY",
        impact: "high",
        time: "2026-08-12 12:30:00",
        estimate: 2.8,
        prev: 2.7,
        unit: "%",
      },
      "2026-08-11T15:00:00.000Z",
    );
    expect(event).toMatchObject({
      title: "CPI YoY",
      country: "US",
      importance: "high",
      category: "economic",
      consensus: 2.8,
      previous: 2.7,
      sourceQuality: "secondary",
      providerName: "finnhub",
    });
    expect(event?.scheduledAt).toBe("2026-08-12T12:30:00.000Z");
  });

  it("drops rows without a title or time", () => {
    expect(
      normalizeFinnhubEconomicEvent({ event: "CPI", time: undefined }),
    ).toBeNull();
  });
});
