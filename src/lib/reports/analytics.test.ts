import { describe, expect, it } from "vitest";
import { buildReportAnalytics } from "@/lib/reports/analytics";
import {
  buildReportDocument,
  evidenceBundleFromMarket,
  extraNumbersFromDocument,
} from "@/lib/reports/content-builder";
import { demoMarketSnapshot } from "@/lib/fixtures/demo-market";
import { demoNewsItems } from "@/lib/fixtures/demo-news";
import { runQualityGate } from "@/lib/reports/quality-gate";
import { tickerMeta } from "@/lib/reports/universe";
import { formatLevelRange } from "@/lib/reports/trade-ideas";
import type { ReportEdition } from "@/lib/providers/types";

describe("institutional analytics", () => {
  it("builds heatmap and relative vs SPY only from snapshot prints", () => {
    const market = demoMarketSnapshot("midday");
    const analytics = buildReportAnalytics({
      quotes: market.quotes.map((q) => ({
        ticker: q.ticker,
        last: q.last,
        changePercent: q.changePercent ?? null,
      })),
      movers: market.movers.map((m) => ({
        ticker: m.ticker,
        price: m.last,
        changePercent: m.changePercent,
        catalystSummary: "x",
        sourceIds: [],
      })),
      news: demoNewsItems("midday"),
      breadth: market.breadth,
    });
    expect(analytics.heatmap.length).toBeGreaterThan(4);
    expect(analytics.heatmap.every((c) => c.available)).toBe(true);
    const spy = analytics.tape.find((r) => r.ticker === "SPY");
    expect(spy?.vsSpyPct).toBeNull();
    const qqq = analytics.tape.find((r) => r.ticker === "QQQ");
    expect(qqq?.vsSpyPct).not.toBeNull();
    expect(analytics.optionsDesk.available).toBe(false);
    expect(analytics.optionsDesk.reason).toMatch(/not in this evidence bundle/i);
  });

  it("builds event-to-trade chains without duplicating the same news id as the only event", () => {
    const document = buildReportDocument({
      edition: "close_postmarket",
      tradingDate: "2026-08-10",
      market: demoMarketSnapshot("close_postmarket"),
      news: demoNewsItems("close_postmarket"),
      isDemo: true,
    });
    expect(document.analytics.causality.length).toBeGreaterThan(2);
    expect(
      document.analytics.causality.some((c) =>
        /Event → why it matters/i.test(c.whyItMatters + c.event) ? false : true,
      ),
    ).toBe(true);
    expect(document.sections.some((s) => s.sectionKey === "pm_playbook")).toBe(
      true,
    );
    expect(document.sections.some((s) => s.sectionKey === "ai_infrastructure")).toBe(
      true,
    );
    expect(document.sections.some((s) => s.sectionKey === "earnings_calendar")).toBe(
      true,
    );
    expect(document.tradeIdeas.some((i) => i.strategyType === "pair_long_short")).toBe(
      true,
    );
    expect(document.tradeIdeas.every((i) => i.optionsStructure == null)).toBe(
      true,
    );
    expect(
      document.tradeIdeas.every(
        (i) => i.ticker !== "BTC-USD" && i.ticker !== "VIXY",
      ),
    ).toBe(true);
    const pair = document.tradeIdeas.find((i) => i.strategyType === "pair_long_short");
    if (pair?.pairLeg) {
      expect(["ai_infra", "sector"]).toContain(tickerMeta(pair.ticker)?.group);
      expect(["ai_infra", "sector"]).toContain(tickerMeta(pair.pairLeg)?.group);
    }
    expect(document.analytics.causality[0]?.causalStatus).toBe("reported");
    const playbook =
      document.sections.find((s) => s.sectionKey === "pm_playbook")?.body ?? "";
    const idea = document.tradeIdeas[0];
    if (idea) {
      expect(playbook).toContain(
        formatLevelRange(idea.entryLow, idea.entryHigh),
      );
    }
    const moverIds = document.movers.map((m) => m.ticker);
    expect(new Set(moverIds).size).toBe(moverIds.length);
  });

  it("passes the quality gate for every edition", () => {
    const editions: ReportEdition[] = [
      "premarket",
      "midday",
      "close_postmarket",
    ];
    for (const edition of editions) {
      const market = demoMarketSnapshot(edition);
      const news = demoNewsItems(edition);
      const document = buildReportDocument({
        edition,
        tradingDate: "2026-08-10",
        market,
        news,
        isDemo: true,
      });
      const evidence = evidenceBundleFromMarket(market, news, {
        extraNumbers: extraNumbersFromDocument(document),
      });
      const quality = runQualityGate(document, evidence);
      expect(
        quality.issues.filter((i) => i.severity === "blocking"),
        edition,
      ).toEqual([]);
    }
  });
});
