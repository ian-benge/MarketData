# Material News / Why It’s Moving — Tester & Improver Handoff

**Audience:** a new agent that will independently test, challenge, and then improve this system until it is a production-ready competitive advantage for IB Market Data.

**Date of this report:** 2026-08-15  
**Branch:** `cursor/coverage-taxonomy` (uncommitted; mixed with unrelated dashboard/watchlist/positions work)  
**Hosted Supabase:** `grelplmmgywqoliqzrfi` (`grelplmmgywqoliqzrfi.supabase.co`)  
**App:** Next.js 16.3 App Router + React 19

This report is based on the **final codebase, git status, schemas, and tests that were actually run**. It does not describe the original product prompt as if it were complete. Planned, mocked, fixture-only, and unverified behavior is labeled as such.

**Do not protect the current design.** Several core choices (lexical-only search, in-process caches, once-daily cron, 8-ticker company-news cap, keyword classification, fire-and-forget persistence) are working-enough prototypes, not institutional-grade architecture. Redesign them if a stronger solution is possible.

---

## 0. How to use this document

1. Read **§1–§4** for how the system actually works.
2. Read **§8** before trusting any “it works” claim.
3. Use **§9 capability classes** as the scoreboard. Class 1 is rare.
4. Execute **§11 test matrix** before changing ranking/attribution. Reproduce failures; do not “fix” unobserved bugs.
5. Use **§12 prioritized improvements** as the default backlog. Reorder only with new evidence.
6. Stay inside Material News unless a collision is proven. The working tree contains a large amount of **unrelated** uncommitted work.

### Honesty rules for the next agent

- Do not invent live ingest, cron, Playwright, lint, or build results.
- Demo/fixture headlines are **synthetic** and currently **dated 2026-08-10**. Time-windowed queries for “today” will miss them on later calendar days.
- `fixturesEnabled()` is true when `DEMO_MODE` or `ALLOW_MOCK_PROVIDERS` is set. That path **never calls Finnhub, Massive, RSS, or EDGAR**, and **always returns `moves: []` from the bundle**.
- Production table `market_news_items` had **0 rows** when this report was written. Persistence is unimplemented-in-practice until a live write is proven.
- Never generate causal copy that says a name is moving “because” of a headline. The current attribution layer is allowed to infer; it is not allowed to narrate fiction.

---

## 1. What was implemented (actual)

A **deterministic headline intelligence layer** (no LLM summaries) that:

- Ingests Finnhub general news + allowlisted RSS, Finnhub company news (≤8 priority tickers), optional Massive `/v2/reference/news` (fail-closed on entitlement), and material EDGAR forms.
- Normalizes, clusters, classifies, resolves entities, scores novelty/materiality, and attributes watchlist/tape moves.
- Exposes first-class search at `/news` and `GET /api/news`.
- Surfaces **Why it’s moving** on Market Overview watchlist, Watchlists coverage table, ticker inspector, and `/news` when the query parses as a why-moving intent.
- Persists (intended) into `market_news_items` with English FTS, and user saved searches into `news_saved_searches`.

**Explicitly not implemented**

- Semantic / embedding / vector search
- LLM-written summaries or causal stories
- Benzinga or any paid newswire beyond Finnhub / Massive / RSS / EDGAR
- Dedicated news worker or high-frequency news cron
- Chart headline markers or timestamp-aligned price/volume prints
- A mobile primary tab for News
- A dedicated `viewNews` permission
- API/integration tests for `/api/news`, ingest against live/mocked HTTP, or store upserts
- Proven production persistence (0 rows at report time)

---

## 2. How the complete system works

### 2.1 Mental model

```
Providers → ingestMarketNews → assembleEvents → IntelligenceBundle
                                              ↘ persistNewsItems (best-effort, currently unverified)
Search: parseNewsQuery → (bundle events ∪ FTS extras) → searchEvents
Moves:  detectSignificantMove → attributeMoves (confirmed / likely / sympathy / multiple / unknown)
UI:     /news, dashboard HeadlineFeed + Why column, watchlists, command palette
```

There is **no** separate streaming bus. Every dashboard, news search, watchlist coverage load, command-palette keystroke, and cron tick that misses the 5-minute in-process cache can re-ingest.

### 2.2 Runtime modes

| Mode | Trigger | Behavior |
| --- | --- | --- |
| **Fixtures / demo** | `fixturesEnabled()` = `DEMO_MODE === true` **or** `ALLOW_MOCK_PROVIDERS === true` | `assembleEvents({ items: fixtureDashboard.headlines })`. Gaps include `code: "fixtures"`. **`moves: []` always.** No provider HTTP. Playwright e2e uses this mode (clears Supabase keys, sets both flags). |
| **Live** | Neither demo flag, or production | `ingestMarketNews` + load 48h stored rows + prior 7d for novelty. Attribute significant quotes. `void persistNewsItems(...)`. |
| **Degraded** | ingest throws and a cache exists | Return cached bundle with `stale: true`. |
| **Hard fail** | ingest throws and no cache | Empty events/moves, gap `intelligence_unavailable`, `stale: true`. |

`stale` on a successful live bundle is **only** true when **every** source status is not `"ok"` **and** `events.length > 0`. One healthy RSS feed prevents the stale flag even if Finnhub and EDGAR are down.

### 2.3 Caches (two, both in-process, both 5 minutes)

1. `src/lib/intelligence/service.ts` — `BUNDLE_TTL_MS = 5 * 60 * 1000`. Per serverless isolate. Lost on cold start. `force: true` bypasses.
2. `src/lib/dashboard/research-context.ts` — same TTL, wraps `getIntelligenceBundle` + catalyst calendar. `resetDashboardResearchCache()` also resets the intelligence cache.

There is **no Redis, no shared cache, no HTTP cache** (`Cache-Control: private, max-age=0, must-revalidate` on `/api/news`).

If `getIntelligenceBundle` is called with fresh `quotes` while a cache hit is valid, **events are reused** and **moves are recomputed** from those quotes. Coverage/theme maps on that path use `options.coverage` (may be empty on dashboard research).

### 2.4 Auth, permissions, routing

- Page `/news` and APIs `/api/news`, `/api/news/saved` require `viewDashboard`. There is no news-specific permission.
- `src/proxy.ts` treats `/news` as an app route.
- Login `ALLOWED_DESTINATIONS` includes `/news`.
- Saved-search writes require `user.firmId`. Demo users without a firm get `persistence: "unavailable"` and no Save button.
- `market_news_items`: authenticated members may **SELECT** via `auth_is_active_member()`. Insert/update/delete revoked for `authenticated` and `anon`. Writes are service-role only.
- `news_saved_searches`: user-owned RLS CRUD. Application writes currently go through the **service-role admin client**, so RLS is not what enforces those writes — application filters on `user_id` + `firm_id` are the real control. Treat that as a security review item.

---

## 3. Full data flow

### 3.1 Ingest

`ingestMarketNews(env, { priorityTickers })` in `src/lib/intelligence/ingest.ts`:

1. **Wire / RSS** via `createNewsProvider(env)` (`src/lib/providers/registry.ts`): Finnhub `/news?category=general` if keyed, **plus** RSS from `NEWS_RSS_FEEDS` or defaults. Limit 80. Massive is **not** in this composite.
2. **Finnhub company news** if `FINNHUB_API_KEY` and priority tickers exist: `/company-news` for **at most 8** symbols, 7-day default window, limit 40 after merge. **If Finnhub `related` is empty, the requested symbol is still appended to `tickers`.** That can false-tag unrelated company-news rows.
3. **Massive** if `MASSIVE_API_KEY`: `GET /v2/reference/news`. Entitlement errors (`EntitlementError`) → source `unavailable` + gap `massive_news_unentitled`. Other errors → `massive_news_error`. Other sources still run.
4. **EDGAR** always in live mode: `EdgarCorporateEventsProvider.getFilings` over the last 2 UTC days. Keep forms matching `/8-K|10-Q|10-K|6-K|S-1|SC 13/i`. Cap 20. Form 4 is dropped.
5. Merge by canonical URL and item id, newest `publishedAt` first.
6. Gaps: `no_headlines` if empty; `weak_entity_tags` if fewer than 25% of items have provider ticker tags; company/Finnhub/Massive/EDGAR errors as above.

