"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookImpactStrip } from "@/components/dashboard/BookImpactStrip";
import { CatalystCalendar } from "@/components/dashboard/CatalystCalendar";
import { DivergenceNotes } from "@/components/dashboard/DivergenceNotes";
import { EarningsCalendar } from "@/components/dashboard/EarningsCalendar";
import { FactorTape } from "@/components/dashboard/FactorTape";
import { FedWatchPanel } from "@/components/dashboard/FedWatchPanel";
import { FocusContextPanel } from "@/components/dashboard/FocusContextPanel";
import { HeadlineFeed } from "@/components/dashboard/HeadlineFeed";
import { MarketChart } from "@/components/dashboard/MarketChart";
import { MaterialMoversPanel } from "@/components/dashboard/MaterialMoversPanel";
import { OverviewStatusChrome } from "@/components/dashboard/OverviewStatusChrome";
import { SectorHeatmap } from "@/components/dashboard/SectorHeatmap";
import { ThemeTape } from "@/components/dashboard/ThemeTape";
import { WatchlistTable } from "@/components/dashboard/WatchlistTable";
import { DashboardMarketBoard } from "@/components/dashboard/DashboardMarketBoard";
import { SessionIntelligence } from "@/components/intel/SessionIntelligence";
import { StaleBanner } from "@/components/ui/StaleBanner";
import {
  attachMovesToBookImpact,
  compactBookImpact,
  emptyBookImpact,
  isPositionsSnapshot,
  type DashboardBookImpact,
} from "@/lib/dashboard/book-impact";
import { buildFocusContext } from "@/lib/dashboard/focus-context";
import type { DashboardSnapshot } from "@/lib/fixtures/dashboard";
import { buildAttentionItems } from "@/lib/market-data/overview-attention";
import {
  buildFactorTiles,
  buildSectorHeatmap,
  buildSharedMarketAnalytics,
  overviewDivergenceNotes,
} from "@/lib/market-data/overview-analytics";
import { joinMaterialMovers } from "@/lib/market-data/overview-movers";
import { attributeMoves } from "@/lib/intelligence/attribution";
import { detectSignificantMove } from "@/lib/intelligence/move-detect";
import { calculateMarketPulse } from "@/lib/market-data/market-pulse";
import {
  initialCoveragePick,
  sameCoveragePick,
  watchlistForPick,
  type CoveragePick,
} from "@/lib/dashboard/coverage-pick";
import type { DashboardWatchlistSnapshot } from "@/lib/market-data/watchlist-types";

const LIVE_POLL_MS = 15_000;
const BOOK_POLL_MS = 30_000;

