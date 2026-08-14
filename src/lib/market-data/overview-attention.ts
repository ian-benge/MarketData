import type { MarketPulseDriver } from "@/lib/market-data/market-pulse";
import type { HeatmapCell } from "@/lib/market-data/overview-analytics";
import type { JoinedMover } from "@/lib/market-data/overview-movers";
import type { DashboardWatchlistRow } from "@/lib/market-data/watchlist-types";
import { selectNextHighImpactRisk } from "@/lib/market-data/next-risk";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";
import { formatSignedPercent } from "@/lib/utils/format";

export type AttentionItem = {
  id: string;
  kind: "driver" | "mover" | "sector" | "rvol" | "event";
  kicker: string;
  print: string;
  ticker?: string;
  causalStatus?: "reported" | "unclear";
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

export function buildAttentionItems(input: {
  drivers: MarketPulseDriver[];
  movers: JoinedMover[];
  sectors: HeatmapCell[];
  spyChange: number | null;
  watchlist: DashboardWatchlistRow[] | null | undefined;
  calendar: NormalizedCalendarEvent[];
  asOf: string;
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  const driver = [...input.drivers]
    .filter((item) => item.contribution != null && item.id !== "breadth")
    .sort(
      (a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0),
    )[0];
  if (driver?.quote && driver.rawValue != null) {
    items.push({
      id: `driver-${driver.id}`,
      kind: "driver",
      kicker: "Pulse driver",
      print: `${driver.quote.ticker} ${formatSignedPercent(driver.rawValue)}`,
      ticker: driver.quote.ticker,
    });
  }

  const mover = input.movers[0];
  if (mover) {
    items.push({
      id: `mover-${mover.ticker}`,
      kind: "mover",
      kicker: mover.causalStatus === "reported" ? "Mover · reported" : "Mover · unclear",
      print: mover.headlineTitle
        ? `${mover.ticker} ${formatSignedPercent(mover.changePercent)} · ${mover.headlineTitle}`
        : `${mover.ticker} ${formatSignedPercent(mover.changePercent)}`,
      ticker: mover.ticker,
      causalStatus: mover.causalStatus,
    });
  }

  const sector = [...input.sectors]
    .filter((cell) => cell.changePercent != null)
    .map((cell) => ({
      cell,
      vsSpy:
        input.spyChange == null
          ? cell.changePercent!
          : cell.changePercent! - input.spyChange,
    }))
    .sort((a, b) => Math.abs(b.vsSpy) - Math.abs(a.vsSpy))[0];
  if (sector) {
    const vs =
      input.spyChange == null
        ? formatSignedPercent(sector.cell.changePercent)
        : `${formatSignedPercent(sector.cell.changePercent)} · ${formatSignedPercent(sector.vsSpy)} vs SPY`;
    items.push({
      id: `sector-${sector.cell.key}`,
      kind: "sector",
      kicker: "Vs SPY",
      print: `${sector.cell.key} ${vs}`,
      ticker: sector.cell.key,
    });
  }

  const rvol = [...(input.watchlist ?? [])]
    .filter((row) => row.relativeVolume != null)
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

  return items.slice(0, MAX_ITEMS);
}
