# Market Overview ↔ Watchlists & Sectors — integration audit

**Status:** read-only audit. Do not treat this as already implemented.  
**Audience:** a separate implementation agent.  
**Date of inspection:** 2026-08-14.  
**Scope:** how the Watchlists & Sectors coverage workspace should flow into Market Overview (`/dashboard`), plus a quality audit of the dashboard as a trader command center.

This document is based on the current codebase. Items marked **Verified** were read in source. Items marked **Assumption** or **Judgment** are recommendations, not existing behavior. Do not re-litigate prior Market Overview work that is already shipped (Pulse freeze, open chart, heatmap, movers, attention strip, compact FedWatch/earnings). Integrate coverage *into* that hierarchy; do not rebuild the page.

Related but stale docs (do not follow blindly):

- `docs/ui-ux-audit.md` — predates live watchlist editing, the primary chart, and the Overview recomposition. Cookie-forward / silent fixture swap P0s are **fixed**.
- `docs/implementation-status.md` Phase 4 “Watchlists / dashboard done” is **aspirational** relative to refresh-universe and report wiring.
- `docs/market-overview-implementation-prompt.md` — most P0/P1 items are **shipped**. Remaining: P2-4 poll coordinator, optional `overviewAnalytics` on the snapshot.

Design contract: `docs/ib-market-data-design-system.md` (dense not crowded; truth before polish; refreshes preserve context). Explicit non-goal from the Overview prompt: **Positions P&L does not belong on Overview**.

---

## 1. Executive assessment

Market Overview is already a credible **tape-centric command center**: sticky trust + attention, frozen Market Pulse, an open primary chart (xl), SPDR sector ETF heatmap, factor/duration proxies, material movers with headline join, compact FedWatch / earnings / catalyst, a shared watchlist table, and clustered news. Watchlists & Sectors is already a credible **coverage research and management workspace**: personal/shared lists, taxonomy sectors/themes/screens, relative strength, breadth, unusual flags, rotation board, inspector, CRUD/convert/move.

They are **not yet one workflow**. The dashboard still treats “watchlist” as a thinner quote grid of **shared** lists assembled by a parallel `src/lib/market-data/watchlist-*` stack, and “sector” as **Select Sector SPDR ETFs ∩ tape**. The coverage page’s `CoverageSnapshot` (personal lists, `sectors` table, themes, screens, RS, flags, sector board, per-name catalysts) never reaches Overview except as:

- shared-list symbols in `WatchlistTable` and earnings compact filter;
- one attention chip (“highest RVOL on the currently selected shared list”).

That split is the right *product* idea (command center vs research workspace) and the wrong *data* wiring. The desk can curate coverage that the command center neither refreshes, ranks, nor deep-links.

**Verdict**

| Question | Answer |
| --- | --- |
| Should Overview clone `/watchlists`? | **No.** Do not mount `CoverageTable`, create-coverage, inspector, or the full rotation board on the dashboard. |
| Should Overview ignore coverage? | **No.** Coverage should personalize *exceptions*: unusual names, desk rotation vs SPY, earnings on covered names, news on covered tickers, and one-click drill-down. |
| Highest-leverage fix | Feed **live stored lists + sector constituents** into `buildUniverse` (today it still flattens **fixture** watchlists), then surface a small **Coverage exceptions** module + URL deep links. |
| Primary risk | Overcrowding: Pulse + chart sidebar + calendars + watchlist + news is already dense. Add ranked signals, not a second workspace. |

**Quality of the dashboard as a command center (independent of coverage)**

The Overview recomposition largely succeeded. Remaining institutional gaps are **freshness honesty on live poll failures**, **independent pollers**, **sidebar stack height**, **Pulse visual weight**, **personalization**, and **cross-route continuity** (no `/watchlists?listId=` from Overview). Chart quality, session/trust chrome, mover materiality, and Pulse methodology honesty are already in the right family.

---

## 2. Current relationship between the two pages

### 2.1 Intended roles (verified copy)

`AppShell` `WORKBENCH_NAV`:

- Market Overview — “Session, chart, watchlist, and catalysts”
- Watchlists & Sectors — “Shared and personal coverage universes”

Watchlists page header: “Persistent shared and personal coverage with live tape, multi-horizon performance, and sector rotation.”

Design system: Overview is the command-center hierarchy; Watchlists is a first-class authenticated surface, not a settings page.

### 2.2 Routes and gates

| Surface | Route | Gate | Notes |
| --- | --- | --- | --- |
| Market Overview | `src/app/(app)/dashboard/page.tsx` | App layout `getSessionUser()` only | **Does not** call `requirePermission("viewDashboard")`. Query: `symbol`, `generate`, `state` (fixture demo). |
| Watchlists & Sectors | `src/app/(app)/watchlists/page.tsx` | `requirePermission("viewDashboard")` | **No** `searchParams`. `maxDuration = 60`. |
| Dashboard API | `GET /api/dashboard` | `viewDashboard` | `live=1` tightens refresh due. |
| Coverage API | `GET /api/watchlists` | `viewDashboard` | `listId`, `sectorId`, `includeArchived=1`. |
| Dashboard watchlist switch | `GET /api/market/watchlist` | `viewDashboard` | `listId`. Shared lists only. |
| Mutations | `/api/watchlists/*`, `/api/sectors/*` | `editWatchlists` / `editSectors` | Coverage page only. |

Both roles have `viewDashboard`, `editWatchlists`, and `editSectors` (**Verified** `src/lib/domain/permissions.ts`). There is no “view watchlists” permission distinct from Overview.

### 2.3 Data planes (verified)

```
Coverage workspace                         Market Overview
─────────────────                          ───────────────
buildCoverageSnapshot                      GET /api/dashboard
  listStoredWatchlists (shared+personal)     listStoredWatchlists → filter shared, !archived
  listStoredSectors                          getWatchlistSnapshot (DashboardWatchlistSnapshot)
  loadCoverageQuotes (tape + Yahoo 60s)      tape from MarketDataCache
  analytics: RS, flags, sectorBoard,         client: pulse, heatmap(SECTOR_ETFS),
             winners/losers/unusual                    factors, movers join, attention
  loadCatalysts (earnings + research)        getDashboardResearch (headlines + FF calendar)
WatchlistsWorkspace polls /api/watchlists    LiveMarketOverview polls /api/dashboard?live=1
  every 15s (supabase persistence only)      every 15s; FedWatch/earnings/chart independent
```

**Refresh universe** (`runMarketDataRefresh` → `buildUniverse`) priority:

