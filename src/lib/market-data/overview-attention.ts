import type { MarketPulseDriver } from "@/lib/market-data/market-pulse";
import type { HeatmapCell } from "@/lib/market-data/overview-analytics";
import type { JoinedMover } from "@/lib/market-data/overview-movers";
import type { DashboardWatchlistRow } from "@/lib/market-data/watchlist-types";
import { selectNextHighImpactRisk } from "@/lib/market-data/next-risk";
import type { CausalStatus, NormalizedCalendarEvent } from "@/lib/providers/types";
import { formatSignedPercent } from "@/lib/utils/format";
import { flagsFor } from "@/lib/watchlists/analytics";
import type { DashboardCoverageDigest } from "@/lib/watchlists/dashboard-digest";

export type AttentionItem = {
  id: string;
  kind: "driver" | "mover" | "sector" | "rvol" | "event" | "coverage";
  kicker: string;
  print: string;
  ticker?: string;
  causalStatus?: CausalStatus;
};

function countdown(target: string, asOf: string): string | null {
  const milliseconds = Date.parse(target) - Date.parse(asOf);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const minutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins}m` : `${mins}m`;
}

const MAX_ITEMS = 5;

function unusualFromWatchlist(
  rows: DashboardWatchlistRow[] | null | undefined,
): DashboardWatchlistRow | null {
  const ranked = [...(rows ?? [])]
    .map((row) => ({
      row,
      flags: flagsFor({
        change1dPercent: row.change1dPercent,
        relativeVolume: row.relativeVolume,
        vsGroup1dPercent: null,
        preMarketChangePercent: row.preMarketChangePercent ?? null,
        afterHoursChangePercent: row.afterHoursChangePercent ?? null,
      }),
    }))
    .filter(
      ({ flags }) =>
        flags.includes("rvol") || flags.includes("move") || flags.includes("peer"),
    )
    .sort((a, b) => {
      const aScore =
        (a.row.relativeVolume ?? 0) * Math.abs(a.row.change1dPercent ?? 0);
      const bScore =
        (b.row.relativeVolume ?? 0) * Math.abs(b.row.change1dPercent ?? 0);
      return bScore - aScore;
    });
  return ranked[0]?.row ?? null;
}

export function buildAttentionItems(input: {
  drivers: MarketPulseDriver[];
  movers: JoinedMover[];
  sectors: HeatmapCell[];
  spyChange: number | null;
  watchlist: DashboardWatchlistRow[] | null | undefined;
  calendar: NormalizedCalendarEvent[];
  asOf: string;
  coverage?: DashboardCoverageDigest | null;
}): AttentionItem[] {
  const usedTickers = new Set<string>();
  const items: AttentionItem[] = [];

  const event = selectNextHighImpactRisk(input.calendar, input.asOf);
  if (event) {
    const until = countdown(event.scheduledAt, input.asOf);
    items.push({
      id: `event-${event.id}`,
      kind: "event",
      kicker: "Next USD high-impact",
      print: until ? `${event.title} · ${until}` : event.title,
    });
  }

  const mover = input.movers[0];
  if (mover) {
    usedTickers.add(mover.ticker);
    items.push({
      id: `mover-${mover.ticker}`,
      kind: "mover",
      kicker:
        mover.causalStatus === "confirmed"
          ? "Mover · confirmed"
          : mover.causalStatus === "reported"
            ? "Mover · reported"
            : mover.causalStatus === "inferred"
              ? "Mover · inferred"
              : "Mover · unclear",
      print: mover.headlineTitle
        ? `${mover.ticker} ${formatSignedPercent(mover.changePercent)} · ${mover.headlineTitle}`
        : `${mover.ticker} ${formatSignedPercent(mover.changePercent)}`,
      ticker: mover.ticker,
      causalStatus: mover.causalStatus,
    });
  }

  const coverageHit =
    input.coverage?.exceptions.find((row) => !usedTickers.has(row.ticker)) ??
    (() => {
      const row = unusualFromWatchlist(input.watchlist);
      return row && !usedTickers.has(row.ticker)
        ? {
            ticker: row.ticker,
            flags: flagsFor({
              change1dPercent: row.change1dPercent,
              relativeVolume: row.relativeVolume,
              vsGroup1dPercent: null,
              preMarketChangePercent: row.preMarketChangePercent ?? null,
              afterHoursChangePercent: row.afterHoursChangePercent ?? null,
            }),
            change1dPercent: row.change1dPercent,
            relativeVolume: row.relativeVolume,
          }
        : null;
    })();
  if (coverageHit) {
    usedTickers.add(coverageHit.ticker);
    const rvol =
      coverageHit.relativeVolume != null
        ? `${coverageHit.relativeVolume.toFixed(1)}×`
        : null;
    items.push({
      id: `coverage-${coverageHit.ticker}`,
      kind: "coverage",
      kicker: "Coverage unusual",
      print: rvol
        ? `${coverageHit.ticker} ${formatSignedPercent(coverageHit.change1dPercent)} · ${rvol}`
        : `${coverageHit.ticker} ${formatSignedPercent(coverageHit.change1dPercent)}`,
      ticker: coverageHit.ticker,
    });
  }

  const driver = [...input.drivers]
    .filter((item) => item.contribution != null && item.id !== "breadth")
    .sort(
      (a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0),
    )[0];
  const desk = [...(input.coverage?.deskSectors ?? [])]
    .filter((row) => row.vsSpy1dPercent != null)
    .sort(
      (a, b) =>
        Math.abs(b.vsSpy1dPercent ?? 0) - Math.abs(a.vsSpy1dPercent ?? 0),
    )[0];
  const spdr = [...input.sectors]
    .filter((cell) => cell.changePercent != null)
    .map((cell) => ({
      cell,
      vsSpy:
        input.spyChange == null
          ? cell.changePercent!
          : cell.changePercent! - input.spyChange,
    }))
    .sort((a, b) => Math.abs(b.vsSpy) - Math.abs(a.vsSpy))[0];

  const driverMag = driver?.rawValue != null ? Math.abs(driver.rawValue) : 0;
  const deskMag = desk?.vsSpy1dPercent != null ? Math.abs(desk.vsSpy1dPercent) : 0;
  const useDesk = desk && deskMag >= driverMag && deskMag > 0;
  if (useDesk && desk) {
    const ticker = desk.benchmarkSymbol ?? desk.leaders[0];
    items.push({
      id: `desk-${desk.id}`,
      kind: "sector",
      kicker: "Sector vs SPY",
      print: `${desk.name} ${formatSignedPercent(desk.vsSpy1dPercent)}${ticker ? ` · ${ticker}` : ""}`,
      ticker,
    });
    if (ticker) usedTickers.add(ticker);
  } else if (driver?.quote && driver.rawValue != null) {
    items.push({
      id: `driver-${driver.id}`,
      kind: "driver",
      kicker: "Pulse driver",
      print: `${driver.quote.ticker} ${formatSignedPercent(driver.rawValue)}`,
      ticker: driver.quote.ticker,
    });
    usedTickers.add(driver.quote.ticker);
  } else if (spdr) {
    const vs =
      input.spyChange == null
        ? formatSignedPercent(spdr.cell.changePercent)
        : `${formatSignedPercent(spdr.cell.changePercent)} · ${formatSignedPercent(spdr.vsSpy)} vs SPY`;
    items.push({
      id: `sector-${spdr.cell.key}`,
      kind: "sector",
      kicker: "Vs SPY",
      print: `${spdr.cell.key} ${vs}`,
      ticker: spdr.cell.key,
    });
    usedTickers.add(spdr.cell.key);
  }

  const rvol = [...(input.watchlist ?? [])]
    .filter((row) => row.relativeVolume != null && !usedTickers.has(row.ticker))
    .sort((a, b) => (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0))[0];
  if (rvol?.relativeVolume != null) {
    items.push({
      id: `rvol-${rvol.ticker}`,
      kind: "rvol",
      kicker: "Watchlist RVOL",
      print: `${rvol.ticker} ${rvol.relativeVolume.toFixed(1)}× · ${formatSignedPercent(rvol.change1dPercent)}`,
      ticker: rvol.ticker,
    });
  }

  return items.slice(0, MAX_ITEMS);
}
