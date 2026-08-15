import { describe, expect, it } from "vitest";
import { classifyHeadline } from "./event-classify";

describe("event classification", () => {
  it("labels export-control and filing headlines", () => {
    expect(
      classifyHeadline("BIS adds semiconductor equipment to entity list").eventType,
    ).toBe("export_control");
    expect(classifyHeadline("NVIDIA Corp - 8-K").eventType).toBe("filing");
  });

  it("labels earnings, contracts, and M&A without guessing sentiment on price words", () => {
    expect(classifyHeadline("Apple reports Q2 earnings, beats estimates").eventType).toBe(
      "earnings",
    );
    expect(classifyHeadline("Apple reports Q2 earnings, beats estimates").sentiment).toBe(
      "positive",
    );
    expect(
      classifyHeadline("Utility awards 200 MW power purchase agreement to IREN").eventType,
    ).toBe("contract");
    expect(classifyHeadline("Broadcom to acquire a networking vendor").eventType).toBe("ma");
    expect(classifyHeadline("Stock jumps in early trading").sentiment).toBe("unscored");
  });
});