1. major index ETFs  
2. cross-asset proxies  
3. `SECTOR_ETFS` (SPDRs + SMH)  
4. AI infrastructure seed  
5. **open position tickers** (`loadOpenPositionTickers`)  
6. **watchlist symbols** ← `defaultWatchlistSymbols()` = `fixtureWatchlists.flatMap(w => w.symbols)`  
7. report-in-progress  

Cap: `MARKET_DATA_MAX_UNIVERSE_SIZE` default **80** (`src/lib/env.ts`). Coverage quoting cap is **400** (`COVERAGE_QUOTE_CAP`). **Verified:** live DB lists/sectors are not injected into refresh.

### 2.4 What each page actually shows

**Overview layout** (`LiveMarketOverview` + `DashboardMarketBoard`):

1. Sticky `OverviewStatusChrome` — session/trust + `AttentionStrip` (max 5). Mobile collapses to `<details>`.
2. Optional `StaleBanner`.
3. Full-width `MarketPulse` (regime, score, drivers, grouped `CrossAssetTape`, `ProxyBreadth`, `RiskWatch`, methodology disclosure).
4. 8/4: `MarketChart` | `SectorHeatmap` → `FactorTape` → `DurationStack` → `MaterialMoversPanel` (+ `LatestReportLine`) → `DivergenceNotes`.
5. 6/3/3: compact `FedWatchPanel` | compact `EarningsCalendar` | `CatalystCalendar`.
6. 8/4: `WatchlistTable` | `HeadlineFeed`.

**Coverage layout** (`WatchlistsWorkspace`):

1. Header + persistence/stale/quote-error panels.
2. Collapsible “Create coverage”.
3. Sidebar (`CoverageSidebar`) vs main: `CoverageSummary` (breadth, winners/losers/unusual) → `CoverageHeatmap` → `CoverageTable` + `TickerInspector` → `SectorHeatmapBoard` + `SectorBoard`.

### 2.5 The only live couplings today (verified)

| Coupling | Behavior |
| --- | --- |
| Shared watchlists → Overview table | Dashboard API maps stored **shared, non-archived** lists into `getWatchlistSnapshot`. List chips switch via `/api/market/watchlist?listId=`. |
| Shared watchlist symbols → earnings compact | `watchlistSymbols={watchlist?.symbols}` — today/tomorrow ∩ (watchlist ∪ mega-cap ≥ $200B ∪ implied move ≥ 5%). |
| Watchlist rows → attention | Highest RVOL on current table rows → “Watchlist RVOL” chip → chart. |
| Research headlines | Same `getDashboardResearch` used for Overview news and coverage catalysts (filtered to selected collection tickers). |
| Quote assembler | Coverage `loadCoverageQuotes` calls `assembleWatchlistRows` from market-data. |
| Positions → tape | Open tickers enter refresh universe only. **No** blotter/P&L on Overview (intentional). |
| Symbol → chart | Overview `?symbol=` via `history.replaceState`. Coverage ticker select is **React state only**. |

**No** Overview links to `/watchlists`, `/positions`, or `/proposals` except the app rail. **No** coverage URL params despite the API supporting `listId` / `sectorId`.

### 2.6 Visibility model (verified)

- Watchlists: `shared` (firm, optional one default) vs `personal` (`owner_id = user`). RLS + `canMutateList`.
- Sectors: firm-wide; **no personal sectors**. Kinds: sector / industry / theme / macro / catalyst / screen / benchmark / leveraged_product / custom. Screens compute membership via `runScreen`.
- Overview APIs **drop personal lists** when any stored lists exist. If the stored shared set is empty, `getWatchlistSnapshot` falls back to **all fixture lists including personal “My desk”** — inconsistent with the shared-only filter.

---

## 3. Integration gaps and duplicated functionality

### 3.1 Product gaps (what a trader cannot do)

1. **Personal lists are invisible on Overview** when persistence is live. The desk’s own tape does not drive attention, earnings compact, or the table picker.
2. **Tracked sectors/themes do not appear on Overview.** Heatmap is SPDR ETFs, explicitly “Not a GICS industry map.” Coverage `buildSectorBoard` (EW 1d/1w/1m/YTD, vs SPY, breadth, leaders/laggards, unusualCount) is unused on Overview.
3. **No drill-down.** Clicking a sector ETF opens the **chart on XLK**, not `/watchlists?sectorId=…`. Clicking a watchlist row opens the chart, not the inspector/workspace.
4. **Unusual / RS / flags** exist only on coverage. Overview watchlist flags only `Abn RVOL` at ≥ 2.0× (coverage `rvol` flag is ≥ 1.8× — **forked threshold**).
5. **News is firm-wide**, not coverage-weighted. Coverage already joins headlines onto selected names; Overview `HeadlineFeed` does not prefer covered tickers.
6. **Reports ignore live lists.** `src/lib/reports/pipeline.ts` hardcodes `watchlistTickers: ["SPY","QQQ","NVDA","AAPL","MSFT","TLT"]`. Trade ideas use `TICKER_META` groups, not desk collections.
7. **Proposals are a stub.** Types include `watchlist_add` / `watchlist_remove` / `sector_change`; live POST returns 503. They do not mutate coverage.
8. **Refresh will not quote new coverage names** until they happen to sit in the fixture/AI/position seed. A trader can add `CRWV` to a shared list and see Yahoo enrichment on `/watchlists` while Overview tape/movers never include it (cap 80 vs coverage 400).
9. **Selected non-default list on Overview does not keep polling.** `listOverride` is fetched once; 15s dashboard poll refreshes the *default* snapshot only. **Verified** `selectWatchlist` + `watchlist` ternary in `LiveMarketOverview`.

### 3.2 Duplicated / forked stacks

| Concern | Overview | Coverage | Risk |
| --- | --- | --- | --- |
| Snapshot types | `DashboardWatchlistSnapshot` / `DashboardWatchlistRow` | `CoverageSnapshot` / `CoverageQuote` (superset: RS, flags, role/tier, sectorName) | Two UIs cannot share a row without an adapter. |
| Table UI | `WatchlistTable` | `CoverageTable` | Parallel sort/a11y/empty states. |
| Heatmap | `SectorHeatmap` + `HeatmapCell` (ETF tape) | `CoverageHeatmap` (constituents) + `SectorHeatmapBoard` (`SectorBoardRow`) | Same English word, different models. Keep both; name them in UI. |
| Yahoo enrichment | `watchlist-service.ts` 15m quotes / 60m week | `quotes.ts` 60s quotes / 60m spark | Duplicate caches, duplicate `FIXTURE_QUOTES` tables. |
| List fallback | Fixtures if no shared DB lists | Fixtures / supabase / unavailable via `resolvePersistenceMode` | Empty-DB Overview silently looks like demo lists. |
| Polling | 15s full dashboard snapshot | 15s full coverage snapshot | Two heavy payloads; no shared coordinator. |
| Pulse math | `calculateMarketPulse` in **both** `LiveMarketOverview` and `MarketPulse` | — | Duplicate client work. |

