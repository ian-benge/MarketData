"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { PortfolioPnlChart } from "@/components/positions/PortfolioPnlChart";
import { BookPnlWindowToggle } from "@/components/positions/PositionsPrivacy";
import {
  useHideValues,
  usePositionsPrivacy,
} from "@/components/positions/privacy-context";
import {
  MoneyValue,
  ShareValue,
  SignedValue,
  SideLabel,
  toneClass,
} from "@/components/positions/display";
import { cn } from "@/lib/utils/cn";
import { displayPositionTicker, positionUnderlying } from "@/lib/positions/option-symbol";
import { formatCurrency, formatSignedPercent, formatQuantity } from "@/lib/utils/format";
import {
  BOOK_PNL_WINDOW_LABELS,
  bookPnlForWindow,
  contributorsForWindow,
} from "@/lib/positions/value-privacy";
import type { NamedContributor, PositionsSnapshot } from "@/lib/positions/types";

function Metric({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-b border-[var(--ib-border-subtle)] px-3 py-2 sm:border-b-0 sm:border-r sm:py-2.5 last:border-r-0",
        className,
      )}
    >
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {label}
      </p>
      <div className="mt-1 font-mono text-[16px] leading-5 tabular-nums text-[var(--ib-text-primary)] sm:text-[18px] sm:leading-6">
        {children}
      </div>
      {hint ? (
        <p className="mt-0.5 text-[11px] leading-4 text-[var(--ib-text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ContributorList({
  label,
  rows,
  onInspect,
}: {
  label: string;
  rows: NamedContributor[];
  onInspect?: (id: string) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-[var(--ib-text-muted)]">{label}</p>
      <ul className="mt-1.5 space-y-2">
        {rows.length ? (
          rows.map((row) => (
            <li
              key={row.id}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 font-mono text-[12px]"
            >
              <span
                className="min-w-0 truncate text-[var(--ib-text-primary)]"
                title={row.ticker}
              >
                {onInspect ? (
                  <button
                    type="button"
                    className="truncate hover:text-[var(--ib-maroon-300)] hover:underline"
                    aria-label={`Inspect ${displayPositionTicker(row.ticker)}`}
                    onClick={() => onInspect(row.id)}
                  >
                    {displayPositionTicker(row.ticker)}
                  </button>
                ) : (
                  <Link
                    href={`/news?ticker=${encodeURIComponent(positionUnderlying(row.ticker))}`}
                    className="hover:text-[var(--ib-maroon-300)] hover:underline"
                  >
                    {displayPositionTicker(row.ticker)}
                  </Link>
                )}
              </span>
              <SignedValue value={row.pnl} compact className="justify-self-end" />
              <span className="col-start-1">
                <SideLabel side={row.side} />
              </span>
            </li>
          ))
        ) : (
          <li className="text-[12px] text-[var(--ib-text-muted)]">None</li>
        )}
      </ul>
    </div>
  );
}

