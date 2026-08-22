# Desk Intelligence — Tester & Improver Handoff

**Audience:** the next agent that will independently challenge this system. Treat this report as evidence, not as permission to stop looking.

**Date:** 2026-08-15 (evening pass)  
**App:** Next.js 16.3 App Router + React 19  
**Hosted Supabase:** `grelplmmgywqoliqzrfi`  
**This pass:** source inspection, Vitest, `npm run test:desk-intel`, `tsc`. Live UI / Playwright / `next build` / production gateway were **not** re-run as a full suite.

The prior tester report (same day) was treated as a hypothesis list. Several remaining items were real. One “catalog scrub” idea was wrong: `SPCX` **is** in the instrument catalog (SPAC and New Issue ETF). Catalog membership alone cannot kill SpaceX overtags.

---

## 0. What Desk Intelligence is intended to do

Not a chatbot. Compile tape + clustered headlines + coverage + calendar + open book into an evidence pack, write a deterministic rules compilation, optionally overlay a model, then throw away invented numbers, citations, tickers, or attribution upgrades. Unknown stays unknown.

---

## 1. How the system actually works after this pass

Two layers, one product:

| Layer | Path | Role |
|---|---|---|
| Deterministic headline stack | `src/lib/intelligence/` | Ingest → cluster → classify → entity-resolve → rank → attribute |
| Desk compiler + overlay | `src/lib/desk-intel/` | Evidence pack, rules compile, optional overlay, grounding, cache |

**Runtime path**

1. `loadDeskPack` / `buildEvidencePack` assembles sources, events, significant moves, quotes, optional positions, calendar, gaps, allowed tickers.
2. `compile*` writes the trader-facing object with no model.
3. **New:** UI fetches `?rules=1` (or Ask `rulesOnly: true`) in parallel with the full request. Rules paint immediately. Overlay replaces when grounded. Rules-only responses are **not** written to the main cache, so they cannot block overlay.
4. If credentials exist and overlay is not on cooldown, `generate*` calls `AiOrchestration` (15s / 1 attempt).
5. `ground*` strips invented numbers, uncited facts, disallowed / unmentioned tickers, attribution upgrades. Failure → rules envelope.
6. `cachedOrGenerate` keys on firm + kind + subject + evidence hash + **prompt version** (`@v3` for session/move/book/digest/ask).

**Surfaces**

- Dashboard `SessionIntelligence` — rules first, then overlay; count strip; unexplained tape; book flags; themes; Ask.
- Material News — `NewsDigestPanel` + `DeskAsk` + `MoveNarrativeLoader` (errors no longer silent).
- Watchlist / inspector / movers — selected-name narrative, same two-phase fetch.
- Positions `BookRiskPanel` — rules first; **polls every 60s** so a just-published filing can flash without a full reload.
- Cron `/api/cron/intel` (15m) and tick write session brief **and** book risk, then page new HIGH unexplained book names.

**APIs:** `GET/POST /api/intel/session` (`?rules=1`, `?refresh=1`), `GET /api/intel/move?rules=1`, `POST /api/intel/moves`, `GET /api/intel/book-risk?rules=1`, `GET /api/intel/digest?rules=1`, `POST /api/intel/ask` (`rulesOnly`).

---

## 2. Prior claims that did not hold (this pass)

| Claim | Actual |
|---|---|
| Traders still stare at “Compiling…” until the model returns | **Was true.** Session / digest / book / move / Ask all waited on overlay. Now two-phase: rules paint, overlay replaces, “Refining…” on `GenerationMeta`. |
| Scrub theme tickers the same way as catalog-absent provider tags | **Half-wrong.** `SPCX` is a real catalog ticker (`SPAC and New Issue ETF`). A catalog-only filter kept SPCX on an IREN theme note in unit tests. Correct rule: **desk membership (book / coverage / tape) or mentioned in evidence text**. |
| Move loader “no silent catch” | **Still swallowed errors.** `if (result.ok) setEnvelope` with no error state. Now shows the error string. |
| Alerts are not connected | **Was true.** SURG-class unexplained book names now email once per ticker per UTC day via `desk_intelligence_briefs` subject `alert:TICKER:YYYY-MM-DD`. |
| Reaction-at-publish exists | **Did not.** Compile now marks primary filings ≤15m old on quiet book names as HIGH “Just published”. Book panel polls 60s. This is **not** ingest-within-a-minute — the intelligence bundle TTL is still 5 minutes. |

---

## 3. Weaknesses found (and disposition)

### Intelligence quality

- Theme notes could name `SPCX` / `GOOGM` because compile listed raw `event.tickers` and grounding did not scrub free-text ticker tokens. **Fixed** (`tickers.ts`, compile, grounding). Residual: a ticker that is both on the tape **and** a junk overtag will still appear (correct — tape membership wins).
- Unknown moves still never go to the model (`unknown_not_narrated`). Re-tested.
- Conflicting headlines / incomplete stories: still `inference` with citations. No print-at-headline-time.

