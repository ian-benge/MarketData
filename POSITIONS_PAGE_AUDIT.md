# Positions page audit

**Audience:** a separate implementation agent. Do not treat this as a feature wishlist. Ship the ranked work below in order. Preserve what already works.

**Scope:** `/positions` only. You may change Positions-owned APIs, domain math, brokerage mapping, and shared primitives *when Positions is the consumer*. Do not rename persisted fields, routes, or permissions for visual convenience.

**Evidence date:** 14 Aug 2026. Live session as admin `ianbenge37@gmail.com` against hosted Supabase `grelplmmgywqoliqzrfi` and `npm run dev` at `http://localhost:3000/positions`. Viewport checks: 1613×907 desktop and 375×812 mobile. Code inspection of `src/app/(app)/positions`, `src/app/api/positions`, `src/lib/positions`, `src/components/positions`, brokerage sync, and `docs/ib-market-data-design-system.md`.

---

## 1. How to use this document

1. Read §2 (verdict) and §4 (future state) before touching UI.
2. Implement Phase 0 before any visual redesign. Several headline numbers on the live book are currently **wrong or mislabeled**.
3. Treat the live Schwab book as the design target, not the demo equity fixtures. Demo (`e2e/positions-visual.spec.ts`) is an equity long book with AAPL/GLD/NVDA. Production is a **same-day options daytrading blotter**.
4. Do not invent time-weighted return, broker buying power, or option greeks. The backend cannot support them yet.
5. Follow the IB design system: dense tables, IBM Plex Mono for numbers, maroon for identity/selection, green/red only for signed P&L, `—` never `0` for missing marks, Chicago time with `CT`.

---

## 2. Concise assessment

The Positions page is a capable **portfolio review stack** (snapshot → attribution → open blotter → closed lots → activity tape) built on honest lot math, named books, SnapTrade import, fee subtraction, and teammate privacy. Tokens, signed P&L, and empty-state copy are already closer to a desk tool than a retail dashboard.

It is **not yet a blotter**. On the only realistic book in this environment the page fails its job:

| What a trader needs in the first five seconds | What they get today |
| --- | --- |
| Am I flat, and what did the book make? | Empty open blotter, “Exposure unavailable until marks arrive,” winners/losers **None** |
| Lifetime and today P&L after commissions | Lifetime exists (`−$4,594.48` after `$3,850.62` fees) but is buried; persisted **1D** window shows `—` because there are no open lots |
| What did I trade? | 1,087 fill-level OCC strings (`MSFT260202C00430000`) paginated 10 per page (109 pages) |
| Is the feed trustworthy? | **Real-time — IEX · 0/154 symbols marked** for expired option contracts |
| Cash and buying power | Portfolio **$1.28**; Cash **—**; Intraday BP **$5.12** labeled `4× account value` |
| P&L path | Chart: **Not enough history to plot book P&L** despite 1,087 closed lots |

The product assumed an **open equity sleeve with daily bars**. The live user is an **options daytrader who is often flat**, with history stored as unaggregated fills. Until the page is rebuilt around that reality, polish will not make it more useful.

**What to preserve**

- Signed P&L with Unicode minus, tabular mono, `—` for missing marks (`math.ts` `enrichPosition`, `display.tsx`).
- Fee-aware realized P&L (`grossRealizedPnl - fees`). Fees are the dominant number on this book.
- Hide-values (`••••`) and locked teammate tape (open day/open P&L only; closed lots redacted).
- Brokerage honesty: read-only SnapTrade lots, “Imported history,” cannot delete a linked book.
- Owner + named-book model; view-only when looking at someone else.
- Differentiated empty copy (manual vs brokerage vs teammate).
- Design-system tokens and `Panel` / `StatePanel` / `StaleBanner` primitives.

---

## 3. Current architecture (implementation map)

```
SSR  GET /(app)/positions          requirePermission("viewDashboard")
       → buildPositionsSnapshot({ includeClosed: true })
Client PositionsWorkspace
       → poll 15s GET /api/positions?includeClosed=1&owner&book
       → BrokerageConnect poll 15s POST /api/brokerage/sync?live=1
       → mutations: POST /api/positions, PATCH /api/positions/[id],
                    POST .../close, PUT /api/positions/account,
                    books CRUD/reorder, POST /api/positions/unlock
Domain  store.ts → service.ts → market.ts (quotes + 252d bars)
       → assemble.ts → math.ts (enrich, summarize, series)
Privacy redactLockedOwnerSnapshot + client hide-values
```

