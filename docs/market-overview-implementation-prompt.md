# Market Overview — implementation prompt

Paste this document into a new agent chat (or open it in-repo and tell the agent to execute it). It is self-contained. The scored audit that produced these decisions lives in the Cursor canvas `canvases/market-overview-audit.canvas.tsx` under the MarketData workspace; treat that canvas as rationale, this file as the runbook.

---

## Prompt

Implement the Market Overview institutional recomposition. **Do not rebuild the page.**

You are implementing an already-audited change to IB Market Data `/dashboard` (Market Overview). Verify every claim below against the current code before editing. Do not start a second dashboard, a second chart library, or a new Pulse scoring model.

Repo: this MarketData tree. Follow `AGENTS.md`, `docs/ib-market-data-design-system.md`, and existing dashboard primitives (`Panel`, `StatusIndicator`, `xl:grid-cols-12`, token colors). Research-only — no order entry.

### Goal

A sophisticated trader can answer **in one viewport**:

- regime and whether it is confirmed
- what is moving vs SPY
- whether a headline explains the top mover
- the next high-impact print

The primary chart is **open** on that name. Nothing implies SIP internals, VIX futures, or a cash Treasury curve unless that series is actually present.

Surface **what is moving, why, what changed, and what deserves attention next**. Do not add more undifferentiated data.

### Current facts (re-verify, then treat as true)

- Route: `src/app/(app)/dashboard/page.tsx` → `LiveMarketOverview`.
- `DashboardSnapshot.movers` is populated by refresh / `/api/dashboard` / `/api/market/movers` and **never rendered**.
- `MarketChart` starts with `panelOpen = false` and default range `"3M"`.
- Live `calculateMarketPulse` scores **every tape quote** (including single-name AI / sector ETFs). `PULSE_HISTORY_SYMBOLS` is a different 8-name set. Live score ≠ history path.
- `SECTOR_ETFS` are in `buildUniverse`. `buildReportAnalytics` already builds heatmap cells, QQQ−SPY / IWM−SPY factor rows, vs-SPY bars, and `variantViews`. Overview uses none of that.
- Cross-asset tape omits **HYG** (a scored Pulse driver), **IWM/DIA** (often already on tape), **LQD**, **IBIT**. Gold is shown but unscored.
- Live `/api/dashboard` hardcodes `latestReport: null`. `listLiveReports` already exists. Fixtures still populate a research desk.
- Cache `breadth.supported` can be true while `advancing`/`declining` stay `null`. Do not label proxy A/D as NYSE internals.
- Alpaca stocks already drop `BTC-USD`. Use **IBIT** only.
- Design system promised sortable movers on Market Overview. Trust chrome is duplicated (session strip, pulse header, chart status, provider panel).
- Independent 15s polls: dashboard, FedWatch, chart 1D/5D. Earnings ~5m. Pulse-history on range change.

### Target information architecture (same components, new defaults)

Keep `xl:grid-cols-12`. Sticky below the app rail:

1. **Trust + attention** — keep `SessionControlStrip` as the only trust row. Add 3–5 `AttentionStrip` items: largest |pulse driver|, top material mover + headline, top vs-SPY sector, highest watchlist RVOL, next USD high-impact (`selectUpcomingUsdHighImpactRisks`). Each click sets chart symbol.
2. **Pulse** — keep regime, score, one-line explanation, path, drivers. Shorten. Tape grouped (index / rates-credit / vol-fx / commodity). Breadth on the **frozen** basket only.
3. **Workspace 8/4** — chart **open**, default **1D RTH** in live/provider mode (keep 3M in mock if fixture bars are daily-only). Sidebar: sector heatmap, factor spreads, sortable material movers. Latest report is a **one-line link** under movers, not an empty card.
4. **Risk 6/3/3** — compact FedWatch | compact earnings (today/tomorrow ∩ watchlist ∪ mega-cap ∪ high expected move) | catalyst week. Expand in place restores the current full panels unchanged.
5. **Names 8/4** — watchlist (default sort `|1d|` or rvol, abnormal flag) | clustered headlines with clickable tickers. Demote `ProviderHealthBanner` to a trust-row popover.

### Work packages

