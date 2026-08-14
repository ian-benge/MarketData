"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PositionPriceChart } from "@/components/positions/PositionPriceChart";
import {
  ASSET_TYPE_LABELS,
  MoneyValue,
  PriceValue,
  ShareValue,
  SignedValue,
  chicagoDateInput,
  formatEntryDate,
} from "@/components/positions/display";
import { ClientMarketTime } from "@/components/ui/ClientMarketTime";
import { formatQuantity } from "@/lib/utils/format";
import { displayPositionTicker, parseOccOptionSymbol } from "@/lib/positions/option-symbol";
import type { DailyClose, EnrichedPosition } from "@/lib/positions/types";

function Metric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {label}
      </p>
      <div className="mt-0.5 font-mono text-[12px] tabular-nums">{children}</div>
    </div>
  );
}

function canFetchDailyBars(row: EnrichedPosition): boolean {
  if (row.status === "closed") return false;
  if (row.assetType === "option") return false;
  if (parseOccOptionSymbol(row.ticker)) return false;
  if (row.ticker.length > 16) return false;
  return true;
}

function closesFromBars(bars: unknown): DailyClose[] {
  if (!Array.isArray(bars)) return [];
  const out: DailyClose[] = [];
  for (const bar of bars) {
    if (!bar || typeof bar !== "object") continue;
    const rec = bar as { barStart?: string; close?: number | null };
    if (rec.close == null || !Number.isFinite(rec.close) || !rec.barStart) continue;
    out.push({ date: rec.barStart.slice(0, 10), close: rec.close });
  }
  return out;
}