| Layer | Files |
| --- | --- |
| Page | `src/app/(app)/positions/page.tsx` — no `loading.tsx` / `error.tsx` |
| Workspace | `src/components/positions/PositionsWorkspace.tsx` |
| Snapshot / metrics | `PositionsSummary.tsx`, `PortfolioPnlChart.tsx`, `PositionsPrivacy.tsx`, `privacy-context.tsx` |
| Blotter | `PositionsTable.tsx`, `PositionInspector.tsx`, `PositionPriceChart.tsx`, `PositionActivity.tsx`, `TablePager.tsx` |
| Chrome | `PositionsOwnerTabs.tsx`, `PositionsBookTabs.tsx`, `BrokerageConnect.tsx`, `OwnerUnlockPanel.tsx`, `PositionFormDialog.tsx` |
| Domain | `src/lib/positions/{service,assemble,math,market,store,privacy,value-privacy,pnl-range,close,owners,books,owner-unlock,alerts,schemas,types}.ts` |
| Brokerage | `src/lib/brokerage/{sync,normalize,history,client,store}.ts` |
| Design | `docs/ib-market-data-design-system.md`, `src/app/globals.css` |

Nav: `AppShell.tsx` Workbench → `/positions`. Permission is `viewDashboard` (members and admins). Both roles have `editPositions`.

---

## 4. Live book used as the design target

Hosted `positions` table (query 14 Aug 2026):

| Fact | Value |
| --- | --- |
| Open lots | **0** |
| Closed lots | **1,087**, all `source=snaptrade`, all `asset_type=option` |
| Shorts | 542 |
| Equities / ETFs | 0 |
| Unique OCC tickers requested for marks | **154** |
| Quotes covered | **0/154** |
| Account value on book `Schwab · DAYTRADING` | **$1.28** |
| Gross realized (price P&L) | **−$743.86** |
| Fees | **$3,850.62** |
| Net after fees | **−$4,594.48** |
| Closed cost basis shown | **$283.8K** (premium × multiplier × qty) |
| Realized return | **−1.62%** vs that premium cost, **not** vs $1.28 NAV |
| Hit rate | **53%** of lots (585 winners) |
| Avg hold | **0 calendar days** (every sampled lot enters and exits the same date) |
| Monthly mix | Jan 2026: 1,083 lots; Feb 2026: 4 lots |
| Second book | Teammate `test 57` / `Main`, empty, locked |
| Poll | `GET /api/positions` **~1.5–1.7s**, **~1.69 MB** every 15s |
| Brokerage poll | `POST /api/brokerage/sync?live=1` **~5.5–7s**, **~1.69 MB** |

Representative lots (unaggregated fills):

- `MSFT260202C00430000` short 1×100, entry 1.06, close 1.32 / 1.29 / 1.35 as **three rows**, fees `1.32333333` each, same-day.
- Inspector: **Daily series unavailable**, Last **—**, Entry 1.06, Qty 1×100, Cost $106, 0d held, badge “Imported history”.

This is not an edge case. It is the product.

---

## 5. What works (do not regress)

1. **Missing marks stay `—`.** `enrichPosition` does not coerce `last`/`dayPnl` to zero (`math.ts`, `math.test.ts`).
2. **Fees are first-class** on closed lots and book totals. On this book they dwarf gross P&L. Keep before/after fee columns.
3. **Hide values** and **owner lock** are real, not decorative. Locked teammate view correctly drops closed lots, account value, and brokerage chrome; open day/open P&L remain on the tape (`privacy.ts`, `OwnerUnlockPanel.tsx`).
4. **Brokerage lots are read-only.** Inspector shows “Imported history” / “Brokerage lot”; delete book is blocked until disconnect.
5. **Empty copy is task-aware** for open books (manual vs SnapTrade vs teammate).
6. **Shell quality:** skip link, `aria-current="page"`, IBM Plex, maroon selection, 44px mobile controls on tabs/toggles, no page-level overflow at 375px on the locked empty view (`scrollWidth === 375`).
7. **Chart a11y (when it has data):** keyboard SVG, polite live region, legend. Demo e2e covers this; live options book never reaches it.
8. **Partial close** math and copy exist for manual lots (`close.ts`, inspector form).

---

## 6. Evidence-backed problems

Severity: **P0** correctness/performance that makes the page lie or unusable; **P1** high-impact product gaps; **P2** craft.

### P0-1. Feed label is false for this book

**Observed:** `Real-time — IEX as of … · 0/154 symbols marked`.

**Why:** `service.ts` always loads market context for **every visible ticker**, and the UI always requests `includeClosed=true`. Closed OCC symbols are sent to the equity quote router (`market.ts` `loadPositionMarketContext`). Coverage 0, but `latencyCoverageLabel` still says Real-time IEX from the live batch metadata.

**Files:** `PositionsWorkspace.tsx` (poll + meta line ~961–969), `service.ts` ~188–193, `market.ts` ~208–303.

**Impact:** The design system forbids implying realtime when the book is unmarked. Traders will not trust any number next to that label.

### P0-2. Polling a 1.7 MB closed-option snapshot every 15 seconds

**Observed (Chrome resource timing):**

- `GET /api/positions?includeClosed=1&…` duration 1529–1696 ms, transfer **1,693,685 bytes**, repeating.
- `POST /api/brokerage/sync?live=1` duration 5553–6931 ms, transfer ~1.69 MB.

