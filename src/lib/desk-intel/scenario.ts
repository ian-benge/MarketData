import { buildEvidenceNumberTokens } from "@/lib/reports/quality-gate";
import { UNKNOWN_MOVE_COPY, type EvidencePack } from "./types";

/** Realistic desk pack used by tests and the eval script. */
export function sampleEvidencePack(): EvidencePack {
  const sources = [
    {
      id: "src-iren-8k",
      title: "IREN Limited files 8-K on additional AI power capacity",
      url: "https://demo.news.local/iren-8k",
      publisher: "Demo EDGAR",
      publishedAt: "2026-08-15T13:40:00.000Z",
      sourceClass: "primary",
      tickers: ["IREN"],
    },
    {
      id: "src-nvda-8k",
      title: "NVIDIA 8-K — data-center outlook commentary",
      url: "https://demo.news.local/nvda-8k",
      publisher: "Demo EDGAR",
      publishedAt: "2026-08-15T13:20:00.000Z",
      sourceClass: "primary",
      tickers: ["NVDA"],
    },
  ];
  const events = [
    {
      id: "evt-iren",
      title: "IREN Limited files 8-K on additional AI power capacity",
      summary: "Synthetic primary-style filing used only in demo mode.",
      eventType: "filing" as const,
      publishedAt: "2026-08-15T13:40:00.000Z",
      materialityScore: 82,
      novelty: "new" as const,
      tickers: ["IREN"],
      themes: ["semiconductors"],
      sourceIds: ["src-iren-8k"],
      coverageHit: true,
    },
    {
      id: "evt-nvda",
      title: "NVIDIA 8-K — data-center outlook commentary",
      eventType: "filing" as const,
      publishedAt: "2026-08-15T13:20:00.000Z",
      materialityScore: 76,
      novelty: "new" as const,
      tickers: ["NVDA"],
      themes: ["semiconductors"],
      sourceIds: ["src-nvda-8k"],
      coverageHit: true,
    },
  ];
  const moves = [
    {
      ticker: "IREN",
      significant: true,
      changePercent: -6.4,
      relativeVolume: 3,
      attribution: "confirmed_company" as const,
      confidence: "confirmed" as const,
      evidenceNature: "fact" as const,
      headline: "IREN files 8-K on AI power capacity",
      detail: "Primary filing matched to IREN in the session window.",
      sourceIds: ["src-iren-8k"],
      relatedTickers: ["NVDA"],
      inBook: true,
      onCoverage: true,
    },
    {
      ticker: "XYZ",
      significant: true,
      changePercent: 8.4,
      relativeVolume: 3.2,
      attribution: "unknown" as const,
      confidence: "unknown" as const,
      evidenceNature: "inference" as const,
      headline: "Unknown catalyst",
      detail: UNKNOWN_MOVE_COPY,
      sourceIds: [],
      relatedTickers: [],
      inBook: false,
      onCoverage: false,
    },
  ];
  const quotes = [
    { ticker: "IREN", name: "IREN Limited", changePercent: -6.4, relativeVolume: 3 },
    { ticker: "NVDA", name: "NVIDIA", changePercent: 1.94, relativeVolume: 1.1 },
    { ticker: "XYZ", name: "Unknown tape name", changePercent: 8.4, relativeVolume: 3.2 },
  ];
  const positions = [
    {
      ticker: "IREN",
      side: "long" as const,
      dayPnl: -1200,
      dayPercent: -6.4,
      weight: 28,
      unrealizedPnl: -800,
    },
  ];
  return {
    asOf: "2026-08-15T18:00:00.000Z",
    session: "regular",
    sources,
    allowedTickers: ["IREN", "NVDA", "XYZ"],
    inBookTickers: ["IREN"],
    coverageTickers: ["IREN", "NVDA"],
    events,
    moves,
    quotes,
    positions,
    calendar: [
      {
        id: "cal-cpi",
        title: "CPI (YoY)",
        scheduledAt: "2026-08-12T12:30:00.000Z",
        importance: "high",
      },
    ],
    gaps: [],
    numberTokens: buildEvidenceNumberTokens([
      -6.4, 8.4, 3, 3.2, 1.94, 82, 76, -1200, 28, -800,
    ]),
    ownerLocked: false,
    attributionByTicker: {
      IREN: "confirmed_company",
      XYZ: "unknown",
    },
    identity: {
      events: ["evt-iren", "evt-nvda"],
      moves: ["IREN", "XYZ"],
    },
  };
}
