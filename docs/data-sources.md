# Data sources

Free-first and paid adapters behind provider interfaces. Live HTTP + Zod normalize when keys are set; otherwise mocks when `ALLOW_MOCK_PROVIDERS=true` and `NODE_ENV !== production`.

Market-data routing (Alpaca / Massive / Finnhub) is documented in [`market-data-architecture.md`](./market-data-architecture.md). **Production shared real-time is not activated by this repo** — the account owner must purchase and entitle a plan, then complete [`owner-market-data-checklist.md`](./owner-market-data-checklist.md).

## Alpaca Market Data

| | |
| --- | --- |
| **Uses** | Quotes, snapshots, bars, tracked-universe movers, market clock (`GET /v2/clock` only) |
| **Capabilities** | quotes, bars, snapshots, movers, marketClock (no reference/corporate in adapter) |
| **Env** | `ALPACA_DATA_KEY_ID`, `ALPACA_DATA_SECRET_KEY`, `ALPACA_STOCK_FEED` (`iex` \| `sip`), `ALPACA_DATA_BASE_URL` |
| **Feed** | Default **IEX** (single-exchange). **SIP** only when the account is entitled and `ALPACA_STOCK_FEED=sip` |
| **Latency** | Labeled `realtime` when live; never relabel IEX as SIP/NBBO/full-market |
| **Movers** | Ranked inside the configured refresh universe only — not exchange-wide |
| **Breadth** | Unsupported on IEX; only consider when SIP/full-market coverage is proven |
| **Licensing** | Confirm current Alpaca terms for your use case. Retail / personal plans often restrict redistribution and multi-user display — see official docs. App enforces `MARKET_DATA_LICENSE_SCOPE` + surface gates |
| **Surfaces** | Bound by license scope defaults in [`licensing.ts`](../src/lib/market-data/licensing.ts) |

Official docs / plans (do not rely on this page for prices or legal terms):