**Default RSS** (`src/lib/providers/rss/default-feeds.ts`): Fed, BLS, SEC press, CNBC, EIA, Treasury. SSRF-checked before fetch. `NEWS_RSS_FEEDS` **replaces** defaults rather than appending.

**Priority tickers** (`priorityFromQuotes`): significant movers from quotes, plus caller extras, plus first 12 coverage tickers — then sliced to 8 for company news. Large watchlists do not get issuer-tagged wires for most names.

`buildGeneralNewsProvider` exists in `ingest.ts` and is **unused** by the live path (`createNewsProvider` is). It would have included Massive in the composite; live ingest calls Massive separately instead.

### 3.2 Normalize / cluster

`assembleEvents` (`src/lib/intelligence/assemble.ts`):

1. `clusterNewsItems` (`src/lib/domain/news-cluster.ts`): SHA-256 of title+summary+excerpt; canonicalize URL (https, strip tracking params, drop hash, lowercase host). Exact URL or hash collapse, then greedy Jaccard title clustering at **0.55**. Representative prefers `sourceClass` primary > wire > other.
2. `resolveEntities` per cluster member, then merge (higher confidence + provider method wins).
3. `classifyHeadline` keyword rules (first highest score wins). Sentiment is keyword-only (beat/raise vs miss/cut/lawsuit). Price-only headlines stay `unscored`.
4. `themesForEvent` + `secondOrderEntities` (theme `relatedTickers` + coverage theme overlap, confidence `low`, method `theme_peer`, cap 6).
5. `detectNovelty` vs prior stored headlines (7d, limit 800): exact hash → duplicate (<36h) or recycled (≥36h); Jaccard ≥0.82 + ticker overlap → duplicate/recycled; Jaccard ≥0.55 + age ≥2h → update.
6. `rankEvent` → 0–100: recency (6h half-life 28), novelty (16), credibility (14), event-type score (16), coverage hit (12), tape reaction (10), cluster size (4).
7. `marketReaction` copies **current** quote `%` and RVOL for resolved tickers. It is **not** the print at headline time.

**Client constraint:** `assemble.ts` and `news-cluster.ts` import `node:crypto`. The dashboard `HeadlineFeed` must not import them. If `events` is missing it uses `headlinesAsEvents()` (synthetic `eventType: "other"`, materiality 40, no themes).

### 3.3 Entity resolution

`src/lib/intelligence/entity-resolve.ts`:

- Provider `tickers[]` → high confidence, method `provider`.
- `$TICKER`, `NASDAQ:TICKER`, `(TICKER)` if in instrument catalog and not a stopword.
- Company-name / alias scan against `listCatalogInstruments()` plus `EXTRA_ALIASES` (NVIDIA→NVDA, Iris Energy→IREN, TSMC→TSM, …). Aliases shorter than 4 chars skipped unless in `EXTRA_ALIASES`. If more than 6 name hits, confidence drops to `low` / method `ambiguous`.
- Stopwords include NOW, ALL, CAN, FED-ish tokens (CEO, EPS, CPI, AI, …). **ServiceNow (`NOW`) will not resolve from English.** `THEMES.ai_software.relatedTickers` still lists `"NOW"` for second-order.
- **`SKHY` is not a US-listed ticker** (SK Hynix). It is in aliases and semiconductor `relatedTickers`. Sympathy/search can emit a fake symbol.
- Ambiguous aliases that map to two catalog tickers are **deleted** (neither kept).

`resolveQueryTickers` is used by search parsing. Why-moving regex captures **one** `[A-Za-z][A-Za-z0-9.-]{0,9}` token. `why is IREN down today` works. `why is Iris Energy down today` captures `Iris`, which is **not** an alias for IREN.

### 3.4 Search

`parseNewsQuery` (`search-parse.ts`):

- Intent `why_moving` if `why is {token} down|up|moving|…` or `what('s| is) moving|wrong with {token}`.
- Event-type regex aliases, theme expansion (`expandThemeQuery`), ticker/alias resolution, time windows (last hour, premarket, after-hours, today, this week, this month, overnight), `material` / `high-impact` → `materialOnly`.
- Leftover tokens become AND-ish `textTerms` after a brittle consumed-word list (`why`, `is`, `news`, `affecting`, `contracts`, …). Extra leftover terms **zero the result set**.

`searchEvents`: filter then sort (ticker hit first, then materiality). Limit default 60, API max 100.

Ticker filter matches **`event.tickers` OR `event.secondOrder`**. Searching `NVDA` can return a power/semis story whose only NVDA link is a theme-peer list. That looks like a false positive.

Theme filter is exact `event.themes.includes(themeId)`. Combining a theme chip with a ticker that never received that theme **returns nothing**.

Time windows:

- Query “today” / chips: Chicago calendar day start → now (`parseTimeWindow`).
- Move attribution window: **rolling hours** from `newsWindowForSession` (premarket 18h, afterhours 12h, closed 24h, else 16h). These two clocks **do not match**. A “today” search and a Why-moving panel can disagree.

Premarket chip: Chicago day start + 3 UTC hours (not 4:00 ET). After-hours: +15 UTC hours. **Not** exchange-session aligned. Improve or replace.

`searchIntelligence` optionally unions Postgres FTS (`websearch`, english) on `market_news_items.search_vector`. If the table is empty (it was), FTS adds nothing. FTS errors are swallowed → `[]`.

### 3.5 Move detection

`detectSignificantMove` reuses watchlist `flagsFor` when `quote.flags` is empty:

| Flag | Threshold |
| --- | --- |
| `move` | \|1d %\| ≥ 3 |
| `rvol` | RVOL ≥ 1.8× |
| `extended` | premarket or AH \|%\| ≥ 1.5 |
| `peer` | vs group ≥ 2.5 |
| extra | \|%\| ≥ 5 or RVOL ≥ 3 |

`significant` if any of those reasons fire (including the extras even when flags are pre-supplied).

**Dashboard intelligence quotes** (`quotesFromCache`): tape `relativeVolume` is **hard-coded `null`**. RVOL only appears if the ticker is also in `snapshot.movers`. Watchlist coverage passes real RVOL / pre / AH / vs-group. Dashboard Why and coverage Why can disagree on the same name.

### 3.6 Attribution (“Why it’s moving”)

`attributeMove` (`attribution.ts`), in order:

1. **confirmed_company** — company-specific event type **and** ticker hit (confidence high or medium) **and** primary source (`sourceClass`/`sourceQuality` primary, or host contains `sec.gov` / `edgar` / `federalreserve.gov` / `treasury.gov` / `bls.gov` / `eia.gov`). Evidence = **fact**. Copy cites the filing; does not say “because”.
2. **multiple** — ≥2 company-specific events with **distinct event types**. Inference. Does not pick a winner.
3. **likely_catalyst** — one company-specific, or any ticker-matched event. High entity confidence → probable; else speculative. Inference.
4. **sympathy** — only if the move is `significant` and there is theme/peer/second-order overlap (macro types require that overlap; a random CPI print does not explain IREN). Speculative inference.
5. **unknown** — “No verified catalyst found” + explicit “not a claim that no catalyst exists.”

