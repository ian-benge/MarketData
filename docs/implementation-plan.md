# Implementation Plan — IB Market Data

## Repository audit (2026-08-10)

- Workspace `C:\Projects\MarketData` was **empty** (no prior app, migrations, or design system).
- Initialized git + Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, ESLint via create-next-app.
- Package name: `market-data` (npm forbids capital letters in the folder-derived name).

## Architecture (target)

```
Next.js App Router (Vercel)
  ├─ UI: dashboard, archive, report detail, watchlists, proposals, admin
  ├─ API routes / server actions: authz → Zod → domain services
  └─ Domain services
       ├─ Providers (Market/News/Macro/Corporate/AI/Email/Scheduler)
       ├─ Material movers + news clustering + citations
       ├─ Report job pipeline (resumable stages)
       └─ Supabase (Auth, Postgres+RLS, Storage)
```

## Phases

| Phase | Scope | Touches | Dependencies | Risks |
| --- | --- | --- | --- | --- |
| 1 | Plan, assumptions, status log | `docs/*` | — | Scope creep |
| 2 | App foundation, env Zod, auth shell, SQL migrations+RLS | `src/lib`, `src/app`, `supabase/` | Supabase project (owner) | RLS gaps |
| 3 | Provider interfaces, mocks, normalization, source registry | `src/lib/providers` | — | Free API quotas |
| 4 | Watchlists/sectors seed + live dashboard | `src/app/(app)/dashboard`, services | Phase 3 | Stale data UX |
| 5 | Movers, clustering, causal labels, content domains | `src/lib/domain` | Phase 3–4 | False causation |
| 6 | AI adapters (Anthropic/Gemini/Gateway) + orchestration | `src/lib/ai` | API keys | Schema drift |
| 7 | Job pipeline + quality gate | `src/lib/reports` | Phase 5–6 | Serverless timeouts |
| 8 | Web reports, FTS archive, PDF, storage downloads | `src/app`, PDF module | Phase 7 | PDF layout bugs |
| 9 | Chicago scheduler, email, idempotency | cron routes, email | Phase 7–8 | DST / dupes |
| 10 | Proposals + admin ops | admin UI/API | Phase 2 | Privilege bugs |
| 11 | Hardening, fixtures, tests, docs | `tests`, `docs` | All | Flaky e2e |
| 12 | Full validation + handoff | scripts | All | External config |

## Validation gates (each phase)

`npm run lint` · `npm run typecheck` · `npm run test` (as suites land) · `npm run build` before handoff.

## Execution note

Proceed phase-by-phase without stopping at scaffolding. Prefer adapters + deterministic fixtures so local demo works without paid keys.
