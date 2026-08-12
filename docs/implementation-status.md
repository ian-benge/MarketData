# Implementation Status

Last updated: 2026-08-12

## Summary

Phases 1–12 are **code-complete for local demo**. The **affordable real-time market-data follow-up** adds capability routing, Alpaca/Massive adapters, licensing fail-closed, and schema for refresh/cache/snapshots (see plan below). The **three-edition Close / Postmarket briefing** replaces 15:30 `close` with `close_postmarket` at 16:00 CT (collect from 15:00; early-close + 1 hour). Production readiness still requires account-owner configuration (Supabase including `20260812000000_close_postmarket_edition.sql`, Vercel, provider entitlements, Resend). Mock/demo paths fail closed in production. **Shared production real-time is not activated** until the owner completes [`owner-market-data-checklist.md`](./owner-market-data-checklist.md). Briefing details: [`briefing-implementation-status.md`](./briefing-implementation-status.md), [`automated-briefing-setup.md`](./automated-briefing-setup.md).

## Market-data follow-up

**Plan:** [`market-data-followup-plan.md`](./market-data-followup-plan.md)  
**Architecture:** [`market-data-architecture.md`](./market-data-architecture.md)

### Completed (code)

- Capability schemas, licensing, session baselines, latency/coverage labels (`src/lib/market-data/`)
- Alpaca (IEX/SIP) and Massive REST adapters + fixture/contract tests
- Capability-aware primary/fallback router; Finnhub as delayed fallback path
- Migration `20260811000000_market_data_realtime.sql` (license configs, latest observations, refresh runs, usage, report freezes)
- Env: `MARKET_DATA_*`, `ALPACA_*`, `MASSIVE_*` documented in `.env.example`
- Docs: architecture, data sources, methodology, ops, deployment, owner checklist

### Remaining owner actions

1. Purchase/entitle vendor plan (outside this repo)  
2. Complete the nine steps in [`owner-market-data-checklist.md`](./owner-market-data-checklist.md)  
3. Apply DB migration in the target Supabase project  
4. Set production secrets and license scope only after written authorization  
5. Approve scheduled activation explicitly  

### Validation (market-data follow-up)

| Command | Result |
| --- | --- |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test` | **92** passed (24 files) |
| `npm run test:e2e` | **6** passed |
| `npm run test:market-smoke` | opt-in (`MARKET_DATA_SMOKE=1` + keys); not CI default |
| `npm run build` | pass |

## Validation (2026-08-12 — three-edition Close / Postmarket)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test` | **237** passed (58 files) |
| `npm run lint` | briefing files clean; **pre-existing** dashboard/fedwatch hook errors remain (`CatalystCalendar`, `MarketChart`, `MarketChartCanvas`, `fedwatch/sources`) |
| `npm run test:pdf` | pass (`tmp/fixture-report.pdf`; stream string check still best-effort) |
| `npm run test:e2e` | briefing surfaces pass (archive Close / Postmarket filter, admin 16:00 schedule, on-demand Close / Postmarket radio). Unrelated `workspace` market-chart IWM click timed out |
| `npm run build` | pass |

## Phase checklist

| Phase | Status | Notes |
| --- | --- | --- |
| 1 Audit & plan | done | `docs/implementation-plan.md`, `assumptions.md` |
| 2 Foundation / migrations / auth shell | done | Next.js 16, Zod env, Supabase clients, SQL+RLS, demo auth |
| 3 Providers / mocks / schemas | done | Interfaces + mock + Finnhub/FRED/EDGAR/RSS/Resend |
| 4 Watchlists / dashboard | done | Seeded sectors; live dashboard UI + API |
| 5 Movers / news / content domains | done | Thresholds, clustering, citations, content builder |
| 6 AI adapters | done | OpenAI, Anthropic, Gemini + orchestration/fallback |
| 7 Job pipeline / quality gate | done | Resumable stages + MemoryReportJobStore |
| 8 Archive / PDF / downloads | done | `@react-pdf/renderer`, archive search UI |
| 9 Scheduling / email | done | Chicago schedule (07:30 / 11:30 / 16:00), Vercel cron tick/worker, `SupabaseReportJobStore`, Resend+console |
| 10 Proposals / admin | done | Admin tabs + proposal/invite APIs |
| 11 Hardening / tests / docs | done | Vitest, Playwright, full docs set |
| 12 Validation + handoff | done | See README and this file |
| MD follow-up | done | Alpaca/Massive, router, refresh/cache, report freeze, docs, validation green |

## Known limitations

- Without Supabase credentials, persistence uses fixtures/demo session cookies — not multi-user production auth.
- Free Finnhub breadth is unavailable (`null` with honest coverage labels).
- Alpaca IEX is single-exchange — not SIP/NBBO/full-market; movers are tracked-universe only.
- Massive inactive until `MASSIVE_API_KEY` + appropriate license scope.
- PDF stream text extraction is best-effort (compressed streams); visual fixture at `tmp/fixture-report.pdf`.
- Live scheduled enqueue requires Supabase service role; demo/fixtures cron is a no-op. Worker emails active team profile addresses and skips email if none exist.
- Real AI/email/market calls require owner-supplied keys in `.env`.
- Hosted DBs that already applied earlier migrations still need `20260812000000_close_postmarket_edition.sql` then `20260812000001_close_postmarket_data.sql` (two SQL Editor runs).

## Next production milestone

1. Create Supabase project; apply migrations (including market-data realtime and `close_postmarket` edition) + seed; set Auth invite-only.
2. Deploy to Vercel with cron secrets and env vars (including `ALPACA_*` / `MASSIVE_*` / `MARKET_DATA_*` as entitled).
3. Complete owner market-data checklist before shared real-time; keep Finnhub as optional delayed fallback.
4. Add FRED + one AI provider + Resend; disable `ALLOW_MOCK_PROVIDERS`.
5. Bootstrap first admin; invite a member; run one scheduled edition end-to-end under an authorized license scope.