**Do not merge the two UIs.** Do merge **list loading, universe seeding, quote enrichment, and deep-link params**.

### 3.3 Dashboard quality gaps (command-center audit)

**Information density — Judgment, based on verified layout**

The first viewport on xl already contains: trust row, five attention chips, a heavy Pulse instrument (spectrum + drivers + four tape groups + breadth + risk), then chart + five sidebar panels. Calendars and watchlist/news sit below the fold. This matches the Overview prompt’s IA, but the **sidebar is a vertical pile** (heatmap, factors, duration, movers, divergence). Duration stack returning `null` when SHY/IEF/TLT are missing is good; when all present, movers drop. **Do not add a sixth sidebar panel.** Coverage belongs in attention + a compact module in the names row, or a heatmap *mode toggle*, not another full board.

**Market Pulse — Verified + Judgment**

Shipped correctly: frozen `PULSE_INPUT_SYMBOLS`, honest proxy copy (VIXY ≠ VIX TS, HYG ≠ OAS, TLT ≠ CMT), coverage gate 0.55, withheld score. Issues: (1) parent and child both call `calculateMarketPulse`; (2) Pulse uses a drop shadow (`shadow-[0_14px_36px_…]`) that fights the design system’s flat terminal language; (3) Pulse remains tall — further shortening is optional polish, not a coverage requirement; (4) Pulse is **market-wide**, not personalized — **keep it that way**. Desk rotation must not change the regime score.

**Macro coverage — Verified**

FedWatch compact + 60s collapsed poll; earnings compact; Forex Factory catalyst week; duration/factor/cross-asset proxies. Gaps: no coverage-theme overlay on macro (e.g. “oil theme unusual into CPI”). **Judgment:** do not add that in v1.

**Chart quality — Verified**

`MarketChart` + `MarketChartCanvas`; ranges 1D–6M; live default **1D / 5m**, mock **3M / 1d**; `panelOpen` starts true then closes below xl; symbol change reopens panel; bars via `/api/market/bars?surface=derived_charts`; indicators, compare, log, extended hours. E2E still assumes a click-to-open 3M mock chart (`e2e/workspace.spec.ts`) — keep that path working. **Assumption:** canvas polish (axis density, whitespace, compare-legends) is acceptable; not the integration blocker.

**Responsiveness — Verified**

`OverviewStatusChrome` collapses on `lg:hidden`. Chart closes below 1280px. Watchlist table `min-w-[720px]` inside `overflow-x-auto`. Coverage page is a two-column xl grid. Mobile primary nav includes dashboard, positions, watchlists. **Judgment:** Overview is usable but not a phone product; do not add coverage boards that require xl.

**Data freshness / reliability / loading / errors — Verified**

| Path | Behavior | Gap |
| --- | --- | --- |
| Live Overview poll | 15s, skip hidden tab, errors swallowed, last snapshot kept | No “poll failed / aging” chip distinct from cache `stale`. |
| SSR `/api/dashboard` | Cookie-forwarded; non-OK → `unavailableDashboard` (no fixture swap) | Page self-HTTP instead of calling assembler; extra hop / 401 → unavailable panel rather than login. |
| Watchlist switch | Failure returns silently | No toast/error on list load. |
| Coverage poll | Same swallow pattern | Same. |
| Research | 5 min module TTL, inflight | Process-local; multi-instance **Assumption:** can diverge. |
| Market cache | In-process `MarketDataCache` | Same. Architecture doc: “Dashboard reads cache only.” |
| Fixtures | Honest mock labels | Demo `?state=` previews exist. |
| Pulse skeleton | Only fixture `state=loading` | Real first paint uses last SSR snapshot, not skeleton. |

**Performance — Verified + Assumption**

Full `DashboardSnapshot` (tape + movers + watchlist rows + 16 headlines + calendar + providers) every 15s. Coverage rebuilds up to 400 quotes. **Assumption:** Yahoo fan-out on coverage is the expensive path; Overview Yahoo is 15m cached. Unifying enrichment onto one cache with the coverage 60s TTL would increase Overview Yahoo load — prefer **tape-first, Yahoo as enrichment**, and put new names into the **refresh universe** instead of Yahoo-on-dashboard.

**Visual polish — Judgment**

Tokens, `Panel`, mono labels, and market tone colors are consistent. Pulse shadow, five equal-weight sidebar panels, and a watchlist module with no “Open coverage” affordance are the main polish misses. `LatestReportCard` is unused; `LatestReportLine` under movers is the correct density.

**Prior Overview items still open (verified against prompt)**

- P2-4: one refresh coordinator (dashboard 15s + FedWatch 15/60 + chart 1D/5D + earnings ~5m + coverage 15s).
- Optional server-side `overviewAnalytics` (client memo is current design).

---

## 4. Proposed dashboard-to-watchlist workflow

**Principle:** Overview answers “what do I need to see in the next 30 seconds?” Coverage answers “what do we track, why, and how is the basket behaving?” Navigation is **exceptions → workspace**, not **workspace embedded in Overview**.

### 4.1 Trader loop (target)

1. Land on Market Overview. Regime, tape, and **coverage exceptions** are visible without leaving the page.
2. Attention / exceptions / earnings / news click either:
   - **Chart** (inspect the print) — existing `?symbol=` behavior, keep as default for tickers;
   - **Coverage** (inspect the basket / edit membership) — new deep link, secondary affordance.
3. From Overview watchlist module: switch among **My lists** (personal + shared) without editing. “Manage” / collection name → `/watchlists?listId=`.
4. From Overview desk-rotation chip or heatmap mode: → `/watchlists?sectorId=`.
5. On coverage: edit, convert, move, inspect, rotation board. Header “As of” / stale already exist. Optional: “View on Overview” with `?symbol=` for the selected ticker (**nice-to-have**).
6. Generate brief remains Overview-header CTA. Once reports consume the default shared list, the brief’s watchlist section matches the desk.

### 4.2 What belongs on Overview (from coverage)

Include **only ranked exceptions and a thin tape of the active collection**:

