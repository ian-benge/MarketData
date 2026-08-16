# Market Dashboard Command Center — Tester & Improver Handoff

**Audience:** a new agent that will independently test, challenge, and improve Market Overview until it is a faster, more trustworthy institutional command center.

**Date of this report:** 2026-08-16 (Sunday; US cash equity session **closed** for live clocks)

**Product:** IB Market Data — private research workspace. Display name is IB Market Data. Do not imply Interactive Brokers, IBKR adapters, SIP internals, VIX futures, or a cash Treasury curve.

**Hosted Supabase:** `grelplmmgywqoliqzrfi` (`grelplmmgywqoliqzrfi.supabase.co`)

**App:** Next.js 16.3 App Router, React 19, Tailwind 4, custom IB design system (`docs/ib-market-data-design-system.md`). Not shadcn.

This report describes the **code that actually shipped in this pass**, plus tests that were actually run. Planned, fixture-only, and unverified live behavior is labeled as such.

**Do not protect the current layout.** Hierarchy, poll cadence, and which widgets belong on Overview vs destination pages are product decisions that should be rewritten if a trader would decide faster with a different composition.

---

## 0. How to use this document

1. Read **§1** for what was wrong with the previous Overview.
2. Read **§2–§4** for what the page now does and where numbers come from.
3. Read **§8** before trusting any “it works” claim.
4. Execute **§9** before changing pulse math, book P&L, or mover materiality.
5. Use **§10** as the default backlog. Reorder only with new evidence.

### Honesty rules

- All prices, returns, breadth, P&L, Fed probabilities, and earnings implied moves must come from deterministic sources. LLMs may narrate only from an evidence pack.
- Cross-asset tape uses **ETF proxies**: SPY/QQQ/IWM/DIA, TLT, VIXY, UUP, USO/GLD, HYG/LQD, IBIT. Label them as proxies.
- `fixturesEnabled()` currently equals `isDemoAuthEnabled()` (`src/lib/api/http.ts`). Demo cookie auth is **off** when `NEXT_PUBLIC_SUPABASE_URL` and anon key are set, even if `DEMO_MODE=true`.
- Playwright e2e blanks those keys and sets `DEMO_MODE` / `ALLOW_MOCK_PROVIDERS`. That is **not** a live-data test.
- This machine’s `npm run dev` on port 3000 is a **live** workspace (Supabase configured). Cursor’s browser cannot demo-login there. Live logged-in visual QA needs the operator’s credentials.
- Never invent P&L, breadth, or “why it’s moving” facts to fill an empty panel. Show `—`, stale, delayed, mock, or unavailable.

---

## 1. What the audit found

### 1.1 Destinations that actually exist

| Route | Label | Role vs Overview |
| --- | --- | --- |
| `/dashboard` | Market Overview | Command center (this work) |
| `/news` | Material News | Why-moving, event feed, desk ask |
| `/positions` | Positions | Full blotter, unlock, history |
| `/watchlists` | Watchlists & Sectors | Lists, sectors, themes, coverage table |
| `/archive`, `/reports/[id]` | Research Archive | Briefs / PDFs |
| `/settings`, `/admin` | Settings / Data Operations | Config |

There is **no** dedicated ticker page, themes page, or earnings page. Drill-downs must use query params: `/news?q=`, `/news?ask=`, `/news?ticker=`, `/watchlists?ticker=` / `listId=` / `sectorId=`.

### 1.2 Data architecture (unchanged, still true)

- UI must not call vendors. Quotes live in the in-memory market-data cache (`src/lib/market-data/cache.ts`), filled by refresh/cron.
- Overview snapshot: `loadDashboardSnapshot` → `GET /api/dashboard` (live poll uses `?live=1`).
- Material News is rules-based (`src/lib/intelligence/`).
- Desk Intelligence is rules compile + optional LLM overlay (`src/lib/desk-intel/`).
- Position marks are computed at read time (`buildPositionsSnapshot`).
- Live quotes: Alpaca primary, Massive/Polygon, Finnhub delayed fallback. Brokerage sync: SnapTrade. **No IBKR adapter.**

