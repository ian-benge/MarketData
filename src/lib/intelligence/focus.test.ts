import { describe, expect, it } from "vitest";
import {
  coverageRowToQuoteContext,
  focusAttributionWindow,
  focusTickersFrom,
  hydrateFocusEvidence,
  mergeEvents,
  mergeQuotes,
} from "./focus";
import type { IntelligenceEvent } from "./types";
import type { Env } from "@/lib/env";

function event(
  partial: Partial<IntelligenceEvent> & Pick<IntelligenceEvent, "id" | "title">,
): IntelligenceEvent {
  const publishedAt = partial.publishedAt ?? "2026-08-15T14:00:00.000Z";
  return {
    clusterId: partial.id,
    summary: undefined,
    eventType: "product",
    eventTypeLabel: "Product",
    publishedAt,
    novelty: "new",
    materialityScore: 60,
    sentiment: "unscored",
    sentimentNote: null,
    confidence: "probable",
    tickers: [
      {
        ticker: "TSLA",
        name: "Tesla",
        role: "primary",
        confidence: "high",
        method: "provider",
      },
    ],
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

describe("ticker focus helpers", () => {
  it("collects filter chips and why-ticker, not just parsed query tokens", () => {
    expect(
      focusTickersFrom(
        { tickers: [], whyTicker: null },
        { tickers: ["tsla", "TSLA"] },
      ),
    ).toEqual(["TSLA"]);
    expect(
      focusTickersFrom({ tickers: ["NVDA"], whyTicker: "IREN" }, { tickers: ["META"] }),
    ).toEqual(["NVDA", "META", "IREN"]);
  });

  it("widens the why window to matching headlines when none sit in the session", () => {
    const window = focusAttributionWindow({
      events: [
        event({
          id: "old",
          title: "Tesla robotaxi update",
          publishedAt: "2026-08-10T14:00:00.000Z",
        }),
      ],
      session: "closed",
      now: new Date("2026-08-15T20:00:00.000Z"),
    });
    expect(window.label).toBe("Matching headlines");
    expect(window.start).toBe("2026-08-10T14:00:00.000Z");
  });

  it("keeps the session window when a headline is already in it", () => {
    const window = focusAttributionWindow({
      events: [
        event({
          id: "today",
          title: "Tesla robotaxi update",
          publishedAt: "2026-08-15T18:00:00.000Z",
        }),
      ],
      session: "closed",
      now: new Date("2026-08-15T20:00:00.000Z"),
    });
    expect(window.label).toBe("Since last regular session");
  });

  it("merges quotes so a live print replaces a null cache stub", () => {
    const merged = mergeQuotes(
      [{ ticker: "TSLA", changePercent: null, relativeVolume: null, flags: [] }],
      [{ ticker: "TSLA", changePercent: 2.4, relativeVolume: 1.2, flags: ["move"] }],
    );
    expect(merged[0]?.changePercent).toBe(2.4);
  });

  it("hydrates company news and a live quote for a typed ticker", async () => {
    const extra = event({ id: "tsla-wire", title: "Tesla unveils cheaper Model Y" });
    const result = await hydrateFocusEvidence(
      { FINNHUB_API_KEY: "test" } as Env,
      ["TSLA"],
      {
        events: [],
        quotes: [{ ticker: "TSLA", changePercent: null, relativeVolume: null, flags: [] }],
        ingest: true,
      },
      {
        ingestCompanyNews: async () => ({
          items: [
            {
              id: "tsla-wire",
              title: extra.title,
              url: "https://example.com/a",
              publishedAt: extra.publishedAt,
              retrievedAt: extra.publishedAt,
              tickers: ["TSLA"],
              sourceClass: "wire",
              providerName: "finnhub",
              sourceQuality: "secondary",
            },
          ],
          sources: [],
          gaps: [],
        }),
        searchStoredNews: async () => [],
        loadQuotes: async () => [
          { ticker: "TSLA", changePercent: 1.8, relativeVolume: 1.1, flags: [] },
        ],
      },
    );
    expect(result.events.some((row) => /Tesla/i.test(row.title))).toBe(true);
    expect(result.quotes.find((row) => row.ticker === "TSLA")?.changePercent).toBe(1.8);
    expect(mergeEvents([], result.events).length).toBeGreaterThan(0);
  });
});

describe("coverage quote mapping", () => {
  it("maps 1d change onto the intelligence quote context", () => {
    const quote = coverageRowToQuoteContext(
      {
        ticker: "TSLA",
        name: "Tesla",
        last: 240,
        change1dPercent: -1.2,
        changeFromOpenPercent: null,
        change1wPercent: null,
        change1mPercent: null,
        changeYtdPercent: null,
        preMarketChangePercent: 0.4,
        afterHoursChangePercent: null,
        vsSpy1dPercent: null,
        vsBenchmark1dPercent: null,
        vsGroup1dPercent: -0.3,
        relativeVolume: 1.4,
        marketCap: null,
        volume: null,
        avgVolume: null,
        dayHigh: null,
        dayLow: null,
        priorClose: null,
        volatility: null,
        sectorId: null,
        sectorName: null,
        notes: null,
        tags: [],
        role: null,
        tier: null,
        rationale: null,
        securityType: "common_stock",
        leverageMultiple: null,
        isInverse: false,
        isOtc: false,
        resolutionStatus: "resolved",
        underlyingSymbol: null,
        exchange: null,
        themeCount: 0,
        flags: ["move"],
        missing: [],
      },
      "regular",
    );
    expect(quote.changePercent).toBe(-1.2);
    expect(quote.session).toBe("regular");
  });
});