**Why:** SSR and client always send `includeClosed: true`. Enrichment attaches quotes, 252 daily bars, sparklines, and period metrics **per lot**. 1,087 lots × unique OCC roots × bar cache misses (concurrency 4) dominate TTFB. Brokerage live sync reruns on the same interval (`BrokerageConnect.tsx` `BROKERAGE_REFRESH_MS = 15_000`).

**Files:** `positions/page.tsx` ~14–16, `PositionsWorkspace.tsx` ~40, ~393–431, `BrokerageConnect.tsx` ~19, ~320, `market.ts` ~15–19, ~168–205, `assemble.ts` ~133–134 (`history: Object.fromEntries`).

**Impact:** The page feels stale while “refreshing”; laptop fans; quota burn against the market-data router for symbols that will never quote.

### P0-3. Portfolio P&L path cannot be drawn from fills

**Observed:** Chart overlay **“Not enough history to plot book P&L.”** Attribution winners/losers **None**. 1W/1M P&L **—**.

**Why:** `buildPortfolioSeries` unions **daily equity bars** by ticker (`math.ts` ~673–752). OCC roots have empty `closes`. No dates → empty `series` → chart empty state (`PortfolioPnlChart.tsx` ~149–161). Winners/losers/hit rate/avg hold in `PositionsAttribution` are computed from **open** lots only (`math.ts` `contributors` / `summarizePositions`). A flat book therefore looks like a new account even though Max P&L is `−$4,594.48`.

**Impact:** The most expensive panel on the page is dead for the real user.

### P0-4. Cash and buying power are misleading

**Observed:** Portfolio **$1.28**, Cash **—**, Option BP **—** with hint `1× cash · set account value`, Intraday BP **$5.12** (`4×`), Overnight **$2.56** (`2×`).

**Why:**

```432:446:src/lib/positions/math.ts
  const investedValue = longExposure;
  const cash =
    normalizedAccount != null && investedValue != null
      ? normalizedAccount - investedValue
      : null;
  const intradayBuyingPower =
    normalizedAccount != null ? normalizedAccount * 4 : null;
```

When there are no open longs, `investedValue` is `null`, so cash is `null` even though NAV is `$1.28`. Option BP is cash, so also `—`. Intraday/overnight BP are hardcoded Reg-T multiples, not Schwab BP (`types.ts` comments claim 4×/2×/1×). Sync may write SnapTrade **cash** into `account_value` when `totalValue` is missing (`sync.ts` ~409–414, `getSnapTradeAccountBalanceTotal`).

**Impact:** A daytrading options account that is flat should show **cash ≈ NAV**. Showing $5.12 of “intraday buying power” next to −$4.6k lifetime P&L is not institutional; it is incorrect.

### P0-5. Occupied screen is the empty open blotter

**Observed (desktop first viewport):** Book snapshot + empty exposure + empty chart + **“No open positions on the book. Sync again after positions appear at the broker.”** + **Add position**. The 1,087 closed lots and −$4,594.48 live **below the fold**.

**Observed (mobile 375px):** Header, brokerage actions, owner/book tabs, and **Add position** consume the first screen. Snapshot metrics start after scroll (~520px). Bottom nav is overlapped by the Next.js **1 Issue** overlay (hydration error).

**Why:** Workspace order is metrics → attribution → open blotter → past → activity (`PositionsWorkspace.tsx` ~1060–1226). Attribution is `lg:order-2` above the blotter on desktop. Empty open blotter uses a large `StatePanel`. Default closed page size is **10** (`pagination.ts`).

**Impact:** The page answers “do you have an open equity?” not “what happened in this book?”

### P0-6. OCC symbols and fill-level lots are unreadable

**Observed:** Ticker column `MSFT260202C00430000 Schwab · closed`. Three consecutive shorts of the same call at 1.32 / 1.29 / 1.35. Path column empty. Inspector Last **—** (uses `row.last` quote, not `closePrice`/`mark`).

**Why:** `sanitizeTicker` strips spaces from OCC (`normalize.ts` ~59–67) to fit `TICKER_PATTERN`. History import keeps **per-fill** lots (`history.ts`; workspace copy even says partials are not collapsed). Inspector always labels the first metric **Last** from `row.last` (`PositionInspector.tsx` ~154). Sparkline/path needs daily bars.

**Impact:** A desk blotter shows `MSFT  2 Feb 26  430 C` and one average/round-trip, not raw OSI concatenated with fill fragments.

### P0-7. Dual P&L windows disagree; 1D is the persisted default for a flat book

**Observed:** Book snapshot toggle `1D 1W 1M 3M 1Y Max` (localStorage `ib-positions-pnl-window`, default after hydrate can be `1d`). Chart toggle `1M 3M 6M YTD Max` (default `3M`). Session opened with **1D** pressed → snapshot P&L `—` (“Open lots vs prior close”) while lifetime fees still showed. Switching to **Max** revealed `−$743.86` / `−$4,594.48`.

