# Prompt: implement the Positions page audit

Copy everything below the line into a new agent chat.

---

You are implementing the Positions page audit in this repo. Do not re-audit and do not invent a parallel plan. Execute `POSITIONS_PAGE_AUDIT.md` in the stated order.

## Mission

Make `/positions` honest and useful for the **live book**, which is a **flat Schwab options daytrading blotter** (0 open lots, ~1,087 same-day option fills), not the demo equity sleeve (AAPL/GLD/NVDA).

The page already has good lot math, fees, books, SnapTrade import, hide-values, and teammate lock. It fails because it assumes an **open equity book with daily bars**. Do not polish the empty open blotter. Change the product around a book that is often flat, options-heavy, and fee-sensitive.

## Source of truth

Read first, in this order:

1. `POSITIONS_PAGE_AUDIT.md` — full spec, file paths, acceptance criteria, what to preserve
2. `docs/ib-market-data-design-system.md` — density, tokens, stale/mock/`—` rules
3. `AGENTS.md` / Next.js 16 notes under `node_modules/next/dist/docs/` before writing App Router code
4. Existing Positions code: `src/app/(app)/positions/page.tsx`, `src/components/positions/*`, `src/lib/positions/*`, `src/app/api/positions/*`, `src/lib/brokerage/*`

Do not rename persisted fields, API routes, or permissions. Do not apply `supabase db reset`. If you need schema, write a versioned migration under `supabase/migrations/` and apply via Supabase MCP `apply_migration` against project `grelplmmgywqoliqzrfi`. Prefer no migration unless Phase 0/1 truly requires it.

## Hard constraints

- Do **not** invent TWR, broker buying power, option greeks, or fake IEX marks for expired OCC symbols.
- Do **not** coerce missing marks to `0`. Keep `—`.
- Preserve: fee-aware realized P&L, hide-values, locked teammate tape (open day/open P&L visible; closed lots and NAV hidden), SnapTrade lots read-only, owner + named books.
- Design system: IBM Plex Mono for numbers, maroon for identity/selection, green/red only for signed P&L, Chicago time with `CT`.
- Demo equity path in `e2e/positions-visual.spec.ts` must keep working. Add coverage for the flat-options case; do not replace the equity demo.

## Live facts the UI must stop getting wrong

On the Schwab · DAYTRADING book (hosted data as of the audit):

- 0 open, 1,087 closed option lots, all SnapTrade
- Coverage shown as `Real-time — IEX · 0/154 symbols marked` because closed OCC tickers are quoted
- `GET /api/positions?includeClosed=1` ~1.5–1.7s and ~1.69 MB every 15s
- Chart: “Not enough history” because series is built from equity daily bars of OCC roots
- NAV $1.28, Cash `—`, Intraday BP $5.12 labeled `4× account value`
- Lifetime net **−$4,594.48** after **$3,850.62** fees, buried below an empty open blotter
- Tickers like `MSFT260202C00430000` as unaggregated fills, 10 rows per page

## Implementation order

Ship in this order. Do not start Phase 2 visual work before Phase 0.

### Phase 0 — truth and performance (required)

Audit IDs: **R1 → R3 → R9 → R10 → R8 → R2**

If you can only land one PR, do **R1 + R3 + R5 (flat primary table only) + R9**.

1. **R1 — Stop marking closed lots.** Quote/bar-fetch open lots only. Coverage copy is `k/n open marked` or, if flat, `Flat · no live marks required`. Never `0/154` or Real-time IEX at 0 coverage.
2. **R3 — Cash and kill fictional BP.** `cash = accountValue - (longExposure ?? 0)` so cash = NAV when there are no longs. Remove Intraday/Overnight/Option BP from the UI until a real broker field exists. Label broker NAV vs cash-fallback honestly (`sync.ts` may write cash into `account_value`).
3. **R9 — Hydration and click intercept.** Last-sync / as-of must not hydrate-mismatch (`BrokerageConnect` + `PageHeader` actions). Command search in `AppShell` must not steal clicks on owner tabs after scroll. Hard reload `/positions` with no Next.js hydration overlay.
4. **R10 — Locked/empty copy.** 0 symbols requested ≠ `Unavailable`. Do not show a fake teammate open count. Unlock errors `role="alert"`. Do **not** replace password-unlock with a new protocol.
5. **R8 — Add position is not the primary action on a linked SnapTrade book.** Sync/Import/Manage first. Manual add only in overflow, with a warning. Prefer not inserting manual lots onto `source=snaptrade` books.
6. **R2 — Shrink polls.** List snapshot should not dump 1,087 enriched lots + 252d history every 15s. Poll open+quotes; load closed lots separately or on a much slower cadence. Brokerage `live=1` should not echo the full blotter payload every 15s.

### Phase 1 — P&L path and flat-book IA

Audit IDs: **R4 → R5 → R7**

- Build `buildPortfolioSeries` from **fill cashflows + marked open**, not OCC equity bars. Fees on close date.
- **One** window control (`1D 1W 1M 3M YTD Max`) driving hero P&L and the chart. Delete the duplicate chart-only range group.
- 1D on a flat book = Chicago today’s **realized**, not open-vs-prior-close. If none: `—` with `Flat · no closes today`.
- Max percent: net / NAV if NAV > 0; otherwise vs cost labeled as cost/premium, never implied TWR.
- If `openCount === 0` and `closedCount > 0`: no giant empty StatePanel. Hero = P&L row; primary table = recent closed (default page size 50). Compact the page header; hide Entries & exits by default for same-day round trips.
- One return % per row. Hit rate includes sample size and closed-lot expectancy, not open-only “None”.

### Phase 2 — options blotter

Audit ID: **R6**

- Parse OCC to `MSFT  2 Feb 26  430 C` (keep raw in `title` / inspector). Pure function + tests.
- Group same underlying+expiry+strike+side+day fills; do not delete fill rows in the DB.
- Closed inspector primary price is **Exit** (`closePrice`/`mark`), not Last from a missing quote.

### Phase 3 — desk interaction

Audit ID: **R11**

- Real tablist keyboard on owner/book tabs.
- Sortable Qty/Mark/Exit; row focus + Enter to inspect; Escape to collapse.
- Inspector pane at ≥1280px; expand-in-row below that.
- Hide-values must also mask inspector captions/notionals.

### Phase 4 — verify

- Unit tests: flat-book cash; no quote fetch for closed-only books; series last point ≈ net P&L; OCC parse.
- Playwright: keep equity demo; add a **flat options fixture** (0 open, N closed OCC, fees, parsed ticker, no `0/154`, no BP row, P&L visible without hunting).
- Manual: `/positions` desktop 1440 and mobile 375 against the live Schwab book. Network panel: expired OCC not quoted. Hide-values persist. 1D vs Max on a flat day.

## Out of scope unless the user asks

- Replacing teammate password-unlock with grant/approve
- Real SnapTrade buying power / greeks / TWR
- Quoting open OCC unless you have proven the router/license can do it
- Generic herfindahl/analytics cards
- Renaming `/positions` or DB columns

## Done looks like

On the live Schwab book, in five seconds, a trader can see: **flat**, **cash/NAV**, **lifetime net after fees**, **honest feed state**, and **recent closes** with readable option names. Polls are small. No hydration overlay. Demo equity blotter still works.