`export_control` is a **MACRO_TYPE**, not company-specific. A ticker-tagged export-control wire about NVDA therefore skips the confirmed/company buckets and lands in **likely_catalyst via `anyTicker`**, or sympathy for peers. The unit test covers that path.

Confirmed requires **primary source + company-specific type**. An 8-K about NVDA confirms. A Fed RSS item does not confirm a single-stock move.

If the user asked why-moving but the quote is not significant, an explanation may still be returned with a caveat in `detail`.

### 3.7 Persistence (intended vs actual)

`persistNewsItems` upserts on `(provider_name, external_id)` using the admin client.

**Critical defect:** the upsert result’s `{ error }` is **not checked**. PostgREST failures do not throw. Combined with `void persistNewsItems(...)` (fire-and-forget) and a catch that swallows exceptions, **failed writes are silent**.

`loadRecentNewsItems` / `searchStoredNews` / `loadPriorHeadlines` return `[]` if admin client is missing or any error occurs.

**Remote verification 2026-08-15 (this report):** both tables exist, RLS on, **0 rows**. Either ingest has not successfully written since migration apply (`20260815191302`, ~19:13 UTC), or writes failed silently. Do not treat FTS, novelty-from-history, or saved searches as production-proven.

Local migration filename: `supabase/migrations/20260815140000_market_news_intelligence.sql`. Remote version name: `market_news_intelligence` / `20260815191302`. CLI `db:push` may see a version mismatch; prefer MCP `list_migrations` over assuming the files are 1:1.

### 3.8 Jobs

`POST|GET /api/cron/tick` (`verifyCronSecret`): after market refresh + Forex Factory morning refresh, calls `getIntelligenceBundle(env, { force: true })` and returns `newsRefresh: refreshed|failed|skipped`. **Still calls `enqueueDueReportRuns`.** Do not remove that.

`vercel.json`:

```json
{ "path": "/api/cron/tick", "schedule": "0 14 * * *" }
```

That is **once daily at 14:00 UTC**, not a news loop. Live freshness in practice is **on-demand dashboard/news/watchlist traffic + 5-minute isolate cache**. Treating cron as “continuous intelligence” is false.

Fixtures mode skips news refresh (`newsRefresh` omitted; `mode: "demo"`).

### 3.9 Watchlist / dashboard join

- `getDashboardResearch` → `loadDashboardSnapshot` → `compactIntelligence`: **24 events, 40 moves**.
- `HeadlineFeed` shows 16, coverage-tagged first.
- `LiveMarketOverview` prefers server `intelligence.moves` per significant watchlist row; else **client** `attributeMoves([quote], events, marketSession)` **without peer/theme maps**. Dashboard list-switch sympathy is weaker than `/watchlists`.
- `joinMaterialMovers(..., explanations)`: if an explanation exists, its `causalStatus` / headline win — including **unknown over a ticker-matched headline** (unit-tested). If no explanation, falls back to “reported if any headline tickers match.”
- `buildCoverageSnapshot` loads intelligence with full quote context; `moveExplanations` filtered to selected symbols. List overlay (`assemble.ts`) re-filters to visible rows.
- Why deep links are always  
  `/news?q=why is {TICKER} moving today`  
  not session-aware, not using aliases.

### 3.10 UI surfaces

| Surface | What it shows |
| --- | --- |
| `/news` | Search, type/theme/time chips, recent (localStorage `ib-news-recent-searches`), saved searches, why panel, gaps, sources, EventCards, j/k navigation |
| Dashboard HeadlineFeed | Clustered events or headline fallback; “Search all” → `/news` |
| Dashboard WatchlistTable | Compact Why badge (confidence label) + link |
| Watchlists CoverageTable | Compact Why for every row (— if no explanation) |
| TickerInspector | Full badge + detail + fact vs inference copy |
| MaterialMoversPanel | `confidence ?? causalStatus` + headline title |
| Command palette (`/` or Ctrl/Cmd+K) | Debounced 200ms `GET /api/news?q=&limit=6` then jump to `/news?q=` |

**UX footgun:** clicking a ticker on an EventCard in `/news` **navigates to `/dashboard?symbol=`** and also sets the ticker filter. Users leave the search workspace.

Mobile bottom nav is dashboard / positions / watchlists only. News is sidebar + More + command palette.

---

## 4. Intended user workflows and acceptance criteria

Treat these as **product intent**. Many are only partially met. Class in §9.

### W1 — Scan material market news

Analyst opens Market Overview, sees clustered headlines, coverage-tagged first, source/gap honesty, click ticker to focus chart.

**Accept if:** live (non-demo) feed shows real URLs from configured sources; duplicates cluster; fixture banner is absent; gaps visible when sources fail; no invented summaries.

**Currently:** dashboard feed implemented; live ingest **not browser-verified**; demo uses three synthetic headlines dated 2026-08-10.

### W2 — First-class headline search

`/news` or command palette: ticker, alias, keyword, theme, event type, time window, natural language (`AI power contracts this week`, `export-control news affecting semiconductors`).

**Accept if:** those two example queries return relevant clusters on **live** data; aliases (NVIDIA, TSMC, Iris Energy) work; empty/error/gap states are honest; search is fast enough for typing.

**Currently:** parser unit-tested; **no live query evaluation**; lexical AND can zero results; no latency SLO; command palette can trigger a 60s ingest.

### W3 — Why is this name moving?

From watchlist / coverage / inspector / `why is IREN down today`.

**Accept if:** confirmed vs likely vs sympathy vs unknown are visually distinct; unknown does not claim “no news exists”; primary 8-K can confirm; wire copy is inference; sympathy requires overlap; deep link opens `/news` with the same ticker.

**Currently:** unit tests cover the four attribution branches on **hand-built events**. End-to-end live attribution **not run**. Demo Why is structurally empty (`moves: []`) except `/news` why-intent which attributes a **dummy quote** (often `changePercent: null`) against time-filtered events.

### W4 — Coverage-aware research

Watchlist/theme names rank higher; Why uses desk sectors/themes for sympathy.

**Accept if:** coverage-tagged events sort first; sympathy for a theme peer is speculative; switching lists updates Why.

**Currently:** ranking boost + maroon “On coverage” implemented. Dashboard client re-attribution **drops peer maps**. Not live-verified.

### W5 — Degraded honesty

Provider outage, unentitled Massive, missing Finnhub, empty RSS, stale cache.

**Accept if:** source list shows `ok|empty|error|unavailable`; gaps copy is specific; UI does not fill with mocks in production.

**Currently:** gap/source plumbing exists; NewsWorkspace unit-tests empty + fetch-throw. Live outage behavior **not run**.

---

## 5. File, route, schema, job, dependency, env inventory

### 5.1 New files (untracked at report time)

