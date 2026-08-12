"use client";

import { useEffect, useState } from "react";
import { CatalystCalendar } from "@/components/dashboard/CatalystCalendar";
import { EarningsCalendar } from "@/components/dashboard/EarningsCalendar";
import { FedWatchPanel } from "@/components/dashboard/FedWatchPanel";
import { DashboardMarketBoard } from "@/components/dashboard/DashboardMarketBoard";
import { HeadlineFeed } from "@/components/dashboard/HeadlineFeed";
import { LatestReportCard } from "@/components/dashboard/LatestReportCard";
import { WatchlistTable } from "@/components/dashboard/WatchlistTable";
import { ProviderHealthBanner } from "@/components/dashboard/ProviderHealthBanner";
import { SessionControlStrip } from "@/components/dashboard/SessionControlStrip";
import { StaleBanner } from "@/components/ui/StaleBanner";
import type { DashboardSnapshot } from "@/lib/fixtures/dashboard";
import type { DashboardWatchlistSnapshot } from "@/lib/market-data/watchlist-types";
import type { NormalizedBar } from "@/lib/providers/types";

const LIVE_POLL_MS = 15_000;

export function LiveMarketOverview({
  initial,
  selectedSymbol,
  chartSeries,
  chartMode,
  chartInitialState,
  live,
}: {
  initial: DashboardSnapshot;
  selectedSymbol: string;
  chartSeries: Record<string, NormalizedBar[]>;
  chartMode: "mock" | "provider" | "unavailable";
  chartInitialState?:
    | "mock"
    | "loading"
    | "realtime"
    | "delayed"
    | "stale"
    | "empty"
    | "unavailable"
    | "rate-limited"
    | "entitlement";
  live: boolean;
}) {
  const [data, setData] = useState(initial);
  const [chartSymbol, setChartSymbol] = useState(selectedSymbol);
  const [listOverride, setListOverride] = useState<DashboardWatchlistSnapshot | null>(
    null,
  );

  function selectChartSymbol(ticker: string) {
    setChartSymbol(ticker);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("symbol", ticker);
    window.history.replaceState({}, "", url);
    document
      .getElementById("primary-market-chart")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    async function pull() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/dashboard?live=1", {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as DashboardSnapshot;
        if (!cancelled) setData(next);
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

  const unhealthyCount = data.providers.filter(
    (provider) => provider.health === "degraded" || provider.health === "down",
  ).length;

  return (
    <>
      <SessionControlStrip
        session={data.marketSession}
        asOf={data.asOf}
        coverageLabel={data.latencyCoverageLabel}
        latencyClass={data.latencyClass}
        providerCount={data.providers.length}
        unhealthyCount={unhealthyCount}
        licenseWarning={data.licenseWarning}
      />

      {data.stale && data.latencyClass !== "unavailable" ? (
        <StaleBanner asOf={data.asOf} />
      ) : null}

      <DashboardMarketBoard
        quotes={data.tape}
        latencyCoverageLabel={data.latencyCoverageLabel}
        asOf={data.asOf}
        marketSession={data.marketSession}
        initialSymbol={selectedSymbol}
        symbol={chartSymbol}
        onSelectSymbol={selectChartSymbol}
        initialSeries={chartSeries}
        coverageLabel={data.latencyCoverageLabel ?? null}
        mode={chartMode}
        initialState={chartInitialState}
        feedCoverage={data.feedCoverage}
        latencyClass={data.latencyClass}
        breadthSupported={data.breadthSupported}
        breadthExplanation={data.breadthExplanation}
        calendar={data.calendar}
        sidebar={
          <LatestReportCard report={data.latestReport} />
        }
      />

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <div id="fedwatch" className="min-w-0 scroll-mt-3 xl:col-span-12">
          <FedWatchPanel />
        </div>
        <div id="earnings-calendar" className="min-w-0 scroll-mt-3 xl:col-span-12">
          <EarningsCalendar onSelectSymbol={selectChartSymbol} />
        </div>
        <div className="min-w-0 xl:col-span-8">
          <WatchlistTable
            data={watchlist}
            onSelectSymbol={selectChartSymbol}
            onSelectList={selectWatchlist}
          />
        </div>
        <div id="catalyst-calendar" className="min-w-0 scroll-mt-3 xl:col-span-4">
          <CatalystCalendar events={data.calendar} />
        </div>

        <div className="min-w-0 xl:col-span-8">
          <HeadlineFeed headlines={data.headlines} />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <ProviderHealthBanner
            providers={data.providers}
            latencyCoverageLabel={data.latencyCoverageLabel}
            asOf={data.asOf}
            marketSession={data.marketSession}
            licenseWarning={data.licenseWarning}
          />
        </div>
      </div>
    </>
  );
}
