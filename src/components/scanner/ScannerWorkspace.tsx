"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ScannerFocus } from "@/components/scanner/ScannerFocus";
import { ScannerTable } from "@/components/scanner/ScannerTable";
import { ScannerTape } from "@/components/scanner/ScannerTape";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { ClientMarketTime } from "@/components/ui/ClientMarketTime";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatePanel } from "@/components/ui/StatePanel";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import {
  SYSTEM_ATTRIBUTION,
  SYSTEM_SHORT_LABELS,
  alertCountByStrategy,
  coverageLine,
  displayAlerts,
  displayRows,
  filtersFromQuick,
  focusFromSnapshot,
  freshnessKind,
  freshnessLabel,
  neighboringStrategy,
  neighboringTicker,
  presetFitsSession,
  sessionClockLabel,
  strategyWithHits,
  summarizeScan,
  toggleSort,
  type ScannerSort,
} from "@/lib/scanner/display";
import { SESSION_PRESET_LABELS, builtinLayout } from "@/lib/scanner/presets";
import { inferSessionPreset } from "@/lib/scanner/session";
import { DEFAULT_ALERT_SETTINGS } from "@/lib/scanner/types";
import type {
  RankedScannerRow,
  ScannerAlertEvent,
  ScannerCenterSnapshot,
  ScannerPreset,
  ScannerSessionPreset,
  ScannerSystem,
  ScannerUserState,
} from "@/lib/scanner/types";
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