**Why:** `value-privacy.ts` vs `pnl-range.ts` are separate session-count systems. `bookPnlForWindow("1d")` uses **open** `dayPnl`. `bookPnlForWindow("max")` dollars use `totalPnl` but percent uses `bookReturnPercent` (unrealized / **open** cost) — dollars and percent disagree (`value-privacy.ts` ~110–115, `math.ts` ~499–502). Windowed 1W/1M after-fees equals before-fees (fees not applied).

**Impact:** Two “Max” buttons. The stored 1D window hides the only meaningful P&L on a flat book.

### P0-8. Hydration error on every load

**Observed:** Next.js overlay `src/components/ui/PageHeader.tsx (25:11)` — typical mis-attribution. Root cause is client-only time in header **actions** (`formatMarketDateTime` in `BrokerageConnect`). Overlay “1 Issue” sits on the mobile bottom nav.

**Files:** `PageHeader.tsx` (actions slot), `BrokerageConnect.tsx` last-sync label, `format.ts` `formatMarketDateTime`.

### P1-1. “Add position” is the wrong primary action on a linked brokerage book

Empty SnapTrade open blotter still offers **Add position** (`PositionsWorkspace.tsx` ~1155–1164). Manual insert into a `source=snaptrade` book is allowed unless the same ticker+side is already open (`store.ts` ~632–649). That creates a mixed manual/synced book the sync loop does not own.

### P1-2. Closed history UX does not scale

1,087 rows × page size 10 = 109 pages. Activity is 2,174 events (entry+exit per lot) × 10 = 218 pages. Filter/side controls sit on the **empty** open blotter, not on past positions. No group-by underlying, expiry, or strategy. `byAssetType` / `bySide` / `herfindahl` are computed and never shown (`math.ts` vs `PositionsAttribution`).

### P1-3. Inspector is equity-shaped

Closed option inspector: Last —, Market value —, Weight —, 1D/1W/1M from missing bars, daily chart empty, notes “Imported from Schwab history”. No underlying, expiry, strike, call/put, IV, or even **Exit** as the primary price. Edit/close hidden (correct for SnapTrade) but the remaining grid still pretends the lot is a live equity.

### P1-4. Teammate unlock is password sharing

`OwnerUnlockPanel`: “Enter {name}'s sign-in password”. Cookie HMAC, 8h TTL, epoch reset only on Settings (`OwnerUnlockResetPanel`). Types comment overclaims that unlock hides “P&L”; open P&L stays visible (`types.ts` ~257–258 vs `privacy.ts` ~46–48). Teammate `openCount` on tabs is **0** for others after `positions_select_own` unless admin client path is used (`owners.ts` + RLS migration `20260814004052_positions_select_own.sql`). Empty locked book labels feed **Unavailable · 0/0 symbols marked**.

### P1-5. Trust chrome is thinner than Dashboard

Snapshot carries `marketSession`, `latencyClass`, `feedCoverage`, `licenseWarning` and the Positions UI ignores them. Dashboard uses `SessionControlStrip`. Positions uses a muted 11px line. Stale banner only if `snapshot.stale`.

### P1-6. Accessibility gaps on the blotter itself

- Owner/book `role="tablist"` without arrow keys / `aria-controls` (`PositionsOwnerTabs.tsx`, `PositionsBookTabs.tsx`).
- Sort buttons use `aria-pressed`; inactive columns have no sort icon. Qty/Entry/Last often not sortable.
- Row expand is `<tr onClick>` plus a ticker button; the row is not a keyboard widget.
- After scroll, the sticky command-search control (`AppShell.tsx` ~368, `hidden sm:flex`) **intercepted** a click on the teammate tab (browser: click intercepted by `Open command search`).
- Unlock error is not `role="alert"` (`OwnerUnlockPanel.tsx` ~54–56).
- `ToneIcon` is unused (`display.tsx`); color still carries most meaning, though signs exist in `SignedValue`.

### P1-7. Mobile information hierarchy

375px: no page overflow (good). Tables min-width ~544px / ~418px inside `overflow-x-auto` (acceptable if affordance is obvious; it is not). Metric **hints hide** below `sm` (`PositionsSummary.tsx` `Metric` `hidden sm:block`), so Cash `—` has no explanation. P&L window buttons wrap to two rows. Intraday BP stacks alone. First viewport is chrome, not P&L.

### P2. Smaller craft issues

- Past metrics: 7 cells in `lg:grid-cols-6` so **Avg hold** wraps (`PositionsSummary.tsx` ~526).
- Open table duplicates return % under Total P&L and as a Return column (`PositionsTable.tsx` ~405–436).
- Default add-form: equity, qty 100 (`PositionFormDialog.tsx` ~46–57) — wrong for this book.
- Book tabs ignore `connectionStatus` / `lastSyncAt`.
- No Positions `loading.tsx`; route uses global `LoadingScreen`. Book switch has no busy skeleton (tabs disable only when `bookBusy`).
- Poll failures are silent (`PositionsWorkspace.tsx` ~379–381, ~420–422).
- Demo e2e never exercises OCC, 1k closed lots, unlock, or brokerage sync.

