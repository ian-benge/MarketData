"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/Panel";
import type {
  FixtureSector,
  FixtureWatchlist,
} from "@/lib/fixtures/watchlists";

type SessionState = "submitting" | "accepted";

type WatchlistRow = FixtureWatchlist & {
  demo?: boolean;
  sessionState?: SessionState;
};

type Feedback = { tone: "error" | "success"; message: string } | null;

type FieldErrors = Partial<Record<"name" | "symbols", string>>;

type CreateWatchlistResponse = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  symbols?: unknown;
  isDefault?: unknown;
  demo?: unknown;
  error?: unknown;
};

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;

function parseSymbols(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

function duplicateSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const symbol of symbols) {
    if (seen.has(symbol)) duplicates.add(symbol);
    seen.add(symbol);
  }
  return [...duplicates];
}

function sessionBadge(row: WatchlistRow) {
  if (row.sessionState === "submitting") {
    return <Badge tone="warn">Saving</Badge>;
  }
  if (row.sessionState === "accepted") {
    return <Badge tone="mock">Session only</Badge>;
  }
  if (row.isDefault) return <Badge tone="info">Default</Badge>;
  return <Badge tone="neutral">Shared</Badge>;
}

function WatchlistCards({ rows }: { rows: WatchlistRow[] }) {
  return (
    <div className="space-y-2 md:hidden">
      {rows.map((row) => (
        <article
          key={row.id}
          className="min-w-0 rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] p-3"
        >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--ib-text-primary)]">
                {row.name}
              </h3>
              <p className="mt-0.5 text-xs leading-4 text-[var(--ib-text-muted)]">
                {row.description || "No description provided"}
              </p>
            </div>
            <div className="shrink-0">{sessionBadge(row)}</div>
          </div>
          <p className="mt-3 font-mono text-xs leading-5 text-[var(--ib-text-secondary)]">
            {row.symbols.join(", ") || "No symbols"}
          </p>
          <p className="mt-2 text-[11px] text-[var(--ib-text-muted)]">
            {row.symbols.length} configured symbol
            {row.symbols.length === 1 ? "" : "s"}
          </p>
        </article>
      ))}
    </div>
  );
}

function SectorCards({ sectors }: { sectors: FixtureSector[] }) {
  return (
    <div className="space-y-2 md:hidden">
      {sectors.map((sector) => (
        <article
          key={sector.id}
          className="min-w-0 rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--ib-text-primary)]">
                {sector.name}
              </h3>
              <p className="mt-0.5 font-mono text-[11px] text-[var(--ib-text-muted)]">
                {sector.slug}
              </p>
            </div>
            <span className="font-mono text-xs text-[var(--ib-text-secondary)]">
              {sector.symbols.length}
            </span>
          </div>
          <p className="mt-3 font-mono text-xs leading-5 text-[var(--ib-text-secondary)]">
            {sector.symbols.join(", ")}
          </p>
        </article>
      ))}
    </div>
  );
}