function playAlertTone(key: string) {
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
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
  initialQuery = "",
  initialWatchlist = false,
  initialBook = false,
}: {
  initialSystem: ScannerSystem;
  initialTicker: string;
  initialPreset?: string;
  initialQuery?: string;
  initialWatchlist?: boolean;
  initialBook?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [system, setSystem] = useState<ScannerSystem>(initialSystem);
  const [preset, setPreset] = useState<ScannerSessionPreset>(
    (initialPreset as ScannerSessionPreset) || inferSessionPreset(),
  );
  const [followSession, setFollowSession] = useState(!initialPreset);
  const [strategyId, setStrategyId] = useState("");
  const [strategyOverride, setStrategyOverride] = useState<string[] | null>(null);
  const [userPresetId, setUserPresetId] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [watchlistOnly, setWatchlistOnly] = useState(initialWatchlist);
  const [bookOnly, setBookOnly] = useState(initialBook);
  const [hideHalted, setHideHalted] = useState(false);
  const [newsOnly, setNewsOnly] = useState(false);
  const [lowFloat, setLowFloat] = useState(false);
  const [hotRvol, setHotRvol] = useState(false);
  const [showMuted, setShowMuted] = useState(false);
  const [tapeStrategyOnly, setTapeStrategyOnly] = useState(false);
  const [selected, setSelected] = useState(initialTicker);
  const [sort, setSort] = useState<ScannerSort>({ key: "rank", dir: "asc" });
  const [payload, setPayload] = useState<ScannerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replayAt, setReplayAt] = useState("");
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [watchlists, setWatchlists] = useState<Array<{ id: string; name: string }>>([]);
  const [now, setNow] = useState(() => Date.now());
  const seenAlerts = useRef(new Set<string>());
  const primedAlerts = useRef(false);
  const audioUnlocked = useRef(false);
  const fetchGen = useRef(0);
  const tableRegionRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const strategyTouched = useRef(false);
  const watchlistsLoaded = useRef(false);
  const audioEnabled = payload?.user.settings.audioEnabled ?? true;
  const livePreset = inferSessionPreset(new Date(now));

  const filters = useMemo(
    () =>
      filtersFromQuick({
        query: debouncedQuery,
        watchlistOnly,
        inPositionOnly: bookOnly,
        hideHalted,
        newsOnly,
        lowFloat,
        hotRvol,
        showMuted,
      }),
    [bookOnly, debouncedQuery, hideHalted, hotRvol, lowFloat, newsOnly, showMuted, watchlistOnly],
  );

  const presetStrategyIds = useMemo(
    () => strategyOverride ?? builtinLayout(system, preset).strategies,
    [preset, strategyOverride, system],
  );

  const localFilters = useMemo(() => ({ ...filters, query }), [filters, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      const params = new URLSearchParams();
      params.set("system", system);
      params.set("strategies", presetStrategyIds.join(","));
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (watchlistOnly) params.set("watchlist", "1");
      if (bookOnly) params.set("book", "1");
      if (hideHalted) params.set("hideHalted", "1");
      if (newsOnly) params.set("news", "0_2h,2_12h,12_24h");
      if (lowFloat) params.set("maxFloat", "20");
      if (hotRvol) params.set("minRvol", "2");
      if (showMuted) params.set("showMuted", "1");
      if (opts.refresh) params.set("refresh", "1");
      const gen = ++fetchGen.current;
      if (opts.refresh) setRefreshing(true);
      try {
        const response = await fetch(`/api/scanner?${params.toString()}`, { cache: "no-store" });
        const body = (await response.json()) as ScannerResponse & { error?: string };
        if (gen !== fetchGen.current) return null;
        if (!response.ok) throw new Error(body.error ?? "Scanner unavailable");
        setPayload(body);
        setError(null);
        setStrategyId((current) => {
          const picked = strategyTouched.current
            ? current
            : strategyWithHits(presetStrategyIds, body.snapshot.lists, current);
          if (
            picked &&
            presetStrategyIds.includes(picked) &&
            body.catalog.some((item) => item.id === picked)
          ) {
            return picked;
          }
          return (
            presetStrategyIds.find((id) => body.catalog.some((item) => item.id === id)) ??
            body.catalog[0]?.id ??
            ""
          );
        });
        return body;
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      bookOnly,
      debouncedQuery,
      hideHalted,
      hotRvol,
      lowFloat,
      newsOnly,
      presetStrategyIds,
      showMuted,
      system,
      watchlistOnly,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    load().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Scanner unavailable");
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
    const urlQuery = searchParams.get("q") ?? "";
    if (urlQuery !== debouncedQuery) {
      if (debouncedQuery) params.set("q", debouncedQuery);
      else params.delete("q");
      changed = true;
    }
    const urlWatch = searchParams.get("watchlist") === "1";
    if (urlWatch !== watchlistOnly) {
      if (watchlistOnly) params.set("watchlist", "1");
      else params.delete("watchlist");
      changed = true;
    }
    const urlBook = searchParams.get("book") === "1";
    if (urlBook !== bookOnly) {
      if (bookOnly) params.set("book", "1");
      else params.delete("book");
      changed = true;
    }
    if (!changed) return;
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    bookOnly,
    debouncedQuery,
    pathname,
    preset,
    router,
    searchParams,
    selected,
    system,
    watchlistOnly,
  ]);

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
          /* autoplay */
        }
        if (
          payload.user.settings.desktopEnabled &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification(`${alert.ticker} · ${alert.strategyTitle}`, {
            body: alert.explanation.headline,
          });
        }
      }
    }
  }, [audioEnabled, payload]);

  useEffect(() => {
    if (!followSession || preset === livePreset) return;
    setUserPresetId(null);
    setStrategyOverride(null);
    strategyTouched.current = false;
    setPreset(livePreset);
  }, [followSession, livePreset, preset]);

  useEffect(() => {
    if (!payload || watchlistsLoaded.current) return;
    watchlistsLoaded.current = true;
    void fetch("/api/scanner/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "watchlists" }),
    })
      .then((response) => response.json())
      .then((body: { watchlists?: Array<{ id: string; name: string }> }) => {
        if (Array.isArray(body.watchlists)) setWatchlists(body.watchlists);
      })
      .catch(() => undefined);
  }, [payload]);

  const catalog = (payload?.catalog ?? [])
    .filter((item) => presetStrategyIds.includes(item.id))
    .sort((a, b) => presetStrategyIds.indexOf(a.id) - presetStrategyIds.indexOf(b.id));
  const visibleCatalog = catalog;
  const lists = payload?.snapshot.lists ?? {};
  const activeStrategy =
    strategyId && (lists[strategyId] || visibleCatalog.some((item) => item.id === strategyId))
      ? strategyId
      : visibleCatalog[0]?.id;
  const rawRows = activeStrategy ? (lists[activeStrategy] ?? []) : [];
  const rows = useMemo(
    () => displayRows(rawRows, localFilters, sort, payload?.user.pins ?? []),
    [localFilters, payload?.user.pins, rawRows, sort],
  );
  const alerts = displayAlerts(
    payload?.snapshot.alerts ?? [],
    localFilters,
    tapeStrategyOnly ? activeStrategy : null,
  );
  const glance = summarizeScan(lists, payload?.snapshot.alerts ?? [], presetStrategyIds);
  const alertCounts = alertCountByStrategy(payload?.snapshot.alerts ?? []);
  const activeMeta = visibleCatalog.find((item) => item.id === activeStrategy) ?? null;
  const { feature, row: selectedRow } = focusFromSnapshot(payload?.snapshot ?? null, selected, rows);

  useEffect(() => {
    if (!payload) return;
    const inRows = rows.some((item) => item.ticker === selected);
    const inFeatures = Boolean(selected && payload.snapshot.features[selected]);
    if (selected && (inRows || inFeatures)) return;
    const next = rows[0]?.ticker ?? alerts[0]?.ticker ?? selected;
    if (next !== selected) setSelected(next);
  }, [alerts, payload, rows, selected]);

  useEffect(() => {
    if (!selected) return;
    const node = tableRegionRef.current?.querySelector(`[data-ticker="${CSS.escape(selected)}"]`);
    if (node instanceof HTMLElement && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [activeStrategy, selected]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (typing) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = neighboringTicker(rows, selected, 1);
        if (next) setSelected(next);
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = neighboringTicker(rows, selected, -1);
        if (next) setSelected(next);
      }
      if (event.key === "]" || event.key === "[") {
        event.preventDefault();
        const ids = visibleCatalog.map((item) => item.id);
        const next = neighboringStrategy(ids, activeStrategy ?? "", event.key === "]" ? 1 : -1);
        if (next) selectStrategy(next);
      }
      if (event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        void load({ refresh: true }).catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Scanner unavailable");
        });
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeStrategy, load, rows, selected, visibleCatalog]);

  function clearUserLayout() {
    setUserPresetId(null);
    setStrategyOverride(null);
    strategyTouched.current = false;
  }

  function selectStrategy(id: string) {
    strategyTouched.current = true;
    setStrategyId(id);
  }

  function changeSystem(next: ScannerSystem) {
    clearUserLayout();
    setSystem(next);
    setStrategyId(strategyWithHits(builtinLayout(next, preset).strategies, payload?.snapshot.lists ?? {}, ""));
    setSort({ key: "rank", dir: "asc" });
  }

  function changePreset(next: ScannerSessionPreset, follow = false) {
    clearUserLayout();
    setFollowSession(follow);
    setPreset(next);
    setStrategyId(strategyWithHits(builtinLayout(system, next).strategies, payload?.snapshot.lists ?? {}, ""));
    setSort({ key: "rank", dir: "asc" });
  }

  function applySavedPreset(item: ScannerPreset) {
    setUserPresetId(item.id);
    setFollowSession(false);
    setSystem(item.system);
    setPreset(item.layout.sessionPreset);
    setStrategyOverride(item.layout.strategies);
    setStrategyId(item.layout.strategies[0] ?? "");
    setQuery(item.layout.filters.query);
    setWatchlistOnly(item.layout.filters.watchlistOnly);
    setBookOnly(item.layout.filters.inPositionOnly);
    setHideHalted(item.layout.filters.hideHalted);
    setNewsOnly(Boolean(item.layout.filters.newsFreshness?.length));
    setLowFloat(item.layout.filters.maxFloatMm != null);
    setHotRvol(item.layout.filters.minRvol != null);
    setShowMuted(!item.layout.filters.hideMuted);
  }

  async function act(action: string, extra: Record<string, string> = {}) {
    if (!selected && action !== "watchlists") return;
    setActionError(null);
    const response = await fetch("/api/scanner/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ticker: selected, ...extra }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      watchlists?: Array<{ id: string; name: string }>;
    };
    if (!response.ok) {
      setActionError(body.error ?? "Action failed.");
      return;
    }
    if (action === "watchlists") setWatchlists(body.watchlists ?? []);
    void load();
  }

  async function savePreset() {
    const name = presetName.trim();
    if (!name || !payload) return;
    setSavingPreset(true);
    setActionError(null);
    try {
      const response = await fetch("/api/scanner/presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          system,
          layout: {
            sessionPreset: preset,
            strategies: presetStrategyIds,
            columns: [],
            filters: localFilters,
            sort,
          },
        }),
      });
      const body = (await response.json()) as { error?: string; preset?: ScannerPreset };
      if (!response.ok || !body.preset) {
        setActionError(body.error ?? "Could not save this layout.");
        return;
      }
      setPresetName("");
      setUserPresetId(body.preset.id);
      void load();
    } finally {
      setSavingPreset(false);
    }
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
    setPayload((current) => (current ? { ...current, snapshot: body.snapshot } : current));
  }

  async function toggleAudio() {
    audioUnlocked.current = true;
    try {
      const Ctx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) void new Ctx().resume();
    } catch {
      /* autoplay policy */
    }
    if ("Notification" in window) void Notification.requestPermission();
    const response = await fetch("/api/scanner/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        settings: {
          ...DEFAULT_ALERT_SETTINGS,
          ...(payload?.user.settings ?? {}),
          audioEnabled: !audioEnabled,
        },
      }),
    });
    if (!response.ok) {
      setActionError("Could not persist alert audio.");
      return;
    }
    void load();
  }

  function selectAlert(alert: ScannerAlertEvent) {
    setSelected(alert.ticker);
    if (presetStrategyIds.includes(alert.strategyId)) setStrategyId(alert.strategyId);
  }

  const savedPresets = payload?.user.presets ?? [];
  const snapshot = payload?.snapshot ?? null;
  const filtersActive = Boolean(
    query || watchlistOnly || bookOnly || newsOnly || hotRvol || lowFloat || hideHalted || showMuted,
  );
  const sessionMismatch = Boolean(snapshot && !presetFitsSession(preset, snapshot.session));
  const jumpId = rows.length === 0 ? strategyWithHits(presetStrategyIds, lists, "") : "";
  const jumpMeta =
    jumpId && jumpId !== activeStrategy ? (visibleCatalog.find((item) => item.id === jumpId) ?? null) : null;
  const jumpHits = jumpId ? (lists[jumpId]?.length ?? 0) : 0;

  function clearQuickFilters() {
    setQuery("");
    setDebouncedQuery("");
    setWatchlistOnly(false);
    setBookOnly(false);
    setNewsOnly(false);
    setHotRvol(false);
    setLowFloat(false);
    setHideHalted(false);
    setShowMuted(false);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:h-[calc(100dvh-6.25rem)]">
      <div className="shrink-0 space-y-2">
        <PageHeader
          compact
          title="Scanner Center"
          description="Ranked server scans. The browser polls a snapshot — it does not scan the market."
          actions={
            snapshot ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <StatusIndicator kind={freshnessKind(snapshot)} label={freshnessLabel(snapshot)} />
                {refreshing ? (
                  <Badge tone="info">Refreshing</Badge>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                    As of <ClientMarketTime value={snapshot.asOf} seconds />
                  </span>
                )}
                <span className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)] xl:inline">
                  J/K names · [ ] strategies · S search · R refresh
                </span>
              </div>
            ) : null
          }
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className="inline-flex rounded-[4px] border border-[var(--ib-border-subtle)] p-0.5"
            role="group"
            aria-label="Scanner system"
          >
            {(["momentum", "desk"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={system === id}
                aria-label={SYSTEM_ATTRIBUTION[id]}
                onClick={() => changeSystem(id)}
                className={cn(
                  "rounded-[3px] px-2.5 py-1 text-left xl:min-w-[148px] xl:px-3 xl:py-1.5",
                  system === id
                    ? "bg-[var(--ib-surface-3)] text-[var(--ib-text-primary)]"
                    : "text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]",
                )}
              >
                <span className="block text-[12px] font-semibold tracking-[-0.01em]">
                  {SYSTEM_SHORT_LABELS[id]}
                </span>
                <span
                  aria-hidden="true"
                  className="hidden font-mono text-[10px] uppercase tracking-[0.06em] xl:block"
                >
                  {SYSTEM_ATTRIBUTION[id]}
                </span>
              </button>
            ))}
          </div>
          <ChipToggle
            pressed={preset === livePreset}
            onClick={() => changePreset(livePreset, true)}
          >
            This session
          </ChipToggle>
          {(Object.keys(SESSION_PRESET_LABELS) as ScannerSessionPreset[]).map((id) => (
            <ChipToggle key={id} pressed={preset === id} onClick={() => changePreset(id)}>
              {SESSION_PRESET_LABELS[id]}
            </ChipToggle>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={searchRef}
            aria-label="Search scanner"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ticker, catalyst, theme"
            className="field-control h-8 min-w-[160px] max-w-[220px] !min-h-8 px-2 text-[12px]"
          />
          <ChipToggle pressed={watchlistOnly} onClick={() => setWatchlistOnly((value) => !value)}>
            Watchlists
          </ChipToggle>
          <ChipToggle pressed={bookOnly} onClick={() => setBookOnly((value) => !value)}>
            Book
          </ChipToggle>
          <ChipToggle pressed={newsOnly} onClick={() => setNewsOnly((value) => !value)}>
            News
          </ChipToggle>
          <ChipToggle pressed={hotRvol} onClick={() => setHotRvol((value) => !value)}>
            RVOL ≥ 2
          </ChipToggle>
          <ChipToggle pressed={lowFloat} onClick={() => setLowFloat((value) => !value)}>
            Float ≤ 20M
          </ChipToggle>
          <ChipToggle pressed={hideHalted} onClick={() => setHideHalted((value) => !value)}>
            Hide halted
          </ChipToggle>
          {filtersActive ? (
            <ChipToggle pressed={false} onClick={clearQuickFilters}>
              Clear
            </ChipToggle>
          ) : null}
          <Button size="sm" onClick={() => void load({ refresh: true })} disabled={refreshing}>
            Refresh
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void toggleAudio()}>
            Audio {audioEnabled ? "on" : "off"}
          </Button>
          <details className="relative">
            <summary className="flex h-7 cursor-pointer list-none items-center rounded-[3px] border border-[var(--ib-border-subtle)] px-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)] [&::-webkit-details-marker]:hidden">
              Layout tools
            </summary>
            <div className="absolute right-0 z-30 mt-1 flex w-[min(calc(100vw-2rem),28rem)] flex-wrap items-end gap-2 rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] p-3 shadow-[var(--shadow-float)]">
              <label className="min-w-[140px] flex-1 text-[11px] text-[var(--ib-text-muted)]">
                Preset name
                <input
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  className="field-control mt-1 h-8 !min-h-8 px-2 text-[12px]"
                  placeholder="Open low-float"
                />
              </label>
              <Button
                size="sm"
                disabled={!presetName.trim() || savingPreset}
                onClick={() => void savePreset()}
              >
                Save layout
              </Button>
              <ChipToggle pressed={showMuted} onClick={() => setShowMuted((value) => !value)}>
                Show muted
              </ChipToggle>
              <label className="text-[11px] text-[var(--ib-text-muted)]">
                Replay
                <input
                  aria-label="Replay timestamp"
                  type="datetime-local"
                  value={replayAt}
                  onChange={(event) => setReplayAt(event.target.value)}
                  className="field-control mt-1 h-8 !min-h-8 px-2 font-mono text-[11px]"
                />
              </label>
              <Button size="sm" variant="ghost" onClick={() => void runReplay()}>
                Replay
              </Button>
            </div>
          </details>
        </div>

        {savedPresets.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Saved
            </span>
            {savedPresets.map((item) => (
              <ChipToggle
                key={item.id}
                pressed={userPresetId === item.id}
                onClick={() => applySavedPreset(item)}
              >
                {item.name}
              </ChipToggle>
            ))}
          </div>
        ) : null}

        {snapshot ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--ib-border-subtle)] pb-2 font-mono text-[11px] tabular-nums text-[var(--ib-text-secondary)]">
            <span>
              <strong className="text-[var(--ib-text-primary)]">{glance.names.toString().padStart(2, "0")}</strong> names
            </span>
            <span>
              <strong className="text-[var(--ib-text-primary)]">{glance.hits.toString().padStart(2, "0")}</strong> hits
            </span>
            <span>
              <strong className="text-[var(--ib-text-primary)]">{glance.alerts.toString().padStart(2, "0")}</strong> alerts
            </span>
            <span className={glance.confirmed ? "text-[var(--market-positive)]" : undefined}>
              {glance.confirmed.toString().padStart(2, "0")} confirmed
            </span>
            <span className={glance.unexplained ? "text-[var(--state-warning)]" : undefined}>
              {glance.unexplained.toString().padStart(2, "0")} unexplained
            </span>
            <span className={glance.halted || glance.resumed ? "text-[var(--state-warning)]" : undefined}>
              {glance.halted.toString().padStart(2, "0")} halted
              {glance.resumed ? ` · ${glance.resumed.toString().padStart(2, "0")} resumed` : ""}
            </span>
            <span>{glance.book.toString().padStart(2, "0")} book</span>
            <span>{glance.watchlist.toString().padStart(2, "0")} watchlist</span>
            {sessionMismatch ? (
              <span className="text-[var(--state-warning)]">
                Tape {sessionClockLabel(snapshot.session).toLowerCase()}; {SESSION_PRESET_LABELS[preset]} can be empty.
              </span>
            ) : null}
            {sessionMismatch ? (
              <Button size="sm" onClick={() => changePreset(livePreset, true)}>
                Switch to this session
              </Button>
            ) : null}
            {snapshot.coverage.coverageNotes.length ? (
              <span className="min-w-0 truncate text-[var(--ib-text-muted)]">{coverageLine(snapshot)}</span>
            ) : null}
          </div>
        ) : null}

        {error ? <StatePanel kind="error" title="Scanner error" description={error} /> : null}
        {actionError ? <p className="text-[12px] text-[var(--market-negative)]">{actionError}</p> : null}
      </div>

      {loading && !payload ? (
        <div className="grid min-h-[420px] flex-1 gap-2 lg:grid-cols-[152px_minmax(0,1fr)_minmax(268px,300px)]">
          <Skeleton className="h-full min-h-[240px]" />
          <Skeleton className="h-full min-h-[320px]" />
          <Skeleton className="h-full min-h-[320px] max-lg:hidden" />
        </div>
      ) : (
        <div className="grid min-h-[420px] min-w-0 flex-1 gap-2 lg:min-h-0 lg:grid-cols-[minmax(140px,152px)_minmax(0,1fr)_minmax(268px,300px)] xl:grid-cols-[160px_minmax(0,1fr)_320px]">
          <Panel
            title="Strategies"
            description={`${SESSION_PRESET_LABELS[preset]} · ${sessionClockLabel(snapshot?.session)}`}
            className="hidden h-full min-h-0 lg:flex lg:flex-col"
            bodyClassName="min-h-0 flex-1 overflow-hidden p-0"
          >
            <StrategyList
              items={visibleCatalog}
              lists={lists}
              alertCounts={alertCounts}
              activeStrategy={activeStrategy}
              onSelect={selectStrategy}
            />
          </Panel>

          <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:hidden">
            <div
              className="flex gap-1 overflow-x-auto pb-1 terminal-scroll"
              role="toolbar"
              aria-label="Strategy shortcuts"
            >
              {visibleCatalog.map((item) => (
                <ChipToggle
                  key={item.id}
                  pressed={item.id === activeStrategy}
                  onClick={() => selectStrategy(item.id)}
                >
                  {item.shortTitle} {(lists[item.id]?.length ?? 0).toString().padStart(2, "0")}
                </ChipToggle>
              ))}
            </div>
          </div>

          <Panel
            title={activeMeta?.title ?? "Ranked list"}
            className="flex h-full min-h-0 min-w-0 flex-col"
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
            actions={
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                {rows.length.toString().padStart(2, "0")} shown
              </span>
            }
          >
            <div ref={tableRegionRef} className="flex min-h-0 flex-1 flex-col">
              <ScannerTable
                rows={rows}
                selected={selected}
                pins={payload?.user.pins ?? []}
                sort={sort}
                onSelect={setSelected}
                onSort={(key) => setSort((current) => toggleSort(current, key))}
                emptyHint={
                  sessionMismatch
                    ? `Tape is ${sessionClockLabel(snapshot?.session).toLowerCase()}. ${SESSION_PRESET_LABELS[preset]} lists can be empty.`
                    : filtersActive
                      ? "No names match the active filters."
                      : undefined
                }
                jump={
                  jumpMeta && jumpHits > 0
                    ? {
                        title: jumpMeta.shortTitle,
                        hits: jumpHits,
                        onClick: () => selectStrategy(jumpMeta.id),
                      }
                    : null
                }
              />
            </div>
          </Panel>

          <div className="grid h-full min-h-0 gap-2 lg:grid-rows-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Panel
              className="flex min-h-0 min-w-0 flex-col"
              bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
            >
              {selected ? (
                <ScannerFocus
                  ticker={selected}
                  feature={feature}
                  row={selectedRow}
                  pins={payload?.user.pins ?? []}
                  mutes={payload?.user.mutes ?? []}
                  watchlists={watchlists}
                  activeStrategy={activeStrategy ?? null}
                  mocked={Boolean(snapshot?.mocked)}
                  session={snapshot?.session ?? null}
                  onPin={() => void act(payload?.user.pins.includes(selected) ? "unpin" : "pin")}
                  onMute={() =>
                    void act(
                      payload && payload.user.mutes.some((mute) => mute.ticker === selected)
                        ? "unmute"
                        : "mute",
                      { strategyId: activeStrategy ?? "*" },
                    )
                  }
                  onLoadWatchlists={() => void act("watchlists")}
                  onAdd={(watchlistId) => void act("add_to_watchlist", { watchlistId })}
                  onSelectTicker={setSelected}
                />
              ) : (
                <p className="px-3 py-6 text-[12px] text-[var(--ib-text-muted)]">
                  Select a name to inspect catalyst, confirmation, and risk.
                </p>
              )}
            </Panel>
            <Panel
              title="Alert tape"
              description="Selected name first"
              className="flex min-h-0 min-w-0 flex-col"
              bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
            >
              <ScannerTape
                alerts={alerts}
                selected={selected}
                strategyOnly={tapeStrategyOnly}
                onStrategyOnlyChange={setTapeStrategyOnly}
                onSelect={selectAlert}
                now={now}
              />
            </Panel>
          </div>
        </div>
      )}
      <p className="sr-only">Keyboard: J and K move names, brackets change strategies, S focuses search, R refreshes.</p>
    </div>
  );
}

