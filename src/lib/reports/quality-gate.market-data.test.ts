import { describe, expect, it } from "vitest";
import { runQualityGate } from "@/lib/reports/quality-gate";
import {
  buildReportDocument,
  evidenceBundleFromMarket,
  extraNumbersFromDocument,
} from "@/lib/reports/content-builder";
import { demoMarketSnapshot } from "@/lib/fixtures/demo-market";
import { demoNewsItems } from "@/lib/fixtures/demo-news";
import { defaultSurfacesForScope } from "@/lib/market-data/licensing";
import { latencyCoverageLabel } from "@/lib/market-data/schemas";

function baseDoc() {
  const market = demoMarketSnapshot("close_postmarket");
  const news = demoNewsItems("close_postmarket");
  const document = buildReportDocument({
    edition: "close_postmarket",
    tradingDate: "2026-08-10",
    market,
    news,
    isDemo: true,
  });
  const evidence = evidenceBundleFromMarket(market, news, {
    extraNumbers: extraNumbersFromDocument(document),
  });
  return { document, evidence };
}

describe("quality gate market-data rules", () => {
  it("blocks shared production surfaces under single_user_development", () => {
    const { document, evidence } = baseDoc();
    const permitted = defaultSurfacesForScope("single_user_development");
    const quality = runQualityGate(document, evidence, {
      marketData: {
        permittedSurfaces: permitted,
        requestedSurfaces: [
          "pdf_inclusion",
          "email_attachment",
          "ai_analysis_input",
        ],
        feedCoverage: "iex",
        dataCutoff: new Date().toISOString(),
      },
    });
    expect(quality.ok).toBe(false);
    expect(
      quality.issues.some((i) => i.code === "license_surface_blocked"),
    ).toBe(true);
  });

  it("blocks stale core observations", () => {
    const { document, evidence } = baseDoc();
    const quality = runQualityGate(document, evidence, {
      marketData: {
        dataCutoff: "2026-08-10T10:00:00.000Z",
        now: new Date("2026-08-10T14:30:00.000Z"),
        staleAfterSeconds: 180,
        feedCoverage: "iex",
      },
    });
    expect(quality.issues.some((i) => i.code === "stale_core_observations")).toBe(
      true,
    );
  });

  it("blocks latency label mismatch and IEX-as-SIP claims", () => {
    const { document, evidence } = baseDoc();
    const expected = latencyCoverageLabel({
      feedCoverage: "iex",
      latencyClass: "realtime",
    });
    const mismatch = runQualityGate(
      { ...document, labels: [...document.labels, "SIP realtime"] },
      evidence,
      {
        marketData: {
          feedCoverage: "iex",
          declaredLatencyLabel: "Real-time — SIP",
          expectedLatencyLabel: expected,
          dataCutoff: new Date().toISOString(),
        },
      },
    );
    expect(
      mismatch.issues.some((i) => i.code === "latency_label_mismatch"),
    ).toBe(true);
    expect(mismatch.issues.some((i) => i.code === "iex_labeled_as_sip")).toBe(
      true,
    );
  });

  it("blocks broad coverage claims on IEX", () => {
    const { document, evidence } = baseDoc();
    const quality = runQualityGate(
      {
        ...document,
        executiveSummary: "Full-market breadth improved with SIP coverage.",
      },
      evidence,
      {
        marketData: {
          feedCoverage: "iex",
          dataCutoff: new Date().toISOString(),
        },
      },
    );
    expect(quality.issues.some((i) => i.code === "coverage_too_narrow")).toBe(
      true,
    );
  });

  it("does not treat IEX disclaimers as SIP or full-market claims", () => {
    const { document, evidence } = baseDoc();
    const quality = runQualityGate(
      {
        ...document,
        executiveSummary:
          "Tracked-universe tape only. Movers are not labeled as SIP.",
        sections: [
          ...document.sections,
          {
            sectionKey: "methodology",
            title: "Methodology",
            body: "Universe breadth (not SIP/full-market unless the feed says so).",
          },
        ],
      },
      evidence,
      {
        marketData: {
          feedCoverage: "iex",
          dataCutoff: new Date().toISOString(),
          permittedSurfaces: defaultSurfacesForScope("internal_team"),
          requestedSurfaces: ["pdf_inclusion", "ai_analysis_input"],
        },
      },
    );
    expect(
      quality.issues.filter((i) =>
        ["coverage_too_narrow", "iex_labeled_as_sip", "license_surface_blocked"].includes(
          i.code,
        ),
      ),
    ).toEqual([]);
  });
});