| Path | Role |
| --- | --- |
| `src/lib/intelligence/types.ts` | Domain types, labels |
| `src/lib/intelligence/event-classify.ts` | Keyword event type + sentiment |
| `src/lib/intelligence/themes.ts` | 11 hard-coded themes + query expansion |
| `src/lib/intelligence/entity-resolve.ts` | Ticker/name/alias resolution |
| `src/lib/intelligence/novelty.ts` | new/update/duplicate/recycled |
| `src/lib/intelligence/rank.ts` | Materiality 0–100 |
| `src/lib/intelligence/search-parse.ts` | NL parse + time windows |
| `src/lib/intelligence/search.ts` | In-memory filter/rank |
| `src/lib/intelligence/move-detect.ts` | Significant-move flags + news window |
| `src/lib/intelligence/attribution.ts` | Why-it’s-moving |
| `src/lib/intelligence/second-order.ts` | Theme/coverage peers |
| `src/lib/intelligence/coverage-graph.ts` | Watchlist/sector → CoverageLink + peer map |
| `src/lib/intelligence/assemble.ts` | Cluster → IntelligenceEvent |
| `src/lib/intelligence/ingest.ts` | Multi-source fetch |
| `src/lib/intelligence/store.ts` | Supabase load/upsert/FTS |
| `src/lib/intelligence/service.ts` | Cache, bundle, searchIntelligence |
| `src/lib/intelligence/saved-searches.ts` | Saved search CRUD (admin client) |
| `src/lib/intelligence/*.test.ts` | Unit tests listed in §8 |
| `src/lib/providers/massive/news.ts` | Massive reference news adapter |
| `src/lib/providers/massive/news.test.ts` | Normalize tests |
| `src/app/(app)/news/page.tsx` | `/news` (async `searchParams`, `maxDuration=60`) |
| `src/app/api/news/route.ts` | GET search (`maxDuration=60`) |
| `src/app/api/news/saved/route.ts` | GET/POST/DELETE saved searches |
| `src/components/news/NewsWorkspace.tsx` | Search workspace |
| `src/components/news/EventCard.tsx` | Cluster card |
| `src/components/news/WhyMovingBadge.tsx` | Attribution badge |
| `src/components/news/*.test.tsx` | jsdom tests |
| `src/components/ui/ChipToggle.tsx` | Filter chips (also used by watchlist table) |
| `src/components/dashboard/HeadlineFeed.test.tsx` | Empty + gap tests |
| `src/components/dashboard/WatchlistTable.test.tsx` | Why link test |
| `src/lib/dashboard/snapshot.ts` | Dashboard snapshot assembly (includes `compactIntelligence`) |
| `supabase/migrations/20260815140000_market_news_intelligence.sql` | DDL |

### 5.2 Modified files (news-relevant)

| Path | Change (news-relevant) |
| --- | --- |
| `src/lib/providers/finnhub/news.ts` | Company-news tags requested symbol if `related` empty |
| `src/lib/providers/rss/default-feeds.ts` | Fed/BLS/SEC/CNBC/EIA/Treasury defaults |
| `src/lib/providers/registry.ts` | Massive news note; `createNewsProvider` still Finnhub+RSS only |
| `src/lib/dashboard/research-context.ts` | Intelligence bundle + dual cache |
| `src/lib/dashboard/research-context.test.ts` | Mocks `getIntelligenceBundle` |
| `src/lib/fixtures/dashboard.ts` | `intelligence?` on snapshot type; headlines still 3 synthetic rows |
| `src/lib/domain/news-cluster.ts` | Pre-existing cluster/hash (used by assemble; **do not import on client**) |
| `src/app/api/cron/tick/route.ts` | `getIntelligenceBundle({ force: true })` + `newsRefresh` |
| `src/app/api/dashboard/route.ts` | Unchanged shape; payload now includes `intelligence` via snapshot |
| `src/components/dashboard/HeadlineFeed.tsx` | EventCard + coverage sort + `/news` link |
| `src/components/dashboard/LiveMarketOverview.tsx` | Client/server Why merge; HeadlineFeed events |
| `src/components/dashboard/WatchlistTable.tsx` | Why column |
| `src/components/dashboard/MaterialMoversPanel.tsx` | Shows explanation confidence |
| `src/components/watchlists/CoverageTable.tsx` | Why column |
| `src/components/watchlists/TickerInspector.tsx` | Why panel |
| `src/components/watchlists/WatchlistsWorkspace.tsx` | Passes `moveExplanations ?? []` |
| `src/lib/watchlists/service.ts` | Loads intelligence into coverage snapshot |
| `src/lib/watchlists/assemble.ts` | Filters explanations to visible rows |
| `src/lib/watchlists/types.ts` | `moveExplanations: MoveExplanation[]` |
| `src/lib/watchlists/analytics.ts` / `.test.ts` | Test fixtures include `moveExplanations` |
| `src/lib/market-data/overview-movers.ts` | `joinMaterialMovers` explanation overlay |
| `src/lib/market-data/overview-movers.test.ts` | Unknown attribution beats ticker headline |
| `src/components/layout/AppShell.tsx` | Nav + palette news fetch |
| `src/proxy.ts` | `/news` is an app route |
| `src/app/(auth)/login/LoginClient.tsx` | `/news` allowed destination |
| `docs/data-sources.md` | Headline intelligence section |
| `e2e/workspace.spec.ts` | `/news` + “Why IREN is moving” |
| `e2e/accessibility.spec.ts` | `/news` in a11y loop |

### 5.3 Routes

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/news` | `viewDashboard` | SSR shell; client fetches `/api/news` |
| GET | `/api/news` | `viewDashboard` | Query: `q|query`, `ticker`, `type`, `theme`, `source`, `material=1`, `since`, `until`, `window`, `limit` |
| GET/POST/DELETE | `/api/news/saved` | `viewDashboard` | Firm required to persist |
| GET | `/api/dashboard` | `viewDashboard` | Includes `intelligence` compact bundle |
| GET/POST | `/api/cron/tick` | `CRON_SECRET` or demo | `newsRefresh` |

### 5.4 Schema (applied remotely as `20260815191302` / `market_news_intelligence`)

`market_news_items`: id, provider_name, external_id (unique with provider), title, summary, url, canonical_url, content_hash, published_at, retrieved_at, publisher, source_class, source_quality, tickers[], resolved_tickers[], event_type, themes[], novelty, materiality_score, raw jsonb, generated `search_vector` (english FTS via immutable `text_array_join(text[])`), timestamps. Indexes: unique provider+external, published_at, GIN tickers/resolved/search_vector, (event_type, published_at).

`news_saved_searches`: firm_id, user_id, name, query, filters jsonb, unique `(user_id, name)`.

Helper `public.text_array_join(text[])` exists because `array_to_string` is not immutable in generated columns. First apply failed; this wrapper is the fix. Do not “simplify” it without re-testing generated-column immutability.

### 5.5 Dependencies

**No new npm packages.** Uses existing `zod`, `@supabase/supabase-js`, Next App Router, Vitest, Playwright, `date` APIs. Intelligence does **not** call OpenAI/Anthropic/Gemini despite those env keys existing for reports.

### 5.6 Environment variables (news-relevant)

| Variable | Role for this feature |
| --- | --- |
| `FINNHUB_API_KEY` | General + company news. Unset → company news unavailable gap |
| `MASSIVE_API_KEY` | Optional reference news; fail-closed if unentitled |
| `MASSIVE_API_BASE_URL` | Default `https://api.massive.com` |
| `NEWS_RSS_FEEDS` | Comma-separated https; **replaces** defaults |
| `EDGAR_USER_AGENT` | SEC UA; else derived from `NEXT_PUBLIC_APP_URL` |
| `NEXT_PUBLIC_APP_URL` | EDGAR UA fallback, links |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Persist/FTS/saved searches. Missing → silent no-op store |
| `CRON_SECRET` | Authorizes tick (Bearer or `x-cron-secret`) |
| `DEMO_MODE` / `ALLOW_MOCK_PROVIDERS` | Fixture intelligence; **masks live news** |
| `FIRM_ID` | Not required for news read; saved searches need session `firmId` |

No news-specific env was added to `envSchema`.

### 5.7 Unrelated dirty tree — do not “fix” as news work

The same branch has uncommitted pulse, catalyst calendar, DurationStack/FactorTape deletions, positions, watchlist digest, etc. **Do not** bundle those into news PRs. Diff news paths listed above.

---

## 6. Setup, test, seed, build, lint, migration, dev commands

