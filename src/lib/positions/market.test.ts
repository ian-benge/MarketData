import { describe, expect, it } from "vitest";
import { loadPositionMarketContext } from "./market";

describe("loadPositionMarketContext", () => {
  it("does not request quotes for an empty open book", async () => {
    const context = await loadPositionMarketContext([]);
    expect(context.quotes.size).toBe(0);
    expect(context.closes.size).toBe(0);
    expect(context.latencyCoverageLabel).not.toMatch(/Real-time|Unavailable/i);
  });
});
