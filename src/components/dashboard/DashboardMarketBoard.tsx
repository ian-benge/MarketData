"use client";

import type { ReactNode } from "react";
import { MarketPulse } from "@/components/dashboard/MarketPulse";
import type { MarketPulseResult } from "@/lib/market-data/market-pulse";
import type { NormalizedCalendarEvent, NormalizedQuote } from "@/lib/providers/types";

export function DashboardMarketBoard({
  quotes,
  latencyCoverageLabel,
  asOf,
  marketSession,
  symbol,
  onSelectSymbol,
  feedCoverage,
  latencyClass,
  breadthSupported,
  breadthExplanation,
  calendar,
  pulse,
  loading,
  children,
}: {
  quotes: NormalizedQuote[];
  latencyCoverageLabel?: string | null;
  asOf: string;
  marketSession?: string | null;
  symbol: string;
  onSelectSymbol: (ticker: string) => void;
  feedCoverage?: string | null;
  latencyClass?: string | null;
  breadthSupported?: boolean;
  breadthExplanation?: string | null;
  calendar?: NormalizedCalendarEvent[];
  pulse?: MarketPulseResult;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
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
        onSelectSymbol={onSelectSymbol}
        loading={loading}
        pulse={pulse}
      />
      {children}
    </div>
  );
}