| ID | Pri | Change | Why | Effort | Where |
| --- | --- | --- | --- | --- | --- |
| P0-1 | P0 | Render material movers + catalyst join | Snapshot already carries movers; design system promised sortable movers; overview never mounts them | S | `LiveMarketOverview.tsx`, new `MaterialMoversPanel`, `HeadlineFeed` tickers, `lib/domain/material-movers.ts` |
| P0-2 | P0 | Open the primary chart by default | Command center without a visible path is a quote board. `panelOpen` starts false | XS | `MarketChart.tsx` (`useState(false)` → true on xl; collapsed summary on small screens) |
| P0-3 | P0 | Sector heatmap from tape already in cache | `SECTOR_ETFS` are in the refresh universe. Reports already build heatmap cells | S | `lib/market-data/universe.ts`, `lib/reports/analytics.ts`, new `SectorHeatmap` |
| P0-4 | P0 | Attention strip: moving / why / next | Pulse explains regime; nothing ranks what deserves a click in the next 30 seconds | M | New `AttentionStrip`. Pulse drivers, vs-SPY factors, RiskWatch, watchlist rvol, movers×news |
| P0-5 | P0 | Freeze pulse inputs so live score = history path | Live breadth uses every tape quote. History rebuilds from 8 proxies | S | `market-pulse.ts`, `pulse-history.ts` `PULSE_HISTORY_SYMBOLS`, `ProxyBreadth.tsx` |
| P0-6 | P0 | Put latest report back on the live payload | API hardcodes `latestReport: null`. `listLiveReports` already exists | S | `api/dashboard/route.ts`, `lib/reports/live-reports.ts` |
| P1-1 | P1 | Regroup cross-asset tape to the report taxonomy | Tape omits HYG, IWM/DIA, LQD, IBIT | S | `CrossAssetTape.tsx`, `lib/reports/universe.ts` `TICKER_META` |
| P1-2 | P1 | Factor spreads as first-class tiles | QQQ−SPY and IWM−SPY already exist in `factorRow` | S | `lib/reports/analytics.ts` (extract), new `FactorTape` |
| P1-3 | P1 | Collapse FedWatch to a rates card | Full CME replica sits above movers that are not on the page | M | `FedWatchPanel.tsx` — compact default: next meeting, ease/hold/hike, 1d delta; expand for full tool |
| P1-4 | P1 | Collapse earnings to a risk list | Full-slate week calendar + history drill lives on Overview | M | `EarningsCalendar.tsx`, `LiveMarketOverview` layout |
| P1-5 | P1 | Make news and pulse drive the chart | Ticker badges are inert. Driver hover does not select the proxy | S | `HeadlineFeed.tsx`, `SignalDrivers.tsx`, `MarketPulse.tsx` `onSelectSymbol` |
| P1-6 | P1 | Watchlist default sort = rvol or 1d, plus abnormal flag | RVOL is already computed and unused as a scanner | XS | `WatchlistTable.tsx` |
| P2-1 | P2 | Duration stack as curve proxy (SHY / IEF / TLT) | Rates = TLT session %. Do not fake a Treasury curve | M | `universe.ts`, optional pulse rates input, new `DurationStack` |
| P2-2 | P2 | Honest vol / credit / crypto coverage | VIXY is not VIX TS. HYG is not OAS. BTC-USD 400s Alpaca stocks | M | Cross-asset tape, universe, `alpacaStockSymbols` (already drops BTC-USD) |
| P2-3 | P2 | Divergence engine from existing bars | No SPY vs TLT / breadth confirmation UI. Pulse-history already fetches bars | M | Pulse-history fetch, new `DivergenceNotes` (reuse report `variantViews`) |
| P2-4 | P2 | One dashboard refresh coordinator | Independent 15s polls plus duplicate provenance chrome | M | `LiveMarketOverview`, `SessionControlStrip`, `ProviderHealthBanner` (popover), FedWatch refresh |

Effort: XS = hours, S ≤ 1 day, M = 2–3 days.

### Build order (do this sequence)

**P0 — ship first**

1. **P0-5** Freeze Pulse inputs. Export `PULSE_INPUT_SYMBOLS` from `src/lib/market-data/market-pulse.ts` (driver symbols + explicit breadth basket of indices + scored proxies only). Use the same set in `pulse-history.ts`. Stop scoring NVDA/AMD/full universe as “configured proxy breadth”. Update `ProxyBreadth` copy. Extend `market-pulse.test.ts` so live breadth symbols equal history symbols. Do **not** change weights, imputation rules, or regime thresholds.
2. **P0-2** `MarketChart.tsx`: `panelOpen` true on xl; collapsed summary ok on small screens. Live/provider default range **1D**. Selecting a symbol from pulse/watchlist/news/movers must open the chart on that ticker.
3. Extract shared `src/lib/market-data/overview-analytics.ts` from `src/lib/reports/analytics.ts` (heatmap, `factorRow`, vs-SPY, `variantViews`). Reports must keep **identical numbers**. Do not fork formulas.
4. **P0-1 + P0-3 + P0-4** New UI in the 8/4 workspace:
   - `MaterialMoversPanel` from `data.movers`, filtered with `detectMaterialMovers` / existing thresholds — not a raw % sort. Join headlines by ticker. Causal status `reported` if a headline matches, else `unclear`. Show movers `coverageNotes`.
   - Sector heatmap from tape ∩ `SECTOR_ETFS` (+ SMH). Click → chart.
   - `AttentionStrip` max 5 items, each citing a concrete print (ticker + %, or event + countdown). No model prose.
5. **P0-6** Wire `latestReport` in `src/app/api/dashboard/route.ts` via `listLiveReports` / fixture latest. One-line under movers. Do not leave production `null` while demo shows a desk.
6. Fixtures: add **HYG, SMH, XLK, XLF, IBIT** to `fixtureQuotes` so demo Pulse coverage and heatmap are truthful. Keep mock labeling.