### Workflows

- Paint-rules-first. **Fixed** for session, digest, book, move, Ask.
- Unexplained book names did not page anyone. **Fixed** (email, daily dedupe). Not SMS / in-app toast.
- Just-published book filings waited for a 15-minute cron and a page remount. **Partial:** compile flash + 60s poll. Ingest cadence unchanged.
- `POST /api/intel/moves` still unused by UI. Still acceptable.

### Reliability / cost

- Two requests per first paint (rules + overlay). Rate limits (20–40/min) absorb it. Refresh / book poll is overlay-only.
- Rules-only must **not** populate the main cache. If it does, overlay never runs. Covered by `cachedOrGenerate({ rulesOnly })` skipping `memory.set` / `saveBrief`.
- Prompt versions bumped to `@v3` so v2 rows miss.
- Unique index on `desk_intelligence_briefs` is still `(firm_id, kind, subject, evidence_hash)` — **not** `prompt_version`. Upsert overwrites. Fine for one live row; do not assume two prompt versions can coexist.

### UI / UX

- Move loader silent errors. **Fixed.**
- Overlay in flight is a muted “Refining…”, not a grounding-note badge.

### Security

- Injection patterns unchanged this pass (already expanded). Eval still refuses.
- Book-alert email has no P&L. Cron pack has tickers, not weights.

---

## 4. Improvements implemented (why they matter)

### Paint rules first

- `GenerateOptions.rulesOnly` short-circuits `shouldCallModel`.
- `GET ?rules=1` / Ask `{ rulesOnly: true }`.
- `fetchIntelProgressive` starts overlay immediately, paints rules if overlay has not arrived, never overwrites overlay with a late rules response.
- Traders see the deterministic brief in pack-compile time, not model time. Overlay failure is a no-op if rules already painted.

### Theme / ticker hygiene

- `trustedDeskTicker` / `scrubFreeTextTickers` in `src/lib/desk-intel/tickers.ts`.
- Compile theme notes, digest clusters, material-now chips, and Ask claims use it.
- Grounding scrubs theme notes, headlines, digest cluster notes, and Ask answers.
- `tickerMentionedInText` is now exported from entity-resolve.

### Book alerts (SURG-class)

- `src/lib/desk-intel/book-alerts.ts`
- HIGH `unexplained_move` on a real book ticker → firm email.
- Dedupe: `loadBrief` / `saveBrief` with subject `alert:SURG:2026-08-15`, hash `unexplained-book`.
- Wired from `/api/cron/intel` and `/api/cron/tick` after book-risk compile.
- Copy states unknown stays unknown. Links to why-moving and blotter.

### Reaction-at-publish (slice)

- `isJustPublished` (15m) on primary filings.
- Quiet book names get HIGH catalyst + “Just published · ”.
- Book flags on session brief get the same prefix when a fresh primary is on that name.
- Book-risk items ranked: unexplained → just-published → other high.
- Book panel 60s poll (cache hit is cheap; new evidence hash misses).

### Eval

- Fixture eval now also checks theme junk scrub, just-published flash, and unexplained in-book HIGH.

---

## 5. What a trader should feel

**Dashboard**

- Session brief appears as **Rules compilation** quickly, then may upgrade to **Model synthesis** with “Refining…” in between.
- Unexplained tape still named. No invented METC/SURG story.

**Material News**

- Digest paints rules first. Why-moving shows an error instead of going blank.
- Theme / cluster ticker chips should not show GOOGM. SPCX only if it is actually on the tape or mentioned.

**Positions**

- Book risk paints immediately; a just-published 8-K on a quiet lot should read HIGH “Just published” once the pack contains that event.
- First SURG-class unexplained print in a UTC day should email the firm (if Resend is configured and not demo).

---

## 6. Architecture, performance, security, reliability, cost

| Area | Change |
|---|---|
| First paint | Rules request + overlay in parallel. Rules not cached as the official brief. |
| Latency | Overlay still 15s / 1 attempt. Traders are no longer blocked on it. |
| Alerts | Email only; daily dedupe in `desk_intelligence_briefs`. In-process rate limits still reset on cold start. |
| Ticker hygiene | Mention + desk membership, not catalog-only. |
| Cache | Prompt `@v3`. Unique key still omits `prompt_version`. |
| Privacy | Alert email has no weights / P&L. |

---

## 7. Scenarios, tests, and visual checks

### Automated (this pass)

```
npx vitest run src/lib/desk-intel src/lib/ai/orchestration.test.ts \
  src/lib/intelligence/entity-resolve.test.ts src/components/intel \
  src/app/api/intel src/components/news/NewsWorkspace.test.tsx
```

**Result:** 12 files, **60 tests passed** (2026-08-15 17:45 CT).

`npx tsx scripts/desk-intel-eval.ts` — **12 cases ok**, exit 0:

