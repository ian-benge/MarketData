# Market Overview × Watchlists — implementation prompt

Paste this document into a new agent chat (or open it in-repo and tell the agent to execute it). It is self-contained. The audit that produced these decisions is [`docs/dashboard-watchlists-integration-audit.md`](./dashboard-watchlists-integration-audit.md); treat that file as rationale, this file as the runbook.

Do not re-audit. Do not rebuild Market Overview or Watchlists & Sectors. Wire coverage *into* the shipped command-center hierarchy.

---

## Prompt

Implement the Market Overview ↔ Watchlists & Sectors integration in IB Market Data. **Do not clone `/watchlists` onto `/dashboard`.**

You are implementing an already-audited change. Verify every claim below against the current code before editing. If a spec item is already done, skip it and note that in the wrap-up.

Repo: this MarketData tree. Follow `AGENTS.md`, `docs/ib-market-data-design-system.md`, and existing primitives (`Panel`, `StatusIndicator`, `xl:grid-cols-12`, token colors). Research-only — no order entry.

Read first, in this order:

1. This file
2. `docs/dashboard-watchlists-integration-audit.md` — full file list, digest sketch, acceptance tests
3. `docs/ib-market-data-design-system.md`
4. `docs/market-data-architecture.md` (dashboard reads cache only; universe cap)
5. Current code listed under **Primary files**

Do not follow `docs/ui-ux-audit.md` as current (watchlist editing, chart, and Overview recomposition already shipped). Do not re-run `docs/market-overview-implementation-prompt.md` (P0/P1 shipped; leave Pulse weights, chart library, FedWatch/earnings compact IA alone). Do not mix in `POSITIONS_PAGE_AUDIT.md`.

### Goal

A trader on Market Overview can answer, without opening Watchlists:

- market regime (existing Pulse — **unchanged scoring**)
- whether **their coverage** is doing something unusual
- the next high-impact print
- which name to put on the **open chart**

One click on a collection name lands on Watchlists with that list/sector selected. Watchlists remains the research and management workspace (CRUD, taxonomy, rotation board, inspector). Overview remains the command center: ranked exceptions and a thin tape, not a second coverage editor.

### Current facts (re-verify, then treat as true)

- Overview: `src/app/(app)/dashboard/page.tsx` → `LiveMarketOverview`. Layout is already trust + attention, Pulse, 8/4 chart|sidebar, 6/3/3 calendars, 8/4 watchlist|news.
- Coverage: `src/app/(app)/watchlists/page.tsx` → `WatchlistsWorkspace` via `buildCoverageSnapshot`. Personal + shared lists, sectors/themes/screens, RS, flags, `sectorBoard`.
- `runMarketDataRefresh` → `defaultWatchlistSymbols()` flattens **`fixtureWatchlists`**, not `listStoredWatchlists`. Positions *are* loaded via `loadOpenPositionTickers()`. Cap: `MARKET_DATA_MAX_UNIVERSE_SIZE` default 80. Coverage quotes cap is 400.
- `GET /api/dashboard` and `GET /api/market/watchlist` keep **shared, non-archived** lists only. If that set is empty, `getWatchlistSnapshot` falls back to **all fixture lists including personal**.
- Overview `listOverride` is fetched once; the 15s `?live=1` poll refreshes the default snapshot only.
- `/watchlists` has **no** `searchParams`. `GET /api/watchlists` already accepts `listId` / `sectorId` / `includeArchived=1`.
- No Overview control links to `/watchlists` except the app rail. Ticker clicks set `?symbol=` and scroll the chart.
- Earnings compact uses **only the selected list’s** symbols ∪ mega-cap ∪ high expected move.
- Attention strip max 5: pulse driver, top mover, top SPDR vs SPY, max watchlist RVOL, next USD high-impact. No coverage-unusual chip.
- Reports `watchlistTickers` hardcoded `["SPY","QQQ","NVDA","AAPL","MSFT","TLT"]` in `src/lib/reports/pipeline.ts`.
- Demo session creates live in `WatchlistsWorkspace` via `overlaySessionLists`. Overview will **not** see them unless persistence is supabase. Do not claim otherwise.
- Market cache is **process-global**. Do **not** inject personal-list symbols into `buildUniverse`.
- `DashboardSnapshot` type lives in `src/lib/fixtures/dashboard.ts`.
- Dashboard page does not call `requirePermission("viewDashboard")`; watchlists page does.
- Abn RVOL on Overview is ≥ 2.0×; coverage `rvol` flag is ≥ 1.8×.