- API docs: [https://docs.alpaca.markets/](https://docs.alpaca.markets/)
- Market data overview: [https://docs.alpaca.markets/docs/about-market-data-api](https://docs.alpaca.markets/docs/about-market-data-api)
- Product / plans: [https://alpaca.markets/data](https://alpaca.markets/data)
- Redistribution FAQ: [https://alpaca.markets/support/redistribute-alpaca-api](https://alpaca.markets/support/redistribute-alpaca-api)

Mock limitations: N/A for Alpaca — adapter inactive without keys. Local mocks use the generic market mock path.

## Massive (formerly Polygon.io)

| | |
| --- | --- |
| **Uses** | Quotes/snapshots, aggregates (bars), movers from universe, reference tickers, dividends/splits, market status, optional reference news (`GET /v2/reference/news`) for headline intelligence |
| **Capabilities** | quotes, bars, snapshots, movers, reference, corporateActions, marketClock, news (plan-dependent) |
| **Env** | `MASSIVE_API_KEY`, `MASSIVE_API_BASE_URL` (default `https://api.massive.com`) |
| **Feed / latency** | Plan-dependent (`delayed_15m`, `realtime`, FMV aggregate, etc.). Configure honestly — do not invent full-market from delayed plans |
| **Licensing** | Individual plans are **not** assumed team- or redistribution-licensed. Business / redistribution requires verifying Massive terms and setting an appropriate `MARKET_DATA_LICENSE_SCOPE` |
| **Surfaces** | Same scope → surface matrix as other market providers |
| **Activation** | Adapter is inactive without `MASSIVE_API_KEY` |

Official docs / plans:

- API docs: [https://massive.com/docs/](https://massive.com/docs/)
- Product home: [https://massive.com/](https://massive.com/)
- Individual pricing: [https://massive.com/pricing](https://massive.com/pricing)
- Business: [https://massive.com/business](https://massive.com/business) (confirm current URL on massive.com)

## Finnhub

| | |
| --- | --- |
| **Uses** | Quotes, top movers (from configured symbols), company/general news, optional earnings calendar |
| **Env** | `FINNHUB_API_KEY` |
| **Freshness** | Quotes typically delayed on free tier; router labels `feedCoverage` / `latencyClass` as `delayed_15m` |
| **Role** | May remain **fallback** via `MARKET_DATA_FALLBACK=finnhub`, or legacy primary if no Alpaca/Massive keys |
| **Quotas** | Free tier ~30–60 req/min (registry default 30/min). Respect 429s with registry retry policy |
| **Upgrade** | Paid Finnhub or prefer Alpaca/Massive behind the router |

Mock limitations: fixed seed tape; not suitable for trading decisions.

## Forex Factory (USD catalyst calendar)

| | |
| --- | --- |
| **Uses** | Catalyst radar — this week's USD economic events (impact, actual, forecast, previous) |
| **Source** | Official weekly export linked from the [Forex Factory calendar](https://www.forexfactory.com/calendar): `https://nfs.faireconomy.media/ff_calendar_thisweek.json` |
| **Filter** | Full weekly export. Dashboard defaults to USD; user can switch to other FF markets |
| **Freshness** | Morning snapshot at 6:00 a.m. America/Chicago. Cron refreshes once when that snapshot is stale; dashboard polls do not re-hit the export |
| **Quotas** | FF limits weekly-export downloads (~2 / 5 minutes). Do not poll this feed on the live 15s dashboard loop |
| **Honesty** | Forecast/actual strings are passed through as published. Empty prints stay empty — values are never invented |

## FRED (Federal Reserve Economic Data)

| | |
| --- | --- |
| **Uses** | Macro series observations (`getSeries`); economic calendar is best-effort / static holidays + release placeholders |
| **Env** | `FRED_API_KEY` |
| **Freshness** | Series lag by publication schedule (days–months) |
| **Quotas** | Generous free API; registry default 20/min |
| **Upgrade** | Premium calendar vendor for consensus/actuals |

Mock limitations: handful of hardcoded series (`DGS10`, `CPIAUCSL`, …) and demo calendar events.

## Earnings calendar

| | |
| --- | --- |
| **Uses** | Interactive dashboard calendar above the watchlist, styled after a day-by-day earnings slate (before open / after close) |
| **Universe** | Union of Finnhub + Alpha Vantage for America/Chicago yesterday through +6 months. Server returns the full merged slate. Optional client dropdowns filter by market cap / ADV; defaults are Any |
| **Estimates** | EPS / revenue from Finnhub when present; Alpha Vantage contributes EPS estimate and company name. Empty prints stay empty |
| **Implied move** | ATM call+put mid ÷ spot from delayed Yahoo options for the most active near-term names (budgeted per refresh). Shown as expected move % / $. Missing chains stay "—" — never invented. Missing Yahoo data never drops the row |
| **Freshness** | Source caches are separate: Finnhub calendar ~60 min, Alpha Vantage 3-month CSV ~12 h, Yahoo quotes 5 min, Yahoo options 15 min. Assembled `/api/market/earnings` response 5 min. Not on the 15s tape loop |
| **Diagnostics** | Response `meta` reports per-source counts, merge union / only / conflicted, quote+options enrichment, and fixture usage. Keys are never returned |
| **History** | Selecting a name loads the last eight reported quarters: Finnhub `/stock/earnings` + `/calendar/earnings?symbol=`, Alpha Vantage `EARNINGS`, Yahoo daily closes for 1-session / 5-session reaction. Cached ~12h per symbol, separate from the calendar refresh |
| **Honesty** | Delayed options, not OPRA. Not affiliated with Earnings Whispers. Verify estimates against company IR. History never invents missing EPS, revenue, or reactions |
| **Memory** | Last-known-good snapshots live in process memory and reset on serverless cold start. No paid cache was added |

## Alpha Vantage (earnings calendar only)

| | |
| --- | --- |
| **Uses** | Secondary upcoming earnings CSV (`function=EARNINGS_CALENDAR&horizon=6month`) and historical quarterly JSON (`function=EARNINGS`) for the selected-name history panel |
| **Env** | `ALPHA_VANTAGE_API_KEY` |
| **Official endpoint** | `https://www.alphavantage.co/query` — CSV columns `symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay` |
| **Quotas** | Free tier is typically 25 requests/day and 5/minute. This app caches the CSV for 12 hours and does not call it on the 5-minute quote refresh |
| **Fallback** | Missing key or failed fetch leaves the Finnhub path operational. An unexpected empty payload keeps the last successful snapshot and marks it stale |

## CME FedWatch / 30-Day Fed Funds futures

| | |
| --- | --- |
| **Uses** | FOMC rate-hike / hold / ease probabilities on the dashboard (above Catalyst radar) |
| **Primary (optional)** | Official CME FedWatch REST (`/forecasts/latest`) when `CME_FEDWATCH_ACCESS_TOKEN` is set |
| **Default public path** | NY Fed EFFR + target range + delayed ZQ quotes (Yahoo CBT symbols). CME product-305 settlements are a fallback if delayed quotes fail |
| **Env** | `CME_FEDWATCH_ACCESS_TOKEN`, `CME_FEDWATCH_API_BASE` (optional) |
| **Freshness** | Client and server rebuild last prints every 15 seconds (Yahoo spark). Daily history / NY Fed / settlements stay on longer caches (15–60 min). Public ZQ prints are still delayed vs Globex; settlements are end-of-day. Official API is near-real-time when entitled |
| **Honesty** | Probabilities are never invented. If quotes or the target range cannot be fetched, the panel stays empty |
| **Attribution** | Public path is labeled as CME FedWatch *methodology*, not the licensed QuikStrike / FedWatch stream |

Official product page: [CME FedWatch Tool](https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html). Paid API: [FedWatch API](https://www.cmegroup.com/market-data/market-data-api/fedwatch-api.html).

## RSS (allowlisted)

| | |
| --- | --- |
| **Uses** | Secondary headlines merged into Material News / dashboard intelligence with Finnhub, Massive news (if entitled), and EDGAR |
| **Env** | `NEWS_RSS_FEEDS` — comma-separated **https** feed URLs (allowlist only). When unset, official defaults: Fed, BLS, SEC press, CNBC, EIA Today in Energy, Treasury press |
| **Guards** | http(s) only; block private/link-local/metadata IPs; response size cap (SSRF defenses) |
| **Freshness** | Depends on publisher TTL. Intelligence ingest caches ~5 minutes; cron `tick` forces a refresh |
| **Entity tags** | RSS items usually arrive untagged. Tickers are resolved from provider tags, `$TICKER` / `(TICKER)` tokens, catalog names, and aliases. Untagged wires are labeled as a coverage gap when tagging is weak |
| **Upgrade** | Paid news API with entity tagging |

Mock limitations: static demo headlines on `demo.news.local`.

## Headline intelligence (Material News)

| | |
| --- | --- |
| **Uses** | Clustered event feed, first-class `/news` search, watchlist **Why it’s moving**, command-palette headline jump |
| **Sources** | Finnhub general + company news (priority movers, max 12 tickers; requested symbol is attached only when `related` is empty **and** the title/name corroborates), default/allowlisted RSS, Massive reference news (fail-closed on entitlement errors), material EDGAR forms (8-K, 10-Q, 10-K, 6-K, S-1, SC 13) |
| **Persistence** | `market_news_items` (market-wide, member-readable, service-role writes with checked upsert errors) with English FTS; `news_saved_searches` (user-owned RLS via the session client). Cron `tick` forces ingest and reports `persist_failed` when the store write errors. Command palette never writes. |
| **Honesty** | Attribution never invents a cause. Unknown is explicit. Duplicate/recycled coverage is clustered. Source down / empty / unentitled / persist-failure states stay visible. Current quote % is not the print at headline time |
| **Search** | Lexical + synonym/theme expansion (not embeddings). Ticker filters match issuer tags only (theme peers boost rank, they do not gate). Natural language: tickers, aliases, event types, themes, time windows, “why is TICKER / company name moving”. Command palette searches the last snapshot (`freshness=cached`) and does not ingest |
| **Clocks** | Today search and regular-session Why use America/Chicago calendar day. Premarket/after-hours chips are 4:00 a.m. / 4:00 p.m. ET. Premarket/closed/overnight Why starts at the last completed 4:00 p.m. ET regular close (Friday on a weekend — never Saturday 4:00 p.m.) |

## SEC EDGAR

| | |
| --- | --- |
| **Uses** | Recent filings (`getFilings`); earnings may come from Finnhub when keyed |
| **Env** | `EDGAR_USER_AGENT` preferred; else derived from `NEXT_PUBLIC_APP_URL` (SEC requires a descriptive User-Agent) |
| **Freshness** | Near real-time for new filings |
| **Quotas** | Fair-use; identify your app in User-Agent |
| **Upgrade** | Paid filings/firehose or CIK-mapped watchlist enrichment |

Mock limitations: two demo 8-K / 10-Q rows.

## Resend (email)

| | |
| --- | --- |
| **Uses** | Report delivery (`EmailProvider.sendReport`) |
| **Env** | `RESEND_API_KEY`, `EMAIL_FROM` |
| **Quotas** | Free tier daily send limits — monitor Resend dashboard |
| **Upgrade** | Paid Resend or SES/Postmark behind the same interface |

Mock limitations: writes JSON to `tmp/email-outbox/` only; no external send.

## Mock / demo summary

When mocks are active, every normalized record should carry `sourceQuality: "mock"` and coverage notes stating demo data. Production must not enable `ALLOW_MOCK_PROVIDERS`. Production market-data mocks throw (`assertNoProductionMarketDataMocks`).
