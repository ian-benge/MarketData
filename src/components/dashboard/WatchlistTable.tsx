"use client";

import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import type {
  DashboardWatchlistRow,
  DashboardWatchlistSnapshot,
} from "@/lib/market-data/watchlist-types";
import { cn } from "@/lib/utils/cn";
import {
  formatCompactCurrency,
  formatPrice,
  formatRelativeVolume,
  formatSignedPercent,
  formatVolume,
  marketTone,
} from "@/lib/utils/format";

type SortKey =
  | "list"
  | "symbol"
  | "last"
  | "change1d"
  | "changeOpen"
  | "change1w"
  | "rvol"
  | "marketCap"
  | "volume";

function numeric(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? Number.NEGATIVE_INFINITY : value;
}

function ToneIcon({ value }: { value: number | null }) {
  const tone = marketTone(value);
  const Icon =
    tone === "positive" ? ArrowUpRight : tone === "negative" ? ArrowDownRight : ArrowRight;
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "size-3",
        tone === "positive"
          ? "text-[var(--market-positive)]"
          : tone === "negative"
            ? "text-[var(--market-negative)]"
            : "text-[var(--market-unchanged)]",
      )}
    />
  );
}

function percentCell(value: number | null) {
  const tone = marketTone(value);
  return (
    <td
      className={cn(
        "px-3 text-right font-mono",
        tone === "positive"
          ? "text-[var(--market-positive)]"
          : tone === "negative"
            ? "text-[var(--market-negative)]"
            : "text-[var(--market-unchanged)]",
      )}
    >
      {formatSignedPercent(value)}
    </td>
  );
}

