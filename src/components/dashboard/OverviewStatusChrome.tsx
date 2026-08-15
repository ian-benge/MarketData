"use client";

import { type ComponentProps } from "react";
import { AlertTriangle, ChevronRight, ShieldAlert } from "lucide-react";
import { AttentionStrip } from "@/components/dashboard/AttentionStrip";
import {
  dataTrustKind,
  sessionCompactLabel,
  SessionControlStrip,
  trustCompactLabel,
} from "@/components/dashboard/SessionControlStrip";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import type { AttentionItem } from "@/lib/market-data/overview-attention";
import { formatMarketTime } from "@/lib/utils/format";

function TrustBody({
  items,
  onSelectSymbol,
  ...strip
}: ComponentProps<typeof SessionControlStrip> & {
  items: AttentionItem[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  return (
    <>
      <SessionControlStrip {...strip} />
      <AttentionStrip items={items} onSelectSymbol={onSelectSymbol} />
    </>
  );
}

export function OverviewStatusChrome({
  items,
  onSelectSymbol,
  ...strip
}: ComponentProps<typeof SessionControlStrip> & {
  items: AttentionItem[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  const lead = items[0];

  return (
    <div className="space-y-2 lg:space-y-3">
      <details className="group lg:hidden">
        <summary className="sticky top-12 z-20 flex min-h-11 w-full min-w-0 cursor-pointer list-none items-center gap-2 overflow-hidden rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-[var(--ib-text-muted)] transition-transform group-open:rotate-90"
          />
          <span className="sr-only">Toggle session and attention details</span>
          <span className="shrink-0 text-[12px] font-medium text-[var(--ib-text-primary)] group-open:hidden">
            {sessionCompactLabel(strip.session)}
          </span>
          <StatusIndicator
            kind={dataTrustKind(strip.latencyClass)}
            label={trustCompactLabel(strip.latencyClass)}
            className="shrink-0 group-open:hidden"
          />
          {lead ? (
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--ib-text-primary)] group-open:hidden">
              {lead.print}
            </span>
          ) : null}
          {strip.unhealthyCount ? (
            <AlertTriangle
              aria-hidden="true"
              className="size-3.5 shrink-0 text-[var(--state-warning)] group-open:hidden"
            />
          ) : null}
          {strip.licenseWarning ? (
            <ShieldAlert
              aria-hidden="true"
              className="size-3.5 shrink-0 text-[var(--state-warning)] group-open:hidden"
            />
          ) : null}
          <span className="hidden min-w-0 truncate text-[12px] font-medium text-[var(--ib-text-primary)] group-open:inline">
            Session & attention
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--ib-text-muted)]">
            {formatMarketTime(strip.asOf)}
          </span>
        </summary>
        <div className="mt-3 space-y-3">
          <TrustBody
            {...strip}
            items={items}
            onSelectSymbol={onSelectSymbol}
          />
        </div>
      </details>
      <div className="hidden space-y-2 bg-[var(--ib-canvas)] pb-0.5 lg:sticky lg:top-11 lg:z-20 lg:block">
        <TrustBody
          {...strip}
          items={items}
          onSelectSymbol={onSelectSymbol}
        />
      </div>
    </div>
  );
}
