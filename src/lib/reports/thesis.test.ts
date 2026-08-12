import { describe, expect, it } from "vitest";
import {
  assertNoDroppedTheses,
  evaluateThesis,
  mergeTheses,
  seedThesesFromMovers,
  type ThesisRecord,
} from "@/lib/reports/thesis";

const prior: ThesisRecord = {
  id: "thesis-premarket-nvda-1",
  statement: "NVDA bid on AI outlook",
  tickers: ["NVDA"],
  holdingPeriod: "intraday",
  initialEdition: "premarket",
  status: "pending",
  newEvidence: "Premarket print",
  marketResponse: "Initial",
  affectsTrade: false,
  sourceIds: ["demo-news-1"],
  targetPrice: 140,
  invalidationPrice: 120,
  expectedDirection: "up",
};

describe("thesis audit", () => {
  it("confirms when the tape moves with the thesis", () => {
    const next = evaluateThesis(prior, [
      { ticker: "NVDA", last: 132, changePercent: 2.1 },
    ]);
    expect(next.status).toBe("confirmed");
    expect(next.previousStatus).toBe("pending");
    expect(next.id).toBe(prior.id);
  });

  it("marks target_reached without dropping the id", () => {
    const next = evaluateThesis(prior, [
      { ticker: "NVDA", last: 141, changePercent: 8 },
    ]);
    expect(next.status).toBe("target_reached");
  });

  it("never drops prior thesis ids when merging", () => {
    const { theses, changes } = mergeTheses(
      [prior],
      [
        {
          ...prior,
          id: "thesis-midday-amd-1",
          statement: "AMD follow-through",
          tickers: ["AMD"],
          initialEdition: "midday",
        },
      ],
      [{ ticker: "NVDA", last: 131, changePercent: 1.2 }],
    );
    expect(theses.map((t) => t.id)).toContain(prior.id);
    expect(theses.map((t) => t.id)).toContain("thesis-midday-amd-1");
    expect(changes[0]?.thesisId).toBe(prior.id);
    expect(assertNoDroppedTheses([prior.id], theses)).toEqual([]);
  });

  it("reports dropped ids", () => {
    expect(assertNoDroppedTheses(["missing"], [])).toEqual(["missing"]);
  });

  it("keeps one thesis per ticker across editions", () => {
    const premarket = seedThesesFromMovers("premarket", [
      {
        ticker: "VRT",
        changePercent: 2.4,
        price: 98,
        catalystSummary: "Cooling backlog",
        sourceIds: ["s1"],
      },
    ]);
    const midday = seedThesesFromMovers("midday", [
      {
        ticker: "VRT",
        changePercent: 2.4,
        price: 98.4,
        catalystSummary: "Cooling backlog",
        sourceIds: ["s1"],
      },
      {
        ticker: "NVDA",
        changePercent: 1.9,
        price: 131,
        catalystSummary: "AI outlook",
        sourceIds: ["s2"],
      },
    ]);
    const { theses } = mergeTheses(premarket, midday, [
      { ticker: "VRT", last: 98.4, changePercent: 2.4 },
      { ticker: "NVDA", last: 131, changePercent: 1.9 },
    ]);
    expect(theses.filter((t) => t.tickers.includes("VRT"))).toHaveLength(1);
    expect(theses.map((t) => t.id).sort()).toEqual(["thesis-nvda", "thesis-vrt"]);
  });
});