| Signal | Overview treatment | Cap |
| --- | --- | --- |
| Active collection (default shared, or last-selected, plus a personal “desk” list if present) | Existing `WatchlistTable` (or a thinner variant) | Current table; default sort rvol |
| Unusual names across **union of active personal + default shared + purpose=`tape`/`tactical`** | Attention chip + compact “Coverage exceptions” list | 3–5 names |
| Official / tracked **kind=`sector`** rotation vs SPY | Heatmap **mode** or 4–6 cell compact board — not full `SectorBoard` | Top |vs SPY| |
| Theme / catalyst collections with `unusualCount > 0` or expiring `review_by` | One attention chip or exceptions row | 1–2 |
| Earnings today/tomorrow ∩ **union of displayed lists + personal** | Already in compact earnings; widen symbol set | keep 8 |
| News tagged with coverage tickers | Prefer those headlines in `HeadlineFeed` (toggle or sort), do not hide the rest | 16 total |
| Open position tickers that also sit on a list | Optional badge on watchlist row (“in book”) — **no P&L** | badge only |

### 4.3 What stays exclusive to Watchlists & Sectors

- Create / edit / archive / delete / duplicate / convert / reorder / move-copy.
- Column sets (tape / performance / identity / full), grouping, filter query.
- `TickerInspector` (tags, role, tier, rationale, catalysts, move).
- Full `SectorBoard` (1w/1m/YTD, leaders/laggards columns).
- Screen collections (`runScreen`) as browsable universes.
- Taxonomy (`navGroup`, `kind`, parent/child, benchmark, system flags).
- Archived collections, unresolved instrument counts, admin resolution queue.
- Empty-theme placeholders.

### 4.4 Personalization rules

| Input | Overview effect |
| --- | --- |
| Firm default watchlist | Default table + universe priority after positions |
| Other shared lists | Picker chips (existing) |
| Personal lists | Picker chips grouped or prefixed “Desk”; include in exceptions union and earnings compact |
| Tracked sectors (`kind=sector`, not archived, has symbols) | Desk-rotation compact / heatmap toggle |
| Themes | Exceptions only if unusual or catalyst-dated; not a second heatmap |
| Screens | Do **not** auto-run `relative_volume` on Overview (duplicates movers/attention). Optional later: one chip if screen `unusual_activity` is non-empty |
| Last selected list/sector | Persist in URL (`listId`) and restore on Overview table; **do not** persist in DB unless you add a real prefs table (none exists today) |
| Positions | Universe + optional “in book” badge. Never P&L. |

**Assumption:** last-selected list in `sessionStorage` is enough if URL is the source of truth. Prefer URL.

### 4.5 Information hierarchy (anti-crowding)

Keep the shipped six-band Overview. Changes:

1. **AttentionStrip** — extend item kinds (`coverage`, `theme`) but keep **max 5**. Replace the generic “Vs SPY XLK” chip when a *desk* sector |vs SPY| is larger; do not grow to 7 chips.
2. **Pulse / chart / SPDR heatmap / factors / duration / movers** — unchanged roles. SPDR heatmap remains **market structure**. Label it “U.S. sector ETFs” if desk rotation is added.
3. **Calendars** — widen earnings compact symbol set; no layout change.
4. **Names row** — Watchlist table gains personal lists + “Open in Watchlists” link. Replace or *shorten* the table description. Do **not** add CoverageHeatmap here.
5. **Optional compact “Desk rotation”** — 6 cells *or* heatmap toggle, occupying the **existing** `SectorHeatmap` panel, not a new sidebar card.

If a change requires a new full-width band, it is out of scope.

---

## 5. Recommended dashboard modules and drill-down behavior

Implementation agent: prefer the smallest UI that consumes a new **coverage summary DTO** on `DashboardSnapshot`. Exact component names are suggestions.

### 5.1 Extend `AttentionStrip` (P0)

`buildAttentionItems` today: pulse driver, top material mover, top SPDR vs SPY, max watchlist RVOL, next USD high-impact. Max 5.

**Add candidates, still cap 5**, with a stable ranking:

1. Next USD high-impact (keep — time-critical).  
2. Top material mover (keep).  
3. **Coverage unusual** — highest |1d| or rvol among `unusual` across personal ∪ default shared (new).  
4. Pulse driver **or** desk-sector vs SPY, whichever |contribution / vsSpy| is larger.  
5. Watchlist RVOL if not already the unusual name.

Each coverage item: `ticker` → chart (primary click). Optional overflow control: “Open NVDA in coverage” is **not** required on the chip; put it on the exceptions module.

**Do not** add a chip that only says “3 unusual on Semiconductors” without a ticker unless the click goes to `?sectorId=`.

### 5.2 Watchlist module (P0/P1)

Keep `WatchlistTable` as the Overview names grid.

Changes:

- List source: shared **and** personal (label personal). Still exclude archived.
- Footer or panel action: `Link` to `/watchlists?listId={current}` — “Manage lists”.
- Row click: **chart** (existing). Optional shift/secondary: coverage (not required for v1).
- Re-fetch the selected `listId` on the 15s poll (`/api/market/watchlist?listId=` or fold into dashboard payload).
- Preserve `Abn RVOL`; align threshold with coverage (`>= 1.8`) **or** document the Overview ≥ 2.0 as “abnormal vs flag”. **Judgment:** use **1.8** everywhere.
- Optional: `inBook` badge if `loadOpenPositionTickers()` intersects the row.

Do not add column-set switching, grouping, or inspector.

### 5.3 Sector heatmap (P1)

Keep SPDR + SMH cells. Add a **segmented control** on the same panel:

- **Market ETFs** — current `buildSectorHeatmap(tape)`. Click → chart on XLK/etc.  
- **Desk sectors** — top cells from `sectorBoard` filtered `kind === "sector"` (and maybe `official_sectors` nav group), sorted by `|vsSpy1dPercent|`. Click → `/watchlists?sectorId={id}` **and** set chart to `benchmarkSymbol` or the top leader. Empty: “No tracked sectors — manage in Watchlists.”

**Do not** replace Market ETFs; traders use XLK/XLF as index proxies even when the firm tracks custom baskets.

Themes: not in this grid. They appear in exceptions if unusual.

### 5.4 Coverage exceptions module (P1) — only if attention is insufficient

If attention + watchlist table already surface unusual names, **skip this panel**. If not, a 3-row list in the **names row** (above or inside the watchlist panel header): winners/losers/unusual from the active collection only (reuse `moversFrom` / coverage `unusual`). Click ticker → chart; collection name → deep link.

**Do not** copy `CoverageSummary` stats (advancers, cap-weight, 1m/YTD) onto Overview.

### 5.5 Headlines (P1)

Keep clustered feed. Sort key: headlines whose `tickers` intersect coverage union first, then recency. Visual: small “On watchlist” / “On {list name}” badge. Do not filter out untagged macro news.

### 5.6 Earnings (P0, small)