**P1**

7. Regroup `CrossAssetTape` to `TICKER_META` groups. Show HYG, LQD, IWM, DIA, IBIT. Keep UUP; do not invent EURUSD. Keep VIX/VIXY labeled as proxy, never as VIX futures.
8. Factor tiles: QQQ−SPY, IWM−SPY, HYG−LQD (if both print).
9. News ticker badges and Pulse driver click call `onSelectSymbol`. Watchlist default sort rvol or `|1d|`; flag abnormal RVOL.
10. Compact `FedWatchPanel` default: next meeting, ease/hold/hike, 1d probability delta. Compact `EarningsCalendar` default to the risk list above. Expand restores current UI.

**P2 (if P0+P1 are solid)**

11. Duration stack SHY/IEF/TLT labeled **ETF duration proxies, not CMT yields**. Add to universe only if quotable on the stocks path.
12. Divergence notes from existing pulse-history bars / `variantViews` (SPY vs TLT, narrow breadth vs index, QQQ vs SMH). Rule-based, cite prints.
13. Poll coordinator: one dashboard snapshot poll; FedWatch 60s unless expanded; chart 15s only while 1D/5D is open. Provenance: strip + per-module stale chip only.

### Architecture rules

1. Add `overviewAnalytics` to the dashboard snapshot (or a cheap derived client memo from `tape` + `movers` + `headlines` + `calendar`). Do not run `calculateMarketPulse` on the full tape. Export `PULSE_INPUT_SYMBOLS` from `market-pulse.ts` and use it in `pulse-history.ts`.
2. Extract heatmap / `factorRow` / `variantViews` from `lib/reports/analytics.ts` into a shared module. Reports must keep identical numbers. Do not fork formulas.
3. Attention items are ranked, capped (max 5), and must cite a concrete print (ticker + %, or event + countdown). No model prose. Causal status: `reported` if a headline ticker matches, else `unclear` — copy the report causality rules.
4. Provenance stays per module. Do not mark news or FedWatch as SIP because the equity tape is SIP. Earnings already has source chips; copy that pattern onto movers (`coverageNotes` already on the movers API).
5. Fixtures: add HYG, SMH, XLK, XLF, IBIT to `fixtureQuotes` so demo pulse coverage and heatmap are not a lie. Keep mock labeling.
6. Layout: `xl:grid-cols-12` already in use. Do not introduce a new grid system. Collapse FedWatch/earnings with existing `Panel` plus a details disclosure (the chart already uses this). Sticky attention strip uses `scroll-mt` already on chart/fedwatch/earnings anchors.
7. Tests: extend `market-pulse.test.ts` so breadth symbols equal history symbols; add a dashboard component test that movers render; fixture-safety must still assert no silent live fixture swap (already true on the page).
8. Match existing IB visual language. Do not add a decorative UI system.

### Explicit non-goals

| Do not | Why |
| --- | --- |
| Rebuild Market Pulse scoring | Weights and honesty are fine; inputs are not |
| GICS industry heatmap | No industry map in live data; sectors are enough |
| VIX futures term structure | No futures vendor on the equity snapshot path |
| CMT Treasury curve as if live | FRED is lagged; ETF duration stack is the honest proxy |
| Options / dark pool / ETF create-redeem | Product is research-only; reports already refuse this |
| BTC-USD on Alpaca stocks | Adapter already drops it; use IBIT |
| Second chart library | `MarketChartCanvas` is the stack |
| Full FedWatch + full earnings expanded | They bury movers and the chart |
| Impute missing pulse drivers | Methodology forbids it; keep withheld score |
| Positions P&L on Overview | Separate route; optional later watchlist overlay only |

### Definition of done

- First viewport: attention strip, Pulse (frozen inputs), open 1D chart, heatmap, movers with catalyst join, next USD risk.
- Clicking attention / mover / sector / headline / driver opens the chart on that symbol.
- Live Pulse score and Pulse history path use the same symbol set (tests prove it).
- Live dashboard returns a real latest report when one exists.
- FedWatch and earnings are compact by default with lossless expand.
- No copy implies consolidated internals, VIX term structure, or cash yields unless present.
- Demo fixtures include HYG/SMH/sector/IBIT so Pulse and heatmap are not empty in mock.
- Existing Pulse methodology, chart indicators, earnings history, and FedWatch full tool still work via expand/existing routes.

Implement **P0 completely before P1**. Commit only if asked. If a spec item is already done in code, skip it and note that in the wrap-up.

### Primary files

- `src/components/dashboard/LiveMarketOverview.tsx`
- `src/components/dashboard/DashboardMarketBoard.tsx`
- `src/components/dashboard/MarketPulse.tsx`
- `src/components/dashboard/MarketChart.tsx`
- `src/app/api/dashboard/route.ts`
- `src/lib/market-data/market-pulse.ts`
- `src/lib/market-data/pulse-history.ts`
- `src/lib/market-data/universe.ts`
- `src/lib/reports/analytics.ts`
