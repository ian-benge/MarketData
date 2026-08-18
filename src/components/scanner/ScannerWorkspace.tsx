"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MarketChart } from "@/components/dashboard/MarketChart";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatePanel } from "@/components/ui/StatePanel";
import { StatusIndicator, type StatusKind } from "@/components/ui/StatusIndicator";
import {
  CATALYST_LABELS,
  NEWS_FRESHNESS_LABELS,
  DEFAULT_ALERT_SETTINGS,
  SCANNER_SYSTEM_BLURBS,
  SCANNER_SYSTEM_LABELS,
} from "@/lib/scanner/types";
import type {
  RankedScannerRow,
  ScannerCenterSnapshot,
  ScannerFeatureSnapshot,
  ScannerSessionPreset,
  ScannerSystem,
  ScannerUserState,
} from "@/lib/scanner/types";
import { SESSION_PRESET_LABELS, builtinLayout } from "@/lib/scanner/presets";
import {
  formatCompactCurrency,
  formatPrice,
  formatRelativeVolume,
  formatSignedPercent,
  formatVolume,
  marketToneClass,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type CatalogItem = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  kind: string;
  system: ScannerSystem;
};

type ScannerResponse = {
  snapshot: ScannerCenterSnapshot;
  user: ScannerUserState;
  catalog: CatalogItem[];
  pollSeconds: number;
  error?: string;
};

function freshnessKind(snapshot: ScannerCenterSnapshot): StatusKind {
  const state = snapshot.coverage.freshness;
  if (state === "mock") return "mock";
  if (state === "stale") return "stale";
  if (state === "partial") return "partial";
  if (state === "unavailable") return "unavailable";
  if (state === "delayed") return "delayed";
  return snapshot.coverage.latencyClass === "realtime" ? "realtime" : "delayed";
}

function freshnessLabel(snapshot: ScannerCenterSnapshot): string {
  const cadence = snapshot.coverage.cadenceSeconds;
  const feed = snapshot.coverage.feedCoverage;
  if (snapshot.mocked) return "Mock · not live";
  if (snapshot.coverage.freshness === "stale") return "Stale snapshot";
  if (snapshot.coverage.freshness === "partial") return "Partial coverage";
  if (snapshot.coverage.freshness === "unavailable") return "Unavailable";
  if (feed === "iex") {
    return `IEX realtime + Yahoo pre/post overlay · polling ${cadence}s · not SIP`;
  }
  if (snapshot.coverage.latencyClass === "realtime" && !snapshot.coverage.universeLimited) {
    return `Polling ${cadence}s · live feed`;
  }
  if (snapshot.coverage.latencyClass === "delayed_15m") return `Delayed · polling ${cadence}s`;
  return `Polling ${cadence}s · not a live socket`;
}

function catalystTone(kind: RankedScannerRow["catalystKind"]): "positive" | "info" | "warn" | "neutral" {
  if (kind === "confirmed_company") return "positive";
  if (kind === "likely_catalyst") return "info";
  if (kind === "sector_sympathy" || kind === "macro" || kind === "technical") return "warn";
  return "neutral";
}

function playAlertTone(key: string) {
  const ctx = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = key.includes("halt") ? 220 : key.includes("down") ? 330 : 520;
  gain.gain.value = 0.04;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
}

