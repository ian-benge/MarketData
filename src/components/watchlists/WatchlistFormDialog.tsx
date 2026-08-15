"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AddTickersRow } from "@/components/watchlists/AddTickersRow";
import { assertSymbols, CoverageError, DESCRIPTION_MAX_LEN, NAME_MAX_LEN, validateSymbols } from "@/lib/watchlists/symbols";
import type {
  CoverageWatchlist,
  SectorKind,
  WatchlistVisibility,
} from "@/lib/watchlists/types";

export type WatchlistFormValues = {
  name: string;
  description: string;
  symbols: string;
  visibility: WatchlistVisibility;
  isDefault: boolean;
  identity: "watchlist" | "sector";
  kind: SectorKind;
};

export function WatchlistFormDialog({
  mode,
  initial,
  submitting,
  onClose,
  onSubmit,
  onDuplicate,
  onArchive,
  onDelete,
  canConvertIdentity = false,
}: {
  mode: "create" | "edit";
  initial?: CoverageWatchlist | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: WatchlistFormValues) => void;
  onDuplicate?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  canConvertIdentity?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [symbols, setSymbols] = useState(initial?.symbols.join(", ") ?? "");
  const [visibility, setVisibility] = useState<WatchlistVisibility>(
    initial?.visibility ?? "shared",
  );
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [identity, setIdentity] = useState<"watchlist" | "sector">("watchlist");
  const [kind, setKind] = useState<SectorKind>("theme");
  const [error, setError] = useState<string | null>(null);
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const showIdentity = mode === "edit" && canConvertIdentity;
  const savingAsSector = showIdentity && identity === "sector";

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("input")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const checked = validateSymbols(symbols);
      if (checked.invalid.length || checked.duplicates.length || (mode === "create" && !checked.normalized.length)) {
        if (!checked.normalized.length) setSymbolError("Enter at least one ticker symbol.");
        else if (checked.invalid.length) {
          setSymbolError(`Use valid uppercase ticker symbols. Check: ${checked.invalid.join(", ")}.`);
        } else {
          setSymbolError(`Remove duplicate symbols: ${checked.duplicates.join(", ")}.`);
        }
        return;
      }
      assertSymbols(checked.normalized, { allowEmpty: mode === "edit" });
      onSubmit({
        name,
        description,
        symbols,
        visibility,
        isDefault: visibility === "personal" ? false : isDefault,
        identity: savingAsSector ? "sector" : "watchlist",
        kind,
      });
    } catch (caught) {
      setError(caught instanceof CoverageError ? caught.message : "Unable to save watchlist.");
    }
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
            {mode === "create" ? "Create watchlist" : `Edit ${initial?.name ?? "watchlist"}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-[4px] text-[var(--ib-text-muted)] hover:bg-[var(--ib-surface-hover)]"
            aria-label="Close watchlist form"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <form className="space-y-3 p-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="dialog-watchlist-name" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
              Watchlist name
            </label>
            <input
              id="dialog-watchlist-name"
              className="field-control"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={NAME_MAX_LEN}
              required
              disabled={submitting}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="dialog-watchlist-description" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
              Description <span className="text-[var(--ib-text-muted)]">(optional)</span>
            </label>
            <textarea
              id="dialog-watchlist-description"
              className="field-control min-h-16 resize-y"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={DESCRIPTION_MAX_LEN}
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="dialog-watchlist-symbols" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
              Ticker symbols
            </label>
            <textarea
              id="dialog-watchlist-symbols"
              className="field-control min-h-24 resize-y font-mono uppercase"
              value={symbols}
              onChange={(event) => {
                setSymbols(event.target.value.toUpperCase());
                setSymbolError(null);
              }}
              aria-invalid={Boolean(symbolError)}
              aria-describedby={
                symbolError
                  ? "dialog-watchlist-symbols-help dialog-watchlist-symbols-error"
                  : "dialog-watchlist-symbols-help"
              }
              placeholder="NVDA, AMD, AVGO"
              disabled={submitting}
            />
            <p id="dialog-watchlist-symbols-help" className="mt-1 text-[11px] text-[var(--ib-text-muted)]">
              Separate symbols with commas or spaces. Duplicates are rejected.
            </p>
            {symbolError ? (
              <p id="dialog-watchlist-symbols-error" className="mt-1 text-xs text-[var(--market-negative)]">
                {symbolError}
              </p>
            ) : null}
          </div>
          <AddTickersRow
            idPrefix="dialog-watchlist"
            existing={symbols}
            disabled={submitting}
            onAdd={(next) => {
              setSymbols(next);
              setSymbolError(null);
            }}
          />
          {showIdentity ? (
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-[var(--ib-text-secondary)]">
                Identity
              </legend>
              <div className="flex flex-wrap gap-4 text-xs text-[var(--ib-text-secondary)]">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dialog-identity"
                    value="watchlist"
                    checked={identity === "watchlist"}
                    onChange={() => setIdentity("watchlist")}
                  />
                  Watchlist
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dialog-identity"
                    value="sector"
                    checked={identity === "sector"}
                    onChange={() => setIdentity("sector")}
                  />
                  Sector / theme
                </label>
              </div>
              {savingAsSector ? (
                <p className="text-[11px] text-[var(--ib-text-muted)]">
                  Sectors and themes are shared firm coverage and move to the Sectors & themes tab.
                </p>
              ) : null}
            </fieldset>
          ) : null}
          {savingAsSector ? (
            <div>
              <label htmlFor="dialog-watchlist-kind" className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
                Kind
              </label>
              <select
                id="dialog-watchlist-kind"
                className="field-control"
                value={kind}
                onChange={(event) => setKind(event.target.value as SectorKind)}
                disabled={submitting}
              >
                <option value="theme">Theme</option>
                <option value="sector">Sector</option>
                <option value="industry">Industry</option>
                <option value="custom">Custom basket</option>
              </select>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-xs text-[var(--ib-text-secondary)]">
                  <input
                    type="radio"
                    name="visibility"
                    checked={visibility === "shared"}
                    onChange={() => setVisibility("shared")}
                  />
                  Shared team coverage
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--ib-text-secondary)]">
                  <input
                    type="radio"
                    name="visibility"
                    checked={visibility === "personal"}
                    onChange={() => setVisibility("personal")}
                  />
                  Personal
                </label>
              </div>
              {visibility === "shared" ? (
                <label className="flex items-center gap-2 text-xs text-[var(--ib-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(event) => setIsDefault(event.target.checked)}
                  />
                  Firm default (dashboard)
                </label>
              ) : null}
            </>
          )}
          {error ? (
            <p className="text-xs text-[var(--market-negative)]" role="alert">{error}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ib-border-subtle)] pt-3">
            {mode === "edit" && (onDuplicate || onArchive || onDelete) ? (
              <div className="mr-auto flex flex-wrap gap-1">
                {onDuplicate ? (
                  <Button type="button" size="sm" variant="ghost" onClick={onDuplicate} disabled={submitting}>
                    Duplicate
                  </Button>
                ) : null}
                {onArchive ? (
                  <Button type="button" size="sm" variant="ghost" onClick={onArchive} disabled={submitting}>
                    {initial?.archivedAt ? "Restore" : "Archive"}
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button type="button" size="sm" variant="ghost" onClick={onDelete} disabled={submitting}>
                    Delete
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="primary" disabled={submitting} aria-busy={submitting}>
                {submitting
                  ? "Saving…"
                  : mode === "create"
                    ? "Create watchlist"
                    : savingAsSector
                      ? kind === "industry"
                        ? "Save as industry"
                        : kind === "custom"
                          ? "Save as basket"
                          : kind === "sector"
                            ? "Save as sector"
                            : "Save as theme"
                      : "Save watchlist"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
