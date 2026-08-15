import type { Env } from "@/lib/env";
import {
  createEdgarUserAgent,
  EdgarCorporateEventsProvider,
} from "@/lib/providers/edgar/corporate";
import { FinnhubNewsProvider } from "@/lib/providers/finnhub/news";
import { MassiveNewsProvider, isNewsEntitlementError } from "@/lib/providers/massive/news";
import { createNewsProvider } from "@/lib/providers/registry";
import type { DateRange, NormalizedFiling, NormalizedNewsItem } from "@/lib/providers/types";
import type { CoverageGap, SourceStatus } from "./types";

const GENERAL_LIMIT = 80;
const COMPANY_TICKER_CAP = 12;

function coverageWindow(now = new Date()): DateRange {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 2);
  return { start: start.toISOString(), end: now.toISOString() };
}

function mergeItems(groups: NormalizedNewsItem[][]): NormalizedNewsItem[] {
  const seen = new Set<string>();
  const out: NormalizedNewsItem[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = (item.canonicalUrl ?? item.url).toLowerCase();
      if (seen.has(key) || seen.has(item.id)) continue;
      seen.add(key);
      seen.add(item.id);
      out.push(item);
    }
  }
  out.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return out;
}

export function filingToNews(filing: NormalizedFiling): NormalizedNewsItem {
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

export function materialForm(formType: string) {
  return /8-K|10-Q|10-K|6-K|S-1|SC 13/i.test(formType);
}

function status(
  id: string,
  label: string,
  result: PromiseSettledResult<NormalizedNewsItem[]>,
  unavailableNote?: string,
): SourceStatus {
  if (unavailableNote) {
    return { id, label, status: "unavailable", note: unavailableNote, itemCount: 0 };
  }
  if (result.status === "rejected") {
    return {
      id,
      label,
      status: "error",
      note: result.reason instanceof Error ? result.reason.message : String(result.reason),
      itemCount: 0,
    };
  }
  if (!result.value.length) {
    return { id, label, status: "empty", note: "Provider returned no items in this window.", itemCount: 0 };
  }
  return { id, label, status: "ok", note: `${result.value.length} items`, itemCount: result.value.length };
}

export type IngestResult = {
  items: NormalizedNewsItem[];
  sources: SourceStatus[];
  gaps: CoverageGap[];
};

const COMPANY_NEWS_TTL_MS = 2 * 60 * 1000;
const companyNewsCache = new Map<string, { expiresAt: number; result: IngestResult }>();

export function resetCompanyNewsCache() {
  companyNewsCache.clear();
}

/** Issuer-tagged Finnhub company news for explicit ticker search / why-moving. */
export async function ingestCompanyNews(
  env: Env,
  tickers: string[],
): Promise<IngestResult> {
  const sources: SourceStatus[] = [];
  const gaps: CoverageGap[] = [];
  const priority = [...new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean))].slice(
    0,
    COMPANY_TICKER_CAP,
  );
  if (!priority.length) return { items: [], sources, gaps };

  const cacheKey = priority.slice().sort().join(",");
  const hit = companyNewsCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.result;

  if (!env.FINNHUB_API_KEY) {
    return {
      items: [],
      sources: [
        {
          id: "finnhub-company",
          label: "Finnhub company news",
          status: "unavailable",
          note: "FINNHUB_API_KEY is not set. Issuer-tagged company news is unavailable.",
          itemCount: 0,
        },
      ],
      gaps: [
        {
          code: "finnhub_unkeyed",
          message:
            "Finnhub is not keyed. Company-tagged headlines are limited to RSS entity resolution and EDGAR.",
        },
      ],
    };
  }

  const finnhub = new FinnhubNewsProvider({ apiKey: env.FINNHUB_API_KEY });
  const company = await Promise.allSettled([
    finnhub.search({ tickers: priority, limit: 40 }),
  ]).then((rows) => rows[0]!);
  sources.push(status("finnhub-company", "Finnhub company news", company));
  if (company.status === "rejected") {
    gaps.push({
      code: "company_news_error",
      message: `Company news for ${priority.join(", ")} failed. Watchlist attribution may miss issuer-specific copy.`,
    });
  }
  const result: IngestResult = {
    items: company.status === "fulfilled" ? mergeItems([company.value]) : [],
    sources,
    gaps,
  };
  companyNewsCache.set(cacheKey, {
    expiresAt: Date.now() + COMPANY_NEWS_TTL_MS,
    result,
  });
  return result;
}

