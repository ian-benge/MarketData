/**
 * DEMO news fixtures — clearly labeled, not live wires.
 */
import type { NormalizedNewsItem, ReportEdition } from "@/lib/providers/types";
import { canonicalizeUrl, hashContent } from "@/lib/domain/news-cluster";

export const DEMO_NEWS_NOTE =
  "DEMO news — synthetic headlines for local development and tests only.";

const RETRIEVED = "2026-08-10T14:30:00.000Z";

type DemoHeadline = {
  id: string;
  title: string;
  ticker: string;
  publisher: string;
  path: string;
  editions: ReportEdition[];
};

const HEADLINES: DemoHeadline[] = [
  {
    id: "demo-news-1",
    title: "DEMO: NVIDIA raises data-center outlook on AI demand",
    ticker: "NVDA",
    publisher: "Demo Wire",
    path: "/nvda-ai-outlook",
    editions: ["premarket", "midday", "close_postmarket"],
  },
  {
    id: "demo-news-2",
    title: "DEMO: Treasury yields edge higher ahead of inflation data",
    ticker: "TLT",
    publisher: "Demo Macro Desk",
    path: "/yields-inflation",
    editions: ["premarket", "midday", "close_postmarket"],
  },
  {
    id: "demo-news-3",
    title: "DEMO: Apple supplier update lifts mega-cap tech",
    ticker: "AAPL",
    publisher: "Demo Markets",
    path: "/aapl-supplier",
    editions: ["midday", "close_postmarket"],
  },
  {
    id: "demo-news-4",
    title: "DEMO: Crude oil climbs on inventory draw",
    ticker: "USO",
    publisher: "Demo Energy",
    path: "/crude-inventory",
    editions: ["midday", "close_postmarket"],
  },
  {
    id: "demo-news-5",
    title: "DEMO: Bitcoin holds near record as ETF flows persist",
    ticker: "BTC-USD",
    publisher: "Demo Crypto",
    path: "/btc-etf-flows",
    editions: ["premarket", "close_postmarket"],
  },
  {
    id: "demo-news-6",
    title: "DEMO: AMD unveils next-gen AI accelerator roadmap",
    ticker: "AMD",
    publisher: "Demo Wire",
    path: "/amd-accelerator",
    editions: ["midday", "close_postmarket"],
  },
  {
    id: "demo-news-7",
    title: "DEMO: Fed speakers signal patient approach to policy",
    ticker: "SPY",
    publisher: "Demo Policy",
    path: "/fed-speakers",
    editions: ["premarket", "midday", "close_postmarket"],
  },
  {
    id: "demo-news-8",
    title: "DEMO: After-hours NVDA print extends on follow-on AI commentary",
    ticker: "NVDA",
    publisher: "Demo Wire",
    path: "/nvda-after-hours",
    editions: ["close_postmarket"],
  },
  {
    id: "demo-news-9",
    title: "DEMO: Vertiv cites data-center cooling backlog",
    ticker: "VRT",
    publisher: "Demo Industrials",
    path: "/vrt-cooling",
    editions: ["premarket", "midday", "close_postmarket"],
  },
  {
    id: "demo-news-10",
    title: "DEMO: Semiconductor ETF bid tracks AI capex complex",
    ticker: "SMH",
    publisher: "Demo Wire",
    path: "/smh-ai-complex",
    editions: ["midday", "close_postmarket"],
  },
];

export function demoNewsItems(edition: ReportEdition): NormalizedNewsItem[] {
  return HEADLINES.filter((h) => h.editions.includes(edition)).map(
    (h, index) => {
      const url = `https://demo.news.local${h.path}`;
      const summary = `${h.title} — DEMO coverage for ${h.ticker}.`;
      return {
        id: h.id,
        title: h.title,
        summary,
        url,
        canonicalUrl: canonicalizeUrl(url),
        contentHash: hashContent(`${h.title}\n${summary}`),
        publisher: h.publisher,
        publishedAt: new Date(Date.now() - index * 3_600_000).toISOString(),
        retrievedAt: RETRIEVED,
        tickers: [h.ticker],
        sourceClass: "wire" as const,
        providerName: "demo-fixture",
        sourceQuality: "mock" as const,
        coverageNotes: DEMO_NEWS_NOTE,
        excerpt: summary,
      };
    },
  );
}

export const DEMO_NEWS_BY_EDITION: Record<ReportEdition, NormalizedNewsItem[]> =
  {
    premarket: demoNewsItems("premarket"),
    midday: demoNewsItems("midday"),
    close_postmarket: demoNewsItems("close_postmarket"),
  };
