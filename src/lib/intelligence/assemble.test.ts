import { describe, expect, it } from "vitest";
import { assembleEvents, eventsToHeadlines } from "./assemble";
import type { NormalizedNewsItem } from "@/lib/providers/types";

function item(
  partial: Partial<NormalizedNewsItem> & Pick<NormalizedNewsItem, "id" | "title" | "url">,
): NormalizedNewsItem {
  return {
    publishedAt: "2026-08-15T14:00:00.000Z",
    retrievedAt: "2026-08-15T14:01:00.000Z",
    tickers: [],
    sourceClass: "wire",
    providerName: "test",
    sourceQuality: "secondary",
    ...partial,
  };
}

describe("assembleEvents", () => {
  it("clusters duplicate coverage and ranks coverage-tagged names first", () => {
    const events = assembleEvents({
      items: [
        item({
          id: "a",
          title: "NVIDIA raises AI data center outlook",
          url: "https://a.example/1",
          tickers: ["NVDA"],
        }),
        item({
          id: "b",
          title: "NVIDIA raises AI data-center outlook sharply",
          url: "https://b.example/2",
          tickers: ["NVDA"],
        }),
        item({
          id: "c",
          title: "Oil inventory draw lifts crude prices",
          url: "https://c.example/3",
          tickers: ["USO"],
          publishedAt: "2026-08-15T10:00:00.000Z",
        }),
      ],
      coverageTickers: ["NVDA"],
    });
    const nvda = events.find((event) => event.tickers.some((row) => row.ticker === "NVDA"));
    expect(nvda?.memberCount).toBeGreaterThanOrEqual(2);
    expect(nvda?.sources.every((source) => source.url.startsWith("https://"))).toBe(true);
    expect(events[0]?.tickers.some((row) => row.ticker === "NVDA")).toBe(true);
    expect(eventsToHeadlines(events, 1)[0]?.tickers).toContain("NVDA");
  });
});