Pass **union** of personal + all shared (or at least default + selected + personal) into `watchlistSymbols`, not only the selected list. Compact copy should stay honest.

### 5.7 Pulse, factors, duration, FedWatch, catalysts, movers, chart

No coverage-driven changes in v1 except:

- Material movers: optional badge if ticker ∈ coverage union (**P2**).
- Chart: already receives coverage tickers if they are on the tape. Universe fix makes this real.

### 5.8 Deep-link contract (P0)

Implement on **both** pages. Suggested query params (agent may bikeshed names, not semantics):

| Param | Page | Meaning |
| --- | --- | --- |
| `symbol` | Overview (exists) | Chart focus |
| `listId` | Overview + Watchlists | Active watchlist |
| `sectorId` | Overview (heatmap mode) + Watchlists | Active sector/theme |
| `ticker` | Watchlists | Select inspector row |

Rules:

- `sectorId` wins over `listId` if both set (match `GET /api/watchlists`).
- Watchlists page must read `searchParams` in the RSC and pass `selection` into `buildCoverageSnapshot`, and the client must `replaceState` on selection change (mirror Overview `symbol`).
- Overview `listId` selects the table; it does not change Pulse.

**Verified gap:** `/watchlists` page currently has **no** `searchParams` prop.

### 5.9 Explicit non-goals for dashboard modules

- GICS industry map.
- Correlation matrix / pair heatmap.
- Price alerts / notification engine (coverage “flags” are not alerts).
- Proposal submit from Overview.
- Positions P&L, cash, buying power.
- Editing lists from Overview.
- Running all `screens.ts` keys as Overview widgets.

---

## 6. Shared architecture and data-layer improvements

### 6.1 Universe seeding (P0 — highest backend leverage)

**Today:** `defaultWatchlistSymbols()` flattens fixtures.

**Target:** `runMarketDataRefresh` should load, in order, until `maxSize`:

1. Existing index / cross-asset / sector ETF / AI seeds (unchanged).  
2. Open positions (unchanged).  
3. **Live coverage symbols** from `listStoredWatchlists` + `listStoredSectors` for the **firm** (refresh is process-global, not per-user — **important**).

Because the cache is **firm/process global**, do **not** inject only the requesting user’s personal list into the shared tape. **Verified:** `getMarketDataCache` is process-local and serves all sessions.

**Judgment — firm-wide coverage universe:**

- Include all **shared, non-archived** watchlist symbols.  
- Include **non-archived sector/theme** constituents (round-robin like `quoteUniverse` so one fat theme cannot starve others).  
- **Exclude** personal lists from the shared refresh (privacy + cap). Personal names still get Yahoo on `/watchlists` and on Overview table via enrichment.  
- Cap still `MARKET_DATA_MAX_UNIVERSE_SIZE` (80). If overflow, prefer: default watchlist → `purpose=tape` → `kind=sector` → themes → other shared. Log dropped symbols in refresh notes.

**Assumption:** a single-firm product (`Research Desk`) makes firm-wide tape correct. If multi-firm ever shares one Node process, the cache must become firm-keyed — **out of scope**, but do not pretend personal lists can safely enter a global cache.

Cron `/api/cron/tick` already calls refresh; it should use the same live symbol loader.

### 6.2 Dashboard payload: add a coverage summary, don’t embed `CoverageSnapshot`

Avoid sending 400 `CoverageQuote`s on every 15s Overview poll.

Suggested additive fields on `DashboardSnapshot` (agent may nest under `coverage:`):

```ts
// Sketch — not an existing type
type DashboardCoverageDigest = {
  lists: Array<{
    id: string;
    name: string;
    visibility: "shared" | "personal";
    isDefault: boolean;
    symbolCount: number;
  }>;
  selectedListId: string | null;
  // existing watchlist snapshot can remain the selected list rows
  exceptions: Array<{
    ticker: string;
    listId?: string;
    sectorId?: string;
    flags: string[];
    change1dPercent: number | null;
    relativeVolume: number | null;
  }>; // max ~8
  deskSectors: Array<{
    id: string;
    name: string;
    vsSpy1dPercent: number | null;
    breadth: number | null;
    unusualCount: number;
    leaders: string[];
    benchmarkSymbol: string | null;
  }>; // max ~8, kind=sector
  coverageSymbolSet: string[]; // union for earnings/news — keep modest
};
```

Build this with a **new** `buildDashboardCoverageDigest(user, tape)` in `src/lib/watchlists/` that reuses `summarizeQuotes` / `buildSectorBoard` / `moversFrom` / `flagsFor` on a **capped** symbol set (selected list + personal lists + sector board aggregates already computed for those symbols). Prefer tape prints; Yahoo only if already cached.

`GET /api/market/watchlist` should accept personal `listId` the user owns (today shared-only filter would 404/fallback).

### 6.3 Quote enrichment consolidation (P1/P2)

One cache module for Yahoo quote + spark/week closes. Today: `watchlist-service.ts` vs `quotes.ts` vs earnings yahoo helpers. **Judgment:** make `loadCoverageQuotes` the single assembler; have `getWatchlistSnapshot` call it and map down to `DashboardWatchlistRow` (drop RS/flags). Align TTLs (60s quotes is fine if universe is tape-backed).

Do not give Overview a second 400-name Yahoo burst.

### 6.4 Deep-link + selection state

- RSC watchlists page: `searchParams: Promise<{ listId?: string; sectorId?: string; ticker?: string }>`.
- Client: on `setSelection`, `history.replaceState` (same as chart symbol).
- Overview: `listId` query alongside `symbol`. `selectWatchlist` should write `listId` to the URL.

No new DB prefs table required.

### 6.5 Reports (P1/P2)

Replace hardcoded `watchlistTickers` with the firm **default shared watchlist** symbols (fallback to current hex if none). Keep report snapshots **immutable** (design system / UI audit): resolve lists at collect time, persist tickers on the report, do not live-bind archived reports to later list edits.

Trade-ideas ranking may keep `TICKER_META` for sector taxonomy; add an `isWatchlist` flag from the resolved default list (pipeline already has this flag).

### 6.6 Proposals (P2, optional)

Out of the critical path. When persistence exists, `watchlist_add` / `sector_change` should call the same store functions as the coverage APIs. Do not block Overview integration on this. `configureThresholds` / `approveProposals` remain admin-only and unused in UI.

### 6.7 Poll coordinator (P2, from prior Overview prompt)

One Overview timer: snapshot 15s RTH / 30s extended / 60s closed (already on server `liveRefreshDueSeconds`). FedWatch 60s collapsed. Chart bars only while 1D/5D open. Coverage page can keep 15s **or** rely on tape cache + slower Yahoo. Surface poll failure on `SessionControlStrip`.

