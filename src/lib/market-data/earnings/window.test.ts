import { describe, expect, it } from "vitest";
import {
  earningsCoverageWindow,
  foldWeekendReportDate,
  isDateInInclusiveWindow,
  mondayOfChicagoWeek,
  parseIsoDateOnly,
} from "@/lib/market-data/earnings/window";

describe("earnings date window", () => {
  it("uses America/Chicago yesterday through +6 months, not UTC midnight", () => {
    // 04:00 UTC 11 Aug 2026 = 23:00 CDT 10 Aug
    const lateChicago = earningsCoverageWindow(new Date("2026-08-11T04:00:00.000Z"));
    expect(lateChicago).toEqual({ from: "2026-08-09", to: "2027-02-09" });

    // 05:00 UTC 11 Aug 2026 = 00:00 CDT 11 Aug
    const chicagoMidnight = earningsCoverageWindow(
      new Date("2026-08-11T05:00:00.000Z"),
    );
    expect(chicagoMidnight).toEqual({ from: "2026-08-10", to: "2027-02-10" });
  });

  it("stays on the Chicago date after UTC has already rolled forward", () => {
    // 00:30 UTC 12 Aug 2026 = 19:30 CDT 11 Aug
    const evening = earningsCoverageWindow(new Date("2026-08-12T00:30:00.000Z"));
    expect(evening).toEqual({ from: "2026-08-10", to: "2027-02-10" });
  });

  it("accepts inclusive ISO dates and rejects invalid calendar days", () => {
    expect(parseIsoDateOnly("2026-08-12T15:00:00Z")).toBe("2026-08-12");
    expect(parseIsoDateOnly("2026-02-30")).toBeNull();
    expect(isDateInInclusiveWindow("2026-08-10", "2026-08-10", "2027-02-10")).toBe(
      true,
    );
    expect(isDateInInclusiveWindow("2027-02-11", "2026-08-10", "2027-02-10")).toBe(
      false,
    );
  });

  it("maps Saturday and Sunday prints onto that week's Friday chip", () => {
    expect(mondayOfChicagoWeek("2026-08-22")).toBe("2026-08-17");
    expect(foldWeekendReportDate("2026-08-22")).toBe("2026-08-21");
    expect(foldWeekendReportDate("2026-08-23")).toBe("2026-08-21");
    expect(foldWeekendReportDate("2026-08-19")).toBe("2026-08-19");
  });
});
