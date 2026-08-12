import { describe, expect, it } from "vitest";
import {
  nyseHolidayEvents,
  nyseHolidayName,
} from "@/lib/scheduling/nyse-holidays";

describe("nyse holidays", () => {
  it("names observed 2026 dates", () => {
    expect(nyseHolidayName("2026-09-07")).toBe("Labor Day");
    expect(nyseHolidayName("2026-07-03")).toBe("Independence Day");
  });

  it("emits Labor Day inside a 45-day August window", () => {
    const events = nyseHolidayEvents(
      "2026-08-11T00:00:00.000Z",
      "2026-09-25T00:00:00.000Z",
    );
    expect(events.some((event) => event.title.includes("Labor Day"))).toBe(
      true,
    );
  });
});
