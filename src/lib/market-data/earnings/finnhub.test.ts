import { describe, expect, it } from "vitest";
import { parseFinnhubEarningsCalendar } from "@/lib/market-data/earnings/finnhub";

describe("parseFinnhubEarningsCalendar", () => {
  it("keeps rows with string estimates and skips only broken rows", () => {
    const parsed = parseFinnhubEarningsCalendar(
      {
        earningsCalendar: [
          {
            symbol: "nvda",
            date: "2026-08-12",
            hour: "amc",
            quarter: "2",
            year: "2027",
            epsEstimate: "1.01",
            epsActual: null,
          },
          { symbol: "", date: "2026-08-12" },
          { symbol: "BAD", date: "not-a-date" },
          { symbol: "BRK.B", date: "2026-08-14", hour: "bmo" },
        ],
      },
      "2026-08-11T15:00:00.000Z",
    );
    expect(parsed.events.map((event) => event.canonicalSymbol)).toEqual([
      "NVDA",
      "BRK.B",
    ]);
    expect(parsed.events[0]).toMatchObject({
      session: "amc",
      fiscalPeriod: "Q2 2027",
      epsEstimate: 1.01,
    });
    expect(parsed.diagnostics).toMatchObject({
      rawRows: 4,
      parsed: 2,
      emptySymbol: 1,
      invalidDate: 1,
    });
  });
});
