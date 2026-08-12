import { describe, expect, it } from "vitest";
import { parseAlphaVantageEarningsCsv } from "@/lib/market-data/earnings/alpha-vantage";

const HEADER =
  "symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay";

describe("parseAlphaVantageEarningsCsv", () => {
  it("parses the official 7-column CSV including timing and quoted names", () => {
    const csv = [
      HEADER,
      'PAGP,"PLAINS GP HOLDINGS, L.P.",2026-08-14,2026-06-30,0.43,USD,',
      "BF.B,BROWN FORMAN CORPORATION,2026-09-02,2026-07-31,0.38,USD,pre-market",
      "ABSI,ABSCI CORPORATION,2026-08-11,2026-06-30,-0.17,USD,post-market",
      ",MISSING SYMBOL,2026-08-11,2026-06-30,,USD,",
      "BAD,Bad Date,not-a-date,2026-06-30,,USD,",
    ].join("\n");
    const parsed = parseAlphaVantageEarningsCsv(csv, "2026-08-11T15:00:00.000Z");
    expect(parsed.events).toHaveLength(3);
    expect(parsed.events[0]).toMatchObject({
      canonicalSymbol: "PAGP",
      companyName: "PLAINS GP HOLDINGS, L.P.",
      session: "unknown",
      epsEstimate: 0.43,
      fiscalPeriod: "Q2 2026",
    });
    expect(parsed.events[1]).toMatchObject({
      canonicalSymbol: "BF.B",
      session: "bmo",
      fiscalPeriod: "Q3 2026",
    });
    expect(parsed.events[2]?.session).toBe("amc");
    expect(parsed.diagnostics.emptySymbol).toBe(1);
    expect(parsed.diagnostics.invalidDate).toBe(1);
  });

  it("throws on JSON rate-limit or error payloads instead of treating them as zero rows", () => {
    expect(() =>
      parseAlphaVantageEarningsCsv(
        JSON.stringify({ Note: "API call frequency is 25 requests per day." }),
        "2026-08-11T15:00:00.000Z",
      ),
    ).toThrow(/25 requests per day/i);
  });
});
