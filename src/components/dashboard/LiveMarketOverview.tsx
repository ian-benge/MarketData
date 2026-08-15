"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CatalystCalendar } from "@/components/dashboard/CatalystCalendar";
import { DivergenceNotes } from "@/components/dashboard/DivergenceNotes";
import { EarningsCalendar } from "@/components/dashboard/EarningsCalendar";
import { FedWatchPanel } from "@/components/dashboard/FedWatchPanel";
import { DashboardMarketBoard } from "@/components/dashboard/DashboardMarketBoard";
import { HeadlineFeed } from "@/components/dashboard/HeadlineFeed";
import { MaterialMoversPanel } from "@/components/dashboard/MaterialMoversPanel";
import { SectorHeatmap } from "@/components/dashboard/SectorHeatmap";
import { WatchlistTable } from "@/components/dashboard/WatchlistTable";
import { OverviewStatusChrome } from "@/components/dashboard/OverviewStatusChrome";
import { StaleBanner } from "@/components/ui/StaleBanner";
import type { DashboardSnapshot } from "@/lib/fixtures/dashboard";
import { buildAttentionItems } from "@/lib/market-data/overview-attention";
import {
  buildSectorHeatmap,
  buildSharedMarketAnalytics,
  overviewDivergenceNotes,
} from "@/lib/market-data/overview-analytics";
import { joinMaterialMovers } from "@/lib/market-data/overview-movers";
import { attributeMoves } from "@/lib/intelligence/attribution";
import { detectSignificantMove } from "@/lib/intelligence/move-detect";
import { calculateMarketPulse } from "@/lib/market-data/market-pulse";
import type { DashboardWatchlistSnapshot } from "@/lib/market-data/watchlist-types";

const LIVE_POLL_MS = 15_000;

