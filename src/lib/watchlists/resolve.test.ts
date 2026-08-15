import { describe, expect, it } from "vitest";
import { planInstrumentResolution } from "@/lib/watchlists/resolve";

describe("instrument resolution planner", () => {
  it("quarantines listed unresolved symbols without inventing replacements", () => {
    const plan = planInstrumentResolution({
      symbol: "BRUN",
      yahoo: { name: null, quoteType: null },
    });
    expect(plan.resolutionStatus).toBe("quarantined");
    expect(plan.queue).toBe(true);
    expect(plan.reason).toMatch(/do not guess/i);
  });

  it("resolves Yahoo equity hits and catalog ETFs", () => {
    expect(
      planInstrumentResolution({
        symbol: "NVDA",
        yahoo: { name: "NVIDIA Corporation", quoteType: "EQUITY" },
      }).resolutionStatus,
    ).toBe("resolved");
    expect(
      planInstrumentResolution({
        symbol: "NCLD",
        yahoo: { name: null, quoteType: null },
      }).classification.securityType,
    ).toBe("etf");
  });

  it("queues names the provider cannot identify", () => {
    const plan = planInstrumentResolution({
      symbol: "ZZZZ",
      yahoo: { name: null, quoteType: null },
    });
    expect(plan.resolutionStatus).toBe("unverified");
    expect(plan.queue).toBe(true);
  });
});