function ExposureBar({
  long,
  short,
  flat = false,
}: {
  long: number | null;
  short: number | null;
  flat?: boolean;
}) {
  const longValue = long ?? 0;
  const shortValue = short ?? 0;
  const total = longValue + shortValue;
  if (total <= 0) {
    return (
      <p className="text-[12px] text-[var(--ib-text-muted)]">
        {flat
          ? "Flat · no open exposure."
          : "Exposure unavailable until marks arrive."}
      </p>
    );
  }
  const longPct = (longValue / total) * 100;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-[2px] bg-[var(--ib-surface-inset)]">
        <span
          className="bg-[var(--market-positive)]"
          style={{ width: `${longPct}%` }}
        />
        <span
          className="bg-[var(--market-negative)]"
          style={{ width: `${100 - longPct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px]">
        <span className="flex items-center gap-1.5 text-[var(--market-positive)]">
          Long <MoneyValue value={long} compact />
        </span>
        <span className="flex items-center gap-1.5 text-[var(--market-negative)]">
          Short <MoneyValue value={short} compact />
        </span>
      </div>
    </div>
  );
}

function LockedPnlStat({
  label,
  value,
  percent,
  hint,
}: {
  label: string;
  value: number | null;
  percent: number | null;
  hint: string;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <SignedValue
          value={value}
          className="text-[16px] leading-5 sm:text-[18px] sm:leading-6"
        />
        <SignedValue
          value={percent}
          kind="percent"
          className="text-[12px] sm:text-[13px]"
        />
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--ib-text-muted)]">{hint}</p>
    </div>
  );
}

export function LockedOwnerPnlStrip({
  snapshot,
}: {
  snapshot: PositionsSnapshot;
}) {
  const summary = snapshot.summary;
  return (
    <div
      role="group"
      aria-label="Open lot P&L"
      className="grid grid-cols-2 divide-x divide-[var(--ib-border-subtle)] border-b border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)]"
    >
      <LockedPnlStat
        label="Day P&L"
        value={summary.dayPnl}
        percent={summary.dayPercent}
        hint="Open lots vs prior close"
      />
      <LockedPnlStat
        label="Open P&L"
        value={summary.unrealizedPnl}
        percent={summary.bookReturnPercent}
        hint="Unrealized vs entry"
      />
    </div>
  );
}

export function PositionsMetricsStrip({
  snapshot,
  onAccountValueChange,
  savingAccountValue = false,
}: {
  snapshot: PositionsSnapshot;
  onAccountValueChange?: (value: number | null) => void;
  savingAccountValue?: boolean;
}) {
  return (
    <PositionsMetricsStripInner
      key={`${snapshot.bookId}:${snapshot.ownerId}:${String(snapshot.accountValue)}`}
      snapshot={snapshot}
      onAccountValueChange={onAccountValueChange}
      savingAccountValue={savingAccountValue}
    />
  );
}

function PositionsMetricsStripInner({
  snapshot,
  onAccountValueChange,
  savingAccountValue = false,
}: {
  snapshot: PositionsSnapshot;
  onAccountValueChange?: (value: number | null) => void;
  savingAccountValue?: boolean;
}) {
  const hideValues = useHideValues();
  const { pnlWindow } = usePositionsPrivacy();
  const windowed = bookPnlForWindow(snapshot, pnlWindow);
  const today = bookPnlForWindow(snapshot, "1d");
  const lifetimeWindow = pnlWindow === "max";
  const showSeparateToday = pnlWindow !== "1d";
  const summary = snapshot.summary;
  const flat = summary.openCount === 0;
  const showPortfolio = !flat;
  const metricCount =
    (showSeparateToday ? 1 : 0) +
    1 +
    (lifetimeWindow ? 1 : 0) +
    1 +
    (showPortfolio ? 1 : 0) +
    1;
  const hasAccountValue = snapshot.accountValue != null;
  const activeBook = snapshot.books.find((book) => book.id === snapshot.bookId);
  const brokerageBook = activeBook?.source === "snaptrade";
  const accountHint =
    snapshot.accountValueKind === "broker_cash"
      ? "Cash balance (broker)"
      : snapshot.accountValueKind === "broker" || brokerageBook
        ? summary.openCount === 0
          ? "Account (broker) · cash ≈ NAV"
          : "Account (broker)"
        : summary.accountValue != null
          ? "Account (manual)"
          : "Set account value to include cash";
  const canEditAccount =
    Boolean(snapshot.canEdit && onAccountValueChange) && !brokerageBook;
  const [draft, setDraft] = useState(
    snapshot.accountValue != null ? String(snapshot.accountValue) : "",
  );
  const [editingAccount, setEditingAccount] = useState(
    !hasAccountValue && !brokerageBook,
  );

  function commitAccountValue() {
    if (!onAccountValueChange || !canEditAccount) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      onAccountValueChange(null);
      return;
    }
    const next = Number(trimmed);
    if (!Number.isFinite(next) || next <= 0) {
      setDraft(snapshot.accountValue != null ? String(snapshot.accountValue) : "");
      return;
    }
    if (snapshot.accountValue != null && Math.abs(next - snapshot.accountValue) < 0.005) {
      setEditingAccount(false);
      return;
    }
    onAccountValueChange(next);
  }

  return (
    <Panel
      title="Book snapshot"
      description={
        flat
          ? "Today, windowed P&L, fees, and cash. No open lots on this book."
          : "Today, windowed P&L, cash, and open exposure."
      }
      actions={
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Badge tone={flat ? "neutral" : "info"}>
            {flat ? "Flat" : `${summary.openCount} open`}
          </Badge>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            {summary.closedCount} closed
          </span>
        </div>
      }
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ib-border-subtle)] px-3 py-1.5">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
          P&L window
        </p>
        <BookPnlWindowToggle />
      </div>
      <div
        className={cn(
          "grid grid-cols-2 sm:grid-cols-3",
          metricCount >= 6
            ? "xl:grid-cols-6"
            : metricCount === 5
              ? "xl:grid-cols-5"
              : metricCount === 4
                ? "xl:grid-cols-4"
                : "xl:grid-cols-3",
        )}
      >
        {showSeparateToday ? (
          <Metric label="Today" hint={today.hint}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <SignedValue value={today.afterFees ?? today.beforeFees} compact />
              {today.percent == null ? null : (
                <SignedValue
                  value={today.percent}
                  kind="percent"
                  className="text-[12px] sm:text-[13px]"
                />
              )}
            </div>
          </Metric>
        ) : null}
        <Metric
          label={
            lifetimeWindow
              ? "Total P&L (with fees)"
              : `P&L (${BOOK_PNL_WINDOW_LABELS[pnlWindow]})`
          }
          hint={windowed.hint}
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <SignedValue
              value={
                lifetimeWindow
                  ? windowed.afterFees
                  : (windowed.afterFees ?? windowed.beforeFees)
              }
              compact
            />
            {windowed.percent == null ? null : (
              <SignedValue
                value={windowed.percent}
                kind="percent"
                className="text-[12px] sm:text-[13px]"
              />
            )}
          </div>
        </Metric>
        {lifetimeWindow ? (
          <Metric
            label="P&L (before fees)"
            hint="Gross result before commissions and account fees"
          >
            <SignedValue value={windowed.beforeFees} compact />
          </Metric>
        ) : null}
        <Metric
          label="Total fees"
          hint={
            lifetimeWindow
              ? summary.fees &&
                summary.portfolioValue != null &&
                summary.fees > Math.abs(summary.portfolioValue)
                ? "Lifetime commissions — not a charge against current NAV"
                : summary.fees && summary.fees > 0
                  ? "Commissions and account fees from brokerage history"
                  : "No brokerage fees on this book"
              : `Lifetime fees — not ${BOOK_PNL_WINDOW_LABELS[pnlWindow]} P&L`
          }
        >
          <MoneyValue value={summary.fees} compact />
        </Metric>
        {showPortfolio ? (
          <Metric label="Portfolio" hint={accountHint}>
            <MoneyValue value={summary.portfolioValue} compact />
          </Metric>
        ) : null}
        <Metric
          label="Cash"
          hint={
            summary.cash == null
              ? "Derived from account value"
              : summary.cash < 0
                ? "Account below invested longs"
                : flat
                  ? "Cash ≈ NAV while flat"
                  : "Account − invested"
          }
        >
          <MoneyValue value={summary.cash} compact />
        </Metric>
      </div>

      {flat ? null : (
        <div className="grid grid-cols-2 border-t border-[var(--ib-border-subtle)] sm:grid-cols-3 xl:grid-cols-4">
          <Metric label="Invested" hint="Long market value">
            <MoneyValue value={summary.investedValue} compact />
          </Metric>
          <Metric label="Gross" hint={`${summary.openCount} open`}>
            <MoneyValue value={summary.grossExposure} compact />
          </Metric>
          <Metric
            label="Net"
            hint={
              hideValues || summary.netExposurePercent == null
                ? undefined
                : `${formatSignedPercent(summary.netExposurePercent)} of gross`
            }
          >
            <MoneyValue value={summary.netExposure} compact />
          </Metric>
          <Metric
            label="Day P&L"
            hint="Open lots vs prior close"
            className="sm:last:border-r-0"
          >
            <SignedValue value={summary.dayPnl} compact />
          </Metric>
        </div>
      )}

      {brokerageBook ? (
        flat ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ib-border-subtle)] px-3 py-2">
          <p className="text-[12px] text-[var(--ib-text-secondary)]">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Account value
            </span>
            <span className="ml-2 font-mono tabular-nums text-[var(--ib-text-primary)]">
              {hasAccountValue ? (
                <MoneyValue value={snapshot.accountValue} />
              ) : (
                "—"
              )}
            </span>
            <span className="ml-2 text-[11px] text-[var(--ib-text-muted)]">
              {hasAccountValue
                ? accountHint
                : "No holdings and $0 in this brokerage account yet"}
            </span>
          </p>
        </div>
        )
      ) : hasAccountValue && !editingAccount ? (
        flat && !canEditAccount ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ib-border-subtle)] px-3 py-2">
          <p className="text-[12px] text-[var(--ib-text-secondary)]">
            {flat ? (
              <span className="text-[11px] text-[var(--ib-text-muted)]">
                Cash uses this book's NAV.
              </span>
            ) : (
              <>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Account value
            </span>
            <span className="ml-2 font-mono tabular-nums text-[var(--ib-text-primary)]">
              <MoneyValue value={snapshot.accountValue} />
            </span>
            <span className="ml-2 text-[11px] text-[var(--ib-text-muted)]">
              Cash = account − long market value
            </span>
              </>
            )}
          </p>
          {canEditAccount ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingAccount(true)}
            >
              {flat ? "Edit NAV" : "Edit"}
            </Button>
          ) : null}
        </div>
        )
      ) : (
        <div className="flex flex-wrap items-end gap-3 border-t border-[var(--ib-border-subtle)] px-3 py-2.5">
          <div className="min-w-[180px] flex-1">
            <label
              htmlFor="account-value"
              className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]"
            >
              Account value (incl. cash)
            </label>
            <input
              id="account-value"
              className="field-control font-mono"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="e.g. 250000"
              value={draft}
              disabled={!canEditAccount || savingAccountValue}
              autoFocus={editingAccount && hasAccountValue}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitAccountValue}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitAccountValue();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape" && hasAccountValue) {
                  setDraft(String(snapshot.accountValue));
                  setEditingAccount(false);
                }
              }}
            />
          </div>
          {canEditAccount ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={savingAccountValue}
              onClick={commitAccountValue}
            >
              {savingAccountValue ? "Saving…" : "Save"}
            </Button>
          ) : null}
          {hasAccountValue ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={savingAccountValue}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setDraft(String(snapshot.accountValue));
                setEditingAccount(false);
              }}
            >
              Cancel
            </Button>
          ) : null}
          <p className="pb-2 text-[11px] text-[var(--ib-text-muted)]">
            {snapshot.canEdit
              ? savingAccountValue
                ? "Saving…"
                : "Cash = account − long market value. Position weights use account value when set."
              : "View only — account value is set by the book owner."}
          </p>
        </div>
      )}
    </Panel>
  );
}

export function PastPositionsMetrics({
  snapshot,
}: {
  snapshot: PositionsSnapshot;
}) {
  const hideValues = useHideValues();
  const summary = snapshot.summary;
  return (
    <div className="grid grid-cols-2 border-b border-[var(--ib-border-subtle)] sm:grid-cols-4">
      <Metric
        label="Realized return"
        hint={
          summary.closedCostBasis == null
            ? "Closed cost unavailable"
            : hideValues
              ? "Versus closed cost basis"
              : `Cost ${formatCurrency(summary.closedCostBasis, { compact: true })}`
        }
      >
        <SignedValue value={summary.realizedReturnPercent} kind="percent" />
      </Metric>
      <Metric label="Closed lots" hint="Fully exited sleeves">
        {summary.closedCount}
      </Metric>
      <Metric
        label="Hit rate"
        hint={
          summary.hitRateSampleSize
            ? `${summary.hitRateSampleSize} closed lots`
            : "Winning closed lots"
        }
      >
        {summary.closedHitRate == null && summary.hitRate == null
          ? "—"
          : `${(summary.closedHitRate ?? summary.hitRate)!.toFixed(0)}% of ${summary.hitRateSampleSize || summary.closedCount} lots`}
      </Metric>
      <Metric
        label="Avg hold"
        hint="Calendar days, closed lots"
        className="sm:last:border-r-0"
      >
        {summary.closedAverageHoldingDays == null &&
        summary.averageHoldingDays == null
          ? "—"
          : `${formatQuantity(summary.closedAverageHoldingDays ?? summary.averageHoldingDays)}d`}
      </Metric>
    </div>
  );
}

export function PositionsAttribution({
  snapshot,
  defaultOpen = true,
  onInspect,
}: {
  snapshot: PositionsSnapshot;
  defaultOpen?: boolean;
  onInspect?: (id: string) => void;
}) {
  const summary = snapshot.summary;
  const flat = summary.openCount === 0;
  const { pnlWindow } = usePositionsPrivacy();
  const windowedContributors = contributorsForWindow(
    snapshot.positions,
    pnlWindow,
    snapshot.asOf,
  );
  const [open, setOpen] = useState(defaultOpen);
  const showMix = summary.byAssetType.length > 1;

  return (
    <Panel
      title="Exposure & attribution"
      description={
        flat
          ? "Closed-lot quality and the book P&L path from fills."
          : "Long/short mix, top contributors, and the book P&L path from fills."
      }
      bodyClassName="p-0"
      actions={
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
        >
          {open ? "Hide" : "Show"}
        </button>
      }
    >
      {open ? (
      <>
      <div className="grid gap-0 lg:grid-cols-2">
        <div className="border-b border-[var(--ib-border-subtle)] p-3 lg:border-b-0 lg:border-r">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            {flat ? "Closed-book quality" : "Long / short exposure"}
          </p>
          {flat ? null : (
            <div className="mt-3">
              <ExposureBar
                long={summary.longExposure}
                short={summary.shortExposure}
                flat={flat}
              />
            </div>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            {flat ? (
              <>
                <div>
                  <dt className="text-[var(--ib-text-muted)]">Hit rate</dt>
                  <dd className="font-mono">
                    {summary.closedHitRate == null && summary.hitRate == null
                      ? "—"
                      : `${(summary.closedHitRate ?? summary.hitRate)!.toFixed(0)}% of ${summary.hitRateSampleSize || summary.closedCount}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--ib-text-muted)]">Avg hold</dt>
                  <dd className="font-mono">
                    {summary.closedAverageHoldingDays == null &&
                    summary.averageHoldingDays == null
                      ? "—"
                      : `${formatQuantity(summary.closedAverageHoldingDays ?? summary.averageHoldingDays)}d`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--ib-text-muted)]">Avg winner</dt>
                  <dd>
                    <SignedValue value={summary.averageWinner} compact />
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--ib-text-muted)]">Avg loser</dt>
                  <dd>
                    <SignedValue value={summary.averageLoser} compact />
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--ib-text-muted)]">1W P&L</dt>
                  <dd>
                    <SignedValue value={summary.change1wPnl} compact />
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--ib-text-muted)]">1M P&L</dt>
                  <dd>
                    <SignedValue value={summary.change1mPnl} compact />
                  </dd>
                </div>
              </>
            ) : (
              <>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Long names</dt>
              <dd className="font-mono">{summary.longCount}</dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Short names</dt>
              <dd className="font-mono">{summary.shortCount}</dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">L/S ratio</dt>
              <dd className="font-mono">
                {summary.longShortRatio != null
                  ? `${summary.longShortRatio.toFixed(2)}x`
                  : summary.shortCount === 0 && summary.longCount > 0
                    ? "Long only"
                    : summary.longCount === 0 && summary.shortCount > 0
                      ? "Short only"
                      : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Quoted</dt>
              <dd className="font-mono">
                {`${summary.quotedCount}/${summary.openCount} open`}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Hit rate</dt>
              <dd className="font-mono">
                {summary.hitRate == null
                  ? "—"
                  : `${summary.hitRate.toFixed(0)}% of ${summary.hitRateSampleSize}`}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Avg hold</dt>
              <dd className="font-mono">
                {summary.averageHoldingDays == null
                  ? "—"
                  : `${formatQuantity(summary.averageHoldingDays)}d`}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Avg winner</dt>
              <dd>
                <SignedValue value={summary.averageWinner} compact />
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Avg loser</dt>
              <dd>
                <SignedValue value={summary.averageLoser} compact />
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Top weight</dt>
              <dd>
                <ShareValue value={summary.largestWeight} />
              </dd>
            </div>
              </>
            )}
            {showMix
              ? summary.byAssetType.slice(0, 2).map((slice) => (
                  <div key={slice.key}>
                    <dt className="text-[var(--ib-text-muted)]">{slice.label}</dt>
                    <dd className="font-mono">
                      {slice.weight == null ? "—" : `${slice.weight.toFixed(0)}%`}
                    </dd>
                  </div>
                ))
              : null}
          </dl>
        </div>

        <div className="p-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            Contributors
          </p>
          <div className="mt-3 space-y-4">
            <ContributorList
              label={`Winners (${BOOK_PNL_WINDOW_LABELS[pnlWindow]})`}
              rows={windowedContributors.winners}
              onInspect={onInspect}
            />
            <ContributorList
              label={`Losers (${BOOK_PNL_WINDOW_LABELS[pnlWindow]})`}
              rows={windowedContributors.losers}
              onInspect={onInspect}
            />
          </div>
          {summary.byStrategy.length ? (
            <ul className="mt-3 space-y-1 border-t border-[var(--ib-border-subtle)] pt-2">
              {summary.byStrategy.slice(0, 4).map((slice) => (
                <li
                  key={slice.key}
                  className="flex items-center justify-between font-mono text-[11px] text-[var(--ib-text-secondary)]"
                >
                  <span>{slice.label}</span>
                  <span className="flex items-center gap-2">
                    <MoneyValue value={slice.value} compact />
                    {slice.weight == null ? null : (
                      <span className={toneClass(slice.weight)}>
                        <ShareValue value={slice.weight} />
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="border-t border-[var(--ib-border-subtle)] p-3">
        <PortfolioPnlChart
          series={snapshot.series}
          positions={snapshot.positions}
          asOf={snapshot.asOf}
        />
      </div>
      </>
      ) : null}
    </Panel>
  );
}