### Target information architecture (same bands, new signals)

Keep `xl:grid-cols-12`. Do **not** add a new full-width band or a sixth sidebar panel.

1. **Trust + attention** — still max **5** chips. Replace or rank in a **coverage unusual** candidate (personal ∪ default shared). Ticker click → chart. Do not grow to 7 chips.
2. **Pulse** — market-wide, frozen `PULSE_INPUT_SYMBOLS`. Desk rotation must **not** change the regime score. Do not restyle Pulse in this work.
3. **Workspace 8/4** — chart unchanged. Sidebar: SPDR heatmap **gains a mode toggle** (Market ETFs | Desk sectors) *or* desk cells replace nothing — Market ETFs stay available. Factors / duration / movers / divergence stay.
4. **Risk 6/3/3** — earnings compact symbol set = union of personal + default shared + selected list. FedWatch/catalyst unchanged.
5. **Names 8/4** — watchlist picker includes **personal** lists; “Manage lists” → `/watchlists?listId=`; poll the selected `listId`. Headlines: prefer coverage-tagged items (badge), do not hide macro news.

Ticker click on Overview → **chart** (existing). Collection name / “Manage lists” / desk-sector cell → **Watchlists deep link**.

### Work packages

| ID | Pri | Change | Why | Effort | Where |
| --- | --- | --- | --- | --- | --- |
| P0-1 | P0 | Seed refresh universe from live **shared** lists + sector/theme constituents | Tape never quotes names the desk actually tracks | S | `refresh-service.ts`, new helper, `universe.ts` tests, cron tick |
| P0-2 | P0 | URL deep links on `/watchlists` | API already supports selection; page does not | S | `watchlists/page.tsx`, `WatchlistsWorkspace.tsx` |
| P0-3 | P0 | Overview `listId` + personal lists in picker; poll selected list | Personal coverage is invisible; selected list goes stale | S | `api/dashboard`, `api/market/watchlist`, `LiveMarketOverview`, `WatchlistTable` |
| P0-4 | P0 | Stop fixture-list fallback when persistence is supabase and shared lists are empty | Empty firm looks like demo tape | XS | `watchlist-service.ts` / dashboard assembler |
| P0-5 | P0 | Earnings compact uses coverage **union** | Compact filter ignores personal + other shared lists | XS | `LiveMarketOverview`, `EarningsCalendar` |
| P0-6 | P0 | Attention: coverage-unusual candidate, still max 5 | Command center has no desk exception signal | S | `overview-attention.ts`, digest or watchlist rows |
| P1-1 | P1 | `DashboardCoverageDigest` on snapshot (not full `CoverageSnapshot`) | Need desk sectors + exceptions without 400-row payload | M | `src/lib/watchlists/*`, `fixtures/dashboard.ts`, `api/dashboard` |
| P1-2 | P1 | Heatmap toggle Market ETFs \| Desk sectors | SPDR map ≠ firm `sectors` table | S | `SectorHeatmap.tsx`, digest `deskSectors` |
| P1-3 | P1 | “Manage lists” link; headline coverage badge/sort | No drill-down; news ignores desk names | S | `WatchlistTable`, `HeadlineFeed` |
| P1-4 | P1 | Reports resolve default shared list at collect time | Brief watchlist section is a hardcoded hex | S | `pipeline.ts`; persist tickers on the report |
| P1-5 | P1 | Align RVOL threshold 1.8; optional in-book badge | Forked flags; positions already in universe | XS | `WatchlistTable`, `loadOpenPositionTickers` |
| P1-6 | P1 | `requirePermission` on dashboard page; optional extract shared loader | Page trusts layout login only; SSR self-fetch | XS | `dashboard/page.tsx`, `api/dashboard` |
| P2-1 | P2 | Unify Yahoo enrichment; `getWatchlistSnapshot` as projection of coverage quotes | Duplicate caches / fixture quote tables | M | `quotes.ts`, `watchlist-service.ts` |
| P2-2 | P2 | Poll coordinator + visible poll failure | Independent 15s pollers; failures swallowed | M | `LiveMarketOverview`, `SessionControlStrip` |
| P2-3 | P2 | Pass Pulse result in; drop duplicate `calculateMarketPulse` | Wasted client work | XS | `LiveMarketOverview`, `MarketPulse` |
| P2-4 | P2 | Move API: require `editSectors` when target is a sector | Permission asymmetry | XS | `api/watchlists/move/route.ts` |

