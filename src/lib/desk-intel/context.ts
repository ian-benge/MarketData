import type { SessionUser } from "@/lib/auth/session";
import type { Env } from "@/lib/env";
import { getEnv } from "@/lib/env";
import { attributeMoves } from "@/lib/intelligence/attribution";
import { peerMapFrom } from "@/lib/intelligence/coverage-graph";
import { focusAttributionWindow, hydrateFocusEvidence } from "@/lib/intelligence/focus";
import {
  coverageFromCollections,
  getIntelligenceBundle,
  quotesFromMarketCache,
} from "@/lib/intelligence/service";
import type { IntelligenceEvent, QuoteContext } from "@/lib/intelligence/types";
import { loadDashboardCatalystCalendar } from "@/lib/market-data/catalyst-calendar-load";
import { inferUsEquitySession } from "@/lib/market-data/us-session";
import { loadOpenPositionTickers } from "@/lib/positions/store";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";
import { listStoredSectors, listStoredWatchlists } from "@/lib/watchlists/store";
import { buildEvidencePack } from "./evidence";
import type { EvidencePack, EvidencePosition } from "./types";

export type DeskContextOptions = {
  ingest?: boolean;
  includePositions?: boolean;
  events?: IntelligenceEvent[];
  force?: boolean;
  priorityTickers?: string[];
  quotes?: QuoteContext[];
};

export function selectDeskCalendar(
  events: NormalizedCalendarEvent[],
  now = Date.now(),
): NormalizedCalendarEvent[] {
  const start = now - 2 * 60 * 60 * 1000;
  const end = now + 48 * 60 * 60 * 1000;
  return events
    .filter((row) => {
      const at = Date.parse(row.scheduledAt);
      return Number.isFinite(at) && at >= start && at <= end;
    })
    .sort((a, b) => {
      const rank = (value?: string) =>
        value === "high" ? 0 : value === "medium" ? 1 : 2;
      const byImportance = rank(a.importance) - rank(b.importance);
      if (byImportance !== 0) return byImportance;
      return Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt);
    })
    .slice(0, 12);
}

export async function loadDeskPack(
  user: SessionUser,
  options: DeskContextOptions = {},
  env: Env = getEnv(),
): Promise<EvidencePack> {
  const [lists, sectors] = await Promise.all([
    listStoredWatchlists(user).catch(() => ({ lists: [] })),
    listStoredSectors(user).catch(() => ({ sectors: [] })),
  ]);
  const coverage = coverageFromCollections(lists.lists, sectors.sectors);
  const coverageTickers = coverage.map((row) => row.ticker);
  const session = inferUsEquitySession();
  const priorityTickers = [
    ...new Set((options.priorityTickers ?? []).map((ticker) => ticker.toUpperCase())),
  ];
  let quotes = options.quotes?.length
    ? options.quotes
    : quotesFromMarketCache();
  const [bundle, inBookTickers, calendar] = await Promise.all([
    getIntelligenceBundle(env, {
      coverage,
      coverageTickers,
      quotes,
      priorityTickers,
      session,
      ingest: options.ingest === true,
      force: options.force === true,
    }),
    loadOpenPositionTickers(user.firmId).catch(() => [] as string[]),
    loadDashboardCatalystCalendar(env).catch(() => [] as NormalizedCalendarEvent[]),
  ]);
  let positions: EvidencePosition[] = [];
  let ownerLocked = false;
  if (options.includePositions) {
    try {
      const snapshot = await buildPositionsSnapshot({
        user,
        includeClosed: false,
      });
      ownerLocked = snapshot.ownerLocked;
      if (!snapshot.ownerLocked) {
        positions = snapshot.positions
          .filter((row) => row.status === "open")
          .map((row) => ({
            ticker: row.ticker,
            side: row.side,
            dayPnl: row.dayPnl,
            dayPercent: row.dayPercent,
            weight: row.weight,
            unrealizedPnl: row.unrealizedPnl,
          }));
      }
    } catch {
      positions = [];
    }
  }
  let packBundle = options.events
    ? {
        ...bundle,
        events: options.events,
      }
    : bundle;
  if (priorityTickers.length) {
    const hydrated = await hydrateFocusEvidence(env, priorityTickers, {
      events: packBundle.events,
      quotes,
      session,
      coverage,
      coverageTickers,
      ingest: true,
    });
    quotes = hydrated.quotes;
    const links = coverage;
    const focusQuotes = priorityTickers.map(
      (ticker) =>
        hydrated.quotes.find((row) => row.ticker.toUpperCase() === ticker) ?? {
          ticker,
          changePercent: null,
          relativeVolume: null,
          flags: [],
          session,
        },
    );
    const focusEvents = hydrated.events.filter((event) =>
      event.tickers.some((entity) => priorityTickers.includes(entity.ticker)),
    );
    const focusMoves = attributeMoves(
      focusQuotes,
      hydrated.events,
      session,
      new Date(),
      peerMapFrom(links),
      new Map(
        links.map((row) => [row.ticker, [...row.themeNames, ...row.sectorNames]]),
      ),
      {
        window: focusAttributionWindow({
          events: focusEvents.length ? focusEvents : hydrated.events,
          session,
        }),
        matchLowConfidence: true,
      },
    );
    packBundle = {
      ...packBundle,
      events: hydrated.events,
      moves: [
        ...focusMoves,
        ...packBundle.moves.filter((move) => !priorityTickers.includes(move.ticker)),
      ],
    };
  }
  return buildEvidencePack({
    bundle: packBundle,
    quotes,
    coverageTickers,
    inBookTickers,
    positions,
    calendar: selectDeskCalendar(calendar),
    session,
    ownerLocked,
    focusTickers: priorityTickers,
  });
}

export async function loadCronDeskPack(env: Env = getEnv()): Promise<EvidencePack> {
  const session = inferUsEquitySession();
  const quotes = quotesFromMarketCache();
  const [bundle, inBookTickers, calendar] = await Promise.all([
    getIntelligenceBundle(env, {
      force: true,
      quotes,
      session,
      ingest: true,
    }),
    loadOpenPositionTickers(env.FIRM_ID).catch(() => [] as string[]),
    loadDashboardCatalystCalendar(env).catch(() => [] as NormalizedCalendarEvent[]),
  ]);
  return buildEvidencePack({
    bundle,
    quotes,
    inBookTickers,
    calendar: selectDeskCalendar(calendar),
    session,
  });
}
