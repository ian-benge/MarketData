"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { suggestTickers, type TickerSuggestion } from "@/lib/intelligence/ticker-suggest";
import { cn } from "@/lib/utils/cn";

export function TickerSearchField({
  selected,
  onAdd,
  onRemove,
}: {
  selected: string[];
  onAdd: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = useMemo(
    () => suggestTickers(draft, 8).filter((row) => !selected.includes(row.ticker)),
    [draft, selected],
  );

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, []);

  function commit(row: TickerSuggestion | string) {
    const ticker = typeof row === "string" ? row : row.ticker;
    if (!ticker) return;
    onAdd(ticker);
    setDraft("");
    setActive(0);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative min-w-0 sm:max-w-[16rem] sm:flex-1">
      <label className="sr-only" htmlFor="news-ticker-search">
        Filter by ticker
      </label>
      <div
        className={cn(
          "field-control flex min-h-11 flex-wrap items-center gap-1 py-1",
          open && "border-[var(--ib-border-control)]",
        )}
      >
        {selected.map((ticker) => (
          <span
            key={ticker}
            className="inline-flex items-center gap-0.5 rounded-[3px] border border-[color-mix(in_oklab,var(--ib-maroon-500)_48%,transparent)] bg-[color-mix(in_oklab,var(--ib-maroon-500)_16%,transparent)] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-[var(--ib-maroon-300)]"
          >
            {ticker}
            <button
              type="button"
              className="grid size-4 place-items-center rounded-[2px] hover:bg-[var(--ib-surface-hover)]"
              aria-label={`Remove ${ticker} ticker filter`}
              onClick={() => onRemove(ticker)}
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </span>
        ))}
        <div className="flex min-w-[6rem] flex-1 items-center gap-1">
          <Search aria-hidden="true" className="size-3.5 shrink-0 text-[var(--ib-text-muted)]" />
          <input
            id="news-ticker-search"
            ref={inputRef}
            value={draft}
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && suggestions[active] ? `${listId}-${suggestions[active]!.ticker}` : undefined
            }
            placeholder={selected.length ? "Add ticker" : "Ticker or company"}
            autoComplete="off"
            className="h-8 min-w-0 flex-1 bg-transparent font-mono text-[12px] uppercase text-[var(--ib-text-primary)] outline-none placeholder:normal-case placeholder:text-[var(--ib-text-muted)]"
            onChange={(event) => {
              setDraft(event.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && suggestions.length) {
                event.preventDefault();
                setOpen(true);
                setActive((current) => Math.min(current + 1, suggestions.length - 1));
                return;
              }
              if (event.key === "ArrowUp" && suggestions.length) {
                event.preventDefault();
                setActive((current) => Math.max(current - 1, 0));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const pick = suggestions[active];
                if (pick) commit(pick);
                return;
              }
              if (event.key === "Escape") {
                setOpen(false);
                return;
              }
              if (event.key === "Backspace" && !draft && selected.length) {
                onRemove(selected[selected.length - 1]!);
              }
            }}
          />
        </div>
      </div>
      {open && suggestions.length ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Ticker suggestions"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-[4px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-1)] py-1 shadow-lg terminal-scroll"
        >
          {suggestions.map((row, index) => (
            <li key={row.ticker} role="none">
              <button
                type="button"
                id={`${listId}-${row.ticker}`}
                role="option"
                aria-selected={index === active}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left max-sm:min-h-11",
                  index === active
                    ? "bg-[var(--ib-surface-selected)]"
                    : "hover:bg-[var(--ib-surface-hover)]",
                )}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(row)}
              >
                <span className="font-mono text-[12px] font-medium text-[var(--ib-text-primary)]">
                  {row.ticker}
                </span>
                <span className="min-w-0 truncate text-[11px] text-[var(--ib-text-muted)]">
                  {row.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