### 6.8 Permissions / RLS notes for implementers

- Read Overview digest: `viewDashboard` is enough.  
- Do not expose other users’ personal list **names/symbols** in the digest — `listStoredWatchlists` already scopes personal rows (**Verified** store + RLS).  
- `POST /api/watchlists/move` requires `editWatchlists` even when the target is a sector — **permission asymmetry** vs `editSectors`. Fix if you touch move; otherwise leave a comment.  
- Dashboard page should use `requirePermission("viewDashboard")` like watchlists, for consistency.

### 6.9 Caching / deploy **Assumption**

In-memory cache is documented. Do not introduce Redis for this integration. Do not put `CoverageSnapshot` in the market-data cache (user-specific). Digest is per-request, cheap if it uses tape + stored memberships.

### 6.10 Next.js notes

App Router, client islands (`LiveMarketOverview`, `WatchlistsWorkspace`). Keep digest assembly on the server (route handler). `searchParams` is a Promise (Next 16). Do not add `runtime = 'edge'`. Avoid a new self-`fetch` from the watchlists page to `/api/watchlists` on SSR — it already calls `buildCoverageSnapshot` directly (**good**). Overview page still self-fetches `/api/dashboard` — optional cleanup: extract `loadDashboardSnapshot(user)` and call it from both the page and the route.

---

## 7. Relevant files, components, routes, and dependencies

### 7.1 Overview

| Path | Why it matters |
| --- | --- |
| `src/app/(app)/dashboard/page.tsx` | RSC load, `?symbol`/`?generate`/`?state`, unavailable panel, no permission helper |
| `src/app/api/dashboard/route.ts` | Snapshot assembler; shared-list filter; research; latest report |
| `src/components/dashboard/LiveMarketOverview.tsx` | Poll, listOverride, layout, client analytics |
| `src/components/dashboard/DashboardMarketBoard.tsx` | Pulse + chart + sidebar |
| `src/components/dashboard/WatchlistTable.tsx` | Shared-list grid; rvol sort; Abn RVOL ≥ 2 |
| `src/components/dashboard/SectorHeatmap.tsx` | SPDR ETF cells |
| `src/components/dashboard/AttentionStrip.tsx` / `overview-attention.ts` | Max 5 chips |
| `src/components/dashboard/EarningsCalendar.tsx` | Compact ∩ watchlistSymbols |
| `src/components/dashboard/HeadlineFeed.tsx` | Clustered news; ticker → chart |
| `src/components/dashboard/MaterialMoversPanel.tsx` | Materiality + catalyst join |
| `src/components/dashboard/MarketPulse.tsx` + `market-pulse/*` | Regime instrument |
| `src/components/dashboard/MarketChart.tsx` + `chart/*` | Primary chart |
| `src/components/dashboard/OverviewStatusChrome.tsx` | Sticky trust |
| `src/components/dashboard/FedWatchPanel.tsx` | Independent poll |
| `src/lib/fixtures/dashboard.ts` | `DashboardSnapshot` type lives here |
| `src/lib/dashboard/research-context.ts` | News + FF calendar, 5 min TTL |
| `src/lib/market-data/watchlist-service.ts` | Dashboard list snapshot + Yahoo 15m |
| `src/lib/market-data/watchlist-types.ts` | Thin row DTO |
| `src/lib/market-data/watchlist-assemble.ts` | Shared row math |
| `src/app/api/market/watchlist/route.ts` | List switch |

### 7.2 Coverage

| Path | Why it matters |
| --- | --- |
| `src/app/(app)/watchlists/page.tsx` | No URL selection |
| `src/components/watchlists/WatchlistsWorkspace.tsx` | Client shell, 15s poll, CRUD |
| `src/components/watchlists/CoverageSidebar.tsx` | List/sector nav, personal filter |
| `src/components/watchlists/CoverageSummary.tsx` | Breadth / unusual |
| `src/components/watchlists/CoverageTable.tsx` | Full grid |
| `src/components/watchlists/CoverageHeatmap.tsx` | Constituent + `SectorHeatmapBoard` |
| `src/components/watchlists/SectorBoard.tsx` | Rotation table |
| `src/components/watchlists/TickerInspector.tsx` | Name-level research |
| `src/lib/watchlists/service.ts` | `buildCoverageSnapshot`, `quoteUniverse`, `COVERAGE_QUOTE_CAP` |
| `src/lib/watchlists/store.ts` | Persistence, RLS-facing CRUD, `listStoredWatchlists` |
| `src/lib/watchlists/analytics.ts` | `flagsFor`, `buildSectorBoard`, `summarizeQuotes` |
| `src/lib/watchlists/quotes.ts` | Tape + Yahoo 60s |
| `src/lib/watchlists/types.ts` | Canonical coverage model |
| `src/lib/watchlists/taxonomy.ts` | Kinds, nav groups, purposes, screens |
| `src/lib/watchlists/screens.ts` | Computed collections |
| `src/lib/watchlists/assemble.ts` | `resolveSelection` |
| `src/lib/fixtures/watchlists.ts` | Demo lists/sectors |
| `src/app/api/watchlists/route.ts` | GET snapshot / POST create |
| `src/app/api/watchlists/[id]/*` | Patch, delete, duplicate, convert |
| `src/app/api/watchlists/move/route.ts` | Move/copy; editWatchlists only |
| `src/app/api/sectors/*` | Sector CRUD / convert / reorder |

### 7.3 Shared market / reports / positions / auth

| Path | Why it matters |
| --- | --- |
| `src/lib/market-data/universe.ts` | `SECTOR_ETFS`, `buildUniverse` |
| `src/lib/market-data/refresh-service.ts` | `defaultWatchlistSymbols()` fixture bug |
| `src/lib/market-data/cache.ts` | In-memory tape |
| `src/lib/market-data/overview-analytics.ts` | Heatmap/factors/divergence shared with reports |
| `src/lib/market-data/overview-movers.ts` | ETF exclusion set + headline join |
| `src/lib/market-data/market-pulse.ts` | `PULSE_INPUT_SYMBOLS` |
| `src/lib/reports/pipeline.ts` | Hardcoded `watchlistTickers` |
| `src/lib/reports/universe.ts` | `TICKER_META` (parallel sector names) |
| `src/lib/positions/store.ts` | `loadOpenPositionTickers` |
| `src/lib/domain/permissions.ts` | Role matrix |
| `src/lib/auth/authorize.ts` | `requirePermission` |
| `src/components/layout/AppShell.tsx` | IA / command palette |
| `src/app/(app)/layout.tsx` | Session gate |
| `src/app/api/cron/tick/route.ts` | Refresh + instrument resolution |
| `src/app/api/proposals/route.ts` | Stub persistence |
| `supabase/migrations/20260814220000_coverage_workspace.sql` | visibility, personal, archive |
| `supabase/migrations/20260815000000_coverage_taxonomy.sql` | kinds, membership, screens |
| `supabase/migrations/20260815010000_coverage_restructure.sql` | collection restructure |
| `supabase/migrations/20260815020000_coverage_new_collections.sql` | seed collections |