export function LiveMarketOverview({
  initial,
  initialBookImpact,
  selectedSymbol,
  selectedListId,
  selectedSectorId,
  live,
  chartMode,
  pulseLoading = false,
}: {
  initial: DashboardSnapshot;
  initialBookImpact?: DashboardBookImpact;
  selectedSymbol: string;
  selectedListId?: string;
  selectedSectorId?: string;
  live: boolean;
  chartMode: "mock" | "provider" | "unavailable";
  pulseLoading?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [book, setBook] = useState<DashboardBookImpact>(
    () => initialBookImpact ?? emptyBookImpact(null),
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [focusSymbol, setFocusSymbol] = useState(selectedSymbol);
  const [listOverride, setListOverride] = useState<DashboardWatchlistSnapshot | null>(
    null,
  );
  const [pick, setPick] = useState<CoveragePick | null>(() =>
    initialCoveragePick(selectedSectorId, selectedListId, initial.watchlist?.listId),
  );
  const pickRef = useRef<CoveragePick | null>(pick);
  pickRef.current = pick;
  const movesRef = useRef(data.intelligence?.moves);
  movesRef.current = data.intelligence?.moves;
  const skipInitialPollDelay = useRef(false);

  function selectSymbol(ticker: string) {
    setFocusSymbol(ticker);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", ticker);
    window.history.replaceState({}, "", url);
  }

  function writePick(next: CoveragePick | null) {
    pickRef.current = next;
    setPick(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next?.type === "sector") {
      url.searchParams.set("sectorId", next.id);
      url.searchParams.delete("listId");
    } else if (next?.id) {
      url.searchParams.set("listId", next.id);
      url.searchParams.delete("sectorId");
    } else {
      url.searchParams.delete("listId");
      url.searchParams.delete("sectorId");
    }
    window.history.replaceState({}, "", url);
  }

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const requested = pickRef.current;
    const delay = skipInitialPollDelay.current ? 0 : 1_500;
    skipInitialPollDelay.current = true;

    async function pull() {
      if (document.visibilityState === "hidden") return;
      try {
        const params = new URLSearchParams({ live: "1" });
        if (requested?.type === "sector") params.set("sectorId", requested.id);
        else if (requested?.id) params.set("listId", requested.id);
        const response = await fetch(`/api/dashboard?${params.toString()}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!response.ok) {
          setRefreshError(
            `Live refresh failed (${response.status}). Showing last successful snapshot.`,
          );
          return;
        }
        if ((pickRef.current || requested) && !sameCoveragePick(pickRef.current, requested)) {
          return;
        }
        const next = (await response.json()) as DashboardSnapshot;
        if (cancelled) return;
        if ((pickRef.current || requested) && !sameCoveragePick(pickRef.current, requested)) {
          return;
        }
        setData(next);
        setRefreshError(null);
        setListOverride((current) => {
          if (!current) return null;
          if (current.listId === next.watchlist?.listId) return null;
          if (pickRef.current && current.listId !== pickRef.current.id) return null;
          return current;
        });
      } catch {
        if (!cancelled) {
          setRefreshError(
            "Live refresh failed. Showing last successful snapshot. Tape, news, and calendars keep their own source labels.",
          );
        }
      }
    }

    const timeout = window.setTimeout(() => void pull(), delay);
    const interval = window.setInterval(() => void pull(), LIVE_POLL_MS);
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
  }, [live, pick?.id, pick?.type]);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    async function pullBook() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/positions", { cache: "no-store" });
        if (cancelled) return;
        if (!response.ok) {
          setBook((prev) => ({
            ...prev,
            error: `Book refresh failed (${response.status}). Showing last successful blotter.`,
            stale: true,
          }));
          return;
        }
        const payload: unknown = await response.json();
        if (cancelled) return;
        if (!isPositionsSnapshot(payload)) {
          setBook((prev) => ({
            ...prev,
            error: "Book refresh returned an incomplete blotter. Showing last successful data.",
            stale: true,
          }));
          return;
        }
        setBook(compactBookImpact(payload, movesRef.current ?? []));
      } catch {
        if (!cancelled) {
          setBook((prev) => ({
            ...prev,
            error: "Book refresh failed. Showing last successful blotter.",
            stale: true,
          }));
        }
      }
    }
    void pullBook();
    const interval = window.setInterval(() => void pullBook(), BOOK_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [live]);

  async function selectCollection(next: CoveragePick) {
    if (sameCoveragePick(next, pickRef.current)) return;
    writePick(next);
    try {
      const params =
        next.type === "sector"
          ? `sectorId=${encodeURIComponent(next.id)}`
          : `listId=${encodeURIComponent(next.id)}`;
      const response = await fetch(`/api/market/watchlist?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      if (!sameCoveragePick(pickRef.current, next)) return;
      setListOverride((await response.json()) as DashboardWatchlistSnapshot);
    } catch {
      /* keep last */
    }
  }

  const watchlist = watchlistForPick(pick, listOverride, data.watchlist);
  const bookDigest = useMemo(
    () => attachMovesToBookImpact(book, data.intelligence?.moves ?? []),
    [book, data.intelligence?.moves],
  );
  const inBookTickers = data.coverage?.inBookTickers?.length
    ? data.coverage.inBookTickers
    : bookDigest.openTickers;

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
  const tapeChangeByTicker = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const quote of data.tape) {
      map.set(quote.ticker.toUpperCase(), quote.changePercent ?? null);
    }
    return map;
  }, [data.tape]);
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
  const factors = useMemo(() => buildFactorTiles(data.tape), [data.tape]);
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
        marketSession: data.marketSession,
        book: bookDigest,
      }),
    [
      bookDigest,
      data.asOf,
      data.calendar,
      data.coverage,
      data.marketSession,
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
  const focus = useMemo(
    () =>
      buildFocusContext({
        ticker: focusSymbol,
        tape: data.tape,
        watchlist,
        coverage: data.coverage,
        movers,
        headlines: data.headlines,
        explanations: watchlistMoves,
        book: bookDigest,
      }),
    [
      bookDigest,
      data.coverage,
      data.headlines,
      data.tape,
      focusSymbol,
      movers,
      watchlist,
      watchlistMoves,
    ],
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
        universeCoverage={data.universeCoverageLabel}
        providers={data.providers}
        refreshError={refreshError}
        items={attention}
        onSelectSymbol={selectSymbol}
      />

      <BookImpactStrip
        key="book-impact"
        book={bookDigest}
        onSelectSymbol={selectSymbol}
      />

      <SessionIntelligence
        key="desk-intelligence"
        compact
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
        <FactorTape tiles={factors} onSelectSymbol={selectSymbol} />
        <ThemeTape
          sectors={data.coverage?.deskSectors ?? []}
          selectedSectorId={pick?.type === "sector" ? pick.id : undefined}
          onSelectSymbol={selectSymbol}
          onSelectSector={(sectorId) => {
            void selectCollection({ type: "sector", id: sectorId });
          }}
        />
      </DashboardMarketBoard>

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <div id="market-chart" className="min-w-0 scroll-mt-3 xl:col-span-8">
          <MarketChart
            initialSeries={{}}
            initialSymbol={focusSymbol}
            symbol={focusSymbol}
            onSymbolChange={selectSymbol}
            coverageLabel={data.latencyCoverageLabel ?? null}
            asOf={data.asOf}
            mode={chartMode}
            marketSession={data.marketSession}
          />
        </div>
        <div className="min-w-0 space-y-3 xl:col-span-4">
          <FocusContextPanel focus={focus} onSelectSymbol={selectSymbol} />
          <MaterialMoversPanel
            movers={movers}
            selectedSymbol={focusSymbol}
            onSelectSymbol={selectSymbol}
            latestReport={data.latestReport}
          />
          <SectorHeatmap
            cells={sectors}
            deskSectors={data.coverage?.deskSectors}
            onSelectSymbol={selectSymbol}
            onSelectSector={(sectorId) => {
              void selectCollection({ type: "sector", id: sectorId });
              document
                .getElementById("watchlist")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            selectedSymbol={focusSymbol}
            selectedSectorId={pick?.type === "sector" ? pick.id : undefined}
            tapeChangeByTicker={tapeChangeByTicker}
            spyChange={shared.spyChange}
          />
          <DivergenceNotes notes={divergence} />
        </div>
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <div id="watchlist" className="min-w-0 scroll-mt-3 xl:col-span-8">
          <WatchlistTable
            data={watchlist}
            onSelectSymbol={selectSymbol}
            onSelectCollection={selectCollection}
            selectedCollection={pick}
            inBookTickers={inBookTickers}
            selectedSymbol={focusSymbol}
            explanations={watchlistMoves}
            deskSectors={data.coverage?.deskSectors}
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
        <div id="fedwatch" className="min-w-0 scroll-mt-3 xl:col-span-4">
          <FedWatchPanel />
        </div>
        <div id="earnings-calendar" className="min-w-0 scroll-mt-3 xl:col-span-4">
          <EarningsCalendar
            onSelectSymbol={selectSymbol}
            coverageTickers={data.coverage?.coverageSymbolSet}
            inBookTickers={inBookTickers}
          />
        </div>
        <div id="catalyst-calendar" className="min-w-0 scroll-mt-3 xl:col-span-4">
          <CatalystCalendar events={data.calendar} />
        </div>
      </div>
    </div>
  );
}
