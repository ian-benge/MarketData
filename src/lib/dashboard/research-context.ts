import type { Env } from "@/lib/env";
import { FinnhubNewsProvider } from "@/lib/providers/finnhub/news";
import {
  createEdgarUserAgent,
  EdgarCorporateEventsProvider,
} from "@/lib/providers/edgar/corporate";
import { getCatalystCalendar } from "@/lib/providers/forex-factory/calendar";
import { CompositeNewsProvider } from "@/lib/providers/rss/composite-news";
import {
  DEFAULT_NEWS_RSS_FEEDS,
  resolveNewsRssFeeds,
} from "@/lib/providers/rss/default-feeds";
import { RssNewsProvider } from "@/lib/providers/rss/news";
import type {
  DateRange,
  NormalizedFiling,
  NormalizedNewsItem,
} from "@/lib/providers/types";

const RESEARCH_TTL_MS = 5 * 60 * 1000;
const HEADLINE_LIMIT = 16;

export type DashboardResearch = {
  headlines: NormalizedNewsItem[];
  calendar: Awaited<ReturnType<typeof getCatalystCalendar>>["events"];
  fetchedAt: string;
};

let cached: DashboardResearch | null = null;
let inflight: Promise<DashboardResearch> | null = null;

export function resetDashboardResearchCache() {
  cached = null;
  inflight = null;
}

function emptyResearch(fetchedAt = new Date().toISOString()): DashboardResearch {
  return { headlines: [], calendar: [], fetchedAt };
}

function coverageWindow(now = new Date()): DateRange {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 45);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function buildNewsProvider(env: Env) {
  const providers = [];
  if (env.FINNHUB_API_KEY) {
    providers.push(new FinnhubNewsProvider({ apiKey: env.FINNHUB_API_KEY }));
  }
  try {
    providers.push(
      new RssNewsProvider({ feedUrls: resolveNewsRssFeeds(env.NEWS_RSS_FEEDS) }),
    );
  } catch {
    providers.push(
      new RssNewsProvider({ feedUrls: [...DEFAULT_NEWS_RSS_FEEDS] }),
    );
  }
  return providers.length === 1
    ? providers[0]!
    : new CompositeNewsProvider(providers);
}

function filingToNews(filing: NormalizedFiling): NormalizedNewsItem {
  return {
    id: `filing-news-${filing.id}`,
    title: filing.title ?? `${filing.formType} filing`,
    summary: `${filing.formType} filed${filing.companyName ? ` — ${filing.companyName}` : ""}`,
    url: filing.url,
    publishedAt: filing.filedAt,
    retrievedAt: filing.retrievalTimestamp,
    tickers: filing.ticker ? [filing.ticker] : [],
    sourceClass: "primary",
    providerName: filing.providerName,
    sourceQuality: filing.sourceQuality,
    coverageNotes: filing.coverageNotes,
  };
}

function materialForm(formType: string) {
  return /8-K|10-Q|10-K|6-K|S-1|SC 13/i.test(formType);
}

async function loadDashboardResearch(env: Env): Promise<DashboardResearch> {
  const now = new Date();
  const range = coverageWindow(now);

  const corporate = new EdgarCorporateEventsProvider({
    userAgent: createEdgarUserAgent(env),
    finnhubApiKey: env.FINNHUB_API_KEY,
  });

  const [newsResult, filingsResult, calendarResult] = await Promise.allSettled([
    buildNewsProvider(env).search({ limit: HEADLINE_LIMIT }),
    corporate.getFilings(range),
    getCatalystCalendar(),
  ]);

  const headlines: NormalizedNewsItem[] = [];
  if (newsResult.status === "fulfilled") headlines.push(...newsResult.value);

  const filings =
    filingsResult.status === "fulfilled" ? filingsResult.value : [];
  const materialFilings = filings.filter((filing) => materialForm(filing.formType));
  if (headlines.length < 6) {
    headlines.push(...materialFilings.slice(0, 8).map(filingToNews));
  }

  headlines.sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );

  const calendar =
    calendarResult.status === "fulfilled" ? calendarResult.value.events : [];

  return {
    headlines: headlines.slice(0, HEADLINE_LIMIT),
    calendar,
    fetchedAt: now.toISOString(),
  };
}

export async function getDashboardResearch(
  env: Env,
  options?: { force?: boolean },
): Promise<DashboardResearch> {
  if (
    !options?.force &&
    cached &&
    Date.now() - Date.parse(cached.fetchedAt) < RESEARCH_TTL_MS
  ) {
    return cached;
  }
  if (inflight) return inflight;

  inflight = loadDashboardResearch(env)
    .then((bundle) => {
      cached = bundle;
      return bundle;
    })
    .catch((error) => {
      if (cached) return cached;
      throw error;
    })
    .finally(() => {
      inflight = null;
    });

  try {
    return await inflight;
  } catch {
    return emptyResearch();
  }
}
