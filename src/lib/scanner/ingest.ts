import type { Env } from "@/lib/env";
import { getEnv } from "@/lib/env";
import { fixturesEnabled } from "@/lib/api/http";
import { createMarketDataRouter } from "@/lib/market-data/router";
import type { NormalizedSnapshotObservation } from "@/lib/market-data/schemas";
import {
  fetchYahooEquityQuotesDetailed,
  fetchYahooIntradayBars,
} from "@/lib/market-data/earnings/yahoo";
import type { YahooEquityQuote } from "@/lib/market-data/earnings/types";
import { blendScannerPrint, mergeMinuteBars, yahooBarsToMinute } from "./print";
import { getIntelligenceBundle } from "@/lib/intelligence/service";
import { coverageLinksFrom, peerMapFrom } from "@/lib/intelligence/coverage-graph";
import { attributeMove } from "@/lib/intelligence/attribution";
import type { IntelligenceBundle, MoveExplanation } from "@/lib/intelligence/types";
import { loadOpenPositionTickers } from "@/lib/positions/store";
import { listFirmSharedCoverage } from "@/lib/watchlists/store";
import { loadFirmCoverageSymbols } from "@/lib/watchlists/firm-coverage";
import { DEFAULT_FIRM_UUID } from "@/lib/reports/editions";
import { buildFeatureSnapshot, type FeatureBuildInput } from "./features";
import { discoverMarketMovers } from "./discovery";
import { fetchTradingHalts, haltMapFrom, type HaltEvent } from "./halts";
import { buildScannerUniverse, SCANNER_THEME_BY_TICKER } from "./universe";
import { applyHistoryFlags, type TickerHistoryFlags } from "./history";
import type { LinkedEvidence, MinuteBar, ScannerFeatureSnapshot } from "./types";
import type { ScannerSessionClock } from "./session";

