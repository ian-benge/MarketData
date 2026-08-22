import type { MoveExplanation } from "@/lib/intelligence/types";
import type { JoinedMover } from "@/lib/market-data/overview-movers";
import type { DashboardWatchlistSnapshot } from "@/lib/market-data/watchlist-types";
import type {
  NormalizedNewsItem,
  NormalizedQuote,
} from "@/lib/providers/types";
import type { DashboardBookImpact } from "@/lib/dashboard/book-impact";
import type { DashboardCoverageDigest } from "@/lib/watchlists/dashboard-digest";

export type FocusHeadline = {
  id: string;
  title: string;
  publishedAt: string;
  url?: string;
  publisher?: string;
};

export type FocusMembership = {
  id: string;
  name: string;
  kind: "watchlist" | "sector" | "theme" | "industry" | "custom";
};

export type FocusContext = {
  ticker: string;
  name: string | null;
  last: number | null;
  changePercent: number | null;
  changeFromOpenPercent: number | null;
  change1wPercent: number | null;
  preMarketChangePercent: number | null;
  afterHoursChangePercent: number | null;
  relativeVolume: number | null;
  volume: number | null;
  marketCap: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  inBook: boolean;
  bookSide: "long" | "short" | null;
  bookDayPnl: number | null;
  bookDayPercent: number | null;
  bookUnexplained: boolean;
  membership: FocusMembership[];
  explanation: MoveExplanation | null;
  headlines: FocusHeadline[];
  relatedTickers: string[];
  mover: JoinedMover | null;
};

function quoteFor(
  ticker: string,
  tape: NormalizedQuote[],
  watchlist?: DashboardWatchlistSnapshot | null,
): {
  name: string | null;
  last: number | null;
  changePercent: number | null;
  changeFromOpenPercent: number | null;
  change1wPercent: number | null;
  preMarketChangePercent: number | null;
  afterHoursChangePercent: number | null;
  relativeVolume: number | null;
  volume: number | null;
  marketCap: number | null;
  dayHigh: number | null;
  dayLow: number | null;
} {
  const upper = ticker.toUpperCase();
  const row = watchlist?.rows.find((item) => item.ticker.toUpperCase() === upper);
  const quote = tape.find((item) => item.ticker.toUpperCase() === upper);
  const fromOpen =
    row?.changeFromOpenPercent ??
    (quote?.open != null && quote.last != null && quote.open !== 0
      ? ((quote.last - quote.open) / quote.open) * 100
      : null);
  return {
    name: row?.name ?? null,
    last: row?.last ?? quote?.last ?? null,
    changePercent: row?.change1dPercent ?? quote?.changePercent ?? null,
    changeFromOpenPercent: fromOpen,
    change1wPercent: row?.change1wPercent ?? null,
    preMarketChangePercent:
      row?.preMarketChangePercent ?? quote?.preMarketChangePercent ?? null,
    afterHoursChangePercent:
      row?.afterHoursChangePercent ?? quote?.afterHoursChangePercent ?? null,
    relativeVolume: row?.relativeVolume ?? null,
    volume: row?.volume ?? quote?.volume ?? null,
    marketCap: row?.marketCap ?? null,
    dayHigh: row?.dayHigh ?? quote?.high ?? null,
    dayLow: row?.dayLow ?? quote?.low ?? null,
  };
}

export function buildFocusContext(input: {
  ticker: string;
  tape: NormalizedQuote[];
  watchlist?: DashboardWatchlistSnapshot | null;
  coverage?: DashboardCoverageDigest | null;
  book?: DashboardBookImpact | null;
  movers: JoinedMover[];
  headlines: NormalizedNewsItem[];
  explanations?: MoveExplanation[];
}): FocusContext | null {
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) return null;
  const quote = quoteFor(ticker, input.tape, input.watchlist);
  const explanation =
    input.explanations?.find((row) => row.ticker.toUpperCase() === ticker) ?? null;
  const mover = input.movers.find((row) => row.ticker.toUpperCase() === ticker) ?? null;
  const headlines = input.headlines
    .filter((item) =>
      item.tickers.some((tag) => tag.toUpperCase() === ticker),
    )
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      title: item.title,
      publishedAt: item.publishedAt,
      url: item.url,
      publisher: item.publisher,
    }));
  const membership: FocusMembership[] = [];
  const seen = new Set<string>();
  function addMember(row: FocusMembership) {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    membership.push(row);
  }
  if (input.watchlist?.symbols.some((symbol) => symbol.toUpperCase() === ticker)) {
    addMember({
      id: input.watchlist.listId,
      name: input.watchlist.listName,
      kind: "watchlist",
    });
  }
  for (const exception of input.coverage?.exceptions ?? []) {
    if (exception.ticker.toUpperCase() !== ticker) continue;
    if (!exception.listId) continue;
    const list = input.coverage?.lists.find((row) => row.id === exception.listId);
    if (list) addMember({ id: list.id, name: list.name, kind: "watchlist" });
  }
  for (const sector of input.coverage?.deskSectors ?? []) {
    if (
      sector.leaders.some((leader) => leader.toUpperCase() === ticker) ||
      sector.benchmarkSymbol?.toUpperCase() === ticker ||
      sector.displayTicker?.toUpperCase() === ticker
    ) {
      addMember({
        id: sector.id,
        name: sector.name,
        kind:
          sector.kind === "theme" ||
          sector.kind === "industry" ||
          sector.kind === "custom"
            ? sector.kind
            : "sector",
      });
    }
  }
  const related = [
    ...(explanation?.relatedTickers ?? []),
    ...headlines.flatMap((item) => {
      const source = input.headlines.find((row) => row.id === item.id);
      return (source?.tickers ?? []).filter((tag) => tag.toUpperCase() !== ticker);
    }),
  ];
  const relatedTickers = [...new Set(related.map((tag) => tag.toUpperCase()))].slice(0, 6);
  const lot = input.book?.contributors.find(
    (row) => row.ticker.toUpperCase() === ticker,
  );
  const inBook = Boolean(
    input.coverage?.inBookTickers?.some((item) => item.toUpperCase() === ticker) ||
      input.book?.openTickers?.some((item) => item.toUpperCase() === ticker) ||
      Boolean(lot),
  );

  return {
    ticker,
    name: quote.name && quote.name !== ticker ? quote.name : mover?.name ?? quote.name,
    last: quote.last ?? mover?.last ?? null,
    changePercent: quote.changePercent ?? mover?.changePercent ?? null,
    changeFromOpenPercent: quote.changeFromOpenPercent,
    change1wPercent: quote.change1wPercent,
    preMarketChangePercent: quote.preMarketChangePercent,
    afterHoursChangePercent: quote.afterHoursChangePercent,
    relativeVolume: quote.relativeVolume ?? mover?.relativeVolume ?? null,
    volume: quote.volume ?? mover?.volume ?? null,
    marketCap: quote.marketCap,
    dayHigh: quote.dayHigh,
    dayLow: quote.dayLow,
    inBook,
    bookSide: lot?.side ?? null,
    bookDayPnl: lot?.dayPnl ?? null,
    bookDayPercent: lot?.dayPercent ?? null,
    bookUnexplained: Boolean(
      lot?.unexplained ||
        input.book?.unexplainedTickers?.some((item) => item.toUpperCase() === ticker),
    ),
    membership,
    explanation,
    headlines,
    relatedTickers,
    mover,
  };
}