### 1.3 Pre-existing Overview failures this pass treated as bugs

- `MarketChart` and material movers existed but were not mounted as first-class investigation.
- `focusSymbol` wrote `?symbol=` with no chart/focus consumer.
- Movers only fed attention chips.
- Earnings was a full calendar, not a risk list.
- Dashboard poll failures were silent.
- Book P&L was absent from Overview.
- Session intelligence occupied too much of the first viewport.
- Importing `buildPositionsSnapshot` from a client module exploded with `next/headers`.

---

## 2. What was implemented (actual)

A **composed Market Overview** that answers, in the first few seconds:

1. Session, freshness, provider health, next high-impact USD print.
2. What is unusual (attention rail).
3. How the **book** is printing (deterministic marks).
4. A compact desk brief (rules first, expand for full intel).
5. Regime / pulse, factor ETF spreads, themes vs SPY.
6. Chart + name-in-focus + material movers + heatmap + divergence.
7. Coverage table + material headlines.
8. Next catalysts: FedWatch, earnings risk, economic radar.

### 2.1 Layout (desktop `xl:grid-cols-12`)

Sticky trust + attention → book impact → compact desk intel → Market Pulse + factor/theme tapes → **8/4** chart | focus+movers+heatmap → **8/4** watchlist | headlines → **4/4/4** FedWatch | earnings risk | catalyst radar.

### 2.2 New libraries

| Module | Responsibility |
| --- | --- |
| `src/lib/dashboard/book-impact.ts` | **Client-safe.** Types, `compactBookImpact`, `attachMovesToBookImpact`, `emptyBookImpact`, `isPositionsSnapshot`. Must not import `positions/service` or `next/headers`. |
| `src/lib/dashboard/book-impact-load.ts` | **Server-only.** `loadDashboardBookImpact()` wraps `buildPositionsSnapshot`. |
| `src/lib/dashboard/focus-context.ts` | Joins quote, mover, headlines, coverage membership, book membership, related tickers. |
| `src/lib/market-data/earnings/overview-risk.ts` | Ranks today/tomorrow/+2d ∩ coverage ∪ book ∪ high implied move (≥4%), plus later high-IV names. |

### 2.3 New / remounted UI

- `BookImpactStrip` — always visible. Empty, unavailable, locked, and error states are explicit. P&L redacted when `ownerLocked`.
- `FocusContextPanel` — quote, why-moving badge, `MoveNarrativeLoader`, membership links, Why moving / Coverage / Positions / Ask desk.
- `MaterialMoversPanel` — mounted; sortable; catalyst join; empty region still labeled “Material movers”.
- `FactorTape` — QQQ−SPY, IWM−SPY, HYG−LQD. Empty state says which ETF legs are missing. **Not** a cash curve or OAS.
- `ThemeTape` — `deskSectors` where `kind === "theme"`, vs SPY.
- `MarketChart` — mounted, bound to `focusSymbol`.
- `SessionIntelligence compact` — collapsed by default on Overview.
- `FedWatchPanel` — compact ease/hold/hike; expand for histogram.
- `EarningsCalendar` — compact risk list; “Full calendar” restores the week slate.

### 2.4 Attention

`buildAttentionItems` gained kind `"book"` (unexplained lot preferred). Closed session suppresses Friday movers, coverage unusual, and RVOL so weekend Overview does not pretend the tape is live.

### 2.5 Trust / degraded behavior added in this pass

- Live dashboard poll (`15s`, paused when hidden) surfaces `refreshError` on the session strip.
- Book poll (`30s`) does **not** ride `/api/dashboard?live=1`. Failures mark the last blotter `stale` + `error` instead of throwing on a JSON error envelope.
- `attachMovesToBookImpact` uses **all** `openTickers`, not only the top-4 contributor chips, so unexplained names outside the cap still count.
- Earnings and FedWatch **always fetch on mount** even if the document starts `hidden` (Playwright / background tab). Interval ticks still skip while hidden.
- Demo FedWatch **does not call CME/ZQ**. It returns `source: "unavailable"` with an explicit message. Probabilities are not invented.
- Demo earnings fixtures are **relative to Chicago today**, so the compact risk list is not a stale August 12 slate.

