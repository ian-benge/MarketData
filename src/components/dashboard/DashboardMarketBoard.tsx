"use client";

import { useRef, type ReactNode } from "react";
import { MarketChart } from "@/components/dashboard/MarketChart";
import { MarketPulse } from "@/components/dashboard/MarketPulse";
import type { NormalizedBar, NormalizedCalendarEvent, NormalizedQuote } from "@/lib/providers/types";

function writeSymbolParam(symbol: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("symbol", symbol);
  window.history.replaceState({}, "", url);
}

export function DashboardMarketBoard({
  quotes,
  latencyCoverageLabel,
  asOf,
  marketSession,
  initialSymbol,
  symbol,
  onSelectSymbol,
  initialSeries,
  coverageLabel,
  mode,
  initialState,
  feedCoverage,
  latencyClass,
  breadthSupported,
  breadthExplanation,
  calendar,
  sidebar,
}: {
  quotes: NormalizedQuote[];
  latencyCoverageLabel?: string | null;
  asOf: string;
  marketSession?: string | null;
  initialSymbol: string;
  symbol: string;
  onSelectSymbol: (ticker: string) => void;
  initialSeries: Record<string, NormalizedBar[]>;
  coverageLabel: string | null;
  mode: "mock" | "provider" | "unavailable";
  initialState?:
    | "mock"
    | "loading"
    | "realtime"
    | "delayed"
    | "stale"
    | "empty"
    | "unavailable"
    | "rate-limited"
    | "entitlement";
  feedCoverage?: string | null;
  latencyClass?: string | null;
  breadthSupported?: boolean;
  breadthExplanation?: string | null;
  calendar?: NormalizedCalendarEvent[];
  sidebar: ReactNode;
}) {
  const chartRef = useRef<HTMLDivElement>(null);

  function selectSymbol(next: string) {
    onSelectSymbol(next);
    writeSymbolParam(next);
    chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <MarketPulse
        quotes={quotes}
        coverageLabel={latencyCoverageLabel}
        asOf={asOf}
        marketSession={marketSession}
        latencyClass={latencyClass}
        feedCoverage={feedCoverage}
        breadthSupported={breadthSupported}
        breadthExplanation={breadthExplanation}
        calendar={calendar}
        selectedSymbol={symbol}
        onSelectSymbol={selectSymbol}
        loading={initialState === "loading"}
      />

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <div
          ref={chartRef}
          id="primary-market-chart"
          className="min-w-0 scroll-mt-3 xl:col-span-8"
        >
          <MarketChart
            initialSeries={initialSeries}
            initialSymbol={initialSymbol}
            symbol={symbol}
            onSymbolChange={selectSymbol}
            coverageLabel={coverageLabel}
            asOf={asOf}
            mode={mode}
            initialState={initialState}
          />
        </div>
        <div className="min-w-0 space-y-3 xl:col-span-4">{sidebar}</div>
      </div>
    </>
  );
}