Effort: XS = hours, S ≤ 1 day, M = 2–3 days.

Ship **P0 completely before P1**. P2 is optional in the same effort if P0+P1 are solid. Do not start P2 Pulse restyle or poll coordinator before P0.

### Build order (do this sequence)

**Slice A — data plane (no visual redesign)**

1. **P0-1** Add something like `loadFirmCoverageSymbols()`:
   - Supabase: all **shared, non-archived** watchlist symbols + **non-archived** sector/theme constituents, round-robin so one fat theme cannot starve others (same idea as `quoteUniverse` in `service.ts`).
   - **Exclude personal lists** from the global refresh (cache is process-wide).
   - Overflow vs cap 80: keep indices / cross-asset / `SECTOR_ETFS` / AI seed / positions first (`buildUniverse` order). Coverage fills the remaining slots in order: default watchlist → `purpose=tape` → `kind=sector` → themes → other shared. Log dropped symbols in refresh notes.
   - Fixtures mode: keep flattening `fixtureWatchlists` **plus** `fixtureSectors` so demo universe stays rich.
   - Wire `runMarketDataRefresh` and `/api/cron/tick`. Unit-test injection + cap.
2. Fixture-safety: live path still must not swap in `fixtureDashboard` on error.

**Slice B — deep links (coverage page)**

3. **P0-2** Watchlists RSC: `searchParams: Promise<{ listId?: string; sectorId?: string; ticker?: string }>`. Pass `selection` into `buildCoverageSnapshot` (`sectorId` wins if both set — match GET `/api/watchlists`).
4. Client: `history.replaceState` on selection/ticker change (mirror Overview `symbol`). Initial `ticker` selects inspector.
5. E2E: `goto('/watchlists?listId=wl-core')` selects Market Tape in demo.

**Slice C — Overview consumes lists honestly**

6. **P0-3 / P0-4** Dashboard + `/api/market/watchlist`: shared **and** owner personal lists; exclude archived. Empty persisted firm → empty table + honest copy, **not** fixture names. Personal `listId` the user owns must load.
7. Overview reads/writes `?listId=` next to `?symbol=`. Re-fetch selected list on the 15s poll (fold into dashboard payload or keep `/api/market/watchlist?listId=`).
8. `WatchlistTable`: personal chips labeled; panel action `Link` to `/watchlists?listId={current}` (“Manage lists”). Row click still opens the **chart**.
9. **P0-5** Pass union of personal + default shared + selected list into `EarningsCalendar` `watchlistSymbols`.
10. **P0-6** `buildAttentionItems`: add coverage-unusual candidate; keep max 5. Ranking suggestion (tune if needed): (1) next USD high-impact (2) top material mover (3) coverage unusual (4) pulse driver **or** desk-sector vs SPY, whichever is larger (5) watchlist RVOL if not already the unusual name. Unusual eligibility: reuse `flagsFor` (rvol ≥ 1.8, \|1d\| ≥ 3%, etc.). Prefer not duplicating the top mover ticker on two chips.

