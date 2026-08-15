import { describe, expect, it } from "vitest";
import { applyModelDraft } from "./report-merge";
import type { ReportDocumentModel } from "@/lib/reports/content-builder";

const document = {
  title: "Close / Postmarket",
  executiveSummary: "Tape mixed into the close.",
  executiveBullets: ["IREN -6.4% after an 8-K."],
  sections: [
    {
      sectionKey: "what_is_moving",
      title: "What is moving",
      body: "IREN -6.4% on a primary filing.",
      sourceIds: ["src-iren-8k"],
    },
  ],
  claims: [],
  sources: [
    {
      id: "src-iren-8k",
      title: "IREN 8-K",
      url: "https://demo.news.local/iren-8k",
    },
  ],
  labels: ["filings"],
} as unknown as ReportDocumentModel;

const evidence = {
  numberTokens: ["-6.4", "6.4"],
  textBlobs: ["IREN Limited files 8-K on additional AI power capacity"],
};

describe("applyModelDraft", () => {
  it("merges grounded synthesis into the deterministic document", () => {
    const result = applyModelDraft(
      document,
      {
        synthesis: {
          causalStatus: "confirmed",
          summary: "IREN is -6.4% after a cited 8-K on AI power capacity.",
          sourceIds: ["src-iren-8k"],
          claims: [
            {
              id: "c1",
              text: "IREN filed an 8-K tied to AI power capacity.",
              material: true,
              causalStatus: "confirmed",
              sourceIds: ["src-iren-8k"],
              tickers: ["IREN"],
            },
          ],
          unresolvedQuestions: [],
        },
      },
      evidence,
    );
    expect(result.applied).toContain("causal_synthesis");
    expect(result.document.sections[0]?.body).toMatch(/Desk synthesis/);
    expect(result.document.claims.some((claim) => claim.id === "c1")).toBe(true);
  });

  it("skips synthesis that invents a print", () => {
    const result = applyModelDraft(
      document,
      {
        synthesis: {
          causalStatus: "confirmed",
          summary: "IREN ripped to 47.25 on a buyout rumor.",
          sourceIds: ["src-iren-8k"],
          claims: [],
          unresolvedQuestions: [],
        },
      },
      evidence,
    );
    expect(result.skipped).toContain("causal_synthesis");
    expect(result.document.sections[0]?.body).toBe(document.sections[0]?.body);
  });
});
