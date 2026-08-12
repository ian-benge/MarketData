import { describe, expect, it } from "vitest";
import { validateClaimsHaveCitations } from "@/lib/domain/citations";

describe("citations", () => {
  const sources = [
    { id: "src-1", url: "https://example.com/1" },
    { id: "src-2", url: "https://example.com/2" },
  ];

  it("passes when material claims cite known sources", () => {
    const result = validateClaimsHaveCitations(
      [
        {
          id: "c1",
          text: "NVDA beat estimates",
          material: true,
          sourceIds: ["src-1"],
        },
        {
          id: "c2",
          text: "color commentary",
          material: false,
          sourceIds: [],
        },
      ],
      sources,
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails when material claims lack sources", () => {
    const result = validateClaimsHaveCitations(
      [
        {
          id: "c1",
          text: "unsupported claim",
          material: true,
          sourceIds: [],
        },
      ],
      sources,
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.reason).toBe("empty_source_ids");
  });

  it("fails when sourceIds are unknown", () => {
    const result = validateClaimsHaveCitations(
      [
        {
          id: "c1",
          text: "claim",
          material: true,
          sourceIds: ["missing"],
        },
      ],
      sources,
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.reason).toBe("unknown_source_id");
    expect(result.issues[0]?.invalidSourceIds).toContain("missing");
  });
});
