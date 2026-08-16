import { describe, expect, it } from "vitest";
import { formatReportTimestamp } from "./report-format";

describe("formatReportTimestamp", () => {
  it("renders a Chicago clock without a raw Z timestamp", () => {
    const printed = formatReportTimestamp("2026-08-12T21:28:17.222Z");
    expect(printed).toMatch(/CT$/);
    expect(printed).not.toMatch(/T21:28:17/);
    expect(printed).not.toMatch(/Z$/);
  });
});
