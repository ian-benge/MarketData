/**
 * Live check: fetch Yahoo quotes for one (or more) symbols from each
 * persisted watchlist. Never invents prints — reports missing fields as-is.
 *
 * Usage: npx tsx scripts/verify-watchlist-quotes.ts
 */
import {
  fetchYahooEquityQuotesDetailed,
  fetchYahooSparkDailyClosesDetailed,
  resetYahooEarningsSession,
} from "../src/lib/market-data/earnings/yahoo";
import { assembleWatchlistRows } from "../src/lib/market-data/watchlist-assemble";

const SAMPLES: Record<string, string[]> = {
  "Market Tape": ["SPY", "QQQ", "IWM", "TLT"],
  "Market Leaders": ["NVDA", "MSFT", "PLTR", "BRK.B"],
  "Research Queue": ["PLTR", "NBIS", "SNDK", "LUNR", "USAR", "POET", "AXTI", "LITE", "WDC", "IONQ", "CVNA"],
  "AI Infrastructure Tactical": ["NBIS", "SNDK", "AMD", "LITE", "MU"],
  "Cybersecurity Tactical": ["CRWD", "PANW", "CIBR"],
  "Optical & Networking Tactical": ["COHR", "LITE", "CIEN"],
  "Special formats": ["BRK.B", "BF.B", "BTC-USD"],
};

async function main() {
  resetYahooEarningsSession();
  const symbols = [...new Set(Object.values(SAMPLES).flat())];
  const quotes = await fetchYahooEquityQuotesDetailed(symbols);
  const spark = await fetchYahooSparkDailyClosesDetailed(symbols, "1mo");
  const quoteInputs = new Map(
    [...quotes.quotes.entries()].map(([ticker, quote]) => [
      ticker,
      {
        ticker,
        last: quote.price ?? quote.previousClose ?? null,
        open: quote.open ?? null,
        changePercent: quote.changePercent ?? null,
        volume: quote.volume ?? null,
      },
    ]),
  );
  const enrichment = new Map(
    [...quotes.quotes.entries()].map(([ticker, quote]) => [
      ticker,
      {
        name: quote.name,
        marketCap: quote.marketCap,
        avgVolume: quote.avgVolume,
        previousClose: quote.previousClose,
        last: quote.price,
        open: quote.open,
        volume: quote.volume,
        changePercent: quote.changePercent,
        weekAgoClose: (() => {
          const closes = spark.closes.get(ticker) ?? [];
          return closes.at(-6)?.close ?? null;
        })(),
      },
    ]),
  );

  console.log(`Yahoo quotes received ${quotes.quotes.size} keys for ${symbols.length} requested`);
  console.log(`Quote chunk failures: ${quotes.failures.length}`);
  console.log(`Spark chunk failures: ${spark.failures.length}`);

  for (const [list, tickers] of Object.entries(SAMPLES)) {
    const rows = assembleWatchlistRows(tickers, quoteInputs, enrichment);
    const quoted = rows.filter((row) => row.last != null).length;
    console.log(`\n${list}: quoted ${quoted}/${tickers.length}`);
    for (const row of rows) {
      const diag = quotes.diagnostics.find((item) => item.ticker === row.ticker);
      console.log(
        `  ${row.ticker.padEnd(8)} last=${row.last ?? "—"} 1d=${row.change1dPercent ?? "—"} open%=${row.changeFromOpenPercent ?? "—"} 1w=${row.change1wPercent ?? "—"} rvol=${row.relativeVolume ?? "—"} cap=${row.marketCap ?? "—"} vol=${row.volume ?? "—"} ${diag?.status ?? ""} ${diag?.error ?? ""}`.trim(),
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