From repo root (`c:\Projects\MarketData`). PowerShell: `Copy-Item` not `cp`; `npm.cmd` if the npm shim is blocked.

```bash
npm ci
Copy-Item .env.example .env.local   # only if .env.local does not already exist
npm run check:env
npm run dev                         # http://localhost:3000
```

**Demo (fixtures, no live wires):** keep Supabase keys blank; `DEMO_MODE=true` and `ALLOW_MOCK_PROVIDERS=true`. Login → Enter as member → `/news`. Headlines are synthetic. This is **not** a live-news test.

**Live local (required for real ingest tests):**

- Set `FINNHUB_API_KEY` (company + general).
- Optional `MASSIVE_API_KEY` (expect unentitled on cheap plans).
- Optional `NEWS_RSS_FEEDS` or rely on defaults (SSRF allowlist).
- `EDGAR_USER_AGENT` (SEC fair-access string).
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to persist.
- `DEMO_MODE=false` and `ALLOW_MOCK_PROVIDERS=false` or you will never leave fixtures.

```bash
npm run typecheck
npm run lint
npm run test
npx vitest run src/lib/intelligence src/components/news src/components/dashboard/HeadlineFeed.test.tsx src/components/dashboard/WatchlistTable.test.tsx src/lib/providers/massive/news.test.ts src/lib/dashboard/research-context.test.ts src/lib/domain/news-cluster.test.ts
npm run test:e2e                    # demo env; see §8 — not a live ingest test
npm run build
```

**Targeted Playwright (demo only):**

```bash
npx playwright test e2e/workspace.spec.ts -g "material news"
npx playwright test e2e/accessibility.spec.ts
```

**Migration**

- Preferred: keep SQL in `supabase/migrations/`, apply via Supabase MCP `apply_migration`, confirm with `list_migrations` / `execute_sql`.
- CLI: `npm run db:link` then `npm run db:push`. **Never `db reset` against hosted.**
- Remote already has `market_news_intelligence` (`20260815191302`). Do not re-apply blindly.
- Seed (`npm run seed` / `supabase/seed.sql`) does **not** populate `market_news_items`. There is no news seed.

**Manual live probes (authenticated session):**

```text
GET /api/news
GET /api/news?q=why%20is%20IREN%20down%20today
GET /api/news?q=export-control%20news%20affecting%20semiconductors
GET /api/news?q=AI%20power%20contracts%20this%20week
GET /api/news/saved
POST /api/cron/tick   Authorization: Bearer $CRON_SECRET
```

Inspect `sources[]`, `gaps[]`, `parsed`, `events[].tickers`, `moves[]`, and then:

```sql
select count(*) from public.market_news_items;
select provider_name, count(*) from public.market_news_items group by 1;
```

If count stays 0 after a live `/api/news` with service role configured, persistence is broken (start at `persistNewsItems` not checking `error`).

---

## 7. User-visible workflows (as coded)

1. **Sidebar Material News** → `/news` → input autofocus → 180ms debounce fetch → `router.replace` query string.
2. Type chips: export control, earnings, filing, contract, M&A, cyber, plus Material only. **Most event types have no chip** (guidance, offering, geopolitics, …).
3. Time chips: all / today / this week / last hour / premarket / after-hours.
4. Theme chips: all 11 `THEMES`.
5. Save search only if `/api/news/saved` reports `persistence: "supabase"`.
6. Why panel **only** if `parsed.intent === "why_moving"` and `moves[0]` exists. Generic ticker search does **not** show the Why panel even if the name is moving.
7. j/k or arrows move selection; they do not open sources. `/` and Ctrl+K open the **global** command palette, not the news input (hint text is slightly misleading).
8. Dashboard Why compact label is **confidence** (`Unknown` / `Probable` / …), not attribution kind. Coverage table same. Inspector uses attribution labels.

---

## 8. Tests performed — exact results and evidence

### 8.1 This handoff session (2026-08-15, ~14:30 local)

**Command**

```bash
npx vitest run src/lib/intelligence src/components/news src/components/dashboard/HeadlineFeed.test.tsx src/components/dashboard/WatchlistTable.test.tsx src/lib/providers/massive/news.test.ts src/lib/dashboard/research-context.test.ts src/lib/domain/news-cluster.test.ts --reporter=verbose
```

**Result:** Vitest 4.1.10 — **16 files, 37 tests, all passed**, duration 5.63s.

| File | Cases |
| --- | --- |
| `event-classify.test.ts` | export-control/filing; earnings/contract/M&A; price-only unscored |
| `news-cluster.test.ts` | hash, canonicalize, exact dedupe, similar-title cluster |
| `research-context.test.ts` | mocked bundle headlines; FF calendar; 8-K in headlines (**service mocked, no HTTP**) |
| `entity-resolve.test.ts` | provider tags; NVIDIA/Iris Energy; stopwords NOW/ALL/CAN; query aliases |
| `assemble.test.ts` | duplicate NVDA cluster; coverage ranks first |
| `search.test.ts` | parse why-IREN / AI power contracts / export-control; filter; time window exclude |
| `massive/news.test.ts` | URL canonicalize + ticker upper; drop missing URL |
| `rank.test.ts` | covered+reactive score > recycled |
| `novelty.test.ts` | hash duplicate; old similar recycled; fresh = new |
| `move-detect.test.ts` | 3%, 1.8× RVOL, extended 1.5%; window labels |
| `attribution.test.ts` | confirmed 8-K; likely wire; unknown; sympathy peer |
| `HeadlineFeed.test.tsx` | empty + search link; gap copy |
| `EventCard.test.tsx` | source URL, 2 sources, On coverage, expand, 2nd AVGO |
| `WatchlistTable.test.tsx` | Manage lists href; Unknown Why → `/news?q=` containing SPY |
| `NewsWorkspace.test.tsx` | mocked empty feed + gap; fetch throw → “Headline search unavailable” |
| `ingest.test.ts` | `materialForm`; `filingToNews` mapping **only** — **no provider HTTP** |

**Not run in this session:** full `npm test`, `typecheck`, `lint`, `build`, Playwright, browser, live Finnhub/Massive/EDGAR, cron tick, RLS as a logged-in user, saved-search round-trip.

### 8.2 Prior implementation session (same day, not re-run here)

Reported by the implementing agent, **not independently re-executed for this file:**

| Check | Claimed result | Treat as |
| --- | --- | --- |
| `npx vitest run` (full) | 118 files, 494 passed, ~37s | Stale until re-run |
| `npm run typecheck` | passed after unrelated type fixes | Stale until re-run |
| Playwright e2e | **not run** | Unverified |
| Live ingest / browser | **not run** | Unverified |
| Cron tick live | **not run** | Unverified |
| `npm run lint` | not a confirmed full run | Unverified |

If those numbers matter for a PR, re-run them. Do not cite them as current without a fresh log.

### 8.3 Schema / production data (verified this session via Supabase MCP)

- `list_migrations`: `20260815191302` `market_news_intelligence` is applied (latest).
- `execute_sql`: `market_news_items` and `news_saved_searches` exist, **RLS enabled**, **0 rows each**.

### 8.4 What the unit tests do **not** prove

- Live adapter correctness, rate limits, or entitlement
- Store upsert / FTS / RLS
- `/api/news` HTTP contract or auth
- Saved-search persistence
- Timestamp alignment of headlines vs prints
- Search quality on real wires
- False-tagging from Finnhub company-news symbol injection
- Dashboard Why with real RVOL
- Playwright demo path (and that path uses **stale fixture dates**)

---

## 9. Capability classification

Legend: **1** implemented and verified · **2** implemented, insufficiently verified · **3** implemented, should be improved · **4** partial · **5** not implemented

