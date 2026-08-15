import { describe, expect, it } from "vitest";
import { attributeMove } from "./attribution";
import type { IntelligenceEvent } from "./types";

const NOW = new Date("2026-08-15T18:00:00.000Z");

function event(partial: Partial<IntelligenceEvent> & Pick<IntelligenceEvent, "id" | "title">): IntelligenceEvent {
  const publishedAt = partial.publishedAt ?? "2026-08-15T16:00:00.000Z";
  return {
    clusterId: partial.id,
    eventType: "filing",
    eventTypeLabel: "Filing",
    publishedAt,
    novelty: "new",
    materialityScore: 70,
    sentiment: "unscored",
    sentimentNote: null,
    confidence: "confirmed",
    tickers: [
      {
        ticker: "NVDA",
        name: "NVIDIA Corporation",
        role: "primary",
        confidence: "high",
        method: "provider",
      },
    ],
    themes: ["semiconductors"],
    sectors: [],
    secondOrder: [],
    sources: [
      {
        id: `${partial.id}-src`,
        title: partial.title,
        url: partial.representative?.url ?? "https://www.sec.gov/Archives/edgar/data/1/8k.htm",
        publishedAt,
        sourceClass: "primary",
        providerName: "edgar",
        sourceQuality: "primary",
      },
    ],
    representative: {
      id: `${partial.id}-src`,
      title: partial.title,
      url: "https://www.sec.gov/Archives/edgar/data/1/8k.htm",
      publishedAt,
      sourceClass: "primary",
      providerName: "edgar",
      sourceQuality: "primary",
    },
    memberCount: 1,
    coverageNotes: null,
    marketReaction: [],
    ...partial,
  };
}

const movingNvda = {
  ticker: "NVDA",
  changePercent: -4.2,
  relativeVolume: 2.1,
  flags: ["move", "rvol"],
  session: "regular",
};