export function LiveMarketOverview({
  initial,
  selectedSymbol,
  selectedListId,
  live,
  pulseLoading = false,
}: {
  initial: DashboardSnapshot;
  selectedSymbol: string;
  selectedListId?: string;
  live: boolean;
  pulseLoading?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [focusSymbol, setFocusSymbol] = useState(selectedSymbol);
  const [listOverride, setListOverride] = useState<DashboardWatchlistSnapshot | null>(
    null,
  );
  const listIdRef = useRef<string | null>(
    selectedListId ?? initial.watchlist?.listId ?? null,
  );

  function selectSymbol(ticker: string) {
    setFocusSymbol(ticker);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", ticker);
    window.history.replaceState({}, "", url);
  }

  function writeListId(listId: string | null) {
    listIdRef.current = listId;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (listId) url.searchParams.set("listId", listId);
    else url.searchParams.delete("listId");
    window.history.replaceState({}, "", url);
  }

  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    async function pull() {
      if (document.visibilityState === "hidden") return;
      try {
        const params = new URLSearchParams({ live: "1" });
        const listId = listIdRef.current;
        if (listId) params.set("listId", listId);
        const response = await fetch(`/api/dashboard?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as DashboardSnapshot;
        if (cancelled) return;
        setData(next);
        setListOverride((current) =>
          current && current.listId !== next.watchlist?.listId ? current : null,
        );
      } catch {
        /* keep last valid snapshot */
      }
    }

    const timeout = window.setTimeout(pull, 1_500);
    const interval = window.setInterval(pull, LIVE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live]);

  async function selectWatchlist(nextListId: string) {
    writeListId(nextListId);
    if (nextListId === data.watchlist?.listId) {
      setListOverride(null);
      return;
    }
    try {
      const response = await fetch(
        `/api/market/watchlist?listId=${encodeURIComponent(nextListId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      setListOverride((await response.json()) as DashboardWatchlistSnapshot);
    } catch {
      /* keep last */
    }
  }

  const watchlist =
    listOverride && listOverride.listId !== data.watchlist?.listId
      ? listOverride
      : (data.watchlist ?? null);

  const watchlistMoves = useMemo(() => {
    const events = data.intelligence?.events ?? [];
    const server = data.intelligence?.moves ?? [];
    if (!watchlist?.rows?.length) return server;
    const quotes = watchlist.rows.map((row) => ({
      ticker: row.ticker,
      changePercent: row.change1dPercent,
      relativeVolume: row.relativeVolume,
      preMarketChangePercent: row.preMarketChangePercent,
      afterHoursChangePercent: row.afterHoursChangePercent,
      flags: [],
      session: data.marketSession ?? null,
    }));
    const significant = quotes.filter((quote) => detectSignificantMove(quote).significant);
    if (!significant.length) return [];
    if (!events.length) {
      return server.filter((row) =>
        significant.some((quote) => quote.ticker.toUpperCase() === row.ticker.toUpperCase()),
      );
    }
    return attributeMoves(significant, events, data.marketSession);
  }, [watchlist, data.intelligence, data.marketSession]);

  const unhealthyCount = data.providers.filter(
    (provider) => provider.health === "degraded" || provider.health === "down",
  ).length;

  const shared = useMemo(
    () => buildSharedMarketAnalytics({ quotes: data.tape }),
    [data.tape],
  );
  const movers = useMemo(
    () =>
      joinMaterialMovers(
        data.movers,
        data.headlines,
        data.marketSession,
        data.moversCoverageNotes,
        data.intelligence?.moves,
      ),
    [
      data.headlines,
      data.intelligence?.moves,
      data.marketSession,
      data.movers,
      data.moversCoverageNotes,
    ],
  );
  const sectors = useMemo(() => buildSectorHeatmap(data.tape), [data.tape]);
  const pulse = useMemo(
    () =>
      calculateMarketPulse({
        quotes: data.tape,
        asOf: data.asOf,
        marketSession: data.marketSession,
        latencyClass: data.latencyClass,
        feedCoverage: data.feedCoverage,
        coverageLabel: data.latencyCoverageLabel,
        breadthSupported: data.breadthSupported,
      }),
    [
      data.asOf,
      data.breadthSupported,
      data.feedCoverage,
      data.latencyClass,
      data.latencyCoverageLabel,
      data.marketSession,
      data.tape,
    ],
  );
  const attention = useMemo(
    () =>
      buildAttentionItems({
        drivers: pulse.drivers,
        movers,
        sectors,
        spyChange: shared.spyChange,
        watchlist: watchlist?.rows,
        calendar: data.calendar,
        asOf: data.asOf,
        coverage: data.coverage,
      }),
    [
      data.asOf,
      data.calendar,
      data.coverage,
      movers,
      pulse.drivers,
      sectors,
      shared.spyChange,
      watchlist?.rows,
    ],
  );
  const divergence = useMemo(
    () => overviewDivergenceNotes(shared.variantViews),
    [shared.variantViews],
  );
  return (
    <div className="space-y-3">
      <OverviewStatusChrome
        session={data.marketSession}
        asOf={data.asOf}
        coverageLabel={data.latencyCoverageLabel}
        latencyClass={data.latencyClass}
        providerCount={data.providers.length}
        unhealthyCount={unhealthyCount}
        licenseWarning={data.licenseWarning}
        providers={data.providers}
        items={attention}
        onSelectSymbol={selectSymbol}
      />

      {data.stale && data.latencyClass !== "unavailable" ? (
        <StaleBanner asOf={data.asOf} />
      ) : null}

      <DashboardMarketBoard
        quotes={data.tape}
        latencyCoverageLabel={data.latencyCoverageLabel}
        asOf={data.asOf}
        marketSession={data.marketSession}
        symbol={focusSymbol}
        onSelectSymbol={selectSymbol}
        feedCoverage={data.feedCoverage}
        latencyClass={data.latencyClass}
        breadthSupported={data.breadthSupported}
        breadthExplanation={data.breadthExplanation}
        calendar={data.calendar}
        pulse={pulse}
        loading={pulseLoading}
      >
        <div className="grid min-w-0 gap-3 xl:grid-cols-12">
          <div className="min-w-0 space-y-3 xl:col-span-8">
            <SectorHeatmap
              cells={sectors}
              deskSectors={data.coverage?.deskSectors}
              onSelectSymbol={selectSymbol}
              selectedSymbol={focusSymbol}
            />
            <MaterialMoversPanel
              movers={movers}
              coverageNotes={data.moversCoverageNotes}
              latestReport={data.latestReport}
              onSelectSymbol={selectSymbol}
              selectedSymbol={focusSymbol}
            />
          </div>
          <div className="min-w-0 space-y-3 xl:col-span-4">
            <DivergenceNotes notes={divergence} />
          </div>
        </div>
      </DashboardMarketBoard>

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <div id="watchlist" className="min-w-0 scroll-mt-3 xl:col-span-8">
          <WatchlistTable
            data={watchlist}
            onSelectSymbol={selectSymbol}
            onSelectList={selectWatchlist}
            inBookTickers={data.coverage?.inBookTickers}
            selectedSymbol={focusSymbol}
            explanations={watchlistMoves}
          />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <HeadlineFeed
            headlines={data.headlines}
            events={data.intelligence?.events}
            gaps={data.intelligence?.gaps}
            coverageTickers={data.coverage?.coverageSymbolSet}
            onSelectSymbol={selectSymbol}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <div id="fedwatch" className="min-w-0 scroll-mt-3 xl:col-span-6">
          <FedWatchPanel />
        </div>
        <div id="earnings-calendar" className="min-w-0 scroll-mt-3 xl:col-span-3">
          <EarningsCalendar onSelectSymbol={selectSymbol} />
        </div>
        <div id="catalyst-calendar" className="min-w-0 scroll-mt-3 xl:col-span-3">
          <CatalystCalendar events={data.calendar} />
        </div>
      </div>
    </div>
  );
}