---

## 7. Recommended future-state product

**One-line product:** a per-owner, per-book **desk blotter** that remains useful when the trader is **flat**, **options-heavy**, and **fee-sensitive**, with live marks only for names that can actually be marked.

### Information hierarchy (desktop ≥1024)

1. **Trust strip** (one row): session, as-of CT, coverage `k/n open marks` (never closed OCC), latency class, brokerage last sync, mock/stale/unavailable with design-system labels. Reuse `SessionControlStrip` semantics; do not invent SIP/OPRA.
2. **Book header:** owner tabs, book tabs, hide-values, sync. Drop the marketing description from the first viewport (`PageHeader` description can be a tooltip or omitted).
3. **P&L command row** (the hero):  
   - **Today** (realized today + open day P&L; if flat, realized today or `—` with “flat · no open lots”).  
   - **Windowed net P&L** (one window control for the whole page).  
   - **Fees in window / lifetime.**  
   - **Cash / NAV** (cash = NAV − long MV, and cash = NAV when no longs).  
   - **Open count / closed count.**  
   - Do **not** show 4×/2× BP. If a real SnapTrade buying-power field appears later, show it labeled with source. Until then omit.
4. **Primary blotter**  
   - If any open lots: dense open table (ticker identity, side, qty, mark, day, total, weight).  
   - If flat: **do not** show a giant empty StatePanel. Show a one-line status `Flat · 0 open` and make **Today / recent closed** the primary table.
5. **Inspector** as a right-hand pane on ≥1280px (keep row expand on laptop/mobile). Option identity parsed. Exit price for closed lots. No fake daily equity chart for expired OCC; show fill tape instead.
6. **Secondary:** grouped closed history (by underlying + expiry), then raw fills on demand. Activity tape is optional/advanced — it currently doubles the closed table for 0-day trades.
7. **Attribution / path:** one chart driven by **fill cashflows + marked open**, not equity bars of OCC roots. Winners/losers from the **selected window**, including closed.

### Mobile (<768)

First viewport: trust + P&L command row + primary table. Brokerage manage, owner tabs, and “Add position” go behind an overflow. Bottom nav stays; never let an error pill cover Market/Positions.

### Modes

| Book kind | Primary job |
| --- | --- |
| SnapTrade options / daytrading (live) | Flat-aware P&L, fill grouping, fees, parsed OCC, no fake IEX marks |
| Manual equity (demo + some owners) | Current open blotter + daily path — keep this working |
| Locked teammate | Tape of open lots + unlock; do not say “Unavailable” when there are simply no symbols |

---

## 8. Prioritized recommendations

Effort: **S** <1 day, **M** 2–4 days, **L** ≥1 week. Impact/urgency are for the live options book.

### R1. Stop marking closed lots; tell the truth about coverage — P0, S

**Rationale:** 0/154 IEX realtime is a lie and a quota sink.

**Behavior:**

- Quote and bar-fetch **open lots only**.
- Coverage copy: `12/12 open marked` or `Partial · 8/12 open`. If 0 open: `Flat · no live marks required`, never `0/154`.
- `latencyCoverageLabel` for a flat book must not read Real-time IEX unless at least one **open** quote succeeded.
- Closed-lot inspector must not request a daily equity series for expired OCC; show “No live series for a closed option fill.”

**Systems:** `service.ts`, `market.ts`, `PositionsWorkspace.tsx` meta line, `PositionInspector.tsx`.

**Dependencies:** none.

**Risks:** Charts that today piggyback closed-lot bars will go empty until R4. Accept that; they are already empty.

**AC:**

- Network: `/api/positions` does not call `fetchQuotes`/`fetchBars` for closed-only books.
- UI: no `0/154` on this Schwab book; no Real-time IEX when coverage is 0.
- Open equity demo still marks AAPL.

### R2. Shrink the snapshot payload and poll less — P0, M

**Rationale:** 1.69 MB / 1.6s every 15s plus 6s brokerage sync makes the page feel broken.

**Behavior:**

- Default GET: open lots + **summary of closed** (counts, realized, fees, hit rate). Closed rows via `?includeClosed=1` or a dedicated `GET /api/positions/closed?cursor`.
- Client poll 15s: **open + quotes only**. Closed table is not refreshed at quote cadence (refresh on focus, after sync, or 5–15 min).
- Brokerage `live=1` poll: holdings-only, not full snapshot echo; backoff when tab hidden (already) and when last sync < N seconds.
- Do not send `history` (252 bars × tickers) in the list snapshot; fetch bars in the inspector.

**Systems:** `route.ts` GET, `service.ts`, `assemble.ts`, `PositionsWorkspace.tsx`, `BrokerageConnect.tsx`, `store.ts` pagination.

**Dependencies:** R1.

**Risks:** UI currently assumes one snapshot contains everything. Split the type (`PositionsSnapshot` vs `ClosedLotsPage`) rather than overloading.