**Slice D — digest + desk rotation**

11. **P1-1** `buildDashboardCoverageDigest(user, tape)` in `src/lib/watchlists/`. Reuse `flagsFor` / `buildSectorBoard` / `moversFrom`. Prefer tape prints; Yahoo only if already cached. **Do not** attach a full `CoverageSnapshot` to the 15s poll.
    Suggested shape (agent may nest under `coverage:`; do not bikeshed away the fields):

    ```ts
    type DashboardCoverageDigest = {
      lists: Array<{
        id: string;
        name: string;
        visibility: "shared" | "personal";
        isDefault: boolean;
        symbolCount: number;
      }>;
      selectedListId: string | null;
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
      }>; // max ~8, kind=sector only
      coverageSymbolSet: string[];
    };
    ```

    Desk sector cells: `kind === "sector" && !archivedAt && quotedCount > 0`, sort `|vsSpy1dPercent|` desc. Skip screens.
12. **P1-2** Same `SectorHeatmap` panel: segmented control **Market ETFs** (current `buildSectorHeatmap`) | **Desk sectors**. Market ETFs click → chart on XLK/etc. Desk cell click → `/watchlists?sectorId=` **and** chart on `benchmarkSymbol` or top leader. Empty desk: “No tracked sectors — manage in Watchlists.” Label Market ETFs as ETF tape, not GICS.
13. **P1-3** `HeadlineFeed`: sort coverage-tagged headlines first; small “On watchlist” (or list name) badge. Do not filter out untagged news.
14. **P1-5** Abn RVOL ≥ **1.8**. Optional `inBook` badge if open position tickers intersect the row. **No P&L.**
15. Skip a separate “Coverage exceptions” panel if attention + table already surface unusual names.

**Slice E — reports + hygiene**

16. **P1-4** At report collect, resolve firm **default shared** watchlist symbols; fallback to the current six tickers if none. Persist that list on the report. Archived reports must not live-bind later list edits.
17. **P1-6** `requirePermission("viewDashboard")` on the dashboard page. Optional: extract `loadDashboardSnapshot(user)` and call it from page + route (watchlists already calls `buildCoverageSnapshot` directly — do not add a new SSR self-fetch).
18. P2 items only if A–E are green.

### Architecture rules

1. Overview = exceptions in. Watchlists = management out. No `CoverageTable`, create-coverage, inspector, or full `SectorBoard` on `/dashboard`.
2. Do not send `CoverageSnapshot` on `/api/dashboard`. Digest only.
3. Global refresh universe = **shared** coverage only. Personal lists enrich Overview/coverage tables via Yahoo/tape, not `MarketDataCache`.
4. Attention items stay capped at 5 and must cite a concrete print (ticker + % or event + countdown).
5. Pulse inputs, weights, imputation, and regime thresholds do not change.
6. Provenance stays per module. Do not mark news as SIP because the equity tape is SIP. Demo/fixture lists keep mock labeling.
7. `searchParams` is a Promise (Next 16). No `runtime = 'edge'`. No Redis for this work.
8. Schema: prefer no migration. If you truly need one, version it under `supabase/migrations/` and apply via Supabase MCP `apply_migration` against `grelplmmgywqoliqzrfi`. Never `db reset`. Never commit secrets.
9. Design system: dense not crowded; maroon for identity/selection; green/red only for market tone; refreshes preserve list selection, chart range, and sort.
10. Engineering judgment is allowed on toggle vs 6 desk cells, digest field names, and overflow logs — not on personal-in-global-cache, cloning the workspace, or Pulse rescoring.

