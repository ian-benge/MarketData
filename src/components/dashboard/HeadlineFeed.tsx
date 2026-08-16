"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EventCard } from "@/components/news/EventCard";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { EmptyHint } from "@/components/ui/StatePanel";
import { parseTimeWindow } from "@/lib/intelligence/windows";
import type { IntelligenceEvent } from "@/lib/intelligence/types";
import type { NormalizedNewsItem } from "@/lib/providers/types";

export const MATERIAL_IMPACT_FLOOR = 45;
export const HIGH_IMPACT_FLOOR = 70;

export const MATERIAL_NEWS_TIME_FILTERS = [
  { id: "", label: "All time" },
  { id: "last hour", label: "Last hour" },
  { id: "today", label: "Today" },
  { id: "this week", label: "This week" },
  { id: "premarket", label: "Premarket" },
  { id: "after-hours", label: "After-hours" },
] as const;

export const MATERIAL_NEWS_IMPACT_FILTERS = [
  { id: "all", label: "All impact" },
  { id: "material", label: "Material M≥45" },
  { id: "high", label: "High M≥70" },
] as const;

export const MATERIAL_NEWS_SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "impact", label: "Highest impact" },
] as const;

export type MaterialNewsTimeFilter =
  (typeof MATERIAL_NEWS_TIME_FILTERS)[number]["id"];
export type MaterialNewsImpactFilter =
  (typeof MATERIAL_NEWS_IMPACT_FILTERS)[number]["id"];
export type MaterialNewsSort = (typeof MATERIAL_NEWS_SORTS)[number]["id"];

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

function inTimeWindow(
  publishedAt: string,
  windowId: MaterialNewsTimeFilter,
  now: Date,
): boolean {
  if (!windowId) return true;
  const range = parseTimeWindow(windowId, now);
  if (!range) return true;
  const at = Date.parse(publishedAt);
  if (!Number.isFinite(at)) return false;
  return at >= Date.parse(range.start) && at <= Date.parse(range.end);
}

function impactFloor(filter: MaterialNewsImpactFilter): number {
  if (filter === "high") return HIGH_IMPACT_FLOOR;
  if (filter === "material") return MATERIAL_IMPACT_FLOOR;
  return 0;
}

function coverageRank(event: IntelligenceEvent, coverage: ReadonlySet<string>) {
  return event.tickers.some((entity) => coverage.has(entity.ticker)) ? 0 : 1;
}

export function filterAndSortMaterialNews(
  events: IntelligenceEvent[],
  coverage: ReadonlySet<string>,
  timeFilter: MaterialNewsTimeFilter,
  impactFilter: MaterialNewsImpactFilter,
  sort: MaterialNewsSort = "newest",
  now = new Date(),
): IntelligenceEvent[] {
  const floor = impactFloor(impactFilter);
  return events
    .filter(
      (event) =>
        event.materialityScore >= floor &&
        inTimeWindow(event.publishedAt, timeFilter, now),
    )
    .sort((a, b) => {
      if (sort === "impact" && a.materialityScore !== b.materialityScore) {
        return b.materialityScore - a.materialityScore;
      }
      const byTime = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      if (byTime) return sort === "oldest" ? -byTime : byTime;
      if (a.materialityScore !== b.materialityScore) {
        return b.materialityScore - a.materialityScore;
      }
      return coverageRank(a, coverage) - coverageRank(b, coverage);
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
  const [timeFilter, setTimeFilter] = useState<MaterialNewsTimeFilter>("");
  const [impactFilter, setImpactFilter] = useState<MaterialNewsImpactFilter>("all");
  const [sort, setSort] = useState<MaterialNewsSort>("newest");
  const coverage = useMemo(
    () => new Set((coverageTickers ?? []).map((ticker) => ticker.toUpperCase())),
    [coverageTickers],
  );
  const clustered = useMemo(
    () => (events && events.length ? events : headlinesAsEvents(headlines)),
    [events, headlines],
  );
  const preferred = useMemo(
    () => filterAndSortMaterialNews(clustered, coverage, timeFilter, impactFilter, sort),
    [clustered, coverage, impactFilter, sort, timeFilter],
  );
  const filteredOut = clustered.length > 0 && preferred.length === 0;

  return (
    <Panel
      title="Material news"
      description={`Clustered events · ${
        sort === "oldest" ? "oldest first" : sort === "impact" ? "high impact first" : "newest first"
      } · click a ticker to select it`}
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
      {clustered.length ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--ib-border-subtle)] px-3 py-1.5">
          <select
            aria-label="Sort headlines"
            className="field-control h-7 min-w-[7.5rem] flex-1 py-0 text-[10px]"
            value={sort}
            onChange={(event) => setSort(event.target.value as MaterialNewsSort)}
          >
            {MATERIAL_NEWS_SORTS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by time"
            className="field-control h-7 min-w-[6.75rem] flex-1 py-0 text-[10px]"
            value={timeFilter}
            onChange={(event) =>
              setTimeFilter(event.target.value as MaterialNewsTimeFilter)
            }
          >
            {MATERIAL_NEWS_TIME_FILTERS.map((row) => (
              <option key={row.id || "all"} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by impact"
            className="field-control h-7 min-w-[7.25rem] flex-1 py-0 text-[10px]"
            value={impactFilter}
            onChange={(event) =>
              setImpactFilter(event.target.value as MaterialNewsImpactFilter)
            }
          >
            {MATERIAL_NEWS_IMPACT_FILTERS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
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
          {filteredOut ? (
            <>
              No headlines match this time or impact filter.{" "}
              <button
                type="button"
                className="text-[var(--ib-maroon-300)] hover:underline"
                onClick={() => {
                  setTimeFilter("");
                  setImpactFilter("all");
                  setSort("newest");
                }}
              >
                Clear filters
              </button>
              {" · "}
              <Link href="/news" className="text-[var(--ib-maroon-300)] hover:underline">
                Open headline search
              </Link>
            </>
          ) : (
            <>
              No material headlines are available for the configured sources.{" "}
              <Link href="/news" className="text-[var(--ib-maroon-300)] hover:underline">
                Open headline search
              </Link>
            </>
          )}
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