| Capability | Class | Evidence / gap |
| --- | --- | --- |
| Domain types + labels | **1** | Code + unit tests |
| Keyword event classification | **3** | Unit tests on a handful of titles; first-match-wins; “Fed” / sector words over-fire |
| Keyword sentiment | **3** | Honest “not a forecast” notes; too weak for desk use |
| URL/hash clustering | **2** | Unit tests on synthetic items; no live duplicate corpus |
| Novelty vs prior store | **4** | Logic unit-tested; prior store empty in prod → everything looks `new` |
| Materiality rank | **3** | Formula unit-tested; weights uncalibrated; tape reaction uses current quote |
| Entity resolution (catalog + aliases) | **3** | Unit tests for NVDA/IREN/TSM/stopwords; SKHY fake; NOW blocked; Iris Energy why-parse fails |
| Theme tagging (11 themes) | **3** | Hard-coded US/AI-infra bias; not a general taxonomy |
| Second-order peers | **3** | Static lists, confidence low; used in search ticker match (too strong) |
| Lexical search + NL parse | **3** | Parser unit-tested; AND leftover terms; no ranking quality study |
| Postgres FTS | **4** | Code present; **0 rows**; errors swallowed |
| Semantic / embedding search | **5** | Not built |
| Finnhub general + RSS ingest | **2** | Code path exists; **no live test this session** |
| Finnhub company news (8 tickers) | **3** | Cap + forced ticker tag are correctness risks |
| Massive news | **4** | Normalize unit-tested; live fail-closed untested; plan likely unentitled |
| EDGAR material forms | **2** | Mapping unit-tested; live filings untested |
| Source/gap honesty plumbing | **2** | UI unit tests with mocks; live outages unverified |
| In-process 5-min cache | **3** | Works per isolate; wrong tool for multi-instance prod |
| Cron news refresh | **4** | Wired; **once daily 14:00 UTC**; live cron not run |
| Persist `market_news_items` | **4** | Schema applied; writes unverified / likely silent-fail; 0 rows |
| Saved searches | **4** | API+UI; demo unavailable; 0 rows; no tests |
| `/news` workspace UI | **2** | jsdom empty/error; e2e written **not run** |
| Dashboard clustered feed | **2** | jsdom; live unverified; demo dates stale |
| Watchlist Why column + deep link | **2** | jsdom Unknown→`/news?q=`; live unverified |
| Coverage/inspector Why | **2** | Code; no component tests for inspector Why |
| Command-palette headline search | **3** | Implemented; can invoke 60s ingest; no tests |
| Why-moving attribution safeguards | **3** | Strong unit tests; no live calibration; sympathy/search coupling risky |
| Confirmed vs inferred UX | **3** | Labels exist; dashboard compact shows confidence not kind |
| Session windows (pre/RTH/AH) | **3** | Rolling hours ≠ Chicago “today” chip; premarket offset hack |
| Headline↔price timestamp align | **5** | Current quote only |
| Chart / ticker-detail news overlay | **5** | Ticker click goes to dashboard; no markers |
| Mobile News as primary dest | **5** | Sidebar only |
| Dedicated news permission | **5** | Uses `viewDashboard` |
| Rate-limit / backoff / shared quota | **5** | Promise.allSettled per call; Finnhub 30/min easy to blow |
| Offline / service-worker | **5** | Fetch fail → error panel only |
| LLM summaries | **5** | Intentionally omitted — keep it that way unless a new design has citations |

---

## 10. Mocked, fallback, delayed, incomplete, unverified

| Item | Reality |
| --- | --- |
| `fixtureDashboard.headlines` | 3 mock rows, `sourceQuality: "mock"`, published **2026-08-10**, tickers NVDA/AMD/AVGO, TLT/IEF, USO/XLE. **No IREN.** |
| Fixture bundle `moves` | Always `[]` |
| Playwright / `DEMO_MODE` | Entire intelligence path is fixtures. e2e “Why IREN is moving” only asserts a **heading**. Attribution will be unknown; event feed for `today` may be empty because fixtures are 5 days old. |
| `research-context.test.ts` | **Mocks** `getIntelligenceBundle` — does not ingest |
| NewsWorkspace tests | **Mocks** `fetch` |
| Massive | Fail-closed on entitlement; likely unused in cheap plans |
| Finnhub | Delayed/secondary; coverage notes say verify primary |
| RSS | Secondary except Fed/BLS/SEC/Treasury/EIA hosts which attribution treats as primary **if** they appear on the event |
| Tape RVOL in dashboard intelligence | `null` unless ticker is in movers |
| Persistence | Best-effort, errors ignored, **0 rows** |
| FTS | Dead until rows exist |
| Novelty history | Dead until rows exist |
| `buildGeneralNewsProvider` | Dead code |
| Command palette news | Unverified; live cost high |
| Cron | Unverified; daily not continuous |
| Typecheck / lint / e2e / build | Unverified in this handoff session |
| Production live Why accuracy | Unverified |

---

## 11. Known weaknesses, debt, and “works but not useful”

### Architecture

- **On-demand ingest in the request path** (news API, dashboard research, watchlist snapshot, palette). `maxDuration = 60`. Typing search can stampede Finnhub.
- **Two uncoordinated 5-minute memory caches** on serverless. Different instances diverge; cold start always refetches.
- **Persistence that cannot be observed failing** (`upsert` error ignored).
- **FTS as an afterthought** on a table nobody has filled.
- **No job that continuously ingests.** Daily cron is a briefing leftover, not a news engine.
- **Lexical AND search** will not compete with a terminal. Theme+type+leftover-term conjunctions are hostile to natural language.
- **Second-order entities in the ticker filter** over-recall sympathy names as if they were tagged issuers.
- **Forced Finnhub company-news ticker tags** raise false confirmed/likely rates.
- **Hard-coded 11 themes** centered on AI infra / power / semis. Desk coverage that is healthcare, banks, or China will look “theme-less.”
- **`SKHY`, `NOW` in theme peers** vs stopword/catalog reality.
- **No quote at headline time.** Materiality “reaction” and Why `%` are whatever the cache holds now.
- **Why regex is ticker-shaped**, not company-name-shaped.
- **Clicking a ticker abandons `/news`.**
- **Information density vs accessibility:** EventCard badge pile; Why column `min-w-[720px]` table; compact Why shows confidence only.

### Attribution failure modes to hunt

- Recycled earnings-season headlines tagged likely.
- Macro print attributed to a stock via loose theme overlap (`sector` type + “semiconductor” in body).
- Multiple real catalysts collapsed because event types match (two 8-Ks both `filing` → likely, not multiple).
- Confirmed 8-K that is routine (officer departure) vs price-moving 8-K — form type is not item-code aware (no 8-K item 2.02 vs 5.02).
- After-hours gap: 12h window vs overnight 18h parse vs “today” Chicago day.
- Watchlist Why unknown while `/news?q=TICKER` shows a cluster **outside** the move window — users will not understand the two clocks.

### Search failure modes to hunt

- `export-control news affecting semiconductors` requires **both** type and theme; leftover `news` is consumed, good; other NL queries leave junk terms.
- Ambiguous `ALL`, `CAN`, `NOW` correctly dropped — but ServiceNow and Canada stories suffer.
- `Apple` / `Ford` / `Visa` style short names: catalog two-token aliases; collisions deleted.
- FTS `websearch` operator injection is partially sanitized (`[':\\()|&!<>]` stripped) but not a full query language.

### Product gaps vs an institutional desk

