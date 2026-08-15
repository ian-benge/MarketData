"use client";

import Link from "next/link";
import { EventCard } from "@/components/news/EventCard";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { EmptyHint } from "@/components/ui/StatePanel";
import type { IntelligenceEvent } from "@/lib/intelligence/types";
import type { NormalizedNewsItem } from "@/lib/providers/types";

function headlinesAsEvents(headlines: NormalizedNewsItem[]): IntelligenceEvent[] {
  return headlines.map((item) => {
    const representative = {
      id: item.id,
      title: item.title,
      summary: item.summary,
      url: item.url,
      canonicalUrl: item.canonicalUrl,
      publisher: item.publisher,
      publishedAt: item.publishedAt,
      sourceClass: item.sourceClass,
      providerName: item.providerName,
      sourceQuality: item.sourceQuality,
    };
    return {
      id: item.id,
      clusterId: item.id,
      title: item.title,
      summary: item.summary,
      eventType: "other",
      eventTypeLabel: "Headline",
      publishedAt: item.publishedAt,
      novelty: "new",
      materialityScore: 40,
      sentiment: "unscored",
      sentimentNote: null,
      confidence: "unknown",
      tickers: (item.tickers ?? []).map((ticker) => ({
        ticker: ticker.toUpperCase(),
        name: null,
        role: "primary" as const,
        confidence: "high" as const,
        method: "provider" as const,
      })),
      themes: [],
      sectors: [],
      secondOrder: [],
      sources: [representative],
      representative,
      memberCount: 1,
      coverageNotes: item.coverageNotes ?? null,
      marketReaction: [],
    };
  });
}

export function HeadlineFeed({
  headlines,
  events,
  coverageTickers,
  gaps,
  onSelectSymbol,
}: {
  headlines: NormalizedNewsItem[];
  events?: IntelligenceEvent[];
  coverageTickers?: readonly string[];
  gaps?: Array<{ code: string; message: string }>;
  onSelectSymbol?: (ticker: string) => void;
}) {
  const coverage = new Set((coverageTickers ?? []).map((ticker) => ticker.toUpperCase()));
  const clustered =
    events && events.length ? events : headlinesAsEvents(headlines);
  const preferred = [...clustered].sort((a, b) => {
    const aHit = a.tickers.some((entity) => coverage.has(entity.ticker));
    const bHit = b.tickers.some((entity) => coverage.has(entity.ticker));
    if (aHit !== bHit) return aHit ? -1 : 1;
    return b.materialityScore - a.materialityScore;
  });

  return (
    <Panel
      title="Material news"
      description="Clustered events · coverage-tagged first · click a ticker to select it"
      bodyClassName="p-0"
      actions={
        <Link
          href="/news"
          className="text-[11px] font-medium text-[var(--ib-maroon-300)] hover:underline"
        >
          Search all
        </Link>
      }
    >
      {gaps?.length ? (
        <div className="border-b border-[var(--ib-border-subtle)] px-3 py-2">
          {gaps.slice(0, 2).map((gap) => (
            <p key={gap.code} className="text-[11px] text-[var(--ib-text-muted)]">
              {gap.message}
            </p>
          ))}
        </div>
      ) : null}
      {preferred.length ? (
        <div className="xl:max-h-[min(36rem,calc(100dvh-14rem))] xl:overflow-y-auto terminal-scroll">
          {preferred.slice(0, 16).map((event) => (
            <EventCard
              key={event.id}
              event={event}
              coverageTickers={coverage}
              onSelectTicker={onSelectSymbol}
            />
          ))}
        </div>
      ) : (
        <EmptyHint>
          No material headlines are available for the configured sources.{" "}
          <Link href="/news" className="text-[var(--ib-maroon-300)] hover:underline">
            Open headline search
          </Link>
        </EmptyHint>
      )}
      {preferred.some((event) => event.representative.sourceQuality === "mock") ? (
        <div className="border-t border-[var(--ib-border-subtle)] px-3 py-2">
          <Badge tone="mock">Mock source</Badge>
        </div>
      ) : null}
    </Panel>
  );
}
