export type OverviewTickerItem = {
  key: string;
  label: string;
  ticker: string | null;
  changePercent: number | null;
  last: number | null;
  title: string;
  themeId?: string;
};

export type OverviewTickerGroupId = "watchlists" | "themes" | "tape";

export type OverviewTickerGroup = {
  id: OverviewTickerGroupId;
  label: string;
  items: OverviewTickerItem[];
};

type WatchlistRowLike = {
  ticker: string;
  name?: string | null;
  last: number | null;
  change1dPercent: number | null;
};

type DeskSectorLike = {
  id: string;
  name: string;
  kind: string;
  quotedCount: number;
  avg1dPercent: number | null;
  displayTicker: string | null;
  benchmarkSymbol: string | null;
  leaders: string[];
};

type TapePrintLike = {
  ticker: string;
  last: number | null;
  changePercent: number | null;
  title?: string;
};

export function sortGainerToLoser<T extends { changePercent: number | null; label?: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.changePercent == null && b.changePercent == null) {
      return (a.label ?? "").localeCompare(b.label ?? "");
    }
    if (a.changePercent == null) return 1;
    if (b.changePercent == null) return -1;
    if (b.changePercent !== a.changePercent) return b.changePercent - a.changePercent;
    return (a.label ?? "").localeCompare(b.label ?? "");
  });
}

function watchlistItems(rows: WatchlistRowLike[]): OverviewTickerItem[] {
  return sortGainerToLoser(
    rows
      .filter((row) => row.last != null || row.change1dPercent != null)
      .map((row) => ({
        key: `watchlist:${row.ticker}`,
        label: row.ticker,
        ticker: row.ticker,
        changePercent: row.change1dPercent,
        last: row.last,
        title: row.name ? `${row.ticker} · ${row.name}` : row.ticker,
      })),
  );
}

function themeItems(sectors: DeskSectorLike[]): OverviewTickerItem[] {
  return sortGainerToLoser(
    sectors
      .filter((row) => row.kind === "theme" && row.quotedCount > 0 && row.avg1dPercent != null)
      .map((row) => {
        const ticker = row.displayTicker ?? row.benchmarkSymbol ?? row.leaders[0] ?? null;
        return {
          key: `theme:${row.id}`,
          label: row.name,
          ticker,
          changePercent: row.avg1dPercent,
          last: null,
          title: `${row.name} · theme average 1D`,
          themeId: row.id,
        };
      }),
  );
}

function tapeItems(prints: TapePrintLike[]): OverviewTickerItem[] {
  return sortGainerToLoser(
    prints
      .filter((row) => row.last != null || row.changePercent != null)
      .map((row) => ({
        key: `tape:${row.ticker}`,
        label: row.ticker,
        ticker: row.ticker,
        changePercent: row.changePercent,
        last: row.last,
        title: row.title ?? row.ticker,
      })),
  );
}

export function buildOverviewTickerGroups(input: {
  watchlistRows?: WatchlistRowLike[];
  deskSectors?: DeskSectorLike[];
  tape?: TapePrintLike[];
}): OverviewTickerGroup[] {
  const groups: OverviewTickerGroup[] = [];
  const watchlists = watchlistItems(input.watchlistRows ?? []);
  const themes = themeItems(input.deskSectors ?? []);
  const tape = tapeItems(input.tape ?? []);
  if (watchlists.length) {
    groups.push({ id: "watchlists", label: "Watchlists", items: watchlists });
  }
  if (themes.length) {
    groups.push({ id: "themes", label: "Themes", items: themes });
  }
  if (tape.length) {
    groups.push({ id: "tape", label: "Tape", items: tape });
  }
  return groups;
}