### 7.4 Tests to extend

| Path | Today | Extend |
| --- | --- | --- |
| `src/lib/market-data/universe.test.ts` | Seed order / cap | Live watchlist injection (mock lists) |
| `src/lib/market-data/watchlist-service.test.ts` | Snapshot assembly | Personal list visibility; no fixture fallback when shared empty-but-connected |
| `src/lib/watchlists/service.test.ts` / `analytics.test.ts` | Snapshot / RS / flags | Digest helper |
| `src/lib/market-data/overview-attention` (no dedicated file?) | Via chrome tests | New coverage chip ranking |
| `src/app/api/fixture-safety.test.ts` | No live fixture swap | Keep |
| `e2e/workspace.spec.ts` | Chart ↔ watchlist symbol; create list/theme | Deep link `/watchlists?listId=`; Overview “Manage lists”; personal list chip in demo |
| `e2e/market-pulse-visual.spec.ts` | Pulse visuals | Don’t break |

### 7.5 Docs the implementer should read first

1. This file.  
2. `docs/ib-market-data-design-system.md` (density, provenance).  
3. `docs/market-overview-implementation-prompt.md` (non-goals, shipped IA).  
4. `docs/market-data-architecture.md` (cache-only dashboard, universe cap).  
5. `AGENTS.md` / Next in-repo docs before new routes.

---

## 8. Prioritized recommendations

**P0 — correctness and continuity (do these before new widgets)**

1. **Seed refresh universe from live shared lists + sector constituents**, not `fixtureWatchlists`. Same helper for cron and `runMarketDataRefresh`. Preserve cap and source priority.  
2. **URL deep links** on `/watchlists` (`listId` / `sectorId` / `ticker`) and Overview `listId`.  
3. **Overview list picker includes personal lists**; `/api/market/watchlist` and dashboard assembler use the same visibility rules. Stop fixture-list fallback when persistence is supabase but shared lists are empty (show empty state).  
4. **Keep selected list fresh** on the 15s poll.  
5. **Earnings compact** uses coverage union (personal + default + selected), not only selected shared list.  
6. **Attention:** one coverage-unusual candidate in the existing max-5 strip.

**P1 — command-center personalization without cloning the workspace**

7. `DashboardCoverageDigest` on the snapshot; heatmap **Market ETFs | Desk sectors** toggle; “Manage lists” link.  
8. Headline ranking/badge for coverage tickers.  
9. Align RVOL abnormal threshold; optional in-book badge.  
10. Reports `watchlistTickers` = default shared list at collect time.  
11. `requirePermission` on the dashboard page; extract shared loader to avoid SSR self-fetch (**optional** in P1 if timeboxed).

**P2 — architecture hygiene and prior Overview leftovers**

12. Unify Yahoo enrichment caches; `getWatchlistSnapshot` as a projection of coverage quotes.  
13. Poll coordinator + visible poll failure.  
14. Deduplicate `calculateMarketPulse` (pass result into `MarketPulse`).  
15. Pulse shadow / sidebar density polish.  
16. Move API `editSectors` when target is a sector.  
17. Proposals persistence → store mutations (only if that project is in flight).

**P3 — explicitly later / do not sneak in**

18. Correlation, alerting, GICS, personal sectors, Overview editing, Positions P&L, second chart library, Pulse input changes, screen widgets.

**Judgment calls left to the implementer**

- Desk sectors as heatmap toggle vs 6 cells inside the existing panel.  
- Whether exceptions need their own list or attention+table is enough (start without a new panel).  
- Whether default Overview list is firm default or last URL `listId`.  
- Exact overflow policy when shared constituents exceed 80 (log + deterministic priority).

---

## 9. Suggested implementation sequence

Work in vertical slices that stay demo-safe (`fixturesEnabled()`). Do not start a parallel dashboard.

**Slice A — Data plane (no visual redesign)**

1. Add `loadFirmCoverageSymbols()` (name flexible) using `listStoredWatchlists` / `listStoredSectors` without a user personal filter for **shared** memberships. In fixtures mode, keep flattening `fixtureWatchlists` **plus** `fixtureSectors` so demo universe stays rich.  
2. Wire `runMarketDataRefresh` + cron. Unit-test: fixtures vs injected lists, cap truncation order.  
3. Fixture-safety: live path still must not swap in `fixtureDashboard` on error.

**Slice B — Deep links (coverage page)**

4. Watchlists RSC reads `searchParams`, passes `selection` into `buildCoverageSnapshot`.  
5. Workspace writes URL on selection/ticker change.  
6. E2E: `goto('/watchlists?listId=wl-core')` selects Market Tape in demo.

**Slice C — Overview consumes lists honestly**

7. Shared+personal lists in dashboard API + market watchlist API.  
8. Poll selected `listId`. Empty persisted firm → empty table, not fixture names.  
9. Watchlist panel link to `/watchlists?listId=`.  
10. Earnings union. Attention coverage-unusual.

**Slice D — Desk rotation + digest**

11. Digest DTO. Heatmap toggle. Headline badges.  
12. Component tests for attention ranking and heatmap empty desk state.

**Slice E — Reports + polish**

13. Pipeline default list.  
14. Pulse single-calc, poll failure chrome, enrichment unify — as time allows.

**Do not** combine Slice D UI with a Pulse restyle in the same PR if it obscures review.

**Demo / fixtures**

- Keep mock labels. Personal fixture `wl-personal-desk` should appear on Overview picker in demo.  
- Creating a session list in demo still resets on reload — Overview should not imply otherwise.

---

## 10. Acceptance criteria and verification requirements

### 10.1 Product

