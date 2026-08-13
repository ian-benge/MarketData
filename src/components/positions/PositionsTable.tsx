"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { PositionInspector } from "@/components/positions/PositionInspector";
import {
  SignedValue,
  SideLabel,
  Sparkline,
  formatEntryDate,
} from "@/components/positions/display";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import {
  formatCurrency,
  formatPrice,
  formatQuantity,
} from "@/lib/utils/format";
import type { DailyClose, EnrichedPosition } from "@/lib/positions/types";

type SortKey =
  | "ticker"
  | "side"
  | "marketValue"
  | "weight"
  | "dayPnl"
  | "totalPnl"
  | "realizedPnl"
  | "returnPercent"
  | "change1w"
  | "change1m"
  | "closeDate";

function numeric(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? Number.NEGATIVE_INFINITY
    : value;
}

function SortButton({
  label,
  active,
  descending,
  onClick,
  align = "right",
}: {
  label: string;
  active: boolean;
  descending: boolean;
  onClick: () => void;
  align?: "left" | "right";
}) {
  const Icon = descending ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
        active
          ? "text-[var(--ib-text-primary)]"
          : "text-[var(--ib-text-muted)] hover:text-[var(--ib-text-secondary)]",
        align === "right" && "ml-auto",
      )}
    >
      {label}
      {active ? <Icon aria-hidden="true" className="size-3" /> : null}
    </button>
  );
}