---

## 3. Data sources and flows

```
SSR /dashboard
  ├─ loadDashboardSnapshot(live: false)
  │    ├─ fixtures? fixtureDashboard + fixture coverage + intelligence bundle
  │    └─ live? cache + optional refresh + stored watchlists/sectors + intelligence
  └─ loadDashboardBookImpact(user)  → compactBookImpact
       └─ attachMovesToBookImpact(moves)

Client LiveMarketOverview
  ├─ GET /api/dashboard?live=1&listId|sectorId   every 15s if !fixtures
  ├─ GET /api/positions                          every 30s if !fixtures
  ├─ GET /api/intel/session                      progressive rules → optional LLM
  ├─ GET /api/intel/move?ticker=                 focus narrative
  ├─ GET /api/market/bars                        chart
  ├─ GET /api/market/earnings                    compact / full calendar
  ├─ GET /api/market/fedwatch                    compact / full histogram
  └─ GET /api/market/watchlist                   coverage pick override
```

### 3.1 What is deterministic vs generated

| Fact | Source |
| --- | --- |
| Index / proxy prints, heatmap, factor spreads, pulse score | Cache quotes + `overview-analytics` / `market-pulse` |
| Breadth | Proxy-ETF breadth only; `breadthSupported` / explanation on the snapshot |
| Material movers | `detectMaterialMovers` then headline/explanation join |
| Book day P&L / % / weights | Positions snapshot marks |
| Unexplained book names | Material News `moves` where `attribution === "unknown"` |
| Earnings dates, estimates, implied move | Finnhub + Alpha Vantage + Yahoo options (live); relative mock events (demo) |
| Fed probabilities | CME official token, else delayed ZQ, else settlements; **demo = unavailable** |
| Desk headline / session read | Rules compiler, then optional grounded LLM overlay |
| Move narrative | Same: rules first, LLM overlay must not invent prints |

### 3.2 Session honesty

`inferUsEquitySession()` drives pulse, attention suppression, and labels. Overview must keep showing **closed / premarket / regular / afterhours** rather than recycling Friday’s unusual tape as if it were Sunday live flow.

---

## 4. Integrations with the rest of IB Market Data

| Control | Destination |
| --- | --- |
| Attention / movers / watchlist / heatmap / book chips / theme chips | Sets `?symbol=` and focus; chart follows |
| Why moving | `/news?q=why is {ticker} moving today` |
| Ask desk | `/news?ask=Why is {ticker} moving, and does it matter for coverage or the book?` |
| Coverage (focus) | `/watchlists?ticker=` |
| Membership chips | `/watchlists?listId=` or `?sectorId=` |
| Open Positions / Positions | `/positions` |
| Material News footer | `/news` |
| Heatmap sector | Selects coverage collection + scrolls to `#watchlist` |
| Latest report line | `/reports/[id]` when a brief exists |
| Generate brief | Existing on-demand report modal |

Do not add a fake ticker route. The workspace is query-param driven.

---

## 5. Architectural decisions (keep or challenge with evidence)

1. **Book digest is a separate payload** from the 15s dashboard poll. Positions assembly is too heavy for that loop. Client re-joins unexplained flags via `attachMovesToBookImpact` when intelligence updates.
2. **Server/client split for book-impact** is mandatory. Putting `positions/service` in a `"use client"` module recreates the `next/headers` overlay.
3. **Overview is a cockpit, not a clone of News / Positions / Watchlists.** Compact intel, compact earnings, compact FedWatch; expand or navigate for the full tool.
4. **Factor math stays in `overview-analytics`** so reports and Overview cannot diverge.
5. **Demo FedWatch is empty, not fake.** Invented hike probabilities would be worse than an unavailable panel.
6. **Always show Book impact.** Hiding a zero-lot blotter made “no book” indistinguishable from a failed strip.