export type ScannerIngestResult = {
  features: ScannerFeatureSnapshot[];
  symbolsRequested: string[];
  symbolsReceived: number;
  providerName: string;
  feedCoverage: ScannerFeatureSnapshot["feedCoverage"];
  latencyClass: ScannerFeatureSnapshot["latencyClass"];
  notes: string[];
  entitlements: {
    trades: boolean;
    quotes: boolean;
    float: boolean;
    news: boolean;
    halts: boolean;
    options: boolean;
    fullMarket: boolean;
  };
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function ipoAgeDays(firstTradeDateMs: number | null | undefined, now: Date): number | null {
  if (firstTradeDateMs == null || !Number.isFinite(firstTradeDateMs)) return null;
  const days = Math.floor((now.getTime() - firstTradeDateMs) / 86_400_000);
  return days >= 0 ? days : null;
}

function evidenceFrom(move: MoveExplanation | undefined): LinkedEvidence[] {
  if (!move) return [];
  return move.supportingEvents.map((event) => ({
    id: event.id,
    title: event.title,
    url: event.url,
    publisher: event.publisher ?? null,
    publishedAt: event.publishedAt,
    eventType: event.eventType,
  }));
}

export function featureInputFromSnapshot(input: {
  snapshot: NormalizedSnapshotObservation;
  yahoo?: YahooEquityQuote | null;
  clock: ScannerSessionClock;
  halt?: HaltEvent;
  move?: MoveExplanation;
  inWatchlist?: boolean;
  inPosition?: boolean;
  watchlistNames?: string[];
  themes?: string[];
  sectors?: string[];
  isEtf?: boolean;
  bars?: MinuteBar[];
  history?: TickerHistoryFlags;
  coverageNotes?: string | null;
}): FeatureBuildInput {
  const snap = input.snapshot;
  const yahoo = input.yahoo;
  const prior = snap.priorClose ?? yahoo?.previousClose ?? null;
  const blended = blendScannerPrint({
    session: input.clock.session,
    last: snap.last ?? null,
    high: snap.high ?? snap.dailyHigh ?? yahoo?.dayHigh ?? null,
    volume: snap.volume ?? null,
    priorClose: prior,
    yahoo,
    primaryLatency: snap.latencyClass,
  });
  const last = blended.last;
  const volume = blended.volume;
  const open = snap.open ?? snap.dailyOpen ?? yahoo?.open ?? null;
  const high = blended.high;
  const coverageNotes = [input.coverageNotes, snap.coverageNotes, ...blended.notes]
    .filter((note): note is string => Boolean(note && note.trim()))
    .filter((note, index, all) => all.indexOf(note) === index)
    .join(" ");
  return {
    ticker: snap.ticker,
    name: yahoo?.name ?? null,
    asOf: input.clock.now.toISOString(),
    session: input.clock.session,
    sessionDate: input.clock.sessionDate,
    sessionElapsed: input.clock.sessionElapsed,
    last,
    bid: snap.bid ?? null,
    ask: snap.ask ?? null,
    open,
    high,
    low: snap.low ?? snap.dailyLow ?? yahoo?.dayLow ?? null,
    priorClose: prior,
    officialClose: snap.officialClose ?? null,
    volume,
    avgVolume20d: yahoo?.avgVolume ?? null,
    minuteBars: input.bars,
    week52High: yahoo?.fiftyTwoWeekHigh ?? null,
    floatShares: yahoo?.floatShares ?? null,
    sharesOutstanding: yahoo?.sharesOutstanding ?? null,
    marketCap: yahoo?.marketCap ?? null,
    shortInterestPct: yahoo?.shortPercentOfFloat ?? null,
    ipoAgeDays: ipoAgeDays(yahoo?.firstTradeDateMs, input.clock.now),
    haltStatus: input.halt?.status ?? "unknown",
    haltReason: input.halt?.reason ?? null,
    latestHeadlineAt: input.move?.supportingEvents[0]?.publishedAt ?? null,
    attributionKind: input.move?.attribution,
    attributionHeadline: input.move?.headline,
    attributionDetail: input.move?.detail,
    evidence: evidenceFrom(input.move),
    relatedTickers: input.move?.relatedTickers,
    inWatchlist: input.inWatchlist,
    inPosition: input.inPosition,
    watchlistNames: input.watchlistNames,
    themes: input.themes,
    sectors: input.sectors,
    isEtf: input.isEtf ?? yahoo?.quoteType === "ETF",
    unusualOptions: false,
    optionsNote: "Options flow is not entitled on the current market-data plan.",
    providerName: snap.providerName,
    feedCoverage: snap.feedCoverage,
    latencyClass: blended.latencyClass,
    coverageNotes: coverageNotes || null,
    formerRunner: input.history?.formerRunner,
    gapAndFade: input.history?.gapAndFade,
    offeringRisk: input.history?.offeringRisk,
    frequentHalt: input.history?.frequentHalt,
  };
}

export async function ingestScannerUniverse(options: {
  env?: Env;
  clock: ScannerSessionClock;
  firmId?: string;
  priorAlertSymbols?: string[];
  historyByTicker?: Map<string, TickerHistoryFlags>;
}): Promise<ScannerIngestResult> {
  const env = options.env ?? getEnv();
  const notes: string[] = [];
  const coverageLoad = await loadFirmCoverageSymbols();
  const positions = await loadOpenPositionTickers(options.firmId ?? env.FIRM_ID);
  const discovered = fixturesEnabled()
    ? { tickers: [], details: [], notes: [] }
    : await discoverMarketMovers(180);
  notes.push(...discovered.notes);
  notes.push(...coverageLoad.notes);

  const universe = buildScannerUniverse({
    maxSize: env.SCANNER_MAX_UNIVERSE_SIZE,
    coverageSymbols: coverageLoad.symbols,
    positionSymbols: positions,
    discoveredSymbols: discovered.tickers,
    priorAlertSymbols: options.priorAlertSymbols,
  });
  notes.push(...universe.notes);

  const collections = await listFirmSharedCoverage();
  const links = coverageLinksFrom(collections.lists, collections.sectors);
  const linkByTicker = new Map(links.map((link) => [link.ticker, link] as const));
  const peers = peerMapFrom(links);
  const watchlistNames = new Map<string, string[]>();
  for (const list of collections.lists) {
    for (const symbol of list.symbols) {
      const current = watchlistNames.get(symbol) ?? [];
      if (!current.includes(list.name)) current.push(list.name);
      watchlistNames.set(symbol, current);
    }
  }
  const inPosition = new Set(positions);

  const router = createMarketDataRouter(env);
  if (!router) {
    return {
      features: [],
      symbolsRequested: universe.symbols,
      symbolsReceived: 0,
      providerName: "none",
      feedCoverage: "unknown",
      latencyClass: "unavailable",
      notes: [...notes, "No market-data provider is configured for scanner snapshots."],
      entitlements: {
        trades: false,
        quotes: false,
        float: false,
        news: false,
        halts: false,
        options: false,
        fullMarket: false,
      },
    };
  }

  const snapshots: NormalizedSnapshotObservation[] = [];
  for (const group of chunk(universe.symbols, 50)) {
    try {
      const batch = await router.fetchSnapshots({
        symbols: group,
        surface: "server_calculations",
      });
      snapshots.push(...batch.snapshots);
    } catch (error) {
      notes.push(
        `Snapshot batch failed (${group[0]}…): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const yahoo = fixturesEnabled()
    ? { quotes: new Map<string, YahooEquityQuote>() }
    : await fetchYahooEquityQuotesDetailed(universe.symbols).catch(() => ({
        quotes: new Map<string, YahooEquityQuote>(),
      }));

  const bundle: IntelligenceBundle | null = fixturesEnabled()
    ? null
    : await getIntelligenceBundle(env, {
        coverage: links,
        coverageTickers: universe.symbols,
        force: false,
      }).catch(() => null);

  const haltFeed = fixturesEnabled()
    ? { events: [] as HaltEvent[], notes: [] }
    : await fetchTradingHalts();
  notes.push(...haltFeed.notes);
  const halts = haltMapFrom(haltFeed.events);

  const fullMarket = discovered.details.some((row) => row.coverage === "full_market");
  const feedCoverage = snapshots[0]?.feedCoverage ?? "unknown";
  if (feedCoverage === "iex") {
    notes.push(
      "Primary tape is Alpaca IEX realtime (one exchange). Yahoo unofficial pre/post last fills idle IEX prints. Not SIP, not a websocket.",
    );
  }
  if (!fullMarket) {
    notes.push("Universe-limited scan: not an exchange-wide gainer tape.");
  }

  const quoteContexts = snapshots.map((snap) => ({
    ticker: snap.ticker,
    name: yahoo.quotes.get(snap.ticker)?.name ?? null,
    changePercent: snap.changePercent ?? null,
    relativeVolume: null,
    session: options.clock.session,
    flags: [] as string[],
  }));

  const moves = new Map<string, MoveExplanation>();
  if (bundle) {
    for (const quote of quoteContexts) {
      const link = linkByTicker.get(quote.ticker);
      const themes = [
        ...(link?.themeNames ?? []),
        ...(SCANNER_THEME_BY_TICKER[quote.ticker] ?? []),
      ];
      moves.set(
        quote.ticker,
        attributeMove({
          quote,
          events: bundle.events,
          session: options.clock.session,
          now: options.clock.now,
          peerTickers: peers.get(quote.ticker),
          tickerThemes: themes,
        }),
      );
    }
  }

  let features = snapshots.map((snapshot) => {
    const ticker = snapshot.ticker.toUpperCase();
    const link = linkByTicker.get(ticker);
    const themes = [
      ...(link?.themeNames ?? []),
      ...(SCANNER_THEME_BY_TICKER[ticker] ?? []),
    ];
    const built = buildFeatureSnapshot(
      featureInputFromSnapshot({
        snapshot,
        yahoo: yahoo.quotes.get(ticker) ?? yahoo.quotes.get(snapshot.ticker) ?? null,
        clock: options.clock,
        halt: halts.get(ticker),
        move: moves.get(ticker),
        inWatchlist: watchlistNames.has(ticker) || Boolean(link),
        inPosition: inPosition.has(ticker),
        watchlistNames: watchlistNames.get(ticker),
        themes,
        sectors: link?.sectorNames,
        coverageNotes:
          snapshot.feedCoverage === "iex"
            ? "IEX print — not SIP/full-market. Premarket/after-hours last overlays Yahoo when IEX is idle."
            : snapshot.coverageNotes ?? null,
        history: options.historyByTicker?.get(ticker),
      }),
    );
    return applyHistoryFlags(built, options.historyByTicker?.get(ticker));
  });

  const deep = [...features]
    .sort(
      (a, b) =>
        Math.abs(b.changeFromClosePct ?? 0) * (b.relativeVolume ?? 1) -
        Math.abs(a.changeFromClosePct ?? 0) * (a.relativeVolume ?? 1),
    )
    .slice(0, env.SCANNER_DEEP_PASS_SIZE);

  const barsByTicker = new Map<string, MinuteBar[]>();
  await Promise.all(
    deep.map(async (row) => {
      try {
        const batch = await router.fetchBars({
          symbol: row.ticker,
          interval: "1m",
          limit: 90,
          surface: "server_calculations",
        });
        if (!batch.bars.length) return;
        barsByTicker.set(
          row.ticker,
          batch.bars.map((bar) => ({
            start: bar.barStart,
            open: bar.open ?? bar.close ?? 0,
            high: bar.high ?? bar.close ?? 0,
            low: bar.low ?? bar.close ?? 0,
            close: bar.close ?? 0,
            volume: bar.volume ?? null,
          })),
        );
      } catch {
        // Velocity stays null unless Yahoo pre/post bars fill below.
      }
    }),
  );

  const extended =
    options.clock.session === "premarket" ||
    options.clock.session === "afterhours" ||
    options.clock.session === "overnight";
  const needYahooBars = fixturesEnabled()
    ? []
    : deep.filter((row) => extended || (barsByTicker.get(row.ticker)?.length ?? 0) < 8);
  if (needYahooBars.length) {
    let yahooBarHits = 0;
    for (const group of chunk(needYahooBars, 6)) {
      await Promise.all(
        group.map(async (row) => {
          try {
            const yahooBars = yahooBarsToMinute(await fetchYahooIntradayBars(row.ticker, "1m"));
            if (!yahooBars.length) return;
            yahooBarHits += 1;
            barsByTicker.set(
              row.ticker,
              mergeMinuteBars(barsByTicker.get(row.ticker) ?? [], yahooBars),
            );
          } catch {
            // Snapshot ranking still works without velocity.
          }
        }),
      );
    }
    if (yahooBarHits) {
      notes.push(
        `Yahoo includePrePost 1m bars filled ${yahooBarHits} deep-pass names (delayed/unofficial).`,
      );
    }
  }

  if (barsByTicker.size) {
    const byTicker = new Map(snapshots.map((row) => [row.ticker.toUpperCase(), row] as const));
    features = features.map((feature) => {
      const bars = barsByTicker.get(feature.ticker);
      if (!bars?.length) return feature;
      const snapshot = byTicker.get(feature.ticker);
      if (!snapshot) return feature;
      return buildFeatureSnapshot(
        featureInputFromSnapshot({
          snapshot,
          yahoo: yahoo.quotes.get(feature.ticker) ?? null,
          clock: options.clock,
          halt: halts.get(feature.ticker),
          move: moves.get(feature.ticker),
          inWatchlist: feature.inWatchlist,
          inPosition: feature.inPosition,
          watchlistNames: feature.watchlistNames,
          themes: feature.themes,
          sectors: feature.sectors,
          isEtf: feature.isEtf,
          bars,
          history: options.historyByTicker?.get(feature.ticker),
          coverageNotes: feature.coverageNotes,
        }),
      );
    });
  }

  const floatCount = features.filter((row) => row.dataQuality.float).length;
  return {
    features,
    symbolsRequested: universe.symbols,
    symbolsReceived: features.length,
    providerName: snapshots[0]?.providerName ?? router.healthEvents[0]?.providerId ?? "unknown",
    feedCoverage,
    latencyClass: snapshots[0]?.latencyClass ?? "unavailable",
    notes,
    entitlements: {
      trades: false,
      quotes: features.length > 0,
      float: floatCount > 0,
      news: Boolean(bundle?.events.length),
      halts: haltFeed.events.length > 0,
      options: false,
      fullMarket,
    },
  };
}

export function resolveScannerFirmId(env: Env = getEnv()): string {
  return env.FIRM_ID ?? DEFAULT_FIRM_UUID;
}