### Explicit non-goals

| Do not | Why |
| --- | --- |
| Mount Watchlists UI on Overview | Crowds the command center; workspace already exists |
| GICS industry heatmap | No industry map in live data; keep SPDR ETFs |
| Personal lists in `buildUniverse` | Process-global cache; privacy + cap |
| Positions P&L / cash / BP on Overview | Separate route; badge only |
| Edit / create / delete lists from Overview | Coverage page is the editor |
| Correlation matrix, price alerts, notification engine | Flags ≠ alerts; not in codebase |
| Run `screens.ts` as Overview widgets | Duplicates movers/attention |
| Change Pulse scoring or add a second chart library | Already audited and shipped |
| Full FedWatch + full earnings expanded by default | Already collapsed |
| Proposal persistence / approve flow | Stub; do not block on it |
| Claim demo session creates appear on Overview | They live in coverage client overlay only unless you explicitly lift that (out of scope; document supabase-only sync) |

### Definition of done

- First viewport: existing Pulse + chart + attention that can include a **coverage unusual** name. No new full-width coverage workspace.
- Shared list edits on Watchlists appear on Overview within one 15s poll (supabase persistence).
- New **shared** symbols enter the refresh universe on the next refresh, subject to the 80 cap.
- Personal lists appear on Overview for the **owner** only.
- `/watchlists?listId=` / `?sectorId=` / `?ticker=` round-trip; Overview “Manage lists” and desk-sector cells use those URLs.
- Ticker click on Overview still opens the chart (`e2e/workspace.spec.ts` chart ↔ watchlist symbol).
- SPDR heatmap still available and not labeled GICS.
- Empty persisted coverage: honest empty watchlist panel + link, not fixture names presented as live.
- Reports generated after the change persist resolved default-list tickers.
- `fixture-safety` still asserts no silent live fixture swap.
- No create/edit coverage controls on Overview. No positions P&L on Overview.

### Tests

Add or extend:

- `universe.test.ts` / refresh tests: injected shared symbols; cap drops themes before indices.
- Watchlist mapping: personal for owner; exclude other owners; no fixture fallback when supabase + empty shared.
- `buildAttentionItems`: coverage unusual included; length ≤ 5.
- WatchlistTable “Manage lists” href.
- Report collect uses default list when store returns one.
- E2E: `/watchlists?listId=wl-core`; desk-sector or manage-lists navigation. Do **not** assert demo-created session lists on Overview.
- Keep `e2e/workspace.spec.ts` chart path and `fixture-safety.test.ts` green. Do not break `e2e/market-pulse-visual.spec.ts`.

Manual: add a liquid name to the default shared list → Overview table on poll → after refresh it can print as a mover if it qualifies. Personal-only name: Overview table via enrichment, not required in the global 80. Collapse &lt; 1280px: chart closed, no horizontal overflow.

### Primary files

- `src/lib/market-data/refresh-service.ts`
- `src/lib/market-data/universe.ts`
- `src/app/api/cron/tick/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/market/watchlist/route.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/watchlists/page.tsx`
- `src/components/dashboard/LiveMarketOverview.tsx`
- `src/components/dashboard/WatchlistTable.tsx`
- `src/components/dashboard/SectorHeatmap.tsx`
- `src/components/dashboard/HeadlineFeed.tsx`
- `src/components/dashboard/EarningsCalendar.tsx`
- `src/lib/market-data/overview-attention.ts`
- `src/lib/market-data/watchlist-service.ts`
- `src/lib/watchlists/service.ts`
- `src/lib/watchlists/store.ts`
- `src/lib/watchlists/analytics.ts`
- `src/components/watchlists/WatchlistsWorkspace.tsx`
- `src/lib/fixtures/dashboard.ts`
- `src/lib/reports/pipeline.ts`

Commit only if asked. If you timebox, land **P0-1 through P0-6** as the minimum useful PR.
