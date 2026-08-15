"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EventCard } from "@/components/news/EventCard";
import { TickerSearchField } from "@/components/news/TickerSearchField";
import { DeskAsk } from "@/components/intel/DeskAsk";
import { MoveNarrativeLoader } from "@/components/intel/MoveNarrativeLoader";
import { NewsDigestPanel } from "@/components/intel/NewsDigestPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatePanel } from "@/components/ui/StatePanel";
import { EVENT_TYPES, EVENT_TYPE_LABELS, type EventType } from "@/lib/intelligence/types";
import type {
  IntelligenceEvent,
  MoveExplanation,
  ParsedNewsQuery,
  CoverageGap,
  SourceStatus,
} from "@/lib/intelligence/types";
import { THEMES } from "@/lib/intelligence/themes";
import { parseTickerList, queryIsTickerOnly } from "@/lib/intelligence/ticker-suggest";

const RECENT_KEY = "ib-news-recent-searches";

const TIME_WINDOWS = [
  { id: "", label: "All windows" },
  { id: "today", label: "Today" },
  { id: "this week", label: "This week" },
  { id: "last hour", label: "Last hour" },
  { id: "premarket", label: "Premarket" },
  { id: "after-hours", label: "After-hours" },
] as const;

const TYPE_CHIPS: EventType[] = [
  "export_control",
  "earnings",
  "filing",
  "contract",
  "ma",
  "cyber",
];

type SavedSearch = { id: string; name: string; query: string; filters: Record<string, unknown> };

type NewsPayload = {
  query: string;
  parsed: ParsedNewsQuery;
  events: IntelligenceEvent[];
  moves: MoveExplanation[];
  gaps: CoverageGap[];
  sources: SourceStatus[];
  coverageTickers?: string[];
  fetchedAt: string;
  stale: boolean;
  error?: string;
};