**AC:**

- Flat Schwab poll payload **< 50 KB** and TTFB **< 400 ms** locally with warm cache.
- Closed table still shows 1,087 lots without downloading them every 15s.
- Demo e2e still sees past positions after load.

### R3. Cash, NAV, and kill fictional buying power — P0, S

**Rationale:** Cash `—` next to $1.28 NAV is a bug. $5.12 “intraday BP” is a policy fiction.

**Behavior:**

- `cash = accountValue - (longExposure ?? 0)` when accountValue is set. If no longs, cash = accountValue.
- Remove Intraday/Overnight/Option BP from the snapshot UI until a broker-sourced field exists. Do not replace with another heuristic.
- Label NAV `Account (broker)` vs `Account (manual)`. If sync used cash fallback, label `Cash balance (broker)` not “Account value incl. cash”.
- Confirm SnapTrade `totalValue` vs cash with a log/metric; prefer brokerage equity, not cash-only, when both exist.

**Systems:** `math.ts`, `PositionsSummary.tsx`, `sync.ts` ~409–414, types comments.

**Dependencies:** none.

**Risks:** Manual books that never set account value still show cash `—` — keep that.

**AC:**

- This Schwab book: Cash **$1.28**, Option BP absent, no 4×/2× row.
- Tests: cash equals NAV when open longs empty; cash equals NAV − longs when longs exist; shorts do not inflate cash.
- `math.test.ts` covers the flat-book case (add it).

### R4. Build book P&L series from lots, not OCC equity bars — P0, L

**Rationale:** The chart is the right module and the wrong data.

**Behavior:**

- Daily (and, later, session) series = sum of **realized fill P&L by close date** + **marked open** (when quotes exist). Fees allocated to the close date of the lot (already stored per lot).
- One window control: `1D 1W 1M 3M YTD Max`. Drive **both** the command-row P&L and the chart. Delete the second `1M 3M 6M YTD Max` group or make it an alias of the same state.
- 1D on a flat book: **today’s realized** (lots with `closeDate === Chicago today`), not open-vs-prior-close. If none, `—` with hint `Flat · no closes today`.
- Max percent: net P&L / **account NAV** when NAV > 0; otherwise vs closed cost with the label `vs premium` / `vs cost`, never implied TWR.
- Attribution winners/losers/hit rate use the **same window** and include closed lots.

**Systems:** `math.ts` `buildPortfolioSeries`, `value-privacy.ts`, `pnl-range.ts`, `PortfolioPnlChart.tsx`, `PositionsSummary.tsx`, `PositionsAttribution`.

**Dependencies:** R1 (do not wait on bars). R2 helps but is not required for correctness.

**Risks:** Same-day options will produce a spiky daily series (correct). Do not smooth. Do not interpolate missing days as zero unless you label them `no session`.

**AC:**

- This book’s Max chart is a non-empty path whose last point ≈ `−$4,594.48` (± rounding).
- 1D while flat in a session with no closes today shows `—` or `$0` **with explicit copy**, not a fake IEX day P&L.
- Demo AAPL path still works (fills + marks).
- A single `aria-pressed` window group on the page.

### R5. Recompose the page for a flat book — P0, M

**Rationale:** Hierarchy is why the useful numbers are invisible.

**Behavior:**

- Compact `PageHeader`: title `Positions`, no paragraph on desktop. Actions: Hide values, Sync, overflow (Import / Manage / Add).
- Hero = P&L command row (R3–R4).
- If `openCount === 0` and `closedCount > 0`: primary table is **Today / recent closed** (default sort close date desc). One-line `Flat · Schwab · DAYTRADING`. Do not render the large empty StatePanel **and** a 14-column empty table.
- If `openCount > 0`: primary table is open lots; closed is a tab or lower panel.
- Attribution/chart collapsible, default **open on desktop / closed on mobile**.
- Entries & exits: do not show by default when every lot is a same-day round trip; offer “Fill tape” in inspector or an advanced toggle.
- Default closed page size **50** (keep 10/20/50/100). Persist in localStorage.

**Systems:** `PositionsWorkspace.tsx`, `PositionsSummary.tsx`, `PositionsTable.tsx`, `pagination.ts`, `PageHeader` usage.

**Dependencies:** R4 for the hero numbers to mean something; can ship layout first with existing Max totals.

**Risks:** Demo e2e looks for “No open positions” less often; update selectors. Keep empty StatePanel for **zero lots at all**.

**AC:**

- Desktop 1440: lifetime net P&L and the first closed rows visible without scrolling on this book.
- Mobile 375: P&L command row in the first viewport; brokerage manage not required to see P&L.
- Empty new manual book still shows Add / Connect.

### R6. Options identity and fill grouping — P0/P1, L

**Rationale:** OSI strings and split fills are why the table cannot be scanned.

**Behavior:**