export function PositionInspector({
  row,
  history,
  onClose,
  onEdit,
  onClosePosition,
  closing,
  canEdit = true,
  privacy = "full",
}: {
  row: EnrichedPosition;
  history: DailyClose[];
  onClose: () => void;
  onEdit: () => void;
  onClosePosition: (input: {
    closePrice: number;
    closeDate: string;
    quantity: number;
  }) => void;
  closing: boolean;
  canEdit?: boolean;
  privacy?: "full" | "tape";
}) {
  const headingId = useId();
  const [confirmClose, setConfirmClose] = useState(false);
  const [closePrice, setClosePrice] = useState(
    row.status === "closed"
      ? (row.closePrice ?? row.mark ?? row.entryPrice)
      : (row.last ?? row.entryPrice),
  );
  const [closeDate, setCloseDate] = useState(chicagoDateInput());
  const [closeQuantity, setCloseQuantity] = useState(row.quantity);
  const [liveHistory, setLiveHistory] = useState<DailyClose[]>(history);
  const [loadingBars, setLoadingBars] = useState(
    canFetchDailyBars(row) && history.length < 2,
  );
  const tape = privacy === "tape";
  const closed = row.status === "closed";
  const occ = parseOccOptionSymbol(row.ticker);
  const closedOption = closed && (row.assetType === "option" || Boolean(occ));
  const fetchBars = canFetchDailyBars(row);

  useEffect(() => {
    setLiveHistory(history);
    if (!fetchBars || history.length >= 2) {
      setLoadingBars(false);
      return;
    }
    let cancelled = false;
    setLoadingBars(true);
    const params = new URLSearchParams({
      symbol: row.ticker,
      interval: "1d",
      limit: "252",
      surface: "derived_charts",
    });
    void fetch(`/api/market/bars?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { bars?: unknown } | null) => {
        if (cancelled) return;
        const closes = closesFromBars(payload?.bars);
        if (closes.length) setLiveHistory(closes);
        setLoadingBars(false);
      })
      .catch(() => {
        if (!cancelled) setLoadingBars(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchBars, history, row.ticker]);

  const closes = tape ? [] : liveHistory.filter((bar) => Number.isFinite(bar.close));
  const exitPrice = row.closePrice ?? row.mark;

  return (
    <section
      aria-label={`${row.ticker} lot blotter`}
      className="bg-[var(--ib-surface-inset)] px-3 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ib-maroon-300)]">
            Lot blotter
          </p>
          <h3 id={headingId} className="mt-0.5 text-[13px] font-semibold">
            <span title={occ ? occ.raw : row.ticker}>
              {displayPositionTicker(row.ticker)}
            </span>{" "}
            <span className="font-normal text-[var(--ib-text-muted)]">
              {ASSET_TYPE_LABELS[row.assetType]}
              {row.source === "snaptrade"
                ? ` · ${row.brokerageName || "Brokerage"}`
                : row.strategy
                  ? ` · ${row.strategy}`
                  : ""}
              {!tape && row.holdingDays != null ? ` · ${row.holdingDays}d held` : ""}
            </span>
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.status === "open" && canEdit ? (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
                Edit
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setConfirmClose(true)}
                disabled={confirmClose}
              >
                Close position
              </Button>
            </>
          ) : row.source === "snaptrade" ? (
            <Badge tone="brand">
              {row.externalId?.startsWith("hist:")
                ? "Imported history"
                : "Brokerage lot"}
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="min-h-8 rounded-[3px] border border-[var(--ib-border-subtle)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
            aria-label="Collapse row"
          >
            Collapse
          </button>
        </div>
      </div>

      <div
        className={
          tape
            ? "mt-3"
            : "mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
        }
      >
        {tape ? null : (
        <div className="min-w-0">
          {closedOption ? (
            <div className="grid h-[168px] place-items-center rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] px-4 text-center text-[12px] text-[var(--ib-text-muted)]">
              No live series for a closed option fill.
            </div>
          ) : closes.length >= 2 ? (
            <PositionPriceChart
              ticker={row.ticker}
              closes={closes}
              entryPrice={row.entryPrice}
              side={row.side}
              className="h-[168px]"
            />
          ) : loadingBars ? (
            <div className="grid h-[168px] place-items-center rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] text-[12px] text-[var(--ib-text-muted)]">
              Loading daily series…
            </div>
          ) : (
            <div className="grid h-[168px] place-items-center rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] text-[12px] text-[var(--ib-text-muted)]">
              Daily series unavailable for {row.ticker}.
            </div>
          )}
        </div>
        )}
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
            {closed ? (
              <Metric label="Exit">
                <PriceValue value={exitPrice} ticker={row.ticker} />
              </Metric>
            ) : (
              <Metric label="Last">
                <PriceValue value={row.last} ticker={row.ticker} />
              </Metric>
            )}
            <Metric label="Entry">
              <PriceValue value={row.entryPrice} ticker={row.ticker} />
            </Metric>
            <Metric label="Qty">
              {formatQuantity(row.quantity)}
              {row.multiplier !== 1 ? ` × ${formatQuantity(row.multiplier)}` : ""}
            </Metric>
            {tape ? (
              <>
                <Metric label="Day P&L">
                  <SignedValue value={row.dayPnl} compact />
                  <span className="ml-1 text-[11px]">
                    <SignedValue value={row.dayPercent} kind="percent" />
                  </span>
                </Metric>
                <Metric label="Open P&L">
                  <SignedValue value={row.totalPnl} compact />
                  <span className="ml-1 text-[11px]">
                    <SignedValue value={row.returnPercent} kind="percent" />
                  </span>
                </Metric>
              </>
            ) : (
              <>
            {closed ? null : (
              <Metric label="Market value">
                <MoneyValue value={row.marketValue} compact />
              </Metric>
            )}
            <Metric label="Cost basis">
              <MoneyValue value={row.costBasis} compact />
            </Metric>
            {closed ? null : (
              <Metric label="Weight">
                <ShareValue value={row.weight} />
              </Metric>
            )}
            {closed ? null : (
              <Metric label="Day P&L">
                <SignedValue value={row.dayPnl} compact />
                <span className="ml-1 text-[11px]">
                  <SignedValue value={row.dayPercent} kind="percent" />
                </span>
              </Metric>
            )}
            {closed ? null : (
              <Metric label="Total P&L">
                <SignedValue value={row.totalPnl} compact />
              </Metric>
            )}
            {closed && row.fees > 0 ? (
              <>
                <Metric label="Gross P&L">
                  <SignedValue value={row.grossRealizedPnl} compact />
                </Metric>
                <Metric label="Fees">
                  <MoneyValue value={row.fees} compact />
                </Metric>
              </>
            ) : null}
            {row.status === "open" && row.relatedRealizedPnl != null ? (
              <Metric label="Realized">
                <SignedValue value={row.relatedRealizedPnl} compact />
                <span className="ml-1 text-[11px]">
                  <SignedValue value={row.relatedRealizedPercent} kind="percent" />
                </span>
              </Metric>
            ) : null}
            {closed ? (
              <Metric label="Realized">
                <SignedValue value={row.realizedPnl} compact />
                <span className="ml-1 text-[11px]">
                  <SignedValue value={row.returnPercent} kind="percent" />
                </span>
              </Metric>
            ) : null}
            {closedOption ? null : (
              <>
                <Metric label="Since entry">
                  <SignedValue value={row.sinceEntry.percent} kind="percent" />
                </Metric>
                <Metric label="1D">
                  <SignedValue value={row.change1d.percent} kind="percent" />
                </Metric>
                <Metric label="1W">
                  <SignedValue value={row.change1w.percent} kind="percent" />
                </Metric>
                <Metric label="1M">
                  <SignedValue value={row.change1m.percent} kind="percent" />
                </Metric>
              </>
            )}
              </>
            )}
          </div>
          <dl className="mt-3 space-y-1 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ib-text-muted)]">Opened</dt>
              <dd className="font-mono">{formatEntryDate(row.entryDate)}</dd>
            </div>
            {tape || !closed ? null : (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ib-text-muted)]">Closed</dt>
                <dd className="font-mono">
                  {formatEntryDate(row.closeDate)} @{" "}
                  <PriceValue value={exitPrice} ticker={row.ticker} />
                </dd>
              </div>
            )}
            {tape ? null : (
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--ib-text-muted)]">Updated</dt>
              <dd className="font-mono">
                <ClientMarketTime value={row.updatedAt} />
              </dd>
            </div>
            )}
          </dl>
        </div>
      </div>

      {tape || !row.notes ? null : (
        <p className="mt-3 rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] p-2.5 text-[12px] leading-5 text-[var(--ib-text-secondary)]">
          {row.notes}
        </p>
      )}

      {row.missing.length ? (
        <p className="mt-2 text-[11px] text-[var(--state-warning)]">
          Missing fields: {row.missing.join(", ")}.
        </p>
      ) : null}

      {row.status === "open" && confirmClose && canEdit ? (
        <form
          className="mt-3 space-y-3 rounded-[4px] border border-[var(--ib-border-control)] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!Number.isFinite(closeQuantity) || closeQuantity <= 0) return;
            if (closeQuantity > row.quantity) return;
            onClosePosition({ closePrice, closeDate, quantity: closeQuantity });
          }}
        >
          <p className="text-[13px] font-medium">Close {row.ticker}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="close-qty" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
                Quantity to close
              </label>
              <input
                id="close-qty"
                className="field-control font-mono"
                type="number"
                min="0"
                max={row.quantity}
                step={Number.isInteger(row.quantity) ? 1 : "any"}
                value={closeQuantity}
                onChange={(event) => setCloseQuantity(Number(event.target.value))}
                required
              />
            </div>
            <div>
              <label htmlFor="close-price" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
                Close price
              </label>
              <input
                id="close-price"
                className="field-control font-mono"
                type="number"
                min="0"
                step="any"
                value={closePrice}
                onChange={(event) => setClosePrice(Number(event.target.value))}
                required
              />
            </div>
            <div>
              <label htmlFor="close-date" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
                Close date
              </label>
              <input
                id="close-date"
                className="field-control font-mono"
                type="date"
                value={closeDate}
                onChange={(event) => setCloseDate(event.target.value)}
                required
              />
            </div>
          </div>
          <p className="text-[11px] text-[var(--ib-text-muted)]">
            {closeQuantity > 0 && closeQuantity < row.quantity
              ? `Closes ${formatQuantity(closeQuantity)} of ${formatQuantity(row.quantity)}. ${formatQuantity(row.quantity - closeQuantity)} stays on the book.`
              : `Closes the full ${formatQuantity(row.quantity)} lot.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmClose(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={
                closing ||
                !Number.isFinite(closeQuantity) ||
                closeQuantity <= 0 ||
                closeQuantity > row.quantity
              }
              aria-busy={closing}
            >
              {closing
                ? "Closing…"
                : closeQuantity > 0 && closeQuantity < row.quantity
                  ? "Confirm partial close"
                  : "Confirm close"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