export function WatchlistTable({
  data,
  onSelectSymbol,
  onSelectList,
}: {
  data: DashboardWatchlistSnapshot | null | undefined;
  onSelectSymbol?: (ticker: string) => void;
  onSelectList?: (listId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("list");
  const [descending, setDescending] = useState(false);
  const rows = data?.rows;

  const sorted = useMemo(() => {
    const next = [...(rows ?? [])];
    if (sortKey === "list") return descending ? next.reverse() : next;
    next.sort((a, b) => {
      let result = 0;
      if (sortKey === "symbol") result = a.ticker.localeCompare(b.ticker);
      if (sortKey === "last") result = numeric(a.last) - numeric(b.last);
      if (sortKey === "change1d") result = numeric(a.change1dPercent) - numeric(b.change1dPercent);
      if (sortKey === "changeOpen") {
        result = numeric(a.changeFromOpenPercent) - numeric(b.changeFromOpenPercent);
      }
      if (sortKey === "change1w") result = numeric(a.change1wPercent) - numeric(b.change1wPercent);
      if (sortKey === "rvol") result = numeric(a.relativeVolume) - numeric(b.relativeVolume);
      if (sortKey === "marketCap") result = numeric(a.marketCap) - numeric(b.marketCap);
      if (sortKey === "volume") result = numeric(a.volume) - numeric(b.volume);
      return descending ? -result : result;
    });
    return next;
  }, [descending, rows, sortKey]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) setDescending((value) => !value);
    else {
      setSortKey(next);
      setDescending(next !== "symbol");
    }
  }

  const SortIcon = descending ? ArrowDown : ArrowUp;

  return (
    <Panel
      title="Watchlist"
      description={
        data
          ? `${data.listName} · price, 1d, from open, 1w, rvol, cap, volume`
          : "Configured names with session and weekly context"
      }
      bodyClassName="p-0"
      actions={
        <div className="flex flex-wrap items-center gap-1">
          {(data?.lists ?? []).map((list) => (
            <button
              key={list.id}
              type="button"
              onClick={() => onSelectList?.(list.id)}
              aria-pressed={data?.listId === list.id}
              className={cn(
                "inline-flex h-7 items-center rounded-[3px] border px-2 font-mono text-[10px]",
                data?.listId === list.id
                  ? "border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
                  : "border-[var(--ib-border-subtle)] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
              )}
            >
              {list.name}
            </button>
          ))}
        </div>
      }
    >
      <div
        className="w-full min-w-0 overflow-x-auto terminal-scroll"
        tabIndex={0}
        role="region"
        aria-label="Watchlist table"
      >
        <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
          <caption className="sr-only">
            Watchlist rows with last price, one-day change, change from open, one-week
            change, relative volume, market cap, and session volume. Select a symbol to
            inspect its chart.
          </caption>
          <thead>
            <tr className="border-b border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              {(
                [
                  ["symbol", "Symbol", "left"],
                  ["last", "Price", "right"],
                  ["change1d", "1d %", "right"],
                  ["changeOpen", "Open %", "right"],
                  ["change1w", "1w %", "right"],
                  ["rvol", "Rvol", "right"],
                  ["marketCap", "Mkt cap", "right"],
                  ["volume", "Volume", "right"],
                ] as const
              ).map(([key, label, align]) => (
                <th
                  key={key}
                  scope="col"
                  aria-sort={
                    sortKey === key ? (descending ? "descending" : "ascending") : "none"
                  }
                  className={cn(
                    "h-8 px-3 font-medium",
                    align === "right" && "text-right",
                    key === "symbol" && "w-24",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    aria-pressed={sortKey === key}
                    className="inline-flex items-center gap-1 uppercase tracking-[0.08em]"
                  >
                    {label}
                    {sortKey === key ? <SortIcon aria-hidden="true" className="size-3" /> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length ? (
              sorted.map((row) => (
                <WatchlistRow
                  key={row.ticker}
                  row={row}
                  onSelectSymbol={onSelectSymbol}
                />
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-10 text-center text-[13px] text-[var(--ib-text-muted)]"
                >
                  {data?.error ?? "No watchlist names are configured."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[var(--ib-border-subtle)] px-3 py-2 text-[10px] leading-4 text-[var(--ib-text-muted)]">
        1d is vs prior close. Open % is vs the session open. 1w is vs the close five
        sessions ago. RVOL is session volume / 10-day average. Missing fields stay —.
        {data?.usingFixtures ? " DEMO fixture watchlist." : ""}
        {data?.stale ? " Yahoo enrichment is stale." : ""}
        {data?.error ? ` ${data.error}` : ""}
      </p>
    </Panel>
  );
}

function WatchlistRow({
  row,
  onSelectSymbol,
}: {
  row: DashboardWatchlistRow;
  onSelectSymbol?: (ticker: string) => void;
}) {
  return (
    <tr className="border-b border-[var(--ib-border-subtle)] last:border-0 hover:bg-[var(--ib-surface-hover)]">
      <td className="h-9 px-3">
        <button
          type="button"
          onClick={() => onSelectSymbol?.(row.ticker)}
          className="inline-flex items-center gap-1.5 font-mono font-medium text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
          aria-label={`Inspect ${row.ticker} chart`}
        >
          {row.ticker}
          <ToneIcon value={row.change1dPercent} />
        </button>
      </td>
      <td className="px-3 text-right font-mono text-[var(--ib-text-primary)]">
        {formatPrice(row.last, row.ticker)}
      </td>
      {percentCell(row.change1dPercent)}
      {percentCell(row.changeFromOpenPercent)}
      {percentCell(row.change1wPercent)}
      <td className="px-3 text-right font-mono text-[var(--ib-text-secondary)]">
        {formatRelativeVolume(row.relativeVolume)}
      </td>
      <td className="px-3 text-right font-mono text-[var(--ib-text-secondary)]">
        {formatCompactCurrency(row.marketCap)}
      </td>
      <td className="px-3 text-right font-mono text-[var(--ib-text-secondary)]">
        {formatVolume(row.volume)}
      </td>
    </tr>
  );
}
