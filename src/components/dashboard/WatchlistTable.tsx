"use client";

import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Panel } from "@/components/ui/Panel";
import { EmptyHint } from "@/components/ui/StatePanel";
import { WhyMovingBadge } from "@/components/news/WhyMovingBadge";
import { MoveNarrativeLoader } from "@/components/intel/MoveNarrativeLoader";
import type { MoveExplanation } from "@/lib/intelligence/types";
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
  marketToneClass,
} from "@/lib/utils/format";
import { RVOL_FLAG_THRESHOLD } from "@/lib/watchlists/analytics";

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
  return (
    <td className={cn("px-3 text-right font-mono", marketToneClass(value))}>
      {formatSignedPercent(value)}
    </td>
  );
}

export function WatchlistTable({
  data,
  onSelectSymbol,
  onSelectList,
  inBookTickers,
  selectedSymbol,
  explanations,
}: {
  data: DashboardWatchlistSnapshot | null | undefined;
  onSelectSymbol?: (ticker: string) => void;
  onSelectList?: (listId: string) => void;
  inBookTickers?: readonly string[];
  selectedSymbol?: string;
  explanations?: MoveExplanation[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rvol");
  const [descending, setDescending] = useState(true);
  const rows = data?.rows;
  const inBook = useMemo(
    () => new Set((inBookTickers ?? []).map((ticker) => ticker.toUpperCase())),
    [inBookTickers],
  );
  const whyByTicker = useMemo(() => {
    const map = new Map<string, MoveExplanation>();
    for (const row of explanations ?? []) map.set(row.ticker.toUpperCase(), row);
    return map;
  }, [explanations]);
  const manageHref = data?.listId
    ? `/watchlists?listId=${encodeURIComponent(data.listId)}`
    : "/watchlists";

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
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
          <div className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto terminal-scroll">
            {(data?.lists ?? []).map((list) => (
              <ChipToggle
                key={list.id}
                onClick={() => onSelectList?.(list.id)}
                pressed={data?.listId === list.id}
                className="normal-case tracking-[0.04em]"
              >
                {list.visibility === "personal" ? (
                  <span className="text-[var(--ib-maroon-300)]">Personal</span>
                ) : null}
                {list.name}
              </ChipToggle>
            ))}
          </div>
          <Link
            href={manageHref}
            className={buttonStyles({
              variant: "ghost",
              size: "sm",
              className: "h-7 px-2 text-[10px]",
            })}
          >
            Manage lists
          </Link>
        </div>
      }
    >
      <div
        className="w-full min-w-0 overflow-x-auto xl:max-h-[min(32rem,calc(100dvh-14rem))] xl:overflow-y-auto terminal-scroll"
        tabIndex={0}
        role="region"
        aria-label="Watchlist table"
      >
        <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
          <caption className="sr-only">
            Watchlist rows with last price, one-day change, change from open, one-week
            change, relative volume, market cap, and session volume. Select a symbol to
            highlight it across the overview.
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
                    "sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-3 font-medium",
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
              <th className="sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-3 font-medium">
                Why
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length ? (
              sorted.map((row) => (
                <WatchlistRow
                  key={row.ticker}
                  row={row}
                  onSelectSymbol={onSelectSymbol}
                  inBook={inBook.has(row.ticker.toUpperCase())}
                  selected={selectedSymbol?.toUpperCase() === row.ticker.toUpperCase()}
                  explanation={whyByTicker.get(row.ticker.toUpperCase())}
                />
              ))
            ) : (
              <tr>
                <td colSpan={9}>
                  <EmptyHint className="py-10">
                    {data?.error ?? "No watchlists are configured."}{" "}
                    <Link
                      href="/watchlists"
                      className="text-[var(--ib-maroon-300)] hover:underline"
                    >
                      Open Watchlists & Sectors
                    </Link>
                  </EmptyHint>
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
      {selectedSymbol ? (
        <div className="border-t border-[var(--ib-border-subtle)] px-3 py-2">
          <MoveNarrativeLoader
            ticker={selectedSymbol}
            explanation={whyByTicker.get(selectedSymbol.toUpperCase())}
          />
        </div>
      ) : null}
    </Panel>
  );
}

function WatchlistRow({
  row,
  onSelectSymbol,
  inBook,
  selected,
  explanation,
}: {
  row: DashboardWatchlistRow;
  onSelectSymbol?: (ticker: string) => void;
  inBook?: boolean;
  selected?: boolean;
  explanation?: MoveExplanation;
}) {
  const abnormalRvol =
    row.relativeVolume != null && row.relativeVolume >= RVOL_FLAG_THRESHOLD;
  return (
    <tr
      className={cn(
        "border-b border-[var(--ib-border-subtle)] last:border-0 hover:bg-[var(--ib-surface-hover)]",
        onSelectSymbol && "cursor-pointer",
        selected && "bg-[var(--ib-surface-selected)]",
        abnormalRvol && !selected && "bg-[color-mix(in_oklab,var(--state-warning)_6%,transparent)]",
      )}
      onClick={() => onSelectSymbol?.(row.ticker)}
    >
      <td className="h-9 px-3">
        <button
          type="button"
          onClick={() => onSelectSymbol?.(row.ticker)}
          className="inline-flex min-h-8 max-sm:min-h-11 items-center gap-1.5 font-mono font-medium text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
          aria-current={selected ? "true" : undefined}
          aria-label={`Select ${row.ticker}`}
        >
          {row.ticker}
          <ToneIcon value={row.change1dPercent} />
          {abnormalRvol ? <Badge tone="warn">Abn RVOL</Badge> : null}
          {inBook ? <Badge tone="info">In book</Badge> : null}
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
      <td className="max-w-[14rem] px-3">
        <WhyMovingBadge
          explanation={explanation}
          compact
          href={`/news?q=${encodeURIComponent(`why is ${row.ticker} moving today`)}`}
        />
      </td>
    </tr>
  );
}
