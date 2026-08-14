"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  ASSET_TYPE_LABELS,
  chicagoDateInput,
} from "@/components/positions/display";
import { cn } from "@/lib/utils/cn";
import { defaultMultiplier } from "@/lib/positions/math";
import { TICKER_PATTERN } from "@/lib/positions/schemas";
import {
  POSITION_ASSET_TYPES,
  type EnrichedPosition,
  type PositionAssetType,
  type PositionSide,
} from "@/lib/positions/types";

export type PositionFormValues = {
  ticker: string;
  assetType: PositionAssetType;
  side: PositionSide;
  quantity: number;
  multiplier: number;
  entryPrice: number;
  entryDate: string;
  strategy: string;
  notes: string;
};

function valuesFromRow(row: EnrichedPosition): PositionFormValues {
  return {
    ticker: row.ticker,
    assetType: row.assetType,
    side: row.side,
    quantity: row.quantity,
    multiplier: row.multiplier,
    entryPrice: row.entryPrice,
    entryDate: row.entryDate,
    strategy: row.strategy ?? "",
    notes: row.notes ?? "",
  };
}

function emptyValues(): PositionFormValues {
  return {
    ticker: "",
    assetType: "equity",
    side: "long",
    quantity: 100,
    multiplier: 1,
    entryPrice: 0,
    entryDate: chicagoDateInput(),
    strategy: "",
    notes: "",
  };
}

export function PositionFormDialog({
  mode,
  initial,
  submitting,
  onClose,
  onSubmit,
  brokerageWarning = false,
}: {
  mode: "add" | "edit";
  initial?: EnrichedPosition | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: PositionFormValues) => void;
  brokerageWarning?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<PositionFormValues>(
    initial ? valuesFromRow(initial) : emptyValues(),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button",
    );
    first?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function update<K extends keyof PositionFormValues>(
    key: K,
    value: PositionFormValues[K],
  ) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (key === "assetType") {
        const asset = value as PositionAssetType;
        if (
          current.multiplier === defaultMultiplier(current.assetType)
        ) {
          next.multiplier = defaultMultiplier(asset);
        }
      }
      return next;
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ticker = values.ticker.trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      setError("Enter a ticker such as NVDA, SPY, or BTC-USD.");
      return;
    }
    if (!Number.isFinite(values.quantity) || values.quantity <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }
    if (!Number.isFinite(values.entryPrice) || values.entryPrice <= 0) {
      setError("Entry price must be greater than zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.entryDate)) {
      setError("Entry date must be a valid calendar day.");
      return;
    }
    onSubmit({ ...values, ticker });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 px-3 pt-[8vh]"
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-[8px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] shadow-[var(--shadow-float)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--ib-border-subtle)] px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold">
            {mode === "add" ? "Add position" : `Edit ${initial?.ticker ?? "position"}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-[4px] text-[var(--ib-text-muted)] hover:bg-[var(--ib-surface-hover)]"
            aria-label="Close position form"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 p-4" noValidate>
          {brokerageWarning ? (
            <p
              role="alert"
              className="rounded-[4px] border border-[color-mix(in_oklab,var(--state-warning)_38%,transparent)] bg-[color-mix(in_oklab,var(--state-warning)_8%,transparent)] p-2.5 text-[12px] text-[var(--ib-text-secondary)]"
            >
              This book is linked to a brokerage. A manual lot will not stay in
              sync with SnapTrade and can double-count the same ticker.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="pos-ticker" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                Ticker
              </label>
              <input
                id="pos-ticker"
                className="field-control font-mono uppercase"
                value={values.ticker}
                onChange={(event) => update("ticker", event.target.value.toUpperCase())}
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            <div>
              <label htmlFor="pos-asset" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                Asset type
              </label>
              <select
                id="pos-asset"
                className="field-control"
                value={values.assetType}
                onChange={(event) =>
                  update("assetType", event.target.value as PositionAssetType)
                }
              >
                {POSITION_ASSET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ASSET_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="col-span-2">
              <legend className="mb-1 text-xs font-medium text-[var(--ib-text-secondary)]">
                Side
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(["long", "short"] as const).map((side) => (
                  <label
                    key={side}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-center rounded-[4px] border px-3 text-sm capitalize",
                      "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ib-maroon-400)]",
                      values.side === side
                        ? "border-[var(--ib-maroon-500)] bg-[var(--ib-surface-selected)] text-[var(--ib-text-primary)]"
                        : "border-[var(--ib-border-control)] bg-[var(--ib-surface-inset)] text-[var(--ib-text-secondary)]",
                    )}
                  >
                    <input
                      type="radio"
                      name="pos-side"
                      value={side}
                      checked={values.side === side}
                      onChange={() => update("side", side)}
                      className="sr-only"
                    />
                    {side}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="pos-qty" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                Shares / contracts
              </label>
              <input
                id="pos-qty"
                className="field-control font-mono"
                type="number"
                min="0"
                step="any"
                value={values.quantity}
                onChange={(event) => update("quantity", Number(event.target.value))}
                required
              />
            </div>
            <div>
              <label htmlFor="pos-mult" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                Multiplier
              </label>
              <input
                id="pos-mult"
                className="field-control font-mono"
                type="number"
                min="0"
                step="any"
                value={values.multiplier}
                onChange={(event) => update("multiplier", Number(event.target.value))}
              />
            </div>
            <div>
              <label htmlFor="pos-entry" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                Entry price
              </label>
              <input
                id="pos-entry"
                className="field-control font-mono"
                type="number"
                min="0"
                step="any"
                value={values.entryPrice || ""}
                onChange={(event) => update("entryPrice", Number(event.target.value))}
                required
              />
            </div>
            <div>
              <label htmlFor="pos-date" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                Entry date
              </label>
              <input
                id="pos-date"
                className="field-control font-mono"
                type="date"
                value={values.entryDate}
                onChange={(event) => update("entryDate", event.target.value)}
                required
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="pos-strategy" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                Strategy <span className="text-[var(--ib-text-muted)]">(optional)</span>
              </label>
              <input
                id="pos-strategy"
                className="field-control"
                value={values.strategy}
                onChange={(event) => update("strategy", event.target.value)}
                maxLength={80}
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="pos-notes" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                Notes <span className="text-[var(--ib-text-muted)]">(optional)</span>
              </label>
              <textarea
                id="pos-notes"
                className="field-control min-h-20 resize-y"
                value={values.notes}
                onChange={(event) => update("notes", event.target.value)}
                maxLength={2000}
              />
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-[var(--market-negative)]">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-[var(--ib-border-subtle)] pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Saving…" : mode === "add" ? "Add to book" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
