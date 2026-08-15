"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AddTickersRow } from "@/components/watchlists/AddTickersRow";
import { CoverageError, DESCRIPTION_MAX_LEN, NAME_MAX_LEN, normalizeName } from "@/lib/watchlists/symbols";
import {
  KIND_LABELS,
  NAV_GROUPS,
  NAV_GROUP_LABELS,
  SECTOR_KINDS,
  defaultNavGroupForKind,
} from "@/lib/watchlists/taxonomy";
import type {
  CoverageSector,
  NavGroup,
  SectorKind,
  WatchlistVisibility,
} from "@/lib/watchlists/types";

export function SectorFormDialog({
  mode,
  initial,
  submitting,
  onClose,
  onSubmit,
  onArchive,
  onDelete,
  canConvertIdentity = false,
}: {
  mode: "create" | "edit";
  initial?: CoverageSector | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    description: string;
    kind: SectorKind;
    navGroup: NavGroup;
    benchmarkSymbol: string;
    reviewBy: string;
    expiresAt: string;
    sourceUrl: string;
    symbols: string;
    identity: "watchlist" | "sector";
    visibility: WatchlistVisibility;
    isDefault: boolean;
  }) => void;
  onArchive?: () => void;
  onDelete?: () => void;
  canConvertIdentity?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<SectorKind>(initial?.kind ?? "theme");
  const [navGroup, setNavGroup] = useState<NavGroup>(
    initial?.navGroup ?? defaultNavGroupForKind(initial?.kind ?? "theme"),
  );
  const [benchmarkSymbol, setBenchmarkSymbol] = useState(
    initial?.benchmarkSymbol ?? "",
  );
  const [reviewBy, setReviewBy] = useState(initial?.reviewBy ?? "");
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [symbols, setSymbols] = useState(initial?.symbols.join(", ") ?? "");
  const [identity, setIdentity] = useState<"watchlist" | "sector">("sector");
  const [visibility, setVisibility] = useState<WatchlistVisibility>("shared");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showIdentity = mode === "edit" && canConvertIdentity;
  const savingAsWatchlist = showIdentity && identity === "watchlist";

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
      normalizeName(name);
      onSubmit({
        name,
        description,
        kind,
        navGroup,
        benchmarkSymbol,
        reviewBy,
        expiresAt,
        sourceUrl,
        symbols,
        identity: savingAsWatchlist ? "watchlist" : "sector",
        visibility,
        isDefault: visibility === "personal" ? false : isDefault,
      });
    } catch (caught) {
      setError(caught instanceof CoverageError ? caught.message : "Unable to save.");
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
        className="w-full max-w-lg overflow-hidden rounded-[8px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-3)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--ib-border-subtle)] px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold">
            {mode === "create" ? "Create theme / basket" : `Edit ${initial?.name ?? "sector"}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-[4px] text-[var(--ib-text-muted)]"
            aria-label="Close sector form"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <form className="space-y-3 p-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="sector-name" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
              Name
            </label>
            <input
              id="sector-name"
              className="field-control"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={NAME_MAX_LEN}
              required
              disabled={submitting}
            />
          </div>
          {showIdentity ? (
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-[var(--ib-text-secondary)]">
                Identity
              </legend>
              <div className="flex flex-wrap gap-4 text-xs text-[var(--ib-text-secondary)]">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sector-identity"
                    value="watchlist"
                    checked={identity === "watchlist"}
                    onChange={() => setIdentity("watchlist")}
                  />
                  Watchlist
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sector-identity"
                    value="sector"
                    checked={identity === "sector"}
                    onChange={() => setIdentity("sector")}
                  />
                  Sector / theme
                </label>
              </div>
            </fieldset>
          ) : null}
          {savingAsWatchlist ? (
            <>
              <div className="flex flex-wrap gap-4 text-xs text-[var(--ib-text-secondary)]">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sector-visibility"
                    checked={visibility === "shared"}
                    onChange={() => setVisibility("shared")}
                  />
                  Shared team coverage
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sector-visibility"
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
          ) : (
            <>
            <div>
              <label htmlFor="sector-kind" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
                Kind
              </label>
              <select
                id="sector-kind"
                className="field-control"
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as SectorKind;
                  setKind(next);
                  setNavGroup(defaultNavGroupForKind(next));
                }}
                disabled={submitting}
              >
                {SECTOR_KINDS.filter((value) => value !== "screen").map((value) => (
                  <option key={value} value={value}>
                    {KIND_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sector-nav" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
                Desk group
              </label>
              <select
                id="sector-nav"
                className="field-control"
                value={navGroup}
                onChange={(event) => setNavGroup(event.target.value as NavGroup)}
                disabled={submitting}
              >
                {NAV_GROUPS.map((value) => (
                  <option key={value} value={value}>
                    {NAV_GROUP_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sector-benchmark" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
                Benchmark
              </label>
              <input
                id="sector-benchmark"
                className="field-control font-mono uppercase"
                value={benchmarkSymbol}
                onChange={(event) => setBenchmarkSymbol(event.target.value.toUpperCase())}
                disabled={submitting}
                placeholder="SPY"
              />
            </div>
            {kind === "catalyst" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="sector-review" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
                    Review by
                  </label>
                  <input
                    id="sector-review"
                    type="date"
                    className="field-control"
                    value={reviewBy}
                    onChange={(event) => setReviewBy(event.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label htmlFor="sector-expires" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
                    Expires
                  </label>
                  <input
                    id="sector-expires"
                    type="date"
                    className="field-control"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
            ) : null}
            {kind === "catalyst" ? (
              <div>
                <label htmlFor="sector-source" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
                  Source URL
                </label>
                <input
                  id="sector-source"
                  className="field-control"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  disabled={submitting}
                />
              </div>
            ) : null}
            </>
          )}
          <div>
            <label htmlFor="sector-description" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
              Description
            </label>
            <textarea
              id="sector-description"
              className="field-control min-h-16"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={DESCRIPTION_MAX_LEN}
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="sector-symbols" className="mb-1 block text-xs text-[var(--ib-text-secondary)]">
              Constituents
            </label>
            <textarea
              id="sector-symbols"
              className="field-control min-h-20 font-mono uppercase"
              value={symbols}
              onChange={(event) => setSymbols(event.target.value.toUpperCase())}
              disabled={submitting}
              placeholder="NVDA, AMD, AVGO"
            />
          </div>
          <AddTickersRow
            idPrefix="sector"
            existing={symbols}
            disabled={submitting}
            onAdd={setSymbols}
          />
          {error ? <p className="text-xs text-[var(--market-negative)]">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ib-border-subtle)] pt-3">
            {mode === "edit" && (onArchive || onDelete) ? (
              <div className="mr-auto flex flex-wrap gap-1">
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
              <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="sm" variant="primary" disabled={submitting}>
                {submitting
                  ? "Saving…"
                  : mode === "create"
                    ? "Create theme"
                    : savingAsWatchlist
                      ? "Save as watchlist"
                      : "Save"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
