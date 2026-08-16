"use client";

import { Check, FilePlus2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusIndicator } from "@/components/ui/StatusIndicator";

import { REPORT_EDITIONS, editionLabel, type ReportEdition } from "@/lib/reports/editions";
import { onDemandBriefsAllowed } from "@/lib/scheduling/chicago-schedule";

export function OnDemandReportButton({
  autoOpen = false,
  demoMode,
}: {
  autoOpen?: boolean;
  demoMode: boolean;
}) {
  const sessionOpen = demoMode || onDemandBriefsAllowed(new Date());
  const [open, setOpen] = useState(autoOpen);
  const [edition, setEdition] = useState<ReportEdition>("midday");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    id: string;
    status: string;
    message?: string;
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("generate")) {
      url.searchParams.delete("generate");
      window.history.replaceState({}, "", url);
    }
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edition, reason: "on_demand" }),
      });
      const data = (await response.json()) as {
        id?: string;
        status?: string;
        message?: string;
        demo?: boolean;
        error?: string;
      };
      if (!response.ok || !data.id) {
        setError(
          data.error ??
            data.message ??
            "The brief could not be queued. No archive entry was created.",
        );
        return;
      }
      setResult({
        id: data.id,
        status: data.status ?? "queued",
        message: data.message,
      });
    } catch {
      setError(
        "Network unavailable. The request was not submitted; it is safe to retry.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="primary"
        size="sm"
        onClick={() => {
          setResult(null);
          setError(null);
          setOpen(true);
        }}
        disabled={!sessionOpen}
        title={
          sessionOpen
            ? undefined
            : "On-demand briefs are disabled when the US equity session is closed"
        }
        aria-haspopup="dialog"
      >
        <FilePlus2 aria-hidden="true" className="size-3.5" />
        Generate brief
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
          onMouseDown={close}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-brief-title"
            aria-describedby="generate-brief-description"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[8px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-3)] shadow-[var(--shadow-float)] terminal-scroll sm:max-w-lg sm:rounded-[8px]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--ib-border-strong)] px-4 py-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ib-maroon-300)]">
                  Firm-wide research
                </p>
                <h2
                  id="generate-brief-title"
                  className="mt-1 text-lg font-semibold"
                >
                  Generate brief
                </h2>
                <p
                  id="generate-brief-description"
                  className="mt-1 text-[12px] leading-5 text-[var(--ib-text-secondary)]"
                >
                  {demoMode
                    ? "This demo request creates a session-only fixture job. It does not enter a live archive or trigger external delivery."
                    : sessionOpen
                      ? "Queues a firm-wide brief using configured sources, quality gates, archive, and team delivery policy."
                      : "US equities are closed. On-demand editions stay off until the next session so a Saturday click cannot publish a leftover Friday tape."}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={close}
                className="grid size-11 shrink-0 place-items-center rounded-[4px] text-[var(--ib-text-muted)] hover:bg-[var(--ib-surface-hover)] hover:text-[var(--ib-text-primary)]"
                aria-label="Close generate brief dialog"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </header>

            {result ? (
              <div className="p-4">
                <div className="rounded-[6px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-inset)] p-4">
                  <span className="grid size-9 place-items-center rounded-[4px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] text-[var(--state-info)]">
                    <Check aria-hidden="true" className="size-4" />
                  </span>
                  <h3 className="mt-3 text-[15px] font-semibold">
                    Request accepted
                  </h3>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--ib-text-secondary)]">
                    {result.message ??
                      "The report job has entered the shared queue."}
                  </p>
                  <dl className="mt-3 grid gap-2 border-y border-[var(--ib-border-subtle)] py-3 font-mono text-[10px] sm:grid-cols-2">
                    <div>
                      <dt className="text-[var(--ib-text-muted)]">
                        Job / report id
                      </dt>
                      <dd className="mt-1 break-all text-[var(--ib-text-primary)]">
                        {result.id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--ib-text-muted)]">
                        Current stage
                      </dt>
                      <dd className="mt-1">
                        <StatusIndicator kind="queued" label={result.status} />
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-[11px] leading-4 text-[var(--ib-text-muted)]">
                    {result.status === "completed" || result.status === "partial"
                      ? "The brief is in the firm-wide archive and can be opened below."
                      : "A report link will appear only after the archive record is resolvable. This screen intentionally does not open an unfinished report."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" onClick={close}>
                      Done
                    </Button>
                    {result.status === "completed" ||
                    result.status === "partial" ? (
                      <Link
                        href={`/reports/${result.id}`}
                        className="inline-flex min-h-8 items-center rounded-[4px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-2)] px-2.5 text-xs font-medium hover:bg-[var(--ib-surface-hover)] max-sm:min-h-11"
                      >
                        Open report
                      </Link>
                    ) : null}
                    <Link
                      href="/archive"
                      className="inline-flex min-h-8 items-center rounded-[4px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-2)] px-2.5 text-xs font-medium hover:bg-[var(--ib-surface-hover)] max-sm:min-h-11"
                    >
                      Open Research Archive
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4 p-4">
                <fieldset>
                  <legend className="text-[12px] font-medium text-[var(--ib-text-primary)]">
                    Edition scope
                  </legend>
                  <p className="mt-1 text-[11px] text-[var(--ib-text-muted)]">
                    Uses the existing configured sources, watchlists, and
                    quality gates.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {REPORT_EDITIONS.map((item) => (
                        <label
                          key={item}
                          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[4px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-inset)] px-3 text-[12px] hover:bg-[var(--ib-surface-hover)]"
                        >
                          <input
                            type="radio"
                            name="edition"
                            value={item}
                            checked={edition === item}
                            onChange={() => setEdition(item)}
                            className="accent-[var(--ib-maroon-500)]"
                          />
                          {editionLabel(item)}
                        </label>
                      ))}
                  </div>
                </fieldset>

                <div className="grid gap-2 rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] p-3 font-mono text-[10px] sm:grid-cols-2">
                  <div>
                    <p className="text-[var(--ib-text-muted)]">Archive scope</p>
                    <p className="mt-1 text-[var(--ib-text-primary)]">
                      Firm-wide · immutable snapshot
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--ib-text-muted)]">Delivery</p>
                    <p className="mt-1 text-[var(--ib-text-primary)]">
                      Configured team policy
                    </p>
                  </div>
                </div>

                {error ? (
                  <p
                    role="alert"
                    className="rounded-[4px] border border-[color-mix(in_oklab,var(--market-negative)_35%,transparent)] bg-[color-mix(in_oklab,var(--market-negative)_8%,transparent)] px-3 py-2 text-[12px] leading-5 text-[var(--market-negative)]"
                  >
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--ib-border-subtle)] pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={close}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={pending}
                    aria-busy={pending}
                  >
                    <FilePlus2 aria-hidden="true" className="size-3.5" />
                    {pending ? "Queuing brief…" : "Queue firm-wide brief"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