export async function ingestMarketNews(
  env: Env,
  options?: { priorityTickers?: string[] },
): Promise<IngestResult> {
  const sources: SourceStatus[] = [];
  const gaps: CoverageGap[] = [];
  const groups: NormalizedNewsItem[][] = [];

  let generalProvider;
  try {
    generalProvider = createNewsProvider(env);
  } catch (error) {
    sources.push({
      id: "wire",
      label: "Wire / RSS",
      status: "error",
      note: error instanceof Error ? error.message : String(error),
      itemCount: 0,
    });
  }

  if (generalProvider) {
    const general = await Promise.allSettled([
      generalProvider.search({ limit: GENERAL_LIMIT }),
    ]).then((rows) => rows[0]!);
    sources.push(status("wire", "Finnhub general + RSS", general));
    if (general.status === "fulfilled") groups.push(general.value);
  }

  const company = await ingestCompanyNews(env, options?.priorityTickers ?? []);
  sources.push(...company.sources);
  gaps.push(...company.gaps);
  if (company.items.length) groups.push(company.items);

  if (env.MASSIVE_API_KEY) {
    try {
      const massive = new MassiveNewsProvider({
        apiKey: env.MASSIVE_API_KEY,
        baseUrl: env.MASSIVE_API_BASE_URL,
      });
      const massiveItems = await massive.search({ limit: 40 });
      groups.push(massiveItems);
      sources.push({
        id: "massive-news",
        label: "Massive reference news",
        status: massiveItems.length ? "ok" : "empty",
        note: massiveItems.length
          ? `${massiveItems.length} items`
          : "Massive news returned no rows on this plan/window.",
        itemCount: massiveItems.length,
      });
    } catch (error) {
      const entitled = isNewsEntitlementError(error);
      sources.push({
        id: "massive-news",
        label: "Massive reference news",
        status: entitled ? "unavailable" : "error",
        note: error instanceof Error ? error.message : String(error),
        itemCount: 0,
      });
      gaps.push({
        code: entitled ? "massive_news_unentitled" : "massive_news_error",
        message: entitled
          ? "Massive/Polygon news is not entitled on the current plan. Other sources still run."
          : "Massive news failed. Other sources still run.",
      });
    }
  } else {
    sources.push({
      id: "massive-news",
      label: "Massive reference news",
      status: "unavailable",
      note: "MASSIVE_API_KEY is not set.",
      itemCount: 0,
    });
  }

  const corporate = new EdgarCorporateEventsProvider({
    userAgent: createEdgarUserAgent(env),
    finnhubApiKey: env.FINNHUB_API_KEY,
  });
  const filingsResult = await Promise.allSettled([
    corporate.getFilings(coverageWindow()),
  ]).then((rows) => rows[0]!);
  if (filingsResult.status === "fulfilled") {
    const filings = filingsResult.value.filter((filing) => materialForm(filing.formType));
    groups.push(filings.slice(0, 20).map(filingToNews));
    sources.push({
      id: "edgar",
      label: "SEC EDGAR filings",
      status: filings.length ? "ok" : "empty",
      note: filings.length ? `${filings.length} material forms` : "No 8-K/10-Q/10-K in the window.",
      itemCount: filings.length,
    });
  } else {
    sources.push({
      id: "edgar",
      label: "SEC EDGAR filings",
      status: "error",
      note:
        filingsResult.reason instanceof Error
          ? filingsResult.reason.message
          : String(filingsResult.reason),
      itemCount: 0,
    });
    gaps.push({
      code: "edgar_error",
      message: "EDGAR filings could not be loaded. Confirmed company catalysts may be missing.",
    });
  }

  const items = mergeItems(groups);
  if (!items.length) {
    gaps.push({
      code: "no_headlines",
      message: "No headlines were retrieved from configured sources in this window.",
    });
  } else {
    const tagged = items.filter((item) => (item.tickers ?? []).length > 0).length;
    if (tagged / items.length < 0.25) {
      gaps.push({
        code: "weak_entity_tags",
        message:
          "Most headlines arrived without provider ticker tags. Entity resolution is best-effort from company names and may miss names.",
      });
    }
  }

  return { items, sources, gaps };
}