describe("catalyst attribution", () => {
  it("confirms a primary-source company filing and never invents a cause", () => {
    const result = attributeMove({
      quote: movingNvda,
      events: [event({ id: "8k", title: "NVIDIA Corp - 8-K" })],
      session: "regular",
      now: NOW,
    });
    expect(result.attribution).toBe("confirmed_company");
    expect(result.confidence).toBe("confirmed");
    expect(result.evidenceNature).toBe("fact");
    expect(result.causalStatus).toBe("confirmed");
    expect(result.headline).toMatch(/Confirmed company catalyst/);
    expect(result.supportingEvents[0]?.url).toContain("sec.gov");
    expect(`${result.headline} ${result.detail}`).not.toMatch(/\bbecause\b/i);
  });

  it("does not narrate a causal because when the print is not unusual", () => {
    const result = attributeMove({
      quote: {
        ticker: "NVDA",
        changePercent: -0.4,
        relativeVolume: 0.9,
        flags: [],
        session: "regular",
      },
      events: [event({ id: "8k-quiet", title: "NVIDIA Corp - 8-K" })],
      session: "regular",
      now: NOW,
    });
    expect(result.attribution).toBe("confirmed_company");
    expect(result.significant).toBe(false);
    expect(result.detail).toMatch(/not a claim that the print is unusual/i);
    expect(result.detail).not.toMatch(/\bbecause\b/i);
  });

  it("labels ticker-matched wire copy as likely inference, not fact", () => {
    const result = attributeMove({
      quote: movingNvda,
      events: [
        event({
          id: "wire",
          title: "NVIDIA faces export-control headlines, shares slip",
          eventType: "export_control",
          eventTypeLabel: "Export control",
          sources: [
            {
              id: "wire-src",
              title: "NVIDIA faces export-control headlines, shares slip",
              url: "https://finnhub.example/n",
              publishedAt: "2026-08-15T16:00:00.000Z",
              sourceClass: "wire",
              providerName: "finnhub",
              sourceQuality: "secondary",
            },
          ],
          representative: {
            id: "wire-src",
            title: "NVIDIA faces export-control headlines, shares slip",
            url: "https://finnhub.example/n",
            publishedAt: "2026-08-15T16:00:00.000Z",
            sourceClass: "wire",
            providerName: "finnhub",
            sourceQuality: "secondary",
          },
        }),
      ],
      session: "regular",
      now: NOW,
    });
    expect(result.attribution).toBe("likely_catalyst");
    expect(result.evidenceNature).toBe("inference");
    expect(result.headline).not.toMatch(/because/i);
  });

  it("uses an explicit window so ticker-search headlines outside the session still attribute", () => {
    const result = attributeMove({
      quote: {
        ticker: "TSLA",
        changePercent: null,
        relativeVolume: null,
        flags: [],
        session: "closed",
      },
      events: [
        event({
          id: "older-wire",
          title: "Tesla unveils cheaper Model Y",
          eventType: "product",
          eventTypeLabel: "Product",
          publishedAt: "2026-08-10T14:00:00.000Z",
          tickers: [
            {
              ticker: "TSLA",
              name: "Tesla",
              role: "primary",
              confidence: "low",
              method: "alias",
            },
          ],
          sources: [
            {
              id: "older-wire-src",
              title: "Tesla unveils cheaper Model Y",
              url: "https://finnhub.example/tsla",
              publishedAt: "2026-08-10T14:00:00.000Z",
              sourceClass: "wire",
              providerName: "finnhub",
              sourceQuality: "secondary",
            },
          ],
          representative: {
            id: "older-wire-src",
            title: "Tesla unveils cheaper Model Y",
            url: "https://finnhub.example/tsla",
            publishedAt: "2026-08-10T14:00:00.000Z",
            sourceClass: "wire",
            providerName: "finnhub",
            sourceQuality: "secondary",
          },
        }),
      ],
      session: "closed",
      now: NOW,
      window: {
        start: "2026-08-10T14:00:00.000Z",
        end: NOW.toISOString(),
        label: "Matching headlines",
      },
      matchLowConfidence: true,
    });
    expect(result.attribution).toBe("likely_catalyst");
    expect(result.headline).toMatch(/Tesla unveils cheaper Model Y/);
  });

  it("says unknown when no ticker-matched or related headline exists", () => {
    const result = attributeMove({
      quote: {
        ticker: "IREN",
        changePercent: -6.4,
        relativeVolume: 3.2,
        flags: ["move", "rvol"],
        session: "regular",
      },
      events: [
        event({
          id: "unrelated",
          title: "Treasury yields ease ahead of inflation print",
          eventType: "rates",
          eventTypeLabel: "Rates",
          tickers: [
            {
              ticker: "TLT",
              name: "iShares 20+ Year Treasury Bond ETF",
              role: "related",
              confidence: "high",
              method: "provider",
            },
          ],
        }),
      ],
      session: "regular",
      now: NOW,
    });
    expect(result.attribution).toBe("unknown");
    expect(result.confidence).toBe("unknown");
    expect(result.headline).toBe("No verified catalyst found");
    expect(result.detail).toMatch(/not a claim that no catalyst exists/i);
  });

  it("labels theme/peer overlap as sympathy inference, not a confirmed cause", () => {
    const result = attributeMove({
      quote: {
        ticker: "AVGO",
        changePercent: -3.6,
        relativeVolume: 1.9,
        flags: ["move"],
        session: "regular",
      },
      events: [
        event({
          id: "peer",
          title: "NVIDIA 8-K on export-control compliance",
          eventType: "export_control",
          eventTypeLabel: "Export control",
          tickers: [
            {
              ticker: "NVDA",
              name: "NVIDIA Corporation",
              role: "primary",
              confidence: "high",
              method: "provider",
            },
          ],
          themes: ["semiconductors"],
          secondOrder: [
            {
              ticker: "AVGO",
              name: "Broadcom",
              role: "second_order",
              confidence: "low",
              method: "theme_peer",
            },
          ],
        }),
      ],
      session: "regular",
      now: NOW,
      peerTickers: ["NVDA"],
      tickerThemes: ["semiconductors"],
    });
    expect(result.attribution).toBe("sympathy");
    expect(result.evidenceNature).toBe("inference");
    expect(result.headline).not.toMatch(/because/i);
  });
});
