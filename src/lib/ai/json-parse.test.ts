import { describe, expect, it } from "vitest";
import { extractJsonPayload, repairTruncatedJson } from "./json-parse";

describe("extractJsonPayload", () => {
  it("parses a complete object", () => {
    expect(extractJsonPayload('{"headline":"ok"}')).toEqual({ headline: "ok" });
  });

  it("repairs a truncated object cut mid-string", () => {
    expect(extractJsonPayload('{ "headline": "partial')).toEqual({
      headline: "partial",
    });
  });

  it("repairs a truncated nested object", () => {
    expect(
      extractJsonPayload('{"items":[{"id":"a","note":"cut'),
    ).toEqual({
      items: [{ id: "a", note: "cut" }],
    });
  });

  it("throws when no JSON can be recovered", () => {
    expect(() => extractJsonPayload("not json at all")).toThrow(
      /Could not extract JSON/,
    );
  });
});

describe("repairTruncatedJson", () => {
  it("returns null when there is no object or array", () => {
    expect(repairTruncatedJson("plain text")).toBeNull();
  });
});
