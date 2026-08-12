import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEWS_RSS_FEEDS,
  resolveNewsRssFeeds,
} from "@/lib/providers/rss/default-feeds";

describe("resolveNewsRssFeeds", () => {
  it("uses official defaults when env is blank", () => {
    expect(resolveNewsRssFeeds(undefined)).toEqual([...DEFAULT_NEWS_RSS_FEEDS]);
    expect(resolveNewsRssFeeds("")).toEqual([...DEFAULT_NEWS_RSS_FEEDS]);
  });

  it("prefers an explicit allowlist", () => {
    expect(
      resolveNewsRssFeeds(
        "https://www.federalreserve.gov/feeds/press_all.xml, https://www.bls.gov/feed/bls_latest.rss",
      ),
    ).toEqual([
      "https://www.federalreserve.gov/feeds/press_all.xml",
      "https://www.bls.gov/feed/bls_latest.rss",
    ]);
  });
});