export function PositionsTable({
  rows,
  selectedId,
  onSelect,
  history,
  canEdit = true,
  onEdit,
  onClosePosition,
  closing = false,
  variant = "open",
  emptyMessage,
}: {
  rows: EnrichedPosition[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  history: Record<string, DailyClose[]>;
  canEdit?: boolean;
  onEdit: () => void;
  onClosePosition: (input: {
    closePrice: number;
    closeDate: string;
    quantity: number;
  }) => void;
  closing?: boolean;
  variant?: "open" | "closed";
  emptyMessage?: string;
}) {
  const closed = variant === "closed";
  const [sortKey, setSortKey] = useState<SortKey>(closed ? "closeDate" : "weight");
  const [descending, setDescending] = useState(true);
  const colSpan = closed ? 9 : 14;

  const sorted = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => {
      let result = 0;
      if (sortKey === "ticker") result = a.ticker.localeCompare(b.ticker);
      if (sortKey === "side") result = a.side.localeCompare(b.side);
      if (sortKey === "marketValue")
        result = numeric(a.marketValue) - numeric(b.marketValue);
      if (sortKey === "weight") result = numeric(a.weight) - numeric(b.weight);
      if (sortKey === "dayPnl") result = numeric(a.dayPnl) - numeric(b.dayPnl);
      if (sortKey === "totalPnl")
        result = numeric(a.totalPnl) - numeric(b.totalPnl);
      if (sortKey === "realizedPnl")
        result =
          numeric(closed ? a.realizedPnl : a.relatedRealizedPnl) -
          numeric(closed ? b.realizedPnl : b.relatedRealizedPnl);
      if (sortKey === "returnPercent")
        result = numeric(a.returnPercent) - numeric(b.returnPercent);
      if (sortKey === "change1w")
        result = numeric(a.change1w.pnl) - numeric(b.change1w.pnl);
      if (sortKey === "change1m")
        result = numeric(a.change1m.pnl) - numeric(b.change1m.pnl);
      if (sortKey === "closeDate")
        result = (a.closeDate ?? "").localeCompare(b.closeDate ?? "");
      return descending ? -result : result;
    });
    return next;
  }, [closed, descending, rows, sortKey]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) setDescending((value) => !value);
    else {
      setSortKey(next);
      setDescending(next !== "ticker" && next !== "side");
    }
  }

  function header(
    key: SortKey,
    label: string,
    align: "left" | "right" = "right",
    visibility?: string,
  ) {
    return (
      <th
        scope="col"
        aria-sort={
          sortKey === key ? (descending ? "descending" : "ascending") : "none"
        }
        className={cn(
          "sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium",
          align === "right" && "text-right",
          visibility ??
            (key === "weight" ||
            key === "change1w" ||
            key === "change1m" ||
            key === "returnPercent"
              ? "hidden xl:table-cell"
              : undefined),
        )}
      >
        <span className={cn("flex", align === "right" && "justify-end")}>
          <SortButton
            label={label}
            active={sortKey === key}
            descending={descending}
            onClick={() => toggleSort(key)}
            align={align}
          />
        </span>
      </th>
    );
  }

  return (
    <div
      className="w-full min-w-0 overflow-x-auto overscroll-x-contain terminal-scroll"
      tabIndex={0}
      role="region"
      aria-label={closed ? "Past positions table" : "Positions table"}
    >
      <table className="w-full min-w-0 border-collapse text-left text-[12px] tabular-nums md:min-w-[760px] xl:min-w-[1100px]">
        <caption className="sr-only">
          {closed
            ? "Closed lots with realized P&L and exit marks"
            : "Open lots with live marks, unrealized P&L, and realized trims"}
        </caption>
        <thead>
          <tr className="border-b border-[var(--ib-border-strong)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            {header("ticker", "Ticker", "left")}
            {header("side", "Side", "left", "hidden md:table-cell")}
            <th className="sticky top-0 z-10 hidden h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium md:table-cell">
              Qty
            </th>
            <th className="sticky top-0 z-10 hidden h-8 bg-[var(--ib-surface-2)] px-2.5 text-right font-medium md:table-cell">
              Entry
            </th>
            {closed ? (
              header("closeDate", "Exit")
            ) : (
              <th className="sticky top-0 z-10 h-8 bg-[var(--ib-surface-2)] px-2.5 text-right font-medium">
                Last
              </th>
            )}
            {closed ? null : header("marketValue", "Mkt value", "right", "hidden md:table-cell")}
            {closed ? null : header("weight", "Wt")}
            {closed ? null : header("dayPnl", "Day P&L")}
            {closed ? null : header("totalPnl", "Total P&L")}
            {header("realizedPnl", "Realized")}
            {header(
              "returnPercent",
              "Return",
              "right",
              closed ? "hidden md:table-cell" : "hidden xl:table-cell",
            )}
            {closed ? (
              <th className="sticky top-0 z-10 hidden h-8 bg-[var(--ib-surface-2)] px-2.5 text-right font-medium md:table-cell">
                Hold
              </th>
            ) : (
              <>
                {header("change1w", "1W")}
                {header("change1m", "1M")}
              </>
            )}
            <th className="sticky top-0 z-10 hidden h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium xl:table-cell">
              Path
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className="px-3 py-10 text-center text-[13px] text-[var(--ib-text-muted)]"
              >
                {emptyMessage ??
                  (closed
                    ? "No closed lots on this book."
                    : "No positions match the current filters.")}
              </td>
            </tr>
          ) : (
            sorted.map((row) => {
              const selected = row.id === selectedId;
              const detailId = `position-lot-${row.id}`;
              function toggle() {
                onSelect(selected ? null : row.id);
              }
              return (
                <Fragment key={row.id}>
                <tr
                  className={cn(
                    "cursor-pointer border-b border-[var(--ib-border-subtle)] hover:bg-[var(--ib-surface-hover)]",
                    selected && "bg-[var(--ib-surface-selected)]",
                  )}
                  onClick={toggle}
                >
                  <td className="h-[34px] px-2.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle();
                      }}
                      className="flex min-w-0 items-center gap-2 text-left"
                      aria-expanded={selected}
                      aria-controls={detailId}
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          "size-3.5 shrink-0 text-[var(--ib-text-muted)] transition-transform",
                          selected && "rotate-90 text-[var(--ib-maroon-300)]",
                        )}
                      />
                      <span>
                        <span className="block font-mono text-[13px] font-medium text-[var(--ib-text-primary)]">
                          {row.ticker}
                        </span>
                        <span className="block text-[10px] text-[var(--ib-text-muted)]">
                          <span className="md:hidden">
                            {row.side === "short" ? "Short · " : "Long · "}
                          </span>
                          {row.strategy || row.assetType}
                          {row.status === "closed" ? " · closed" : ""}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="hidden px-2.5 md:table-cell">
                    <SideLabel side={row.side} />
                  </td>
                  <td className="hidden px-2.5 font-mono md:table-cell">
                    {formatQuantity(row.quantity)}
                    {row.multiplier !== 1 ? (
                      <span className="text-[var(--ib-text-muted)]">
                        ×{formatQuantity(row.multiplier)}
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-2.5 text-right font-mono md:table-cell">
                    <div>{formatPrice(row.entryPrice, row.ticker)}</div>
                    <div className="text-[10px] text-[var(--ib-text-muted)]">
                      {formatEntryDate(row.entryDate)}
                    </div>
                  </td>
                  {closed ? (
                    <td className="px-2.5 text-right font-mono">
                      <div>{formatPrice(row.closePrice, row.ticker)}</div>
                      <div className="text-[10px] text-[var(--ib-text-muted)]">
                        {formatEntryDate(row.closeDate)}
                      </div>
                    </td>
                  ) : (
                    <td className="px-2.5 text-right font-mono">
                      {formatPrice(row.last, row.ticker)}
                      {row.quoteStale ? (
                        <Badge tone="warn" className="ml-1">
                          Stale
                        </Badge>
                      ) : null}
                    </td>
                  )}
                  {closed ? null : (
                    <td className="hidden px-2.5 text-right font-mono md:table-cell">
                      {formatCurrency(row.marketValue, { compact: true })}
                    </td>
                  )}
                  {closed ? null : (
                    <td className="hidden px-2.5 text-right font-mono xl:table-cell">
                      {row.weight == null ? "—" : `${row.weight.toFixed(1)}%`}
                    </td>
                  )}
                  {closed ? null : (
                    <td className="px-2.5 text-right">
                      <div>
                        <SignedValue value={row.dayPnl} compact />
                      </div>
                      <div className="text-[10px]">
                        <SignedValue value={row.dayPercent} kind="percent" />
                      </div>
                    </td>
                  )}
                  {closed ? null : (
                    <td className="px-2.5 text-right">
                      <div>
                        <SignedValue value={row.totalPnl} compact />
                      </div>
                      <div className="text-[10px]">
                        <SignedValue value={row.returnPercent} kind="percent" />
                      </div>
                    </td>
                  )}
                  <td className="px-2.5 text-right">
                    <div>
                      <SignedValue
                        value={closed ? row.realizedPnl : row.relatedRealizedPnl}
                        compact
                      />
                    </div>
                    <div className="text-[10px]">
                      <SignedValue
                        value={
                          closed ? row.returnPercent : row.relatedRealizedPercent
                        }
                        kind="percent"
                      />
                    </div>
                  </td>
                  <td className="hidden px-2.5 text-right xl:table-cell">
                    <SignedValue value={row.returnPercent} kind="percent" />
                  </td>
                  {closed ? (
                    <td className="hidden px-2.5 text-right font-mono md:table-cell">
                      {row.holdingDays == null ? "—" : `${row.holdingDays}d`}
                    </td>
                  ) : (
                    <>
                      <td className="hidden px-2.5 text-right xl:table-cell">
                        <SignedValue value={row.change1w.percent} kind="percent" />
                      </td>
                      <td className="hidden px-2.5 text-right xl:table-cell">
                        <SignedValue value={row.change1m.percent} kind="percent" />
                      </td>
                    </>
                  )}
                  <td className="hidden px-2.5 xl:table-cell">
                    <Sparkline
                      values={row.sparkline}
                      label={`${row.ticker} cumulative P&L path`}
                    />
                  </td>
                </tr>
                {selected ? (
                  <tr className="border-b border-[var(--ib-border-subtle)] last:border-b-0">
                    <td colSpan={colSpan} className="p-0" id={detailId}>
                      <PositionInspector
                        row={row}
                        history={history[row.ticker.toUpperCase()] ?? []}
                        onClose={() => onSelect(null)}
                        onEdit={onEdit}
                        onClosePosition={onClosePosition}
                        closing={closing}
                        canEdit={canEdit}
                      />
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
