"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { appendUniqueSymbols } from "@/lib/watchlists/symbols";

export function AddTickersRow({
  existing,
  onAdd,
  disabled,
  idPrefix,
}: {
  existing: string;
  onAdd: (nextSymbols: string) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const [raw, setRaw] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const inputId = `${idPrefix}-add-tickers`;
  const helpId = `${idPrefix}-add-tickers-help`;
  const errorId = `${idPrefix}-add-tickers-error`;

  function addTickers() {
    if (!raw.trim()) {
      setMessage("Enter a ticker.");
      setInvalid(true);
      return;
    }
    const result = appendUniqueSymbols(existing, raw);
    if (result.invalid.length) {
      setMessage(`Use valid uppercase ticker symbols. Check: ${result.invalid.join(", ")}.`);
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (!result.added.length) {
      setMessage("Those tickers are already on this list.");
      setRaw("");
      return;
    }
    onAdd(result.next.join(", "));
    setRaw("");
    setMessage(
      result.skipped.length
        ? `Added ${result.added.join(", ")}. Skipped already listed: ${result.skipped.join(", ")}.`
        : null,
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addTickers();
  }

  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]">
        Add tickers
      </label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          className="field-control h-8 min-w-0 flex-1 font-mono text-xs uppercase"
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value.toUpperCase());
            setMessage(null);
            setInvalid(false);
          }}
          onKeyDown={onKeyDown}
          placeholder="SOXL, SMH"
          disabled={disabled}
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={message && invalid ? `${helpId} ${errorId}` : helpId}
        />
        <Button type="button" size="sm" onClick={addTickers} disabled={disabled}>
          <Plus aria-hidden="true" className="size-3.5" />
          Add
        </Button>
      </div>
      <p id={helpId} className="mt-1 text-[11px] text-[var(--ib-text-muted)]">
        Paste one or more names. Tickers already on the list are not added.
      </p>
      {message ? (
        <p
          id={errorId}
          role={invalid ? "alert" : "status"}
          className={
            invalid
              ? "mt-1 text-xs text-[var(--market-negative)]"
              : "mt-1 text-[11px] text-[var(--ib-text-muted)]"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