- No saved **alert** when a coverage name becomes significant + unknown.
- No “confirmed only” / “exclude sympathy” filter.
- No source chip in the UI despite `source` API param.
- No novelty chip despite `novelty` filter in `NewsSearchFilters`.
- No translation of Massive/Finnhub categories into event types (keywords only).
- No peer-move matrix (who moved with this headline).
- No linkage to positions P&L (“names in the book that are unexplained”).

---

## 12. Aggressive test & improvement matrix

For each row: **reproduce first**, then fix. Prefer live keys with `DEMO_MODE=false`. Record `sources`, `gaps`, `parsed`, timestamps, and a screenshot or JSON fixture of the failing payload.

### 12.1 Search accuracy, speed, NL, aliases, ambiguous names

| Test | How | Pass bar | Likely result today | Improve |
| --- | --- | --- | --- | --- |
| `why is IREN down today` | Live `/api/news` during a real IREN move | Parsed `whyTicker=IREN`; Why panel; no “because” | Demo: heading only, unknown, no IREN fixtures | Company-name why parse; session-aware window |
| `why is Iris Energy down today` | Same | Resolves IREN | **Likely fails** (captures `Iris`) | Multi-token why regex |
| `NVIDIA` / `TSMC` / `Taiwan Semiconductor` | Search | NVDA/TSM events | Unit-tested only | Expand alias table from catalog + provider tags |
| `AI power contracts this week` | Live | Contract+power/AI infra, this week | Parser unit-tested; live unknown | Don’t AND every leftover token |
| `export-control news affecting semiconductors` | Live | Type+theme | Parser ok; live unknown | Rank should not require both if user intent is “export control in semis” |
| Ambiguous `NOW`, `ALL`, `CAN` | Titles with English | No false tickers | Unit-tested | Allow ticker if `$NOW` or `NYSE:NOW` |
| Speed | Time `/api/news` cold vs warm | Cold < 3s warm < 300ms as a target (not met by design) | Cold can hit 60s | Background ingest; don’t ingest on palette |
| Palette typing | Ctrl+K, 3 chars | No Finnhub storm | Unverified | Search cached events only; ingest off-request |

### 12.2 Duplicates, recycled, stale, conflicting, low quality

| Test | How | Pass bar | Improve |
| --- | --- | --- | --- |
| Same URL ± UTM | Two provider copies | One cluster | Already hashed; verify live |
| Same story different title | Jaccard ~0.6 | One cluster, memberCount≥2 | Tune 0.55; consider embedding later **after** lexical is solid |
| Recycled “X beats estimates” from last quarter | Prior row 40h ago similar | `recycled`, down-ranked | Needs populated store |
| Conflicting wires (upgrade vs downgrade) | Two types same ticker | `multiple` or both visible | Today two `analyst` types → likely single, not multiple |
| Blog-quality | `sourceClass` blog | Low materiality | Finnhub may still be `wire` |

### 12.3 Entity / ticker resolution

| Test | How | Pass bar | Improve |
| --- | --- | --- | --- |
| Provider tag wrong | Finnhub `related` junk | Do not confirmed-company | Trust tags less; require name corroboration |
| Forced company-news tag | Company-news row about a different issuer | Should not inherit queried ticker | **Remove or gate** the append in `finnhub/news.ts` |
| `SKHY` | Any semis story | Should not appear as a tradeable | Delete alias; map 000660.KS if needed |
| Catalog collision | Two firms sharing a 4-letter alias | Neither invented (current) vs pick-with-low-confidence | Review deleted-alias policy |

### 12.4 False causal attribution

| Test | How | Pass bar | Improve |
| --- | --- | --- | --- |
| CPI day, IREN −6% no company news | Live | unknown or speculative sympathy **only if** theme overlap | Tighten MACRO+theme |
| NVDA 8-K + AVGO −3% | Live | AVGO sympathy not confirmed | Unit-tested; verify live |
| Name +3% on no news | Live | unknown, not a stale yesterday wire | Window clocks must match UI |
| Headline after the move | Filing 2h after spike | Do not confirm using post-move print as reaction | Need tick/bar at `publishedAt` |
| “Stock jumps” only | classify | unscored, not a catalyst | Unit-tested |

### 12.5 Confirmed vs inferred calibration

Build a 30-event labeled set (desk eyeball). Target: confirmed precision ≥ 0.95; likely precision ≥ 0.7; unknown recall of truly unexplained ≥ 0.8. **No such set exists today.** Do not tune weights without it.

8-K item types (2.01 vs 5.02 vs 8.01) are a high-value schema extension.

### 12.6 Sympathy: sector, peer, commodity, macro, geo

| Case | Current | Improve |
| --- | --- | --- |
| Semis export-control, AVGO untagged | sympathy if theme/peer | Keep speculative label; add “peer moved with NVDA” evidence |
| Crude inventory, XLE | commodity type + ticker | OK if USO/XLE tagged; energy producers via theme `natural_gas` only if keywords hit |
| Geopolitics, no ticker | unknown for single names unless theme | Do not auto-explain SPY |
| Rates, TLT | fixture has TLT headline | Duration names not in THEMES |

### 12.7 Multiple catalysts / none

Two distinct types → `multiple` (unit-tested). Two 8-Ks → **not** multiple. Zero → unknown (unit-tested). UI should list supporting events (Why panel does; compact badge does not).

### 12.8 Premarket / RTH / after-hours

Compare `marketSession` vs Why window label vs search chip. Premarket 18h vs chip “premarket” (Chicago start+3h UTC) will disagree. AH prints with `extended` flag should Why even if 1d % is small — dashboard quotes must include `preMarketChangePercent` / `afterHoursChangePercent`. Coverage path does; `quotesFromCache` **does not pass pre/AH**.

### 12.9 Headline-to-price/volume timestamps

**Not implemented.** Improvement: join bars/ticks at `publishedAt` ± 5m; store `reactionAtPublish` separately from `reactionNow`. Until then, never imply the % is the reaction to that headline.

### 12.10 Integration: watchlist, sector/theme, ticker-detail, chart, deep links

| Surface | Test | Gap |
| --- | --- | --- |
| Watchlist Why | Significant row shows badge; quiet row — | Compact confidence vs attribution kind |
| Coverage Why | Theme list sympathy uses coverage maps | Stronger than dashboard |
| Inspector | Detail + evidenceNature | No test |
| Chart | Select from news | Navigates away; **no overlay** |
| Deep link | `/news?q=why is TICKER moving today` | Ignores session; fixture IREN empty |
| Positions | Unexplained names in book | **Not implemented** |

### 12.11 Provider outages, rate limits, latency, missing coverage, stale caches

| Test | Expect | Improve |
| --- | --- | --- |
| Unset Finnhub | `finnhub_unkeyed` gap | OK |
| Massive 403 entitlement | `massive_news_unentitled`, other sources continue | Code; unverified live |
| Finnhub 429 | source error; may empty company news | Retry/backoff **missing** |
| All sources fail, cache warm | stale panel | Unverified |
| Isolate cache 5 min | Second request skip ingest | Hide `fetchedAt` age in UI (partial: sources notes only) |
| `weak_entity_tags` | Shown when <25% tagged | May be the default Finnhub general state — noisy |

### 12.12 Loading, empty, partial, offline, error

NewsWorkspace: loading copy, `StatePanel` no-results, error on throw, coverage-gap panel, stale panel. **No skeleton**; **no retry button**; **no offline**. Partial (some sources ok) still renders events — good. Empty events + ok sources possible.

### 12.13 Responsive, a11y, keyboard, density

| Test | Status |
| --- | --- |
| `/news` in e2e a11y loop | Written, **not run** |
| Search label `sr-only` | Present |
| j/k | Implemented; no test |
| EventCard ticker `min-h-11` on mobile | Present |
| Why table `min-w-[720px]` | Horizontal scroll |
| Mobile News tab | Missing |
| Palette vs `/` hint on news page | Confusing |

