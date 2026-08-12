import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/lib/env";
import type {
  NormalizedCalendarEvent,
  NormalizedFiling,
  NormalizedNewsItem,
} from "@/lib/providers/types";

const ffEvents: NormalizedCalendarEvent[] = [];

const newsItems: NormalizedNewsItem[] = [];
const filings: NormalizedFiling[] = [];

vi.mock("@/lib/providers/rss/news", () => ({
  RssNewsProvider: class {
    async search() {
      return newsItems;
    }
  },
}));

vi.mock("@/lib/providers/rss/composite-news", () => ({
  CompositeNewsProvider: class {
    async search() {
      return newsItems;
    }
  },
}));

vi.mock("@/lib/providers/finnhub/news", () => ({
  FinnhubNewsProvider: class {
    async search() {
      return newsItems;
    }
  },
}));

vi.mock("@/lib/providers/forex-factory/calendar", () => ({
  getCatalystCalendar: async () => ({
    events: ffEvents,
    fetchedAt: "2026-08-11T11:00:00.000Z",
  }),
}));

vi.mock("@/lib/providers/edgar/corporate", () => ({
  createEdgarUserAgent: () => "test-agent",
  EdgarCorporateEventsProvider: class {
    async getFilings() {
      return filings;
    }
    async getEarnings() {
      return [];
    }
  },
}));

import {
  getDashboardResearch,
  resetDashboardResearchCache,
} from "@/lib/dashboard/research-context";

const env = {
  FINNHUB_API_KEY: undefined,
  FRED_API_KEY: undefined,
  NEWS_RSS_FEEDS: undefined,
  EDGAR_USER_AGENT: "test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
} as unknown as Env;

describe("getDashboardResearch", () => {
  beforeEach(() => {
    resetDashboardResearchCache();
    newsItems.length = 0;
    filings.length = 0;
    ffEvents.length = 0;
  });

  it("returns RSS headlines without mock copy or mixed calendars", async () => {
    newsItems.push({
      id: "rss-1",
      title: "BLS reports CPI",
      url: "https://www.bls.gov/news.release/cpi.htm",
      publishedAt: "2026-08-11T12:30:00.000Z",
      retrievedAt: "2026-08-11T12:31:00.000Z",
      tickers: [],
      sourceClass: "primary",
      providerName: "rss",
      sourceQuality: "secondary",
    });

    const bundle = await getDashboardResearch(env, { force: true });
    expect(bundle.headlines.map((item) => item.title)).toContain(
      "BLS reports CPI",
    );
    expect(bundle.headlines.every((item) => item.sourceQuality !== "mock")).toBe(
      true,
    );
    expect(
      bundle.calendar.every((event) => event.sourceQuality !== "mock"),
    ).toBe(true);
    expect(bundle.calendar).toEqual([]);
  });

  it("uses Forex Factory events for the catalyst calendar", async () => {
    ffEvents.push({
      id: "ff-USD-cpi",
      title: "Core CPI m/m",
      category: "economic",
      country: "USD",
      importance: "high",
      scheduledAt: "2026-08-12T12:30:00.000Z",
      timeZone: "America/Chicago",
      consensus: "0.2%",
      previous: "0.0%",
      providerName: "forex-factory",
      providerTimestamp: "2026-08-11T11:00:00.000Z",
      retrievalTimestamp: "2026-08-11T11:00:00.000Z",
      sourceQuality: "secondary",
    });

    const bundle = await getDashboardResearch(env, { force: true });
    expect(bundle.calendar).toHaveLength(1);
    expect(bundle.calendar[0]?.title).toBe("Core CPI m/m");
    expect(bundle.calendar[0]?.country).toBe("USD");
  });

  it("promotes material EDGAR filings when the wire is thin", async () => {
    filings.push({
      id: "edgar:8k",
      ticker: "NVDA",
      companyName: "NVIDIA Corp",
      formType: "8-K",
      filedAt: new Date().toISOString(),
      title: "NVIDIA Corp - 8-K",
      url: "https://www.sec.gov/Archives/edgar/data/1/8k.htm",
      providerName: "edgar",
      providerTimestamp: new Date().toISOString(),
      retrievalTimestamp: new Date().toISOString(),
      sourceQuality: "primary",
    });

    const bundle = await getDashboardResearch(env, { force: true });
    expect(bundle.headlines.some((item) => item.title.includes("8-K"))).toBe(
      true,
    );
    expect(bundle.calendar.some((event) => event.category === "corporate")).toBe(
      false,
    );
  });
});
