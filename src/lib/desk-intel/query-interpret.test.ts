import { describe, expect, it } from "vitest";
import { mergeInterpretedQuery, queryLooksNatural } from "./query-interpret";

describe("query-interpret", () => {
  it("detects natural-language research questions", () => {
    expect(queryLooksNatural("NVDA")).toBe(false);
    expect(queryLooksNatural("why is IREN moving today?")).toBe(true);
  });

  it("merges LLM tickers into the lexical parse without dropping why-moving", () => {
    const merged = mergeInterpretedQuery(
      "what's going on with IREN this morning",
      {
        intent: "why_moving",
        tickers: ["IREN"],
        eventTypes: ["filing"],
        themes: ["semiconductors"],
        materialOnly: true,
        timeWindow: "today",
        textTerms: ["iren"],
        whyTicker: "IREN",
      },
      new Date("2026-08-15T14:00:00.000Z"),
    );
    expect(merged.tickers).toContain("IREN");
    expect(merged.intent).toBe("why_moving");
    expect(merged.whyTicker).toBe("IREN");
    expect(merged.eventTypes).toContain("filing");
    expect(merged.materialOnly).toBe(true);
  });
});