- Parse OCC (`underlying`, `yyMMdd`, `C|P`, strike/1000) in a pure function with tests. Display `MSFT  2 Feb 26  430 C`. Keep raw ticker in `title` and inspector.
- Group consecutive fills of the same underlying+expiry+strike+side+day into a **round-trip / average row** with expandable fills. Do not destroy fill rows in the database.
- Path/sparkline: for grouped closed options, a 2-point entry→exit is enough; do not wait for daily bars.
- Inspector primary price for closed lots: **Exit**, not Last. Use `mark`/`closePrice`. Leave Last blank (`—`) if no quote.

**Systems:** new `src/lib/positions/option-symbol.ts`, `display.tsx`, `PositionsTable.tsx`, `PositionInspector.tsx`, history remains source of truth.

**Dependencies:** none for parse; grouping can follow.

**Risks:** Non-OCC tickers must pass through unchanged. Futures `/ES` mapping stays.

**AC:**

- `MSFT260202C00430000` renders as a parsed call in table and inspector.
- Three 1-lot MSFT shorts can be viewed as one grouped short with three fills.
- Screen reader name includes underlying and expiry.
- Unit tests for padded OCC (`AAPL  250117C00150000`) and already-stripped forms.

### R7. Unify metrics language and kill duplicate return columns — P1, S

**Rationale:** Scan speed.

**Behavior:**

- One return % per row (under P&L).
- Rename “Book return” / Max percent per R4.
- Show `byAssetType` as a single compact mix when >1 type; skip if 100% option.
- Hit rate caption: `53% of lots` plus avg winner/loser **including closed** so a 53% hit rate with −$4.6k is honest.
- Past metrics: 6 columns that fit; put avg hold in the inspector or a 7th that doesn’t wrap.

**Systems:** `PositionsTable.tsx`, `PositionsSummary.tsx`, `PositionsAttribution`.

**AC:** No duplicate Return column. Hit rate not shown without sample size. No orphan Avg hold row at lg.

### R8. Brokerage book actions and add-lot policy — P1, S

**Rationale:** Add position on an empty linked book invites desync.

**Behavior:**

- SnapTrade book primary actions: Sync, Import, Manage. **Add position** only in overflow with copy: “Manual lots on a linked book are not updated by the broker.”
- Empty linked + 0 closed: “Waiting for holdings.” Empty linked + N closed: R5 flat state, not Add CTA.
- Do not insert manual lots onto `source=snaptrade` books unless the user confirms; prefer creating/using a manual book.

**Systems:** `PositionsWorkspace.tsx`, `store.ts` insert guard, `BrokerageConnect.tsx`.

**AC:** Linked Schwab empty-open state has no primary Add button. Demo manual Main still does.

### R9. Trust strip and hydration-safe timestamps — P1, S

**Rationale:** Design system + the live overlay.

**Behavior:**

- Render as-of / last sync only after mount, or pass SSR ISO and format in a `suppressHydrationWarning` time element.
- Positions trust strip: session, as-of, coverage (R1), stale/mock/unavailable, license warning if present.
- Fix command-search intercept: the `sm:flex` search button must not remain a hit target over scrolled content (`AppShell.tsx`). `pointer-events` / stacking context / `sticky` z-index audit.

**Systems:** `BrokerageConnect.tsx`, `PositionsWorkspace.tsx`, `AppShell.tsx`, optionally `SessionControlStrip`.

**AC:** Hard reload `/positions` with brokerage linked: **no** hydration overlay. Teammate tab clickable after scrolling the blotter.

### R10. Locked teammate and empty-feed copy — P1, S

**Rationale:** “Unavailable · 0/0” on an empty locked Main book looks like an outage.

**Behavior:**

- If `quotesRequested === 0`: `No open lots to mark`, not Unavailable.
- Owner tab counts: do not show `0` for teammates unless the viewer can know that. Show lock icon without a fake open count, or fetch counts via a non-lot aggregate RPC.
- Unlock errors: `role="alert"`. Link to Settings reset copy from the panel (“Revoke from Settings”).
- Do not change the password-unlock protocol in this phase unless product decides otherwise (see Open questions). Copy can say the password is the teammate’s **IB Market Data** sign-in, not their Schwab password.

**Systems:** `PositionsWorkspace.tsx`, `OwnerUnlockPanel.tsx`, `owners.ts` / optional SQL.

**AC:** Locked empty teammate view never says Real-time or Unavailable. Unlock failure announced to AT.

### R11. Blotter interaction (keyboard, inspector pane, a11y tabs) — P1, M

**Rationale:** Institutional muscle memory.

**Behavior:**

- Real tablist keyboard on owner/book tabs.
- Open/closed table: `aria-sort`, sortable Qty/Mark/Exit, row focus + Enter to inspect.
- ≥1280px: inspector pane; <1280: current expand. Closed option inspector per R6.
- Hide-values also masks inspector chart captions and OCC notionals (today Last/entry still show in the price chart caption).

**Systems:** tabs, `PositionsTable.tsx`, `PositionInspector.tsx`, `PositionPriceChart.tsx`.

