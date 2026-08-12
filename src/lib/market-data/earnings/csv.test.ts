import { describe, expect, it } from "vitest";
import { csvRowsToObjects, parseCsv } from "@/lib/market-data/earnings/csv";

describe("earnings CSV parser", () => {
  it("reads quoted values, blank fields, and standard rows", () => {
    const text = [
      "symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay",
      'PAGP,"PLAINS GP HOLDINGS, L.P.",2026-08-14,2026-06-30,0.43,USD,',
      "ABSI,ABSCI CORPORATION,2026-08-11,2026-06-30,-0.17,USD,post-market",
      "AEON,AEON BIOPHARMA INCORPORATED,2026-08-11,2026-06-30,,USD,",
    ].join("\n");
    const rows = csvRowsToObjects(parseCsv(text));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      symbol: "PAGP",
      name: "PLAINS GP HOLDINGS, L.P.",
      estimate: "0.43",
      timeOfTheDay: "",
    });
    expect(rows[1]?.timeOfTheDay).toBe("post-market");
    expect(rows[2]?.estimate).toBe("");
  });

  it("skips empty lines and keeps a malformed short row", () => {
    const text = "symbol,reportDate\nAAPL,2026-08-12\n\nbroken-only-one-field\n";
    const rows = parseCsv(text);
    expect(rows).toHaveLength(3);
    expect(rows[2]?.[0]).toBe("broken-only-one-field");
    const objects = csvRowsToObjects(rows);
    expect(objects[1]?.symbol).toBe("broken-only-one-field");
    expect(objects[1]?.reportDate).toBe("");
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const rows = parseCsv('name\n"ACME ""HOLDINGS"""\n');
    expect(rows[1]?.[0]).toBe('ACME "HOLDINGS"');
  });
});