export function WatchlistsWorkspace({
  initialWatchlists,
  sectors,
}: {
  initialWatchlists: FixtureWatchlist[];
  sectors: FixtureSector[];
}) {
  const [rows, setRows] = useState<WatchlistRow[]>(initialWatchlists);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [symbols, setSymbols] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): {
    errors: FieldErrors;
    normalizedName: string;
    normalizedSymbols: string[];
  } {
    const errors: FieldErrors = {};
    const normalizedName = name.trim();
    const normalizedSymbols = parseSymbols(symbols);

    if (!normalizedName) {
      errors.name = "Enter a watchlist name.";
    } else if (
      rows.some(
        (row) => row.name.trim().toLowerCase() === normalizedName.toLowerCase(),
      )
    ) {
      errors.name = "A shared watchlist with this name already exists.";
    }

    if (normalizedSymbols.length === 0) {
      errors.symbols = "Enter at least one ticker symbol.";
    } else {
      const invalid = normalizedSymbols.filter(
        (symbol) => !SYMBOL_PATTERN.test(symbol),
      );
      const duplicates = duplicateSymbols(normalizedSymbols);
      if (invalid.length > 0) {
        errors.symbols = `Use valid uppercase ticker symbols. Check: ${invalid.join(", ")}.`;
      } else if (duplicates.length > 0) {
        errors.symbols = `Remove duplicate symbols: ${duplicates.join(", ")}.`;
      }
    }

    return { errors, normalizedName, normalizedSymbols };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFeedback(null);
    const { errors, normalizedName, normalizedSymbols } = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const temporaryId = `session-watchlist-${Date.now()}`;
    const optimistic: WatchlistRow = {
      id: temporaryId,
      name: normalizedName,
      description: description.trim() || null,
      symbols: normalizedSymbols,
      isDefault: false,
      sessionState: "submitting",
    };

    setSubmitting(true);
    setRows((current) => [optimistic, ...current]);

    try {
      const response = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          description: description.trim() || undefined,
          symbols: normalizedSymbols,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as CreateWatchlistResponse;

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "The watchlist could not be saved.",
        );
      }
      if (typeof payload.id !== "string") {
        throw new Error("The watchlist response was incomplete.");
      }

      const saved: WatchlistRow = {
        ...optimistic,
        id: payload.id,
        name: typeof payload.name === "string" ? payload.name : normalizedName,
        description:
          typeof payload.description === "string" && payload.description.trim()
            ? payload.description
            : null,
        symbols: Array.isArray(payload.symbols)
          ? payload.symbols.filter(
              (symbol): symbol is string => typeof symbol === "string",
            )
          : normalizedSymbols,
        isDefault: payload.isDefault === true,
        demo: payload.demo === true,
        sessionState: payload.demo === true ? "accepted" : undefined,
      };

      setRows((current) =>
        current.map((row) => (row.id === temporaryId ? saved : row)),
      );
      setName("");
      setDescription("");
      setSymbols("");
      setFieldErrors({});
      setFeedback({
        tone: "success",
        message:
          payload.demo === true
            ? "Shared watchlist accepted and added to this session. Demo fixture changes reset when the page reloads."
            : "Shared watchlist created and saved for the team.",
      });
    } catch (error) {
      setRows((current) => current.filter((row) => row.id !== temporaryId));
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The watchlist could not be saved.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.6fr)]">
        <Panel
          title="Create shared watchlist"
          description="Adds a team-visible coverage list through the existing watchlist API."
          actions={<Badge tone="brand">Team edit</Badge>}
        >
          <form
            className="space-y-3"
            onSubmit={handleSubmit}
            aria-busy={submitting}
            noValidate
          >
            <div>
              <label
                htmlFor="watchlist-name"
                className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]"
              >
                Watchlist name
              </label>
              <input
                id="watchlist-name"
                className="field-control"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setFieldErrors((current) => ({
                    ...current,
                    name: undefined,
                  }));
                }}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={
                  fieldErrors.name ? "watchlist-name-error" : undefined
                }
                autoComplete="off"
                maxLength={80}
                disabled={submitting}
                required
              />
              {fieldErrors.name ? (
                <p
                  id="watchlist-name-error"
                  className="mt-1 text-xs text-[var(--market-negative)]"
                >
                  {fieldErrors.name}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="watchlist-description"
                className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]"
              >
                Description{" "}
                <span className="text-[var(--ib-text-muted)]">(optional)</span>
              </label>
              <textarea
                id="watchlist-description"
                className="field-control min-h-20 resize-y"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={240}
                disabled={submitting}
              />
            </div>

            <div>
              <label
                htmlFor="watchlist-symbols"
                className="mb-1 block text-xs font-medium text-[var(--ib-text-secondary)]"
              >
                Ticker symbols
              </label>
              <textarea
                id="watchlist-symbols"
                className="field-control min-h-24 resize-y font-mono uppercase"
                value={symbols}
                onChange={(event) => {
                  setSymbols(event.target.value.toUpperCase());
                  setFieldErrors((current) => ({
                    ...current,
                    symbols: undefined,
                  }));
                }}
                aria-invalid={Boolean(fieldErrors.symbols)}
                aria-describedby={
                  fieldErrors.symbols
                    ? "watchlist-symbols-help watchlist-symbols-error"
                    : "watchlist-symbols-help"
                }
                placeholder="NVDA, AMD, AVGO"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                disabled={submitting}
                required
              />
              <p
                id="watchlist-symbols-help"
                className="mt-1 text-[11px] leading-4 text-[var(--ib-text-muted)]"
              >
                Separate symbols with commas or spaces. Lowercase input is
                converted to uppercase; duplicates are rejected.
              </p>
              {fieldErrors.symbols ? (
                <p
                  id="watchlist-symbols-error"
                  className="mt-1 text-xs text-[var(--market-negative)]"
                >
                  {fieldErrors.symbols}
                </p>
              ) : null}
            </div>

            {feedback ? (
              <div
                role={feedback.tone === "error" ? "alert" : "status"}
                className={
                  feedback.tone === "error"
                    ? "rounded-[4px] border border-[color-mix(in_oklab,var(--market-negative)_38%,transparent)] bg-[color-mix(in_oklab,var(--market-negative)_8%,transparent)] p-2.5 text-xs leading-5 text-[var(--market-negative)]"
                    : "rounded-[4px] border border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] p-2.5 text-xs leading-5 text-[var(--ib-text-secondary)]"
                }
              >
                {feedback.message}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ib-border-subtle)] pt-3">
              <p className="max-w-xs text-[11px] leading-4 text-[var(--ib-text-muted)]">
                Session preview: accepted fixture rows remain local to this
                browser page.
              </p>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={submitting}
                aria-busy={submitting}
              >
                {submitting ? "Saving…" : "Create watchlist"}
              </Button>
            </div>
          </form>
        </Panel>

        <Panel
          title="Shared watchlists"
          description="Firm-wide ticker groups used by dashboard and report coverage."
          actions={<Badge tone="neutral">{rows.length} lists</Badge>}
          bodyClassName="p-0"
        >
          <div className="p-3 md:hidden">
            <WatchlistCards rows={rows} />
          </div>
          <div className="hidden md:block">
            <DataTable
              rows={rows}
              rowKey={(row) => row.id}
              caption="Shared watchlists"
              rowClassName={(row) =>
                row.sessionState === "submitting"
                  ? "bg-[var(--ib-surface-selected)]"
                  : undefined
              }
              columns={[
                {
                  key: "name",
                  header: "Watchlist",
                  width: "28%",
                  render: (row) => (
                    <div className="min-w-40">
                      <div className="font-medium text-[var(--ib-text-primary)]">
                        {row.name}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-4 text-[var(--ib-text-muted)]">
                        {row.description || "No description provided"}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "symbols",
                  header: "Coverage",
                  render: (row) => (
                    <span className="break-words font-mono text-xs leading-5 text-[var(--ib-text-secondary)]">
                      {row.symbols.join(", ") || "—"}
                    </span>
                  ),
                },
                {
                  key: "count",
                  header: "Symbols",
                  align: "right",
                  mono: true,
                  priority: "medium",
                  width: "84px",
                  render: (row) => row.symbols.length,
                },
                {
                  key: "state",
                  header: "Scope",
                  align: "right",
                  priority: "medium",
                  width: "112px",
                  render: (row) => sessionBadge(row),
                },
              ]}
            />
          </div>
        </Panel>
      </div>

      <Panel
        title="Sector coverage"
        description="Reference taxonomy for report and dashboard grouping. No sector mutation endpoint is available."
        actions={<Badge tone="neutral">Read only</Badge>}
        bodyClassName="p-0"
      >
        <div className="p-3 md:hidden">
          <SectorCards sectors={sectors} />
        </div>
        <div className="hidden md:block">
          <DataTable
            rows={sectors}
            rowKey={(sector) => sector.id}
            caption="Read-only sector coverage"
            columns={[
              {
                key: "name",
                header: "Sector",
                width: "26%",
                render: (sector) => (
                  <span className="font-medium text-[var(--ib-text-primary)]">
                    {sector.name}
                  </span>
                ),
              },
              {
                key: "slug",
                header: "Identifier",
                mono: true,
                priority: "medium",
                width: "180px",
                render: (sector) => (
                  <span className="text-xs text-[var(--ib-text-muted)]">
                    {sector.slug}
                  </span>
                ),
              },
              {
                key: "symbols",
                header: "Configured symbols",
                render: (sector) => (
                  <span className="break-words font-mono text-xs leading-5 text-[var(--ib-text-secondary)]">
                    {sector.symbols.join(", ")}
                  </span>
                ),
              },
              {
                key: "count",
                header: "Count",
                align: "right",
                mono: true,
                priority: "medium",
                width: "76px",
                render: (sector) => sector.symbols.length,
              },
            ]}
          />
        </div>
      </Panel>
    </div>
  );
}