### 12.14 Security, permissions, caching, scale, reliability

| Issue | Severity | Action |
| --- | --- | --- |
| Admin client writes saved searches (RLS bypass) | Med | Prefer user-scoped client or keep strict id checks + audit |
| Members can SELECT all `market_news_items` | Low (public wires) | Confirm no firm-private text ever lands in `raw` |
| `/api/news` authenticated but heavy | High | Authz OK; **DoS/cost** via ingest-on-search |
| FTS string still passed to `websearch` | Low | Parameterize; keep sanitization |
| Cron secret | Existing pattern | Unchanged |
| No `viewNews` | Low | Only if you need to hide news from some roles |
| Silent persist | High for correctness | Check `error`, log, metric |
| Serverless stampede | High | Single-flight exists per isolate only (`inflight`) |

---

## 13. Prioritized improvements

Impact × (risk of being wrong today) ÷ difficulty. Do these in order unless live tests contradict.

### P0 — correctness / honesty (do before marketing the feature)

1. **Check and log `persistNewsItems` errors**; add a unit test with a mocked Supabase error. Prove a row appears after live ingest.
2. **Stop appending the queried symbol onto every Finnhub company-news item** unless `related` is empty **and** the title/name resolves to that symbol.
3. **Do not ingest inside command-palette search.** Search the last bundle only.
4. **Align time windows** (attribution vs “today” chip vs premarket). Document the chosen clock in the UI.
5. **Pass pre/AH/RVOL into dashboard `quotesFromCache`** or stop claiming dashboard Why uses the same engine as coverage.
6. **Exclude `secondOrder` from hard ticker filters** (keep them as a boost, not a gate).
7. **Fix why-parse for multi-word names** (`Iris Energy`).
8. **Remove or replace `SKHY`.** Revisit `NOW` in theme peers.

### P1 — make it actually useful

9. **Background ingest** (cron every 1–5 min during US session, or a dedicated worker) writing `market_news_items`; request path reads store + cache only.
10. **Shared cache** (Supabase row `fetched_at` or existing market-data cache table) so isolates agree.
11. **Search ranking redesign:** lexical OR with type/theme as boosts; drop leftover-term AND; optional FTS once rows exist. Embeddings only after a labeled query set.
12. **8-K item codes** for confirmed vs routine filings.
13. **Why UI:** show attribution kind + confidence + window on dashboard, not confidence alone; don’t navigate away from `/news` on ticker click (filter in place + optional “open chart”).
14. **Raise company-news cap** with quota accounting, or fan-out only significant names + the selected watchlist top N.
15. **Fixture headlines:** rolling `publishedAt` (now−30m) and include IREN/NVDA company-specific rows so demo/e2e exercise Why, not just a heading.
16. **API tests** for `/api/news` (auth, parse, fixture vs live flags) and `/api/news/saved`.

### P2 — institutional grade

17. Labeled attribution/search eval set; calibrate rank weights; track precision.
18. Reaction-at-publish from bars.
19. Chart markers + ticker news drawer.
20. Alerts: significant + unknown on coverage/book.
21. Source and novelty chips; confirmed-only filter.
22. Broader theme taxonomy from desk sectors, not 11 AI-infra regexes.
23. Rate-limit, backoff, per-provider budgets.
24. Mobile News destination if the desk is phone-first.
25. Playwright live project (non-demo) behind an env flag — never default CI to live keys.

### P3 — consider redesign rather than patch

- **Search architecture:** in-memory filter of a 400-row pool will not scale. Once persist works, search should be SQL FTS (+ later embeddings) with assemble-on-read for the result ids only.
- **Attribution:** rule table keyed on (eventType, sourceClass, entityConfidence, timeDelta, itemCode) instead of a nested if-else. Easier to test and to show “why this label.”
- **Adapters:** a single `NewsIngestor` with per-source cursors/watermarks, not a full 80-item pull every request.
- **Workflow:** Why belongs **on the row as a popover with evidence**, not a round-trip to `/news?q=`. `/news` stays the research workbench.
- **Schema:** store clusters/events, not only raw items; otherwise every search re-clusters 400 json blobs. Today `raw jsonb` is the source of truth and derived columns can drift (`void persist` uses extras from the just-built events, but reassemble on read ignores stored event_type for clustering).

---

## 14. Suggested first 90 minutes for the next agent

1. Re-run §6 unit command; `npm run typecheck`; `npm run lint`.
2. `execute_sql` count `market_news_items`. If still 0, hit live `/api/news` with service role and watch server logs / upsert `error`.
3. With **live** keys and demo **off**, capture JSON for the four queries in §6. Save as fixtures for regression (redact nothing that’s already public wire copy; do not commit secrets).
4. On Market Overview, pick a name actually moving ≥3% or high RVOL. Compare dashboard Why vs `/watchlists` Why vs `/news?q=why is TICKER moving today`. Screenshot disagreements.
5. Run Playwright demo test and **record that fixture dates make “today” empty** unless you first fix fixture `publishedAt`.
6. Only then start P0 code changes. Keep news diffs isolated from the unrelated dirty tree.

---

## 15. Reproduction notes (known or strongly predicted)

These are **code-derived**. Confirm before fixing if you cannot see them live.

| ID | Prediction | Where |
| --- | --- | --- |
| R1 | Demo `/news?q=why is IREN down today` shows Why heading + unknown + possibly empty event feed | Fixtures have no IREN; dates 2026-08-10 vs “today” |
| R2 | Production FTS never contributes | 0 rows; persist ignores errors |
| R3 | Palette search can invoke full ingest | `AppShell` → `/api/news` → `searchIntelligence` → `getIntelligenceBundle` |
| R4 | Dashboard Why misses RVOL-only names not in movers | `relativeVolume: null` in `quotesFromCache` |
| R5 | Ticker search returns theme-peer hits | `search.ts` uses `secondOrder` |
| R6 | `why is Iris Energy down today` does not set `whyTicker=IREN` | Why regex single token |
| R7 | Two filings same type ≠ `multiple` | Attribution branch |
| R8 | Client `HeadlineFeed` without events looks unclassified | `headlinesAsEvents` |

---

## 16. Guardrails for improvers

- Do not import `assemble.ts` / `news-cluster.ts` into client components (`node:crypto`).
- Do not remove `enqueueDueReportRuns` from cron tick.
- Do not serve fixtures in production (`fixturesEnabled` / `mocksAllowed` fail-closed).
- Do not write LLM prose into `headline` / `detail`. If you add a model, it must cite `supportingEvents[].url` and keep unknown unknown.
- Unique persist key is `(provider_name, external_id)` with `external_id NOT NULL`.
- `WatchlistsWorkspace` must default `moveExplanations ?? []`.
- Prefer versioned SQL in `supabase/migrations/` and MCP apply; never paste-only dashboard DDL; never hosted `db reset`.
- Do not commit `.env*` or keys.

---

## 17. Bottom line

The feature is a **real, non-decorative intelligence pipeline** with honest unknown states and a coherent domain model. It is **not** production-ready as a competitive desk tool: live ingest/persistence/search quality/attribution calibration are largely unverified, the request path is too expensive, demo data cannot exercise Why-moving, and several ranking/search/attribution choices will systematically mislead if left as-is.

The next agent should treat class **1** as the small core of unit-tested functions, class **2–4** as the work, and class **5** as product decisions — not as forgotten TODOs to silently skip.

**Scoreboard to beat:** live persistence with observable writes; sub-second search over stored events; Why labels that survive a 30-example desk review without false “confirmed”; session-correct windows; no ingest on keystroke; e2e that asserts evidence, not just a heading.
