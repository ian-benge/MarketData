/**
 * Official / public market-relevant feeds used when NEWS_RSS_FEEDS is unset.
 * Still SSRF-checked before fetch. Override via NEWS_RSS_FEEDS to replace.
 */
export const DEFAULT_NEWS_RSS_FEEDS = [
  "https://www.federalreserve.gov/feeds/press_all.xml",
  "https://www.bls.gov/feed/bls_latest.rss",
  "https://www.sec.gov/news/pressreleases.rss",
  "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
] as const;

export function resolveNewsRssFeeds(csv: string | undefined): string[] {
  const configured = (csv ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length) return [...new Set(configured)];
  return [...DEFAULT_NEWS_RSS_FEEDS];
}