**AC:** Keyboard-only: switch book, sort day P&L, open inspector, Escape collapse. axe on `/positions` clean for tab/sort/dialog.

### R12. Later analytics (do not start here) — P2, L

Only after Phases 0–1:

- Group by underlying / expiry / strategy.
- Intraday marks **for open options** if the router can quote OCC (verify; do not assume IEX).
- Expectancy, profit factor, MAE/MFE — only from fills you already store.
- Real broker BP, margin, and cashflows/TWR if SnapTrade provides them.
- Column chooser persisted per book.

Do **not** build a generic “analytics dashboard” of unused `herfindahl` charts.

---

## 9. Phased implementation plan

### Phase 0 — Truth and performance (ship first)

R1, R2, R3, R8 (add-button), R9 (hydration + click intercept), R10 (Unavailable copy).

Exit: Schwab flat book polls are cheap; coverage copy is honest; cash = $1.28; no 4× BP; no hydration overlay; closed lots still reachable.

### Phase 1 — P&L path and flat-book IA

R4, R5, R7.

Exit: Max chart matches net P&L; one window control; first viewport shows net P&L + recent closes on desktop and mobile.

### Phase 2 — Options blotter

R6, R11 inspector bits for options.

Exit: Parsed OCC, grouped fills, closed inspector shows Exit not Last.

### Phase 3 — Desk interaction and privacy

R11 remainder, optional unlock-protocol change (only after product answer in §11).

### Phase 4 — Verification and demo alignment

Update Playwright: live-like fixture with OCC fills + flat book; keep equity demo. Screenshot 375 / 768 / 1024 / 1440. Keyboard and reduced-motion.

Do not start Phase 2 visual restyle before Phase 0. A prettier empty blotter is still wrong.

---

## 10. Verification strategy

### Automated

- Extend `math.test.ts`: flat book cash = NAV; series from closed fills; 1D realized-today; no quote coercion.
- New `option-symbol.test.ts` for OCC parse/format.
- `value-privacy.test.ts`: one window model; Max % definition documented in the assertion names.
- `assemble` / service tests: closed-only books do not enqueue quote fetches (mock router).
- Playwright:
  - Keep equity demo path.
  - Add **flat options fixture**: 0 open, N closed OCC, fees, empty chart no longer shown, parsed ticker, no `0/154`, no BP row.
  - Unlock view: no “Unavailable” when 0 symbols.
  - Mobile 375: no page overflow; P&L in first viewport.
- `npm run typecheck` / lint / test / e2e as today.

### Manual (required; this page has lied with green unit tests before)

1. Live Schwab book, desktop 1440 and mobile 375.
2. Flat vs after a sync that opens a lot (if the user trades).
3. Hide values on/off; reload (localStorage).
4. Window 1D vs Max on a weekend/flat day.
5. Teammate lock/unlock (do not log passwords into tickets).
6. Network panel: poll size and that expired OCC are not quoted.
7. Hard reload: no hydration overlay; command search does not steal tab clicks after scroll.
8. Compare NAV/cash to Schwab once (see §11).

### Explicit non-goals for verification

- Do not require TWR to match Schwab performance reports.
- Do not require IEX to quote expired options.
- Do not require buying power to match Schwab.

---

## 11. Open questions (code cannot answer)

1. **Is $1.28 the true Schwab equity or a cash-only fallback?** Sync writes `totalValue` or cash (`sync.ts` ~409–414). An owner should glance at Schwab once. If equity is actually thousands, treat NAV mapping as a P0 data bug inside R3, not a display tweak.
2. **Should teammate unlock stay “type their IB Market Data password”?** It works and is already built (HMAC cookie + epochs). A grant/approve model is safer but is a product/security project, not a UI tweak. Do not silently replace it in Phase 0.
3. **Is grouping fills the desired default, or must every brokerage fill remain a top-level row?** The current copy celebrates uncollapsed partials. Recommend grouped default + “Show fills” because 1,087 rows are unusable; confirm if tax/lot identity matters to the owner.
4. **Will this desk remain options-daytrading-first?** If a second user is equity-swing, keep the open-lot blotter as the default when `openCount > 0` (already specified). Do not build two apps.
5. **Are SnapTrade option quotes available under the current license?** If yes, open-option marks become Phase 3. If no, never label option Last as IEX.

Everything else in this audit is decided: kill heuristic BP, do not quote closed OCC, series from fills, flat-book IA, parsed OSI, one P&L window, honest coverage, smaller polls.

---

## 12. Suggested implementation order for the next agent

```
Phase 0: R1 → R3 → R9 → R10 → R8 → R2
Phase 1: R4 → R5 → R7
Phase 2: R6 → inspector Exit/Last
Phase 3: R11
Phase 4: tests + e2e + screenshots
```

If time-boxed to one PR: **R1 + R3 + R5 (flat primary table) + R9**. That single PR would make the live book honest and scannable without waiting on series math.
