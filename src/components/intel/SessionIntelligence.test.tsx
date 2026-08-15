/** @vitest-environment jsdom */

import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionIntelligence } from "@/components/intel/SessionIntelligence";
import { GroundedNarrative } from "@/components/intel/GroundedNarrative";
import { GenerationMeta } from "@/components/intel/GenerationMeta";
import { UNKNOWN_MOVE_COPY } from "@/lib/desk-intel/types";

describe("SessionIntelligence", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/intel/session")) {
          return new Response(
            JSON.stringify({
              kind: "session_brief",
              method: "rules",
              data: {
                headline: "IREN files 8-K · 2 significant tape names",
                sessionRead: "1 significant name lacks a verified catalyst.",
                materialNow: [
                  {
                    id: "mat-1",
                    text: "IREN Limited files 8-K on additional AI power capacity (IREN)",
                    nature: "fact",
                    sourceIds: ["src-iren-8k"],
                    tickers: ["IREN"],
                  },
                ],
                unexplainedTape: [
                  {
                    ticker: "XYZ",
                    changePercent: 8.4,
                    note: UNKNOWN_MOVE_COPY,
                  },
                ],
                bookFlags: [],
                themes: [{ id: "semiconductors", note: "appears", sourceIds: [] }],
                watchItems: ["XYZ"],
                gaps: [],
                unresolvedQuestions: ["What, if anything, explains XYZ +8.40%?"],
              },
              sources: [
                {
                  id: "src-iren-8k",
                  title: "IREN 8-K",
                  url: "https://demo.news.local/iren-8k",
                  publisher: "Demo EDGAR",
                  publishedAt: "2026-08-15T13:40:00.000Z",
                  sourceClass: "primary",
                  tickers: ["IREN"],
                },
              ],
              warnings: [],
              cached: false,
              generatedAt: "2026-08-15T18:00:00.000Z",
              evidenceHash: "test",
              promptVersion: "test",
              model: null,
              providerName: null,
              subject: "session",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
  });

  it("renders a grounded session brief with unexplained tape", async () => {
    render(<SessionIntelligence />);
    await waitFor(() => {
      expect(screen.getByText(/IREN files 8-K/)).toBeTruthy();
    });
    expect(screen.getAllByText("XYZ").length).toBeGreaterThan(0);
    expect(screen.getByText(/Rules compilation/)).toBeTruthy();
    expect(screen.getByText("fact")).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("GroundedNarrative", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps search evidence when the intel envelope is a weaker unknown", () => {
    render(
      <GroundedNarrative
        explanation={{
          ticker: "TSLA",
          significant: false,
          changePercent: 1.8,
          relativeVolume: 1.1,
          session: "closed",
          flags: [],
          direction: "up",
          attribution: "likely_catalyst",
          confidence: "probable",
          evidenceNature: "inference",
          causalStatus: "reported",
          headline: "Likely catalyst: Tesla unveils cheaper Model Y",
          detail: "A ticker-tagged wire lands in the search window.",
          supportingEvents: [],
          relatedTickers: [],
          themes: [],
          window: {
            start: "2026-08-15T00:00:00.000Z",
            end: "2026-08-15T20:00:00.000Z",
            label: "Matching headlines",
          },
          coverageGap: null,
        }}
        envelope={{
          kind: "move_narrative",
          subject: "TSLA",
          method: "rules",
          model: null,
          providerName: null,
          promptVersion: "move_narrative@v1",
          evidenceHash: "test",
          generatedAt: "2026-08-15T18:00:00.000Z",
          cached: true,
          warnings: [],
          sources: [],
          data: {
            ticker: "TSLA",
            attribution: "unknown",
            nature: "unknown",
            headline: "Unknown catalyst",
            narrative: UNKNOWN_MOVE_COPY,
            whyItMatters: "Do not fill the gap.",
            caveats: [UNKNOWN_MOVE_COPY],
            sourceIds: [],
            relatedTickers: [],
          },
        }}
      />,
    );
    expect(screen.getByText(/Tesla unveils cheaper Model Y/)).toBeTruthy();
    expect(screen.queryByText("Unknown catalyst")).toBeNull();
    expect(screen.queryByText("Rules compilation")).toBeNull();
  });

  it("keeps unknown as unknown when the envelope says so", () => {
    render(
      <GroundedNarrative
        envelope={{
          kind: "move_narrative",
          subject: "XYZ",
          method: "rules",
          model: null,
          providerName: null,
          promptVersion: "move_narrative@v1",
          evidenceHash: "test",
          generatedAt: "2026-08-15T18:00:00.000Z",
          cached: false,
          warnings: [],
          sources: [],
          data: {
            ticker: "XYZ",
            attribution: "unknown",
            nature: "unknown",
            headline: "Unknown catalyst",
            narrative: UNKNOWN_MOVE_COPY,
            whyItMatters: "Do not fill the gap.",
            caveats: [UNKNOWN_MOVE_COPY],
            sourceIds: [],
            relatedTickers: [],
          },
        }}
      />,
    );
    expect(screen.getByText("Unknown catalyst")).toBeTruthy();
    expect(screen.getAllByText(UNKNOWN_MOVE_COPY).length).toBeGreaterThan(0);
  });
});

describe("GenerationMeta", () => {
  afterEach(() => {
    cleanup();
  });

  it("hides operational model_unavailable as a grounding note", () => {
    render(
      <GenerationMeta
        envelope={{
          method: "rules",
          model: null,
          generatedAt: "2026-08-15T18:00:00.000Z",
          cached: false,
          warnings: [
            {
              code: "model_unavailable",
              message: "Model synthesis failed; showing the rules compilation.",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Rules compilation")).toBeTruthy();
    expect(screen.queryByText(/grounding note/)).toBeNull();
  });

  it("surfaces real grounding failures", () => {
    render(
      <GenerationMeta
        envelope={{
          method: "rules",
          model: "anthropic/claude-sonnet-5",
          generatedAt: "2026-08-15T18:00:00.000Z",
          cached: false,
          warnings: [
            {
              code: "grounding_rejected",
              message: "Model brief failed grounding; showing the rules compilation.",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText(/1 grounding note/)).toBeTruthy();
  });
});