- XYZ unknown catalyst preserved
- IREN confirmed against primary 8-K
- Session brief keeps unexplained tape
- Book risk overlaps IREN
- Why-IREN retrieved from evidence
- Prompt-injection refused
- Hallucinated XYZ blocked
- Invented index level rejected
- Cited IREN ask remains grounded
- Theme notes scrub catalog-absent / unmentioned tags
- Just-published book filing flashed high
- Unexplained in-book tape stays high and unknown

`npx tsc -p tsconfig.check.json --noEmit` — **exit 0**

### Not run this pass

- Playwright
- `npm run build`
- Live localhost UI (dev server was up; this agent did not complete a logged-in visual pass)
- Production gateway
- A real Resend send of a book alert

Do not invent those results.

---

## 8. Remaining limitations (honest)

1. **Live overlay quality still depends on keys.** Rules-first makes outages less painful; it does not make prose tighter.
2. **Evidence window is still ~48h / process cache.** Second-order names stay thin.
3. **Ask is still session-scoped retrieval.**
4. **Pack load can still be slow.** Rules-first only skips the model. A cold digest pack can still stall before the first paint.
5. **Reaction-at-publish is not ingest-within-a-minute.** Just-published scoring requires the event to already be in the intelligence bundle (5-minute TTL, 15-minute intel cron, or a forced ingest).
6. **Book alerts are email-only**, once per ticker per UTC day. No in-app flash, no owner-only routing, no cooldown across deploys except the Postgres row.
7. **In-process rate limits** still reset on cold start.
8. **No per-firm token budgets.** `ai_usage_events` still records tokens; nothing caps them.
9. **No 30–50 labeled live-session eval.** Fixture eval grew; production miss-rate is unmeasured. Hybrid search still should wait.
10. **`POST /api/intel/moves` unused by UI.**
11. **Percentages next to headlines are still the current quote**, not the print at headline time.
12. Working tree still contains **unrelated uncommitted** dashboard/watchlist/positions work. Do not bundle this into an unrelated PR.

---

## 9. Manual setup

No dashboard SQL. `desk_intelligence` migration is already on the hosted project. **Do not `db reset`.** Book alerts reuse `desk_intelligence_briefs`; no new table.

For overlay + email:

1. Prefer `AI_GATEWAY_API_KEY`, or Vercel OIDC (`VERCEL=1`).
2. Or `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`.
3. `RESEND_API_KEY` for SURG-class emails. Demo / fixtures skip send.
4. Optional: `DESK_INTEL_MODEL_FAST`, `DESK_INTEL_MODEL_STRONG`, `DESK_INTEL_ENABLED`, `DESK_INTEL_IN_FIXTURES`.
5. Leftover local `VERCEL_OIDC_TOKEN` is still ignored on purpose.

---

## 10. Highest-value next work

1. **Prove paint-rules-first on a live cold pack** (dashboard + `/news` digest). Measure time-to-rules vs time-to-overlay. If pack load dominates, split pack assembly from overlay more aggressively (shared in-memory pack for the two requests).
2. **True reaction-at-publish** — hook primary filings at ingest (not 5-minute bundle TTL) and push book-risk without waiting for cron. The compile flag is ready; the bus is not.
3. **In-app book-risk flash** next to the email (SURG on the blotter, not only inbox).
4. **Labeled eval set** of 30–50 live sessions. Fixture coverage is still synthetic.
5. **Per-firm token budgets** from `ai_usage_events`.
6. **Hybrid search** only after lexical miss-rate is measured.
7. **Include `prompt_version` in the unique cache index** if two versions must coexist.

Do not add a general chat sidebar. Do not generate causal copy for unknown tape. Do not treat catalog membership as proof a ticker belongs on a headline.

---

## 11. Exact verification evidence

| Check | Result |
|---|---|
| Vitest desk-intel + intel UI/API + entity-resolve + orchestration | **60 passed / 12 files** (2026-08-15 17:45 CT) |
| `npx tsx scripts/desk-intel-eval.ts` | **12 ok**, exit 0 |
| `npx tsc -p tsconfig.check.json --noEmit` | **exit 0** |
| `npm run build` | **not run** |
| Live UI | **not completed this pass** |
| Playwright | **not run** |
| Real book-alert email | **not sent** (unit-tested with injected `send`) |

Independent finding used in tests: `SPCX` resolves to “SPAC and New Issue ETF” in `instrument-catalog.ts`. Entity-resolve already dropped it from the SpaceX card via “not mentioned + overtag list”. Theme compile did not.

---

## 12. Honesty rules for the next agent

- Do not invent Playwright, live UI, lint-full, or production-gateway results.
- Do not treat model synthesis on a cached dashboard as proof overlay is production-safe.
- Demo/fixture mode does not call live wires or the model unless explicitly enabled. Book alerts skip in fixtures unless a test injects `send`.
- Never fill METC/SURG-class gaps with a guessed story.
- Stay inside Desk Intelligence unless a collision is proven. The working tree is mixed.