export function ScannerWorkspace({
  initialSystem,
  initialTicker,
  initialPreset,
}: {
  initialSystem: ScannerSystem;
  initialTicker: string;
  initialPreset?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [system, setSystem] = useState<ScannerSystem>(initialSystem);
  const [preset, setPreset] = useState<ScannerSessionPreset>(
    (initialPreset as ScannerSessionPreset) || "open",
  );
  const [strategyId, setStrategyId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [bookOnly, setBookOnly] = useState(false);
  const [selected, setSelected] = useState(initialTicker);
  const [payload, setPayload] = useState<ScannerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [replayAt, setReplayAt] = useState("");
  const [watchlists, setWatchlists] = useState<Array<{ id: string; name: string }>>([]);
  const seenAlerts = useRef(new Set<string>());
  const primedAlerts = useRef(false);
  const audioUnlocked = useRef(false);
  const audioEnabled = payload?.user.settings.audioEnabled ?? true;
  const presetStrategyIds = useMemo(
    () => builtinLayout(system, preset).strategies,
    [system, preset],
  );

  const buildUrl = useCallback(
    (next: { system?: ScannerSystem; ticker?: string } = {}) => {
      const params = new URLSearchParams();
      const nextSystem = next.system ?? system;
      params.set("system", nextSystem);
      params.set("preset", preset);
      if (next.ticker ?? selected) params.set("ticker", next.ticker ?? selected);
      if (query) params.set("q", query);
      if (watchlistOnly) params.set("watchlist", "1");
      if (bookOnly) params.set("book", "1");
      params.set("strategies", builtinLayout(nextSystem, preset).strategies.join(","));
      return params;
    },
    [system, selected, query, watchlistOnly, bookOnly, preset],
  );

  const load = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      const params = buildUrl({});
      if (opts.refresh) params.set("refresh", "1");
      const response = await fetch(`/api/scanner?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json()) as ScannerResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Scanner unavailable");
      setPayload(body);
      setError(null);
      setStrategyId((current) => {
        const presetIds = builtinLayout(system, preset).strategies;
        if (
          current &&
          presetIds.includes(current) &&
          body.catalog.some((item) => item.id === current)
        ) {
          return current;
        }
        return (
          presetIds.find((id) => body.catalog.some((item) => item.id === id)) ??
          body.catalog[0]?.id ??
          ""
        );
      });
      return body;
    },
    [buildUrl, system, preset],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Scanner unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const seconds = Math.max(payload?.pollSeconds ?? 8, 4);
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [load, payload?.pollSeconds]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    if ((searchParams.get("system") ?? "momentum") !== system) {
      params.set("system", system);
      changed = true;
    }
    if ((searchParams.get("ticker") ?? "") !== selected) {
      if (selected) params.set("ticker", selected);
      else params.delete("ticker");
      changed = true;
    }
    if ((searchParams.get("preset") ?? "") !== preset) {
      params.set("preset", preset);
      changed = true;
    }
    if (!changed) return;
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [system, selected, preset, pathname, router, searchParams]);

  useEffect(() => {
    if (!payload) return;
    if (!primedAlerts.current) {
      for (const alert of payload.snapshot.alerts) seenAlerts.current.add(alert.id);
      primedAlerts.current = true;
      return;
    }
    if (!audioEnabled || !audioUnlocked.current) return;
    for (const alert of payload.snapshot.alerts) {
      if (seenAlerts.current.has(alert.id)) continue;
      seenAlerts.current.add(alert.id);
      if (alert.status === "active") {
        try {
          playAlertTone(alert.strategyId);
        } catch {
          /* ignore autoplay */
        }
        if (payload.user.settings.desktopEnabled && "Notification" in window && Notification.permission === "granted") {
          new Notification(`${alert.ticker} · ${alert.strategyTitle}`, {
            body: alert.explanation.headline,
          });
        }
      }
    }
  }, [payload, audioEnabled]);

  const catalog = (payload?.catalog ?? []).filter((item) =>
    presetStrategyIds.includes(item.id),
  );
  const visibleCatalog = catalog.length ? catalog : (payload?.catalog ?? []);
  const lists = payload?.snapshot.lists ?? {};
  const activeStrategy = strategyId && lists[strategyId] ? strategyId : visibleCatalog[0]?.id;
  const rows = activeStrategy ? (lists[activeStrategy] ?? []) : [];
  const alerts = payload?.snapshot.alerts ?? [];
  const feature: ScannerFeatureSnapshot | null = selected
    ? payload?.snapshot.features[selected] ?? null
    : null;
  const selectedRow = rows.find((row) => row.ticker === selected) ?? rows[0] ?? null;

  async function act(action: string, extra: Record<string, string> = {}) {
    if (!selected && action !== "watchlists") return;
    const response = await fetch("/api/scanner/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ticker: selected, ...extra }),
    });
    if (action === "watchlists" && response.ok) {
      const body = (await response.json()) as { watchlists?: Array<{ id: string; name: string }> };
      setWatchlists(body.watchlists ?? []);
    }
    void load();
  }

  async function savePreset() {
    const name = window.prompt("Preset name");
    if (!name || !payload) return;
    await fetch("/api/scanner/presets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        system,
        layout: {
          sessionPreset: preset,
          strategies: activeStrategy ? [activeStrategy] : [],
          columns: [],
          filters: {
            query,
            minPrice: null,
            maxPrice: null,
            minRvol: null,
            maxFloatMm: null,
            minDollarVolume: null,
            watchlistOnly,
            inPositionOnly: bookOnly,
            newsFreshness: null,
            themes: [],
            hideHalted: false,
            hideMuted: true,
          },
          sort: { key: "rank", dir: "asc" },
        },
      }),
    });
    void load();
  }

  async function runReplay() {
    if (!replayAt) return;
    const response = await fetch(
      `/api/scanner/replay?at=${encodeURIComponent(replayAt)}&system=${system}`,
    );
    if (!response.ok) {
      setError("No scanner history at that timestamp.");
      return;
    }
    const body = (await response.json()) as { snapshot: ScannerCenterSnapshot };
    setPayload((current) =>
      current
        ? { ...current, snapshot: body.snapshot }
        : current,
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      <PageHeader
        compact
        eyebrow="Command center"
        title="Scanner Center"
        description={`${SCANNER_SYSTEM_BLURBS[system]} The browser polls a snapshot — it does not scan the market.`}
        actions={
          payload ? (
            <StatusIndicator kind={freshnessKind(payload.snapshot)} label={freshnessLabel(payload.snapshot)} />
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ChipToggle
          pressed={system === "momentum"}
          onClick={() => setSystem("momentum")}
          className="normal-case tracking-normal"
        >
          {SCANNER_SYSTEM_LABELS.momentum}
        </ChipToggle>
        <ChipToggle pressed={system === "desk"} onClick={() => setSystem("desk")}>
          {SCANNER_SYSTEM_LABELS.desk}
        </ChipToggle>
        {(Object.keys(SESSION_PRESET_LABELS) as ScannerSessionPreset[]).map((id) => (
          <ChipToggle
            key={id}
            pressed={preset === id}
            onClick={() => {
              setPreset(id);
              setStrategyId(builtinLayout(system, id).strategies[0] ?? "");
            }}
          >
            {SESSION_PRESET_LABELS[id]}
          </ChipToggle>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Search scanner"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ticker, catalyst, theme"
          className="h-8 min-w-[180px] rounded-[4px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-2)] px-2 text-[12px] text-[var(--ib-text-primary)]"
        />
        <ChipToggle pressed={watchlistOnly} onClick={() => setWatchlistOnly((value) => !value)}>
          Watchlists
        </ChipToggle>
        <ChipToggle pressed={bookOnly} onClick={() => setBookOnly((value) => !value)}>
          Book
        </ChipToggle>
        <Button size="sm" onClick={() => void load({ refresh: true })}>
          Refresh
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void savePreset()}>
          Save preset
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            audioUnlocked.current = true;
            try {
              const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
              if (Ctx) void new Ctx().resume();
            } catch {
              /* autoplay policy */
            }
            if ("Notification" in window) void Notification.requestPermission();
            void fetch("/api/scanner/settings", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                settings: {
                  ...DEFAULT_ALERT_SETTINGS,
                  ...(payload?.user.settings ?? {}),
                  audioEnabled: !(payload?.user.settings.audioEnabled ?? true),
                },
              }),
            }).then(() => load());
          }}
        >
          Audio {audioEnabled ? "on" : "off"}
        </Button>
        <input
          aria-label="Replay timestamp"
          type="datetime-local"
          value={replayAt}
          onChange={(event) => setReplayAt(event.target.value)}
          className="h-8 rounded-[4px] border border-[var(--ib-border-control)] bg-[var(--ib-surface-2)] px-2 font-mono text-[11px]"
        />
        <Button size="sm" variant="ghost" onClick={() => void runReplay()}>
          Replay
        </Button>
      </div>

      {payload?.snapshot.coverage.coverageNotes.length ? (
        <p className="font-mono text-[11px] text-[var(--ib-text-muted)]">
          {payload.snapshot.coverage.providerName ?? "provider"} · session {payload.snapshot.session} ·{" "}
          {payload.snapshot.coverage.symbolsReceived}/{payload.snapshot.coverage.symbolsRequested} names ·{" "}
          {payload.snapshot.coverage.coverageNotes[0]}
        </p>
      ) : null}

      {error ? (
        <StatePanel kind="error" title="Scanner error" description={error} />
      ) : null}
      {loading && !payload ? (
        <StatePanel kind="info" title="Loading scanner" description="Fetching the latest server-side snapshot." />
      ) : null}
      {!loading && payload && rows.length === 0 && alerts.length === 0 ? (
        <StatePanel
          kind="empty"
          title="No scanner hits"
          description="No names currently meet this strategy’s thresholds, or the universe snapshot is empty."
        />
      ) : null}

      <div className="grid min-h-[560px] min-w-0 gap-3 xl:grid-cols-[200px_minmax(0,1fr)_320px]">
        <Panel title="Strategies" bodyClassName="p-0">
          <nav aria-label="Scanner strategies" className="max-h-[560px] overflow-y-auto terminal-scroll">
            {visibleCatalog.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStrategyId(item.id)}
                aria-pressed={item.id === activeStrategy}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b border-[var(--ib-border-subtle)] px-3 py-2 text-left",
                  item.id === activeStrategy
                    ? "bg-[var(--ib-surface-selected)]"
                    : "hover:bg-[var(--ib-surface-hover)]",
                )}
              >
                <span className="text-[12px] font-medium text-[var(--ib-text-primary)]">
                  {item.shortTitle}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ib-text-muted)]">
                  {(lists[item.id]?.length ?? 0).toString().padStart(2, "0")} hits · {item.kind}
                </span>
              </button>
            ))}
          </nav>
        </Panel>

        <Panel
          title={visibleCatalog.find((item) => item.id === activeStrategy)?.title ?? "Ranked list"}
          description={visibleCatalog.find((item) => item.id === activeStrategy)?.description}
          bodyClassName="p-0"
        >
          <ScannerTable
            rows={rows}
            selected={selected}
            onSelect={setSelected}
          />
        </Panel>

        <Panel title="Alert tape" description="Chronological, with consolidation" bodyClassName="p-0">
          <ol className="max-h-[560px] overflow-y-auto terminal-scroll">
            {alerts.length === 0 ? (
              <li className="px-3 py-4 text-[12px] text-[var(--ib-text-muted)]">No alerts this session.</li>
            ) : (
              alerts.map((alert) => (
                <li key={`${alert.id}-${alert.lastSeenAt}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(alert.ticker)}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b border-[var(--ib-border-subtle)] px-3 py-2 text-left hover:bg-[var(--ib-surface-hover)]",
                      selected === alert.ticker && "bg-[var(--ib-surface-selected)]",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[13px] font-semibold">{alert.ticker}</span>
                      <span className={cn("font-mono text-[12px]", marketToneClass(alert.changeFromClosePct))}>
                        {formatSignedPercent(alert.changeFromClosePct)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      <Badge tone={alert.status === "consolidated" ? "warn" : "brand"}>
                        {alert.strategyTitle}
                      </Badge>
                      {alert.occurrenceCount > 1 ? (
                        <Badge tone="neutral">×{alert.occurrenceCount}</Badge>
                      ) : null}
                      <Badge tone={catalystTone(alert.catalystKind)}>
                        {CATALYST_LABELS[alert.catalystKind]}
                      </Badge>
                    </span>
                    <span className="line-clamp-2 text-[11px] text-[var(--ib-text-secondary)]">
                      {alert.explanation.headline}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ol>
        </Panel>
      </div>

      {feature || selectedRow ? (
        <ScannerDetail
          feature={feature}
          row={selectedRow}
          watchlists={watchlists}
          onLoadWatchlists={() => void act("watchlists")}
          onPin={() => void act("pin")}
          onMute={() => void act("mute", { strategyId: activeStrategy ?? "*" })}
          onAdd={(watchlistId) => void act("add_to_watchlist", { watchlistId })}
          mocked={Boolean(payload?.snapshot.mocked)}
          session={payload?.snapshot.session ?? null}
        />
      ) : null}
    </div>
  );
}

function ScannerTable({
  rows,
  selected,
  onSelect,
}: {
  rows: RankedScannerRow[];
  selected: string;
  onSelect: (ticker: string) => void;
}) {
  return (
    <div className="max-h-[560px] overflow-auto terminal-scroll" role="region" aria-label="Ranked scanner list">
      <table className="w-full min-w-[860px] border-collapse text-left text-[12px] tabular-nums">
        <thead>
          <tr className="border-b border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            {["#", "Sym", "Last", "Chg", "Open", "Vel", "RVOL", "$Vol", "Float", "HOD", "News", "Why", "Opp", "Risk"].map((header) => (
              <th key={header} className="sticky top-0 h-8 bg-[var(--ib-surface-2)] px-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.ticker}
              className={cn(
                "h-[34px] cursor-pointer border-b border-[var(--ib-border-subtle)] hover:bg-[var(--ib-surface-hover)]",
                selected === row.ticker && "bg-[var(--ib-surface-selected)]",
              )}
              onClick={() => onSelect(row.ticker)}
            >
              <td className="px-2 font-mono text-[11px] text-[var(--ib-text-muted)]">{row.rank}</td>
              <td className="px-2">
                <button type="button" className="font-mono text-[13px] font-semibold" aria-label={`Select ${row.ticker}`}>
                  {row.ticker}
                </button>
                {row.inPosition ? <span className="ml-1 text-[10px] text-[var(--ib-maroon-300)]">BOOK</span> : null}
                {row.inWatchlist && !row.inPosition ? (
                  <span className="ml-1 text-[10px] text-[var(--ib-text-muted)]">WL</span>
                ) : null}
              </td>
              <td className="px-2 font-mono">{formatPrice(row.last, row.ticker)}</td>
              <td className={cn("px-2 font-mono", marketToneClass(row.changeFromClosePct))}>
                {formatSignedPercent(row.changeFromClosePct)}
              </td>
              <td className={cn("px-2 font-mono", marketToneClass(row.changeFromOpenPct))}>
                {formatSignedPercent(row.changeFromOpenPct)}
              </td>
              <td className={cn("px-2 font-mono", marketToneClass(row.velocity5mPct))}>
                {formatSignedPercent(row.velocity5mPct)}
              </td>
              <td className="px-2 font-mono">{formatRelativeVolume(row.relativeVolume)}</td>
              <td className="px-2 font-mono">{formatCompactCurrency(row.dollarVolume)}</td>
              <td className="px-2 font-mono">
                {row.floatShares != null ? `${(row.floatShares / 1_000_000).toFixed(1)}M` : "—"}
              </td>
              <td className="px-2 font-mono">{formatSignedPercent(row.distanceFromHodPct)}</td>
              <td className="px-2">
                <Badge tone={row.newsFreshness === "none" ? "neutral" : "info"}>
                  {NEWS_FRESHNESS_LABELS[row.newsFreshness]}
                </Badge>
              </td>
              <td className="max-w-[220px] truncate px-2">
                <Badge tone={catalystTone(row.catalystKind)}>{CATALYST_LABELS[row.catalystKind]}</Badge>
              </td>
              <td className="px-2 font-mono">{row.opportunity.total.toFixed(0)}</td>
              <td className="px-2 font-mono">{row.risk.total.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScannerDetail({
  feature,
  row,
  watchlists,
  onLoadWatchlists,
  onPin,
  onMute,
  onAdd,
  mocked,
  session,
}: {
  feature: ScannerFeatureSnapshot | null;
  row: RankedScannerRow | null;
  watchlists: Array<{ id: string; name: string }>;
  onLoadWatchlists: () => void;
  onPin: () => void;
  onMute: () => void;
  onAdd: (id: string) => void;
  mocked: boolean;
  session: string | null;
}) {
  const ticker = feature?.ticker ?? row?.ticker;
  if (!ticker) return null;
  const explanation = feature?.explanation;
  return (
    <Panel
      title={`${ticker} · event detail`}
      description={feature?.name ?? row?.name ?? undefined}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={onPin}>Pin</Button>
          <Button size="sm" variant="ghost" onClick={onMute}>Mute</Button>
          <Button size="sm" variant="ghost" onClick={onLoadWatchlists}>Add to watchlist</Button>
          <a className="text-[12px] text-[var(--ib-maroon-300)]" href={`/news?q=${encodeURIComponent(`why is ${ticker} moving today`)}`}>
            Material News
          </a>
          <a className="text-[12px] text-[var(--ib-maroon-300)]" href={`/dashboard?symbol=${ticker}`}>
            Chart
          </a>
        </div>
      }
    >
      {watchlists.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {watchlists.map((list) => (
            <Button key={list.id} size="sm" onClick={() => onAdd(list.id)}>
              {list.name}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <MarketChart
            initialSeries={{}}
            initialSymbol={ticker}
            symbol={ticker}
            coverageLabel={feature?.coverageNotes ?? null}
            asOf={feature?.asOf ?? row?.asOf ?? new Date().toISOString()}
            mode={mocked ? "mock" : "provider"}
            marketSession={session}
          />
        </div>
        <div className="min-w-0 space-y-3 xl:col-span-5">
          {explanation ? (
            <div className="space-y-2 text-[13px] leading-5 text-[var(--ib-text-secondary)]">
              <p className="text-[var(--ib-text-primary)]">{explanation.headline}</p>
              <p>{explanation.detail}</p>
              <p>
                <span className="font-medium text-[var(--ib-text-primary)]">Why now. </span>
                {explanation.whyNow}
              </p>
              <p>
                <span className="font-medium text-[var(--ib-text-primary)]">Confirmation. </span>
                {explanation.confirmation}
              </p>
              <p>
                <span className="font-medium text-[var(--ib-text-primary)]">Invalidation. </span>
                {explanation.invalidation}
              </p>
              {explanation.unresolved ? (
                <p className="text-[var(--state-warning)]">Unresolved — competing explanations listed, no invented catalyst.</p>
              ) : null}
              {explanation.competing.length ? (
                <ul className="list-disc pl-4">
                  {explanation.competing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {explanation.evidence.length ? (
                <ul className="space-y-1">
                  {explanation.evidence.map((item) => (
                    <li key={item.id}>
                      <a href={item.url} className="text-[var(--ib-maroon-300)]" target="_blank" rel="noreferrer">
                        {item.title}
                      </a>
                      <span className="ml-2 font-mono text-[10px] text-[var(--ib-text-muted)]">
                        {item.publishedAt} · {item.publisher}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {row ? (
            <ScoreList title="Opportunity" score={row.opportunity} />
          ) : null}
          {row ? <ScoreList title="Risk" score={row.risk} /> : null}
          {feature?.dataQuality ? (
            <p className="font-mono text-[11px] text-[var(--ib-text-muted)]">
              {!feature.dataQuality.float
                ? "Float unavailable — float-gated scanners fail closed. "
                : null}
              {!feature.dataQuality.news
                ? "No qualifying headline in the news window. "
                : null}
              {!feature.dataQuality.bars
                ? "Intraday bars unavailable — velocity and HOD acceleration are incomplete. "
                : null}
              {!feature.dataQuality.options
                ? "Unusual options flow is not entitled on this feed. "
                : null}
            </p>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-[var(--ib-text-secondary)]">
            <dt>Float rotation</dt>
            <dd>{row?.floatRotation != null ? `${row.floatRotation.toFixed(2)}×` : "—"}</dd>
            <dt>VWAP</dt>
            <dd>{formatPrice(row?.vwap)}</dd>
            <dt>52w high</dt>
            <dd>{formatPrice(row?.week52High)}</dd>
            <dt>ATR</dt>
            <dd>{formatPrice(row?.atr)}</dd>
            <dt>Spread</dt>
            <dd>{row?.spreadFraction != null ? `${(row.spreadFraction * 100).toFixed(2)}%` : "—"}</dd>
            <dt>Short interest</dt>
            <dd>{row?.shortInterestPct != null ? `${row.shortInterestPct.toFixed(1)}%` : "—"}</dd>
            <dt>IPO age</dt>
            <dd>{row?.ipoAgeDays != null ? `${row.ipoAgeDays}d` : "—"}</dd>
            <dt>Halt</dt>
            <dd>{row?.haltStatus ?? "unknown"}</dd>
            <dt>Volume</dt>
            <dd>{formatVolume(row?.volume)}</dd>
          </dl>
        </div>
      </div>
    </Panel>
  );
}

function ScoreList({
  title,
  score,
}: {
  title: string;
  score: RankedScannerRow["opportunity"];
}) {
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {title} {score.total.toFixed(0)}
      </p>
      <ul className="space-y-1">
        {score.factors.map((factor) => (
          <li key={factor.id} className="flex items-start justify-between gap-3 text-[11px]">
            <span className="text-[var(--ib-text-secondary)]">
              {factor.label}
              <span className="ml-2 text-[var(--ib-text-muted)]">{factor.note}</span>
            </span>
            <span className="shrink-0 font-mono">{factor.contribution.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