function StrategyList({
  items,
  lists,
  alertCounts,
  activeStrategy,
  onSelect,
}: {
  items: CatalogItem[];
  lists: Record<string, RankedScannerRow[]>;
  alertCounts: Record<string, number>;
  activeStrategy: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Scanner strategies" className="h-full overflow-y-auto terminal-scroll">
      {items.map((item) => {
        const hits = lists[item.id]?.length ?? 0;
        const fired = alertCounts[item.id] ?? 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={item.id === activeStrategy}
            className={cn(
              "flex w-full flex-col items-start gap-0.5 border-b border-[var(--ib-border-subtle)] px-2.5 py-1.5 text-left",
              item.id === activeStrategy
                ? "bg-[var(--ib-surface-selected)]"
                : "hover:bg-[var(--ib-surface-hover)]",
              hits === 0 && item.id !== activeStrategy && "opacity-45",
            )}
          >
            <span className="flex w-full items-baseline justify-between gap-2">
              <span className="text-[12px] font-medium text-[var(--ib-text-primary)]">
                {item.shortTitle}
              </span>
              <span
                className={cn(
                  "font-mono text-[12px] tabular-nums",
                  hits > 0 ? "text-[var(--ib-text-primary)]" : "text-[var(--ib-text-muted)]",
                )}
              >
                {hits.toString().padStart(2, "0")}
              </span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ib-text-muted)]">
              {item.kind}
              {fired ? ` · ${fired} alerts` : ""}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
