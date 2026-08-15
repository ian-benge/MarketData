import { describe, expect, it } from "vitest";
import { parseNewsQuery } from "./search-parse";
import { searchEvents } from "./search";
import type { IntelligenceEvent } from "./types";

function event(partial: Partial<IntelligenceEvent> & Pick<IntelligenceEvent, "id" | "title">): IntelligenceEvent {
  const publishedAt = partial.publishedAt ?? "2026-08-15T14:00:00.000Z";
  return {
    clusterId: partial.id,
    summary: undefined,
    eventType: "sector",
    eventTypeLabel: "Sector",
    publishedAt,
    novelty: "new",
    materialityScore: 60,
    sentiment: "unscored",
    sentimentNote: null,
    confidence: "probable",
    tickers: [],
    themes: [],
    sectors: [],
    secondOrder: [],
    sources: [
      {
        id: partial.id,
        title: partial.title,
        url: "https://example.com/a",
        publishedAt,
        sourceClass: "wire",
        providerName: "test",
        sourceQuality: "secondary",
      },
    ],
    representative: {
      id: partial.id,
      title: partial.title,
      url: "https://example.com/a",
      publishedAt,
      sourceClass: "wire",
      providerName: "test",
      sourceQuality: "secondary",
    },
    memberCount: 1,
    coverageNotes: null,
    marketReaction: [],
    ...partial,
  };
}

describe("headline search parsing", () => {
  it("parses why-moving, ticker, theme, event type, and time window", () => {
    const parsed = parseNewsQuery("why is IREN down today", new Date("2026-08-15T18:00:00.000Z"));
    expect(parsed.intent).toBe("why_moving");
    expect(parsed.whyTicker).toBe("IREN");
    expect(parsed.tickers).toContain("IREN");
    expect(parsed.timeRange?.label).toBe("Today (America/Chicago)");

    const iris = parseNewsQuery("why is Iris Energy down today");
    expect(iris.intent).toBe("why_moving");
    expect(iris.whyTicker).toBe("IREN");
    expect(iris.textTerms).not.toContain("iris");
    expect(iris.textTerms).not.toContain("energy");

    const energy = parseNewsQuery("energy");
    expect(energy.intent).toBe("search");
    expect(energy.textTerms).toContain("energy");

    const contracts = parseNewsQuery("AI power contracts this week");
    expect(contracts.eventTypes).toContain("contract");
    expect(contracts.themes).toEqual(expect.arrayContaining(["power", "ai_infrastructure"]));
    expect(contracts.timeRange?.label).toBe("This week");

    const exportNews = parseNewsQuery("export-control news affecting semiconductors");
    expect(exportNews.eventTypes).toContain("export_control");
    expect(exportNews.themes).toContain("semiconductors");
  });

  it("filters events by ticker, theme, and terms", () => {
    const events = [
      event({
        id: "1",
        title: "IREN signs AI power purchase agreement",
        eventType: "contract",
        eventTypeLabel: "Contract",
        tickers: [
          {
            ticker: "IREN",
            name: "IREN Limited",
            role: "primary",
            confidence: "high",
            method: "provider",
          },
        ],
        themes: ["power", "ai_infrastructure"],
      }),
      event({
        id: "2",
        title: "Treasury yields ease ahead of CPI",
        eventType: "rates",
        eventTypeLabel: "Rates",
        tickers: [
          {
            ticker: "TLT",
            name: "iShares 20+ Year Treasury Bond ETF",
            role: "related",
            confidence: "medium",
            method: "provider",
          },
        ],
        themes: [],
      }),
    ];
    const { results } = searchEvents(events, "IREN power contracts");
    expect(results.map((row) => row.id)).toEqual(["1"]);
  });

  it("excludes events outside the requested time window", () => {
    const events = [
      event({
        id: "old",
        title: "IREN signs AI power purchase agreement",
        publishedAt: "2026-08-01T14:00:00.000Z",
        eventType: "contract",
        eventTypeLabel: "Contract",
        tickers: [
          {
            ticker: "IREN",
            name: "IREN Limited",
            role: "primary",
            confidence: "high",
            method: "provider",
          },
        ],
      }),
    ];
    const { results } = searchEvents(events, "IREN this week", {}, new Date("2026-08-15T18:00:00.000Z"));
    expect(results).toEqual([]);
  });

  it("does not treat theme-peer second-order names as a hard ticker match", () => {
    const events = [
      event({
        id: "peer",
        title: "Utility awards 200 MW power purchase agreement",
        eventType: "contract",
        eventTypeLabel: "Contract",
        tickers: [
          {
            ticker: "CEG",
            name: "Constellation Energy",
            role: "primary",
            confidence: "high",
            method: "provider",
          },
        ],
        secondOrder: [
          {
            ticker: "NVDA",
            name: "NVIDIA",
            role: "second_order",
            confidence: "low",
            method: "theme_peer",
          },
        ],
        themes: ["power"],
      }),
    ];
    const { results } = searchEvents(events, "NVDA");
    expect(results).toEqual([]);
  });
});

describe("demo Why-moving on a weekend", () => {
  it("keeps the stamped IREN 8-K inside Saturday after-hours closed window", async () => {
    const { stampFixtureHeadlines, fixtureDashboard } = await import("@/lib/fixtures/dashboard");
    const { assembleEvents } = await import("./assemble");
    const { attributeMove } = await import("./attribution");
    const { fixtureIntelligenceQuotes } = await import("@/lib/market-data/watchlist-service");
    const now = new Date("2026-08-15T20:45:00.000Z");
    const events = assembleEvents({
      items: stampFixtureHeadlines(fixtureDashboard.headlines, now),
      quotes: fixtureIntelligenceQuotes("closed"),
      now,
    });
    const { results } = searchEvents(events, "why is IREN down today", {}, now, "closed");
    expect(results.some((row) => row.title.includes("IREN Limited files 8-K"))).toBe(true);
    const quote = fixtureIntelligenceQuotes("closed").find((row) => row.ticker === "IREN");
    expect(quote?.changePercent).toBe(-6.4);
    const why = attributeMove({
      quote: quote!,
      events,
      session: "closed",
      now,
    });
    expect(why.attribution).toBe("confirmed_company");
    expect(why.detail).not.toMatch(/\bbecause\b/i);
  });
});