"use client";

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { PositionInspector } from "@/components/positions/PositionInspector";
import {
  MoneyValue,
  PriceValue,
  ShareValue,
  SignedValue,
  SideLabel,
  Sparkline,
  TickerLabel,
  formatEntryDate,
} from "@/components/positions/display";
import {
  CLOSED_PAGE_SIZE_STORAGE_KEY,
  DEFAULT_CLOSED_PAGE_SIZE,
  DEFAULT_TABLE_PAGE_SIZE,
  paginate,
  type TablePageSize,
  TABLE_PAGE_SIZES,
} from "@/components/positions/pagination";
import { TablePager } from "@/components/positions/TablePager";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import { formatQuantity } from "@/lib/utils/format";
import { groupLotsForBlotter } from "@/lib/positions/lot-groups";
import { displayPositionTicker } from "@/lib/positions/option-symbol";
import { isResidualBookLot } from "@/lib/positions/residual";
import type { DailyClose, EnrichedPosition } from "@/lib/positions/types";

type SortKey =
  | "ticker"
  | "side"
  | "quantity"
  | "marketValue"
  | "weight"
  | "dayPnl"
  | "totalPnl"
  | "realizedPnl"
  | "returnPercent"
  | "change1w"
  | "change1m"
  | "entryDate"
  | "closeDate"
  | "mark"
  | "closePrice";

function readClosedPageSize(): TablePageSize {
  if (typeof window === "undefined") return DEFAULT_CLOSED_PAGE_SIZE;
  try {
    const raw = Number(window.localStorage.getItem(CLOSED_PAGE_SIZE_STORAGE_KEY));
    return TABLE_PAGE_SIZES.includes(raw as TablePageSize)
      ? (raw as TablePageSize)
      : DEFAULT_CLOSED_PAGE_SIZE;
  } catch {
    return DEFAULT_CLOSED_PAGE_SIZE;
  }
}

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
  privacy = "full",
  emptyMessage,
  groupFills = false,
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
  privacy?: "full" | "tape";
  emptyMessage?: string;
  groupFills?: boolean;
}) {
  const closed = variant === "closed";
  const tape = privacy === "tape";
  const pageSizeId = useId();
  const [sortKey, setSortKey] = useState<SortKey>(
    tape ? "dayPnl" : closed ? "closeDate" : "weight",
  );
  const [descending, setDescending] = useState(true);
  const [pageSize, setPageSize] = useState<TablePageSize>(
    closed ? DEFAULT_CLOSED_PAGE_SIZE : DEFAULT_TABLE_PAGE_SIZE,
  );
  const [page, setPage] = useState(1);
  const [wide, setWide] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const colSpan = tape ? 7 : closed ? 10 : 13;

  useEffect(() => {
    if (!closed) return;
    setPageSize(readClosedPageSize());
  }, [closed]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && selectedId) onSelect(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect, selectedId]);

  const groups = useMemo(
    () =>
      groupFills && closed
        ? groupLotsForBlotter(rows)
        : rows.map((row) => ({ id: row.id, key: row.id, row, fills: [row] })),
    [closed, groupFills, rows],
  );

  const sortedGroups = useMemo(() => {
    const next = [...groups];
    next.sort((left, right) => {
      const a = left.row;
      const b = right.row;
      let result = 0;
      if (sortKey === "ticker")
        result = displayPositionTicker(a.ticker).localeCompare(
          displayPositionTicker(b.ticker),
        );
      if (sortKey === "side") result = a.side.localeCompare(b.side);
      if (sortKey === "quantity") result = a.quantity - b.quantity;
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
      if (sortKey === "mark") result = numeric(a.mark) - numeric(b.mark);
      if (sortKey === "closePrice")
        result = numeric(a.closePrice) - numeric(b.closePrice);
      if (sortKey === "entryDate")
        result = (a.entryDate ?? "").localeCompare(b.entryDate ?? "");
      if (sortKey === "closeDate") {
        result = (a.closeDate ?? "").localeCompare(b.closeDate ?? "");
        if (result === 0) {
          result = (a.closedAt ?? "").localeCompare(b.closedAt ?? "");
        }
        if (result === 0) result = a.id.localeCompare(b.id);
      }
      return descending ? -result : result;
    });
    return next;
  }, [closed, descending, groups, sortKey]);

  const pagedGroups = paginate(sortedGroups, page, pageSize);
  const visibleGroups = closed ? pagedGroups.items : sortedGroups;
  const selectedRow =
    rows.find((row) => row.id === selectedId) ??
    groups.find((group) => group.id === selectedId)?.row ??
    null;

  useEffect(() => {
    setPage(1);
  }, [pageSize, sortKey, descending, rows.length]);

  function changePageSize(next: TablePageSize) {
    setPageSize(next);
    if (closed) {
      try {
        window.localStorage.setItem(CLOSED_PAGE_SIZE_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
    }
  }

  function toggleSort(next: SortKey) {
    if (sortKey === next) setDescending((value) => !value);
    else {
      setSortKey(next);
      setDescending(next !== "ticker" && next !== "side");
    }
    setPage(1);
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
          "sticky top-0 z-10 h-8 whitespace-nowrap bg-[var(--ib-surface-2)] px-2.5 font-medium",
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

  const paneInspector =
    wide && selectedRow ? (
      <aside className="sticky top-24 hidden w-[min(100%,24rem)] shrink-0 border-l border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] xl:block">
        <PositionInspector
          key={`${selectedRow.id}:${selectedRow.last}:${selectedRow.entryPrice}:${selectedRow.quantity}`}
          row={selectedRow}
          history={history[selectedRow.ticker.toUpperCase()] ?? []}
          onClose={() => onSelect(null)}
          onEdit={onEdit}
          onClosePosition={onClosePosition}
          closing={closing}
          canEdit={canEdit && selectedRow.source !== "snaptrade" && !tape}
          privacy={privacy}
        />
      </aside>
    ) : null;

  return (
    <div className={wide ? "xl:flex xl:items-start" : undefined}>
    <div className="min-w-0 flex-1">
    <div
      className="w-full min-w-0 overflow-x-auto overscroll-x-contain terminal-scroll"
      tabIndex={0}
      role="region"
      aria-label={closed ? "Past positions table" : "Positions table"}
    >
      <table
        className={cn(
          "w-full min-w-[640px] border-collapse text-left text-[12px] tabular-nums",
          tape ? "md:min-w-[680px]" : "md:min-w-[760px] xl:min-w-[1100px]",
        )}
      >
        <caption className="sr-only">
          {tape
            ? "Open lots with live marks, day P&L, and open P&L"
            : closed
              ? "Closed lots with realized P&L and exit marks"
              : "Open lots with live marks, unrealized P&L, and realized trims"}
        </caption>
        <thead>
          <tr className="border-b border-[var(--ib-border-strong)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            {header("ticker", "Ticker", "left")}
            {header("side", "Side", "left", "hidden md:table-cell")}
            {header("quantity", "Qty", "left", "hidden md:table-cell")}
            {closed ? header("entryDate", "Date entered", "left") : null}
            <th className="sticky top-0 z-10 hidden h-8 bg-[var(--ib-surface-2)] px-2.5 text-right font-medium md:table-cell">
              Entry
            </th>
            {closed ? header("closeDate", "Date closed", "left") : null}
            {closed
              ? header("closePrice", "Exit")
              : header("mark", "Last")}
            {tape || closed ? null : header("marketValue", "Mkt value", "right", "hidden md:table-cell")}
            {tape || closed ? null : header("weight", "Wt")}
            {closed ? null : header("dayPnl", "Day P&L")}
            {closed ? null : header("totalPnl", "Total P&L")}
            {tape ? null : header("realizedPnl", "Realized")}
            {tape ? null : closed ? (
              <th className="sticky top-0 z-10 hidden h-8 bg-[var(--ib-surface-2)] px-2.5 text-right font-medium md:table-cell">
                Hold
              </th>
            ) : (
              <>
                {header("change1w", "1W")}
                {header("change1m", "1M")}
              </>
            )}
            {tape ? null : (
              <th className="sticky top-0 z-10 hidden h-8 bg-[var(--ib-surface-2)] px-2.5 font-medium xl:table-cell">
                Path
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleGroups.length === 0 ? (
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
            visibleGroups.map((group) => {
              const row = group.row;
              const fillCount = group.fills.length;
              const expanded = expandedGroups.has(group.id);
              const selected =
                selectedId === row.id ||
                selectedId === group.id ||
                group.fills.some((fill) => fill.id === selectedId);
              const inspectTarget =
                group.fills.find((fill) => fill.id === selectedId) ??
                (selectedId === group.id || selectedId === row.id ? row : null);
              const detailId = `position-lot-${row.id}`;
              function toggle() {
                onSelect(selected && inspectTarget?.id === row.id ? null : row.id);
              }
              function onRowKey(event: ReactKeyboardEvent<HTMLTableRowElement>) {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle();
                }
              }
              return (
                <Fragment key={group.id}>
                <tr
                  tabIndex={0}
                  className={cn(
                    "cursor-pointer border-b border-[var(--ib-border-subtle)] hover:bg-[var(--ib-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ib-maroon-500)]",
                    selected && inspectTarget?.id === row.id && "bg-[var(--ib-surface-selected)]",
                  )}
                  onClick={toggle}
                  onKeyDown={onRowKey}
                >
                  <td className="whitespace-nowrap px-2.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle();
                      }}
                      className="flex items-center gap-2 text-left"
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
                      <span className="whitespace-nowrap">
                        <TickerLabel ticker={row.ticker} />
                        {!closed && isResidualBookLot(row) ? (
                          <Badge tone="neutral" className="ml-1">
                            Residual
                          </Badge>
                        ) : null}
                        <span className="block whitespace-nowrap text-[10px] text-[var(--ib-text-muted)]">
                          <span className="md:hidden">
                            {row.side === "short" ? "Short · " : "Long · "}
                          </span>
                          {fillCount > 1 ? `${fillCount} fills · ` : ""}
                          {row.source === "snaptrade"
                            ? row.brokerageName || "Brokerage"
                            : row.strategy || row.assetType}
                          {row.status === "closed" ? " · closed" : ""}
                        </span>
                      </span>
                    </button>
                    {fillCount > 1 ? (
                      <button
                        type="button"
                        className="ml-6 text-[10px] text-[var(--ib-text-muted)] underline-offset-2 hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedGroups((current) => {
                            const next = new Set(current);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          });
                        }}
                      >
                        {expanded ? "Hide fills" : `Show ${fillCount} fills`}
                      </button>
                    ) : null}
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
                  {closed ? (
                    <td className="whitespace-nowrap px-2.5 font-mono text-[var(--ib-text-secondary)]">
                      {formatEntryDate(row.entryDate)}
                    </td>
                  ) : null}
                  <td className="hidden px-2.5 text-right md:table-cell">
                    <PriceValue value={row.entryPrice} ticker={row.ticker} />
                    {closed ? null : (
                      <div className="text-[10px] text-[var(--ib-text-muted)]">
                        {formatEntryDate(row.entryDate)}
                      </div>
                    )}
                  </td>
                  {closed ? (
                    <td className="whitespace-nowrap px-2.5 font-mono text-[var(--ib-text-secondary)]">
                      {formatEntryDate(row.closeDate)}
                    </td>
                  ) : null}
                  {closed ? (
                    <td className="px-2.5 text-right">
                      <PriceValue
                        value={row.closePrice ?? row.mark}
                        ticker={row.ticker}
                      />
                    </td>
                  ) : (
                    <td className="px-2.5 text-right">
                      <PriceValue value={row.last} ticker={row.ticker} />
                      {row.quoteStale ? (
                        <Badge tone="warn" className="ml-1">
                          Stale
                        </Badge>
                      ) : null}
                    </td>
                  )}
                  {tape ? null : closed ? null : (
                    <td className="hidden px-2.5 text-right font-mono md:table-cell">
                      <MoneyValue value={row.marketValue} compact />
                    </td>
                  )}
                  {tape ? null : closed ? null : (
                    <td className="hidden px-2.5 text-right font-mono xl:table-cell">
                      <ShareValue value={row.weight} />
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
                  {tape ? null : (
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
                  )}
                  {tape ? null : closed ? (
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
                  {tape ? null : (
                    <td className="hidden px-2.5 xl:table-cell">
                      <Sparkline
                        values={row.sparkline}
                        label={`${displayPositionTicker(row.ticker)} cumulative P&L path`}
                      />
                    </td>
                  )}
                </tr>
                {expanded && fillCount > 1
                  ? group.fills.map((fill) => (
                      <tr
                        key={fill.id}
                        tabIndex={0}
                        className={cn(
                          "cursor-pointer border-b border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] hover:bg-[var(--ib-surface-hover)]",
                          selectedId === fill.id && "bg-[var(--ib-surface-selected)]",
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(fill.id === selectedId ? null : fill.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelect(fill.id === selectedId ? null : fill.id);
                          }
                        }}
                      >
                        <td className="h-[30px] px-2.5 pl-10 font-mono text-[11px] text-[var(--ib-text-muted)]">
                          Fill · {formatQuantity(fill.quantity)}
                        </td>
                        <td className="hidden px-2.5 md:table-cell" />
                        <td className="hidden px-2.5 font-mono text-[11px] md:table-cell">
                          {formatQuantity(fill.quantity)}
                        </td>
                        {closed ? (
                          <td className="px-2.5 font-mono text-[11px] text-[var(--ib-text-muted)]">
                            {formatEntryDate(fill.entryDate)}
                          </td>
                        ) : null}
                        <td className="hidden px-2.5 text-right md:table-cell">
                          <PriceValue value={fill.entryPrice} ticker={fill.ticker} />
                        </td>
                        {closed ? (
                          <td className="px-2.5 font-mono text-[11px] text-[var(--ib-text-muted)]">
                            {formatEntryDate(fill.closeDate)}
                          </td>
                        ) : null}
                        <td className="px-2.5 text-right">
                          <PriceValue
                            value={
                              closed ? (fill.closePrice ?? fill.mark) : fill.last
                            }
                            ticker={fill.ticker}
                          />
                        </td>
                        {tape || closed ? null : <td className="hidden md:table-cell" />}
                        {tape || closed ? null : <td className="hidden xl:table-cell" />}
                        {closed ? null : <td />}
                        {closed ? null : <td />}
                        {tape ? null : (
                          <td className="px-2.5 text-right">
                            <SignedValue
                              value={closed ? fill.realizedPnl : fill.totalPnl}
                              compact
                            />
                          </td>
                        )}
                        {tape ? null : closed ? (
                          <td className="hidden md:table-cell" />
                        ) : (
                          <>
                            <td className="hidden xl:table-cell" />
                            <td className="hidden xl:table-cell" />
                          </>
                        )}
                        {tape ? null : <td className="hidden xl:table-cell" />}
                      </tr>
                    ))
                  : null}
                {inspectTarget && !wide ? (
                  <tr className="border-b border-[var(--ib-border-subtle)] last:border-b-0 xl:hidden">
                    <td colSpan={colSpan} className="p-0" id={detailId}>
                      <PositionInspector
                        key={`${inspectTarget.id}:${inspectTarget.last}:${inspectTarget.entryPrice}:${inspectTarget.quantity}`}
                        row={inspectTarget}
                        history={history[inspectTarget.ticker.toUpperCase()] ?? []}
                        onClose={() => onSelect(null)}
                        onEdit={onEdit}
                        onClosePosition={onClosePosition}
                        closing={closing}
                        canEdit={canEdit && inspectTarget.source !== "snaptrade" && !tape}
                        privacy={privacy}
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
    {closed ? (
      <TablePager
        total={sortedGroups.length}
        page={page}
        pageSize={pageSize}
        pageSizeId={pageSizeId}
        navLabel="Past positions pages"
        pageSizeLabel="Past positions per page"
        onPageChange={setPage}
        onPageSizeChange={changePageSize}
      />
    ) : null}
    </div>
    {paneInspector}
    </div>
  );
}