function asEventType(value?: string): EventType | "" {
  if (!value) return "";
  return (EVENT_TYPES as readonly string[]).includes(value) ? (value as EventType) : "";
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((row): row is string => typeof row === "string").slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function writeRecent(query: string) {
  const next = [query, ...readRecent().filter((row) => row !== query)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function parseTickerParam(raw: string): string[] {
  return parseTickerList(raw.replaceAll(",", " "));
}

function providerSearchStatus(tickers: string[]): string {
  const names = tickers.join(", ");
  return `Searching news providers for ${names}. Company wires, filings, and RSS can take a few seconds — this is a live provider query, not a generated summary.`;
}

function buildParams(input: {
  query: string;
  tickers: string[];
  eventType: EventType | "";
  theme: string;
  materialOnly: boolean;
  window: string;
  ask?: string;
}) {
  const params = new URLSearchParams();
  if (input.query.trim()) params.set("q", input.query.trim());
  if (input.tickers.length) params.set("ticker", input.tickers.join(","));
  if (input.eventType) params.set("type", input.eventType);
  if (input.theme) params.set("theme", input.theme);
  if (input.materialOnly) params.set("material", "1");
  if (input.window) params.set("window", input.window);
  if (input.ask?.trim()) params.set("ask", input.ask.trim());
  return params;
}

export function NewsWorkspace({
  initialQuery = "",
  initialTicker = "",
  initialEventType,
  initialTheme = "",
  initialMaterial = false,
  initialWindow = "",
  initialAsk = "",
}: {
  initialQuery?: string;
  initialTicker?: string;
  initialEventType?: string;
  initialTheme?: string;
  initialMaterial?: boolean;
  initialWindow?: string;
  initialAsk?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [tickers, setTickers] = useState<string[]>(() => parseTickerParam(initialTicker));
  const [eventType, setEventType] = useState<EventType | "">(asEventType(initialEventType));
  const [theme, setTheme] = useState(initialTheme);
  const [materialOnly, setMaterialOnly] = useState(initialMaterial);
  const [windowFilter, setWindowFilter] = useState(initialWindow);
  const [showThemes, setShowThemes] = useState(Boolean(initialTheme));
  const [reloadNonce, setReloadNonce] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [canSave, setCanSave] = useState(false);
  const [payload, setPayload] = useState<NewsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setRecent(readRecent());
    requestAnimationFrame(() => inputRef.current?.focus());
    void fetch("/api/news/saved", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          searches?: SavedSearch[];
          persistence?: string;
        };
        setSaved(body.searches ?? []);
        setCanSave(body.persistence === "supabase");
      })
      .catch(() => {
        setCanSave(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = buildParams({
      query,
      tickers,
      eventType,
      theme,
      materialOnly,
      window: windowFilter,
      ask: initialAsk,
    });
    const nextPath = params.toString() ? `/news?${params}` : "/news";

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/news?${params.toString()}`, {
          cache: "no-store",
        });
        const body = (await response.json()) as NewsPayload;
        if (cancelled) return;
        if (!response.ok) {
          setError(body.error ?? "Headline search failed.");
          setPayload(null);
          return;
        }
        setError(null);
        setPayload(body);
        setSelectedIndex(0);
        if (query.trim()) {
          writeRecent(query.trim());
          setRecent(readRecent());
        }
      } catch {
        if (!cancelled) {
          setError("Headline search could not reach the intelligence service.");
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = window.setTimeout(() => {
      router.replace(nextPath, { scroll: false });
      void load();
    }, query ? 180 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eventType, initialAsk, materialOnly, query, reloadNonce, router, theme, tickers, windowFilter]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement;
      if (typing) return;
      const count = payload?.events.length ?? 0;
      if (!count) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, count - 1));
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payload?.events.length]);

  const coverage = useMemo(
    () => new Set((payload?.coverageTickers ?? []).map((symbol) => symbol.toUpperCase())),
    [payload?.coverageTickers],
  );
  const focusTicker =
    payload?.parsed.whyTicker ?? (tickers.length === 1 ? tickers[0]! : null);
  const why =
    (focusTicker
      ? payload?.moves.find((row) => row.ticker === focusTicker)
      : null) ??
    payload?.moves[0] ??
    null;
  const showWhy =
    Boolean(why) &&
    (payload?.parsed.intent === "why_moving" || tickers.length === 1);
  const chartTicker = tickers[0] ?? "";
  const hasFilters = Boolean(
    tickers.length || eventType || theme || materialOnly || windowFilter,
  );

  function addTicker(symbol: string) {
    const next = symbol.trim().toUpperCase();
    if (!next) return;
    setTickers((current) => (current.includes(next) ? current : [...current, next]));
  }

  function removeTicker(symbol: string) {
    setTickers((current) => current.filter((row) => row !== symbol));
  }

  function clearFilters() {
    setTickers([]);
    setEventType("");
    setTheme("");
    setMaterialOnly(false);
    setWindowFilter("");
  }

  async function saveCurrent() {
    const name = (query.trim() || tickers.join(" ") || theme || "Untitled search").slice(0, 80);
    if (!query.trim() && !tickers.length && !theme && !eventType) return;
    setSaveError(null);
    try {
      const response = await fetch("/api/news/saved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          query: query.trim() || tickers.join(" ") || theme,
          filters: {
            ticker: tickers.join(","),
            type: eventType || undefined,
            theme: theme || undefined,
            material: materialOnly,
            window: windowFilter || undefined,
          },
        }),
      });
      const body = (await response.json()) as { search?: SavedSearch; error?: string };
      if (!response.ok || !body.search) {
        setSaveError(body.error ?? "Could not save this search.");
        return;
      }
      setSaved((current) => [
        body.search!,
        ...current.filter((row) => row.id !== body.search!.id && row.name !== body.search!.name),
      ]);
    } catch {
      setSaveError("Could not save this search.");
    }
  }

  async function removeSaved(id: string) {
    try {
      const response = await fetch(`/api/news/saved?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) return;
      setSaved((current) => current.filter((row) => row.id !== id));
    } catch {
      /* keep list */
    }
  }

  function applySaved(row: SavedSearch) {
    setQuery(row.query);
    const filters = row.filters ?? {};
    setTickers(typeof filters.ticker === "string" ? parseTickerParam(filters.ticker) : []);
    setEventType(asEventType(typeof filters.type === "string" ? filters.type : ""));
    setTheme(typeof filters.theme === "string" ? filters.theme : "");
    setMaterialOnly(filters.material === true || filters.material === "1");
    setWindowFilter(typeof filters.window === "string" ? filters.window : "");
    if (typeof filters.theme === "string" && filters.theme) setShowThemes(true);
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Intelligence"
        title="Material News"
        description="Search live wires, filings, and clustered events. Why-it’s-moving is evidence-backed — unknown stays unknown."
      />

      <Panel
        title="Headline search"
        description="Pin tickers first, then refine with a question or chips. Ask stays grounded in this session’s evidence."
        bodyClassName="space-y-3 p-3"
      >
        <div className="flex flex-col gap-2 lg:flex-row">
          <TickerSearchField
            selected={tickers}
            onAdd={addTicker}
            onRemove={removeTicker}
          />
          <label className="sr-only" htmlFor="news-search">
            Search headlines
          </label>
          <input
            id="news-search"
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              if (!queryIsTickerOnly(query)) return;
              const next = parseTickerList(query);
              if (!next.length) return;
              event.preventDefault();
              setTickers((current) => [...new Set([...current, ...next])]);
              setQuery("");
            }}
            placeholder='Question or keywords — “why is IREN down today”, “AI power contracts this week”'
            className="field-control h-11 min-w-0 flex-1 text-sm"
          />
          {canSave ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-11 shrink-0"
              onClick={() => void saveCurrent()}
              disabled={!query.trim() && !tickers.length && !theme}
            >
              Save search
            </Button>
          ) : null}
        </div>
        {saveError ? (
          <p className="text-[12px] text-[var(--market-negative)]">{saveError}</p>
        ) : null}
        {loading && tickers.length ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-[4px] border border-[color-mix(in_oklab,var(--state-info)_40%,var(--ib-border-subtle))] bg-[color-mix(in_oklab,var(--state-info)_8%,transparent)] px-2.5 py-2 text-[12px] leading-5 text-[var(--ib-text-secondary)]"
          >
            {providerSearchStatus(tickers)}
          </p>
        ) : null}

        {hasFilters ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Active
            </span>
            {tickers.map((symbol) => (
              <button
                key={`active-${symbol}`}
                type="button"
                className="rounded-[3px] border border-[color-mix(in_oklab,var(--ib-maroon-500)_48%,transparent)] bg-[color-mix(in_oklab,var(--ib-maroon-500)_12%,transparent)] px-2 py-1 font-mono text-[11px] text-[var(--ib-maroon-300)]"
                onClick={() => removeTicker(symbol)}
              >
                {symbol} ×
              </button>
            ))}
            {eventType ? (
              <span className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[11px] text-[var(--ib-text-secondary)]">
                {EVENT_TYPE_LABELS[eventType]}
              </span>
            ) : null}
            {windowFilter ? (
              <span className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[11px] text-[var(--ib-text-secondary)]">
                {TIME_WINDOWS.find((row) => row.id === windowFilter)?.label ?? windowFilter}
              </span>
            ) : null}
            {theme ? (
              <span className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[11px] text-[var(--ib-text-secondary)]">
                {THEMES.find((row) => row.id === theme)?.label ?? theme}
              </span>
            ) : null}
            {materialOnly ? (
              <span className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[11px] text-[var(--ib-text-secondary)]">
                Material only
              </span>
            ) : null}
            <button
              type="button"
              className="text-[11px] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Time
            </span>
            {TIME_WINDOWS.map((row) => (
              <ChipToggle
                key={row.id || "all"}
                pressed={windowFilter === row.id}
                onClick={() => setWindowFilter(row.id)}
              >
                {row.label}
              </ChipToggle>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Type
            </span>
            <ChipToggle pressed={!eventType} onClick={() => setEventType("")}>
              All
            </ChipToggle>
            {TYPE_CHIPS.map((type) => (
              <ChipToggle
                key={type}
                pressed={eventType === type}
                onClick={() => setEventType(eventType === type ? "" : type)}
              >
                {EVENT_TYPE_LABELS[type]}
              </ChipToggle>
            ))}
            <ChipToggle pressed={materialOnly} onClick={() => setMaterialOnly((value) => !value)}>
              Material
            </ChipToggle>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Theme
            </span>
            <ChipToggle pressed={showThemes} onClick={() => setShowThemes((value) => !value)}>
              {showThemes ? "Hide" : "Show themes"}
            </ChipToggle>
            {theme && !showThemes ? (
              <ChipToggle pressed onClick={() => setTheme("")}>
                {THEMES.find((row) => row.id === theme)?.label ?? theme}
              </ChipToggle>
            ) : null}
          </div>
          {showThemes ? (
            <div className="flex flex-wrap gap-1.5 pl-12">
              {THEMES.map((row) => (
                <ChipToggle
                  key={row.id}
                  pressed={theme === row.id}
                  onClick={() => setTheme(theme === row.id ? "" : row.id)}
                >
                  {row.label}
                </ChipToggle>
              ))}
            </div>
          ) : null}
        </div>

        {recent.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Recent
            </span>
            {recent.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[11px] text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
                onClick={() => {
                  if (queryIsTickerOnly(item)) {
                    setTickers((current) => [...new Set([...current, ...parseTickerList(item)])]);
                    return;
                  }
                  setQuery(item);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
        {saved.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Saved
            </span>
            {saved.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[11px] text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
                  onClick={() => applySaved(item)}
                >
                  {item.name}
                </button>
                <button
                  type="button"
                  className="text-[11px] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]"
                  aria-label={`Delete saved search ${item.name}`}
                  onClick={() => void removeSaved(item.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="border-t border-[var(--ib-border-subtle)] pt-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            Ask this session
          </p>
          <DeskAsk initialQuestion={initialAsk} compact />
        </div>
        <p className="font-mono text-[10px] text-[var(--ib-text-muted)]">
          Enter a ticker to pin it · j / k inspect clusters · Ctrl+K command palette
        </p>
      </Panel>

      {payload?.stale ? (
        <Panel variant="critical" title="Stale coverage">
          <p className="text-[12px] text-[var(--ib-text-secondary)]">
            Headline intelligence is serving a prior snapshot because a live source refresh failed.
            Treat timestamps and attribution as delayed.
          </p>
        </Panel>
      ) : null}

      {payload?.gaps.length ? (
        <Panel variant="critical" title="Coverage gaps">
          <ul className="space-y-1 text-[12px] text-[var(--ib-text-secondary)]">
            {payload.gaps.map((gap) => (
              <li key={gap.code}>{gap.message}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {showWhy && why ? (
        <Panel
          title={`Why ${why.ticker} is moving`}
          description={`${why.window.label} · ${
            why.attribution === "unknown"
              ? "unknown — not a claim that no catalyst exists"
              : why.evidenceNature === "fact"
                ? "fact from primary source"
                : "system inference"
          }`}
        >
          <div className="space-y-2">
            <MoveNarrativeLoader ticker={why.ticker} explanation={why} />
            {why.changePercent != null ? (
              <p className="font-mono text-[11px] text-[var(--ib-text-muted)]">
                {why.direction} {why.changePercent.toFixed(2)}%
                {why.relativeVolume != null ? ` · RVOL ${why.relativeVolume.toFixed(2)}×` : ""}
                {why.session ? ` · ${why.session}` : ""}
              </p>
            ) : (
              <p className="text-[11px] text-[var(--ib-text-muted)]">
                No live quote was available for this ticker in the current cache.
              </p>
            )}
            {why.relatedTickers.length ? (
              <p className="text-[11px] text-[var(--ib-text-muted)]">
                Related: {why.relatedTickers.join(", ")}
              </p>
            ) : null}
            {why.coverageGap ? (
              <p className="text-[12px] text-[var(--ib-text-muted)]">{why.coverageGap}</p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {!error ? <NewsDigestPanel query={payload?.query ?? initialQuery} /> : null}

      {error ? (
        <StatePanel
          kind="error"
          title="Headline search unavailable"
          description={error}
          actions={
            <Button size="sm" variant="secondary" onClick={() => setReloadNonce((value) => value + 1)}>
              Retry search
            </Button>
          }
        />
      ) : null}

      <div className="grid min-w-0 gap-3 xl:grid-cols-12">
        <Panel
          className="xl:col-span-8"
          title="Event feed"
          description={
            loading && tickers.length
              ? `Searching providers for ${tickers.join(", ")}…`
              : loading
                ? "Loading clustered headlines…"
                : payload
                  ? `${payload.events.length} clustered events${
                      tickers.length ? ` · ${tickers.join(", ")}` : ""
                    } · ${payload.sources.filter((row) => row.status === "ok").length} live sources`
                  : "No payload"
          }
          bodyClassName="p-0"
        >
          {payload?.events.length ? (
            <div className="xl:max-h-[min(70vh,44rem)] xl:overflow-y-auto terminal-scroll">
              {loading && tickers.length ? (
                <p className="border-b border-[var(--ib-border-subtle)] px-3 py-2 text-[12px] text-[var(--ib-text-secondary)]">
                  Refreshing provider headlines for {tickers.join(", ")}…
                </p>
              ) : null}
              {payload.events.map((event, index) => (
                <EventCard
                  key={event.id}
                  event={event}
                  coverageTickers={coverage}
                  selected={index === selectedIndex}
                  onSelectTicker={addTicker}
                />
              ))}
            </div>
          ) : loading ? (
            <p className="px-3 py-8 text-center text-[12px] text-[var(--ib-text-muted)]">
              {tickers.length
                ? `Waiting on news providers for ${tickers.join(", ")}…`
                : "Loading clustered headlines…"}
            </p>
          ) : (
            <StatePanel
              kind="no-results"
              title="No matching events"
              description="No clustered headlines matched this search in the current source window. Coverage gaps are listed above when sources are empty or delayed."
            />
          )}
        </Panel>
        <div className="min-w-0 space-y-3 xl:col-span-4">
          <Panel title="Sources" bodyClassName="p-0">
            {(payload?.sources ?? []).length ? (
              <ul className="divide-y divide-[var(--ib-border-subtle)]">
                {(payload?.sources ?? []).map((source) => (
                  <li key={source.id} className="flex items-start justify-between gap-2 px-3 py-2">
                    <div>
                      <p className="text-[12px] font-medium text-[var(--ib-text-primary)]">
                        {source.label}
                      </p>
                      <p className="text-[11px] text-[var(--ib-text-muted)]">{source.note}</p>
                    </div>
                    <Badge
                      tone={
                        source.status === "ok"
                          ? "positive"
                          : source.status === "error"
                            ? "negative"
                            : "warn"
                      }
                    >
                      {source.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-6 text-[12px] text-[var(--ib-text-muted)]">
                Source status will appear after the first intelligence refresh.
              </p>
            )}
            <p className="border-t border-[var(--ib-border-subtle)] px-3 py-2 text-[10px] leading-4 text-[var(--ib-text-muted)]">
              Search chips use America/Chicago for Today and 4:00 a.m. / 4:00 p.m. ET for
              premarket / after-hours. Why-moving during regular hours uses that same Chicago
              day; premarket, overnight, and weekend/closed Why start at the last completed
              4:00 p.m. ET regular close. Percentages shown with headlines are the current
              quote, not the print at headline time.
            </p>
          </Panel>
          <Panel title="Jump">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  router.push(
                    chartTicker
                      ? `/dashboard?symbol=${encodeURIComponent(chartTicker)}`
                      : "/dashboard",
                  )
                }
              >
                {chartTicker ? `Open ${chartTicker} chart` : "Market Overview"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push("/watchlists")}
              >
                Watchlists
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--ib-text-muted)]">
              Deep links keep ticker, chart, and coverage context. Stale or empty sources stay labeled.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