- [ ] A sophisticated user can see **market regime** (unchanged Pulse) and **whether their coverage is doing something unusual** on Overview without opening Watchlists.  
- [ ] Clicking a coverage collection name/chip on Overview lands on Watchlists with that collection selected (URL round-trips, refresh-safe).  
- [ ] Clicking a ticker on Overview still opens the **chart** (existing e2e).  
- [ ] Personal lists appear on Overview for the owner and not for another user (**Assumption:** test with two fixture owners or unit-test the digest filter).  
- [ ] Shared list edits on Watchlists appear on Overview after the next poll (≤ 15s) without reload.  
- [ ] New **shared** symbols enter the refresh universe on the next refresh (or force refresh) and can print on tape/movers, subject to the 80 cap.  
- [ ] SPDR heatmap remains available and labeled as ETF tape, not GICS.  
- [ ] No create/edit/delete coverage controls on Overview.  
- [ ] No positions P&L on Overview.  
- [ ] Watchlists remains the place to edit taxonomy, inspector, rotation board, screens.  
- [ ] First viewport is not a new full-width coverage workspace; Pulse + chart still dominate.

### 10.2 Technical

- [ ] `defaultWatchlistSymbols()` / equivalent no longer solely fixtures in the supabase path.  
- [ ] `GET /api/watchlists?listId=` and `/watchlists?listId=` agree.  
- [ ] `GET /api/dashboard` payload remains cache-friendly (no full `CoverageSnapshot`).  
- [ ] Fixture-safety tests still pass (no silent live fixture swap).  
- [ ] `viewDashboard` still reads; mutations still `editWatchlists` / `editSectors`.  
- [ ] Personal list symbols are not required to enter the **global** market cache.  
- [ ] Reports generated after the change persist resolved tickers, not a live query at read time.

### 10.3 Quality / states

- [ ] Empty shared+personal: honest empty watchlist panel + link to Watchlists.  
- [ ] Persistence unavailable: existing coverage StatePanel; Overview table error string, not mock names presented as live.  
- [ ] List switch / poll failure: visible, not only console. (If deferred to P2, document leftover.)  
- [ ] Stale Yahoo: existing footer “Yahoo enrichment is stale.”  
- [ ] Demo: mock badges remain.

### 10.4 Tests the implementer should add or update

1. Unit: `buildUniverse` with injected shared symbols; cap drops themes before indices.  
2. Unit: dashboard list mapping includes personal for owner; excludes other owners.  
3. Unit: `buildAttentionItems` includes coverage unusual and still ≤ 5.  
4. Unit: earnings compact union (if extracted).  
5. Unit: report collect uses default list when store returns one.  
6. Component: WatchlistTable “Manage lists” href.  
7. E2E: demo create shared list on `/watchlists` → Overview picker shows it **or** document that demo session overlay is coverage-page-only (today session lists live in coverage client overlay — **Verified** `overlaySessionLists`). If Overview cannot see demo session creates without a reload/API, either lift overlay to a shared session store or accept “supabase-only” for that e2e. **Do not silently claim demo creates appear on Overview if they only exist in WatchlistsWorkspace state.**  
8. E2E: `/watchlists?sectorId=` opens the theme/sector.  
9. Visual: Pulse / heatmap still within existing e2e screenshots if those are asserted.

**Verified demo limitation:** `WatchlistsWorkspace` keeps created fixture lists in client `lists` state via `overlaySessionLists`. Overview `GET /api/dashboard` will **not** see those session lists. Implementation must either (a) only promise Overview sync for `persistence === "supabase"`, or (b) persist demo creates through the watchlists POST response in a shared way. **Judgment:** (a) is enough; copy on Overview in demo should not say “lists you just created appear here” unless (b) is done.

### 10.5 Manual verification

- Regular session, live keys: add a liquid name to the default shared list; confirm it appears in Overview table on poll; after refresh, confirm it can appear as a mover if it qualifies.  
- Add a name to a **personal** list; confirm Overview picker + table; confirm it does **not** require being in the global 80 if Yahoo enrichment still fills the table.  
- Track a custom sector; confirm Desk sectors cells vs SPY; click through to Watchlists.  
- Collapse viewport &lt; 1280px: chart closed, attention in `<details>`, no horizontal app overflow (`expectNoPageHorizontalOverflow` helper exists).  
- Disconnect network after first paint: last snapshot remains; no fixture labels if live.  
- Generate brief: watchlist section matches default list (after Slice E).

### 10.6 Out of scope / do not regress

- Pulse weights, regime thresholds, imputation rules.  
- Honest proxy labeling.  
- Material movers ≠ raw % sort.  
- `LatestReportLine` under movers.  
- Compact FedWatch/earnings expand-in-place.  
- Coverage CRUD, convert, screens, inspector.  
- Positions page (see `POSITIONS_PAGE_AUDIT.md` — still largely open; do not mix).

---

## Appendix A — Verified vs assumption checklist

| Claim | Status |
| --- | --- |
| Refresh watchlist symbols come from fixtures | **Verified** `refresh-service.ts` `defaultWatchlistSymbols` |
| Dashboard APIs filter `visibility === "shared"` | **Verified** dashboard + market watchlist routes |
| Empty shared lists → fixture fallback including personal | **Verified** `getWatchlistSnapshot` `sourceLists` |
| Coverage page has no URL searchParams | **Verified** `watchlists/page.tsx` |
| API supports listId/sectorId | **Verified** `api/watchlists/route.ts` |
| Overview has no link to `/watchlists` | **Verified** dashboard components (rail only) |
| Pulse computed twice on Overview | **Verified** LiveMarketOverview + MarketPulse |
| Selected list override not polled | **Verified** `listOverride` set once |
| Reports hardcode six tickers | **Verified** `pipeline.ts` |
| Proposals POST 503 when not fixtures | **Verified** `api/proposals/route.ts` |
| Positions tickers enter universe | **Verified** `loadOpenPositionTickers` |
| No correlation / alert engine | **Verified** (no matches in watchlists lib) |
| Process-local cache diverges across instances | **Assumption** (standard for in-memory; documented architecture) |
| Firm is single-tenant in production | **Assumption** (seed firm id; product is private desk) |
| Attention max 5 is still the right cap after coverage chips | **Judgment** |
| Desk sectors as toggle not new panel | **Judgment** |

## Appendix B — Suggested digest ranking (implementer may tune)

Coverage unusual eligibility (`flagsFor` already): `rvol` ≥ 1.8, `|1d|` ≥ 3%, `|vsGroup|` ≥ 2.5%, extended session ≥ 1.5%. Overview exceptions: sort by `rvol * abs(change1d)` descending, unique tickers, cap 5, exclude names already shown as the top material mover to reduce duplicate chips.

Desk sector cells: `kind === "sector" && !archivedAt && quotedCount > 0`, sort `|vsSpy1dPercent|` desc, cap 8, skip `kind === "screen"`.

---

**End of audit.** Implement against the current tree; re-verify any file listed in §7 before editing. Prefer a small digest and deep links over embedding `WatchlistsWorkspace` in Market Overview.
