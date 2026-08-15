import type { NormalizedNewsItem } from "@/lib/providers/types";
import {
  canCreateAdminClient,
  createAdminClient,
} from "@/lib/supabase/admin";
import type { PriorHeadline } from "./types";

const SOURCE_QUALITY = new Set(["primary", "secondary", "estimated", "mock"]);
const UPSERT_CHUNK = 80;

type NewsRow = {
  provider_name: string;
  external_id: string | null;
  title: string;
  summary: string | null;
  url: string;
  canonical_url: string | null;
  content_hash: string | null;
  published_at: string;
  retrieved_at: string;
  publisher: string | null;
  source_class: string;
  source_quality: string;
  tickers: string[];
  resolved_tickers: string[];
  event_type: string;
  themes: string[];
  novelty: string;
  materiality_score: number;
  raw: NormalizedNewsItem;
};

export type PersistNewsResult = {
  attempted: number;
  written: number;
  error: string | null;
  skipped: "no_admin_client" | "empty" | null;
};

function toItem(raw: unknown): NormalizedNewsItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as NormalizedNewsItem;
  if (!row.id || !row.title || !row.url || !row.publishedAt) return null;
  return row;
}

function logStoreError(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[news] ${scope}`, message);
}

export async function loadRecentNewsItems(options?: {
  hours?: number;
  limit?: number;
}): Promise<NormalizedNewsItem[]> {
  if (!canCreateAdminClient()) return [];
  const hours = options?.hours ?? 48;
  const limit = options?.limit ?? 400;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("market_news_items")
      .select("raw")
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) {
      logStoreError("loadRecentNewsItems", error.message);
      return [];
    }
    return (data ?? [])
      .map((row) => toItem((row as { raw: unknown }).raw))
      .filter((row): row is NormalizedNewsItem => row != null);
  } catch (error) {
    logStoreError("loadRecentNewsItems", error);
    return [];
  }
}

export async function loadPriorHeadlines(hours = 7 * 24): Promise<PriorHeadline[]> {
  const items = await loadRecentNewsItems({ hours, limit: 800 });
  return items.map((item) => ({
    title: item.title,
    publishedAt: item.publishedAt,
    contentHash: item.contentHash,
    tickers: item.tickers ?? [],
  }));
}

export async function searchStoredNews(
  query: string,
  limit = 80,
): Promise<NormalizedNewsItem[]> {
  if (!canCreateAdminClient() || !query.trim()) return [];
  try {
    const supabase = createAdminClient();
    const fts = query
      .trim()
      .replace(/[':\\()|&!<>]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!fts) return [];
    const { data, error } = await supabase
      .from("market_news_items")
      .select("raw")
      .textSearch("search_vector", fts, { type: "websearch", config: "english" })
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) {
      logStoreError("searchStoredNews", error.message);
      return [];
    }
    return (data ?? [])
      .map((row) => toItem((row as { raw: unknown }).raw))
      .filter((row): row is NormalizedNewsItem => row != null);
  } catch (error) {
    logStoreError("searchStoredNews", error);
    return [];
  }
}

function toRow(
  item: NormalizedNewsItem,
  extras?: Map<
    string,
    { eventType?: string; themes?: string[]; novelty?: string; materiality?: number; resolved?: string[] }
  >,
): NewsRow | null {
  if (!item.id || !item.providerName || !item.title || !item.url || !item.publishedAt) {
    return null;
  }
  const extra = extras?.get(item.id);
  const quality = SOURCE_QUALITY.has(item.sourceQuality)
    ? item.sourceQuality
    : "secondary";
  return {
    provider_name: item.providerName,
    external_id: item.id,
    title: item.title,
    summary: item.summary ?? null,
    url: item.url,
    canonical_url: item.canonicalUrl ?? null,
    content_hash: item.contentHash ?? null,
    published_at: item.publishedAt,
    retrieved_at: item.retrievedAt,
    publisher: item.publisher ?? null,
    source_class: item.sourceClass,
    source_quality: quality,
    tickers: item.tickers ?? [],
    resolved_tickers: extra?.resolved ?? item.tickers ?? [],
    event_type: extra?.eventType ?? "other",
    themes: extra?.themes ?? [],
    novelty: extra?.novelty ?? "new",
    materiality_score: extra?.materiality ?? 0,
    raw: item,
  };
}

export async function persistNewsItems(
  items: NormalizedNewsItem[],
  extras?: Map<
    string,
    { eventType?: string; themes?: string[]; novelty?: string; materiality?: number; resolved?: string[] }
  >,
): Promise<PersistNewsResult> {
  if (items.length === 0) {
    return { attempted: 0, written: 0, error: null, skipped: "empty" };
  }
  if (!canCreateAdminClient()) {
    return { attempted: items.length, written: 0, error: null, skipped: "no_admin_client" };
  }
  const rows = items
    .map((item) => toRow(item, extras))
    .filter((row): row is NewsRow => row != null);
  if (!rows.length) {
    return { attempted: items.length, written: 0, error: "no valid rows", skipped: null };
  }
  try {
    const supabase = createAdminClient();
    let written = 0;
    for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
      const chunk = rows.slice(index, index + UPSERT_CHUNK);
      const { error, data } = await supabase
        .from("market_news_items")
        .upsert(chunk, {
          onConflict: "provider_name,external_id",
          ignoreDuplicates: false,
        })
        .select("external_id");
      if (error) {
        logStoreError("persistNewsItems", error.message);
        return {
          attempted: rows.length,
          written,
          error: error.message,
          skipped: null,
        };
      }
      written += data?.length ?? chunk.length;
    }
    return { attempted: rows.length, written, error: null, skipped: null };
  } catch (error) {
    logStoreError("persistNewsItems", error);
    return {
      attempted: rows.length,
      written: 0,
      error: error instanceof Error ? error.message : String(error),
      skipped: null,
    };
  }
}