---

## 6. Setup

### 6.1 Live local (this repo’s usual `.env.local`)

Supabase URL + anon set → demo login **disabled**. Sign in with a team invite. `npm run dev` → `http://localhost:3000/dashboard`.

Quotes require Alpaca (or configured primary) and a successful refresh. Cron: see `docs/automated-briefing-setup.md`. Never `db reset` the hosted project.

### 6.2 Playwright / fixture demo

`playwright.config.ts` starts Next on **3100** with `E2E_DIST_DIR=.next-e2e`, blank Supabase keys, `DEMO_MODE=true`, `ALLOW_MOCK_PROVIDERS=true`.

```bash
npx playwright test e2e/dashboard-command-center.spec.ts e2e/workspace.spec.ts e2e/market-pulse-visual.spec.ts
```

Second `next dev` on another port must set `E2E_DIST_DIR` to a **different** dist (Next 16 refuses two servers on `.next`). That auto-edits `tsconfig.json` include paths — revert it.

### 6.3 Degraded fixture previews (demo only)

`/dashboard?state=stale|partial|empty|provider-error|delayed|loading|rate-limit` when fixtures are on.

---

## 7. Testing evidence (this pass)

### 7.1 Unit / component

`npx vitest run` on:

- `src/lib/dashboard/book-impact.test.ts` (ranking, lock redaction, unexplained outside contributor cap)
- `src/lib/dashboard/focus-context.test.ts` (membership + book-only `inBook`)
- `src/lib/market-data/overview-attention.test.ts` (coverage, book promotion, closed-session suppression)
- `src/lib/market-data/earnings/overview-risk.test.ts`
- `src/components/dashboard/BookImpactStrip.test.tsx`
- `src/components/dashboard/MaterialMoversPanel.test.tsx`

All of the above **passed**. Persistence union is `"supabase" | "fixtures" | "unavailable"` — do not type `"live"`.

### 7.2 Typecheck

`npx tsc -p tsconfig.check.json --noEmit` → **exit 0**.

### 7.3 Playwright (fixture server :3100)

| Spec | Result |
| --- | --- |
| Command center composition (chart, book, movers, catalysts, 1440 overflow) | passed |
| Focus / Why moving / Positions / Coverage drill-downs | passed |
| `?state=stale`, `empty`, `provider-error` + 1280 overflow | passed |
| Watchlist IWM → `symbol=IWM`; Symbol sort first row **DIA** (default tape, not AAPL) | passed |
| Market Pulse 1440 composition | passed (methodology modal left open in that screenshot) |

`demoLogin` no longer waits for `networkidle` (earnings / intel / FedWatch keep the network busy).

### 7.4 Screenshots

- `docs/ui-screenshots/market-dashboard/desktop-1440-command-center.png`
- `docs/ui-screenshots/market-dashboard/desktop-1280-stale.png`
- `docs/ui-screenshots/market-dashboard/desktop-1280-provider-error.png`
- `docs/ui-screenshots/market-pulse/desktop-1440-dashboard.png`

### 7.5 Not verified in this pass

- Logged-in **live** Overview on :3000 (invite credentials required).
- Live Alpaca refresh latency under regular session (today is Sunday).
- Live CME FedWatch / ZQ path in demo (intentionally short-circuited).
- Production Vercel deployment of this composition.
- Full `npm run test:e2e` suite beyond the specs above.

---

## 8. Remaining limitations

