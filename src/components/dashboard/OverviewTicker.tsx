"use client";

import { useEffect, useState, type ReactNode } from "react";
import { listCrossAssetTapeItems } from "@/components/dashboard/CrossAssetTape";
import {
  buildOverviewTickerGroups,
  type OverviewTickerGroup,
  type OverviewTickerItem,
} from "@/lib/dashboard/overview-ticker";
import type { DashboardWatchlistRow } from "@/lib/market-data/watchlist-types";
import type { NormalizedQuote } from "@/lib/providers/types";
import type { DashboardCoverageDigest } from "@/lib/watchlists/dashboard-digest";
import { cn } from "@/lib/utils/cn";
import {
  formatPrice,
  formatSignedPercent,
  marketToneClass,
} from "@/lib/utils/format";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function PrintChip({
  item,
  selected,
  clone,
  onSelectSymbol,
  onSelectTheme,
}: {
  item: OverviewTickerItem;
  selected: boolean;
  clone: boolean;
  onSelectSymbol?: (ticker: string) => void;
  onSelectTheme?: (themeId: string) => void;
}) {
  const chip = (
    <>
      <span className="font-semibold tracking-wide text-[var(--ib-text-primary)]">{item.label}</span>
      <span className={cn("tabular-nums", marketToneClass(item.changePercent))}>
        {formatSignedPercent(item.changePercent)}
      </span>
      {item.last != null ? (
        <span className="tabular-nums text-[10px] text-[var(--ib-text-muted)]">
          {formatPrice(item.last, item.ticker ?? undefined)}
        </span>
      ) : null}
    </>
  );
  if (clone) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap px-1.5 font-mono text-[12px]">
        {chip}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={item.ticker ? `Select ${item.ticker}` : item.label}
      title={item.title}
      onClick={() => {
        if (item.themeId) onSelectTheme?.(item.themeId);
        if (item.ticker) onSelectSymbol?.(item.ticker);
      }}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap px-1.5 font-mono text-[12px] hover:bg-[var(--ib-surface-hover)]",
        selected && "bg-[var(--ib-surface-selected)]",
      )}
    >
      {chip}
    </button>
  );
}

function Track({
  groups,
  clone,
  selectedSymbol,
  onSelectSymbol,
  onSelectTheme,
}: {
  groups: OverviewTickerGroup[];
  clone: boolean;
  selectedSymbol?: string;
  onSelectSymbol?: (ticker: string) => void;
  onSelectTheme?: (themeId: string) => void;
}) {
  return (
    <ul className="flex items-center px-1">
      {groups.map((group, groupIndex) => (
        <li key={group.id} className="flex items-center">
          {groupIndex > 0 ? (
            <span
              aria-hidden="true"
              className="mx-1.5 h-5 w-px shrink-0 bg-[var(--ib-border-strong)]"
            />
          ) : null}
          <span className="px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ib-maroon-300)]">
            {group.label}
          </span>
          {group.items.map((item, index) => (
            <span key={item.key} className="flex items-center">
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="px-1 font-mono text-[10px] text-[var(--ib-text-muted)]"
                >
                  ·
                </span>
              ) : null}
              <PrintChip
                item={item}
                selected={Boolean(item.ticker && selectedSymbol === item.ticker)}
                clone={clone}
                onSelectSymbol={onSelectSymbol}
                onSelectTheme={onSelectTheme}
              />
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

function TickerRow({
  duration,
  reducedMotion,
  renderTrack,
}: {
  duration: number;
  reducedMotion: boolean;
  renderTrack: (clone?: boolean) => ReactNode;
}) {
  return (
    <div className="ib-ticker-row flex min-h-8 items-stretch">
      <div className="flex w-[3.25rem] shrink-0 items-center border-r border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-2">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ib-text-muted)]">
          Live
        </p>
      </div>
      <div
        className={cn(
          "min-w-0 flex-1",
          reducedMotion ? "overflow-x-auto terminal-scroll" : "overflow-hidden",
        )}
      >
        {reducedMotion ? (
          <div className="flex w-max min-w-full items-center">{renderTrack()}</div>
        ) : (
          <div
            className="ib-ticker-track"
            style={{ ["--ib-ticker-duration" as string]: `${duration}s` }}
          >
            <div className="flex min-w-[50vw] items-center">{renderTrack()}</div>
            <div aria-hidden="true" className="flex min-w-[50vw] items-center">
              {renderTrack(true)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function OverviewTicker({
  watchlistRows,
  deskSectors,
  quotes,
  selectedSymbol,
  onSelectSymbol,
  onSelectTheme,
}: {
  watchlistRows?: DashboardWatchlistRow[];
  deskSectors?: DashboardCoverageDigest["deskSectors"];
  quotes: NormalizedQuote[];
  selectedSymbol?: string;
  onSelectSymbol?: (ticker: string) => void;
  onSelectTheme?: (themeId: string) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const tape = listCrossAssetTapeItems(quotes).map((item) => ({
    ticker: item.quote.ticker,
    last: item.quote.last,
    changePercent: item.quote.changePercent ?? null,
    title: `${item.quote.ticker} · ${item.config.short} · ${item.config.name}`,
  }));
  const groups = buildOverviewTickerGroups({
    watchlistRows,
    deskSectors,
    tape,
  });
  const itemCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 overflow-hidden lg:bottom-0"
      data-testid="overview-ticker"
    >
      <div
        className="pointer-events-auto overflow-hidden border-t border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)]"
        role="region"
        aria-label="Watchlists, themes, and tape"
      >
        <div className="h-0.5 bg-[var(--ib-maroon-800)]" />
        {itemCount ? (
          <TickerRow
            duration={Math.max(36, itemCount * 3)}
            reducedMotion={reducedMotion}
            renderTrack={(clone) => (
              <Track
                groups={groups}
                clone={Boolean(clone)}
                selectedSymbol={selectedSymbol}
                onSelectSymbol={onSelectSymbol}
                onSelectTheme={onSelectTheme}
              />
            )}
          />
        ) : (
          <p className="px-3 py-2 font-mono text-[11px] text-[var(--ib-text-muted)]">
            Watchlists, themes, and tape are unavailable.
          </p>
        )}
      </div>
    </div>
  );
}
