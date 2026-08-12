import type { NewsProvider } from "@/lib/providers/interfaces";
import type {
  NewsSearchRequest,
  NormalizedNewsItem,
} from "@/lib/providers/types";
import { canonicalizeUrl, hashContent } from "@/lib/domain/news-cluster";
import {
  assertMockProvidersAllowed,
  MOCK_COVERAGE_NOTE,
  mockNowIso,
} from "./assert-mock";

const HEADLINES: Array<{
  title: string;
  ticker: string;
  publisher: string;
  path: string;
}> = [
  {
    title: "NVIDIA raises data-center outlook on AI demand",
    ticker: "NVDA",
    publisher: "Demo Wire",
    path: "/nvda-ai-outlook",
  },
  {
    title: "Treasury yields edge higher ahead of inflation data",
    ticker: "TLT",
    publisher: "Demo Macro Desk",
    path: "/yields-inflation",
  },
  {
    title: "Apple supplier update lifts mega-cap tech",
    ticker: "AAPL",
    publisher: "Demo Markets",
    path: "/aapl-supplier",
  },
  {
    title: "Crude oil climbs on inventory draw",
    ticker: "USO",
    publisher: "Demo Energy",
    path: "/crude-inventory",
  },
  {
    title: "Bitcoin holds near record as ETF flows persist",
    ticker: "BTC-USD",
    publisher: "Demo Crypto",
    path: "/btc-etf-flows",
  },
  {
    title: "AMD unveils next-gen AI accelerator roadmap",
    ticker: "AMD",
    publisher: "Demo Wire",
    path: "/amd-accelerator",
  },
  {
    title: "Dollar strengthens as rate-cut bets trim",
    ticker: "UUP",
    publisher: "Demo FX",
    path: "/dollar-strength",
  },
  {
    title: "Fed speakers signal patient approach to policy",
    ticker: "SPY",
    publisher: "Demo Policy",
    path: "/fed-speakers",
  },
];

export class MockNewsProvider implements NewsProvider {
  constructor() {
    assertMockProvidersAllowed("MockNewsProvider");
  }

  async search(request: NewsSearchRequest): Promise<NormalizedNewsItem[]> {
    const now = mockNowIso();
    const limit = request.limit ?? 50;
    const tickers = (request.tickers ?? []).map((t) => t.toUpperCase());
    const query = request.query?.toLowerCase();

    let items = HEADLINES.map((h, index) => {
      const url = `https://demo.news.local${h.path}?utm_source=mock`;
      const canonicalUrl = canonicalizeUrl(url);
      const summary = `${h.title} — DEMO coverage for ${h.ticker}.`;
      const contentHash = hashContent(`${h.title}\n${summary}`);
      const item: NormalizedNewsItem = {
        id: `mock-news-${index + 1}`,
        title: h.title,
        summary,
        url,
        canonicalUrl,
        contentHash,
        publisher: h.publisher,
        publishedAt: new Date(Date.now() - index * 3_600_000).toISOString(),
        retrievedAt: now,
        tickers: [h.ticker],
        sourceClass: "wire",
        providerName: "mock-news",
        sourceQuality: "mock",
        coverageNotes: MOCK_COVERAGE_NOTE,
        excerpt: summary,
      };
      return item;
    });

    if (tickers.length > 0) {
      items = items.filter((item) =>
        item.tickers.some((t) => tickers.includes(t.toUpperCase())),
      );
    }
    if (query) {
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          (item.summary?.toLowerCase().includes(query) ?? false),
      );
    }

    return items.slice(0, limit);
  }
}