1. **Live Sunday/closed:** pulse and proxies still show last prints; attention correctly drops live unusual. Desk intel may still talk about “session” using rules on last cache — read the session chip first.
2. **FedWatch in demo** is unavailable by design. Live Overview should populate from ZQ/CME; if it hangs, start at `getFedWatchSnapshot` + `sources.ts`, not the panel.
3. **Earnings compact** is only as good as Chicago `today` ∩ ranked events. Live implied moves need Yahoo options budget (`IMPLIED_MOVE_BUDGET`).
4. **Theme tape** is empty unless coverage has `kind === "theme"` with quotes. Heatmap is Select Sector SPDRs (+ SMH), not the firm taxonomy.
5. **Material movers** re-filter with `detectMaterialMovers`. TLT-sized ETF prints may drop; that is intentional vs a raw % sort.
6. **Chart** mock default range is **3M / 1d**; live default is **1D / 5m**. Playwright logs a hydration mismatch on the symbol input `caret-color: transparent` (browser/Playwright, not a data bug).
7. **Desk intel** can show “Compiling…” for a noticeable beat; rules paint first, LLM refines. Generic copy is a Desk Intel problem, not a pulse math problem.
8. **Intelligence in fixtures:** confirm whether `getIntelligenceBundle` still returns empty `moves` on the fixture path before asserting catalyst badges in e2e.
9. **No options unusual / dark-pool / internals / correlation matrix** on Overview. Do not fake them.
10. **In-process caches** die on serverless cold start. Overview freshness is only as good as the last refresh that landed in that instance.

---

## 9. Test matrix before changing math

Reproduce first. Prefer live keys with demo **off**.

| Case | How | Pass |
| --- | --- | --- |
| Regular session hierarchy | Live weekday :3000, 1440px | Session + attention + book visible without scrolling past pulse |
| Closed / weekend | Sunday or `marketSession: "closed"` | No Friday rvol/mover chips; labels say closed |
| Book lock | Teammate book locked | Names visible, P&L “Locked”, never `$0` invented |
| Book poll 401/HTML | Break `/api/positions` | Strip stays on last marks + error, no crash |
| Dashboard poll 500 | Break `/api/dashboard?live=1` | `refreshError` banner, last snapshot remains |
| Partial tape | Missing HYG or LQD | Factor credit cell omitted; empty copy if all missing |
| Focus drill | Click IWM | URL `symbol=IWM`, chart symbol, Why moving → `/news` |
| Earnings risk | Coverage/book name reporting today | Appears above random mega-cap |
| Demo FedWatch | Playwright / blank supabase | Unavailable copy, no invented probabilities |
| Overflow | 1280 and 1440 | `documentElement.scrollWidth - clientWidth ≤ 1` |

---

## 10. Highest-value next work (ordered)

1. **Live closed-session and weekday regular-session visual QA** with a real member session on :3000. Confirm poll times, delayed vs realtime labels, and book marks against Positions.
2. **Market-level “why is the tape moving?”** — join intelligence events to pulse drivers (duration, vol proxy, credit) without duplicating `/news`.
3. **Earnings compact vs live calendar quality** — implied-move fill rate, coverage/book badges, click-through to chart.
4. **Desk intel prompt/grounding** — kill generic “constructing session” prose; require cited prints.
5. **Chart session default on Overview** — consider 1D even in mock so the cockpit matches “what is happening now.”
6. **Fix caret-color hydration** on `MarketChartToolbar` symbol input.
7. **Unusual options / volume** only if a deterministic provider already exists; do not LLM it.
8. **Correlation / beta to book** as a read-time statistic from cached closes — small, high leverage, no new vendor.
9. **FedWatch demo** could show a dated settlement snapshot **if and only if** it is labeled historical fixture, never “now.”
10. **Full e2e suite** after Overview changes; movers vs watchlist both have a “Symbol” sort — keep accessible names distinct (`Sort movers by Symbol` is already set).

---

## 11. Files to start from

```
src/app/(app)/dashboard/page.tsx
src/components/dashboard/LiveMarketOverview.tsx
src/lib/dashboard/snapshot.ts
src/lib/dashboard/book-impact.ts
src/lib/dashboard/book-impact-load.ts
src/lib/dashboard/focus-context.ts
src/lib/market-data/overview-attention.ts
src/lib/market-data/overview-analytics.ts
src/lib/market-data/earnings/overview-risk.ts
e2e/dashboard-command-center.spec.ts
e2e/helpers.ts
```

If a client bundle again traces to `next/headers`, the import graph went through `book-impact-load` or `positions/service`. Undo that before any visual work.
