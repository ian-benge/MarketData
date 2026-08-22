# Backend setup checklist

Owner/ops tracker for IB Market Data backend stand-up. Status starts as **pending**. Update Status / Evidence / Notes as you complete each row. Do not store secret values in Evidence — record “set in Vercel Preview”, screenshot names, ticket IDs, or command exit codes only.

Canonical walkthrough: [`MANUAL_BACKEND_SETUP.md`](./MANUAL_BACKEND_SETUP.md). Env inventory: [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md). Production cutover: [`PRODUCTION_LAUNCH_RUNBOOK.md`](./PRODUCTION_LAUNCH_RUNBOOK.md). Market licensing: [`owner-market-data-checklist.md`](./owner-market-data-checklist.md).

**Status values:** `pending` | `in_progress` | `blocked` | `done` | `n/a`

---

## Checklist

| Step | Status | Owner | Environment | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| Read MANUAL_BACKEND_SETUP + this checklist | done | Owner | All | Owner confirmed ownership of all accounts; launch mode = Local demo | 2026-08-10 |
| Node/npm available; clone repo | done | Ops | Local | Repo at C:\Projects\MarketData; npm in use | |
| Copy `.env.example` → `.env.local` | done | Ops | Local | DEMO_MODE / mocks present per check:env | Do not paste secrets in chat |
| Local demo: `DEMO_MODE` / mocks on, Supabase unset | done | Owner | Local | Owner verified demo login admin+member | Mode A; 2026-08-10 |
| `npm run check:env` (local) | done | Ops | Local | Schema parse OK (2026-08-10); DEMO_MODE/ALLOW_MOCK present; Supabase keys defaulted/missing | Values not printed |
| `npm run seed` checklist printed | n/a | Owner | Local | Skipped for mode A | Optional later |
| `npm run lint` / `typecheck` / `test` | done | Owner | Local | lint/tsc OK; vitest 92 passed (2026-08-10) | |
| `npm run dev` + demo login | done | Owner | Local | Admin + member demo paths verified by owner | Member blocked from admin |
| **STOP:** Create Supabase project (billing) | done | Owner | Shared | Project ref grelplmmgywqoliqzrfi | 2026-08-11 |
| Set Supabase URL + anon + service role | done | Owner | Local | check:env present (no values printed) | Demo login will be off |
| Apply migrations `20260810000000_init` | done | Owner | Hosted | Owner ran SQL Editor | 2026-08-11 |
| Apply migrations `20260810000001_rls_and_search` | done | Owner | Hosted | Owner ran SQL Editor | 2026-08-11 |
| Apply migrations `20260811000000_market_data_realtime` | done | Owner | Hosted | Owner ran SQL Editor | 2026-08-11 |
| Apply migrations `20260812000000_close_postmarket_edition` | pending | Owner | Hosted | | Enum add only; must commit before the next file |
| Apply migrations `20260812000001_close_postmarket_data` | pending | Owner | Hosted | | Migrates `close` rows; columns; `canonical_json`. Do not paste with the enum file in SQL Editor |
| Apply `supabase/seed.sql` (intentional) | done | Owner | Hosted | firms count=1 via check:supabase | 2026-08-11 |
| Create Storage bucket (`STORAGE_BUCKET`, default `reports`) | done | Owner | Hosted | Owner created private `reports` bucket | 2026-08-11 |
| Storage: service role write; authenticated firm members read `report_files` via RLS | pending | Owner | Hosted | | Required for live PDF download |
| Optional `FIRM_ID` UUID override | pending | Ops | As needed | | Seed firm `a0000000-0000-4000-8000-000000000001` |
| Set `BOOTSTRAP_ADMIN_EMAIL` | done | Owner | Local | Used for bootstrap | |
| Create Auth user for bootstrap email | done | Owner | Hosted | Dashboard create user + auto-confirm; no invite email | Rate-limit avoided |
| `npm run bootstrap:admin` | done | Owner | Local | profiles=1 memberships=1; rest 200 | Grants SQL applied |
| Confirm real Supabase login (demo off path) | done | Owner | Local | Owner signed in after dashboard password | Demo buttons off |
| Smoke: Generate brief (fixtures off) → Close/Postmarket → Storage PDF + `reports` row → Archive → download | pending | Owner | Local / Preview | | See automated-briefing-setup.md; mock AI until keys set |
| Document invitations API gap (fixtures) | done | Ops | All | POST returns 503 when demo off; GET empty list | Wire inviteUserByEmail later |
| **STOP:** Member invites via Supabase until API wired | pending | Owner / Admin | Prod | | Partial inviteUserByEmail |
| **STOP:** Alpaca / Massive account + plan | done | Owner | Local | Paper IEX keys; smoke OK | Not licensed for team share |
| Set `ALPACA_*` and/or `MASSIVE_*` | done | Owner | Local | check:env present; smoke 5 IEX quotes | Massive unset |
| Set Finnhub / FRED / RSS / EDGAR as needed | pending | Ops | Preview / Prod | | No BLS/BEA/Treasury/EIA adapters |
| **STOP:** AI provider account(s) | pending | Owner | — | | Anthropic / Google / AI Gateway |
| Set AI keys + `AI_DEFAULT_PROVIDER` | pending | Ops | Preview / Prod | | |
| **STOP:** Resend account + domain DNS | pending | Owner | — | | Billing + DNS |
| Set `RESEND_API_KEY` + `EMAIL_FROM` | pending | Ops | Preview / Prod | | |
| Complete owner-market-data-checklist | pending | Owner | — | | Written authorization |
| Set `MARKET_DATA_PRIMARY` / `FALLBACK` | done | Owner | Local | Alpaca primary; Massive unset | 2026-08-11 |
| Set `MARKET_DATA_LICENSE_SCOPE` | done | Owner | Local | Present in env; smoke used dashboard surface | Keep single_user_development |
| Set `MARKET_DATA_LICENSE_ACKNOWLEDGED` | done | Owner | Local | Present; must stay false for unlicensed team use | Guardrail only |
| Configure refresh / stale / universe env | done | Owner | Local | Defaults in use | |
| `MARKET_DATA_SMOKE=1 npm run test:market-smoke` | done | Ops | Local | 5 quotes; Real-time — IEX; provider alpaca | 2026-08-11 |
| Verify feed labels (IEX ≠ SIP) | done | Ops | Local | Smoke asserted IEX not SIP/NBBO | Confirm in UI after restart |
| **STOP:** Vercel project + domain DNS | pending | Owner | Preview / Prod | | |
| Configure Preview env vars | pending | Ops | Preview | | Prefer mocks/demo false |
| Set Preview `NEXT_PUBLIC_APP_URL` + `CRON_SECRET` | pending | Ops | Preview | | |
| Deploy Preview | pending | Ops | Preview | | |
| Cron tick/worker authorized on Preview | pending | Ops | Preview | | Every 5 min; Chicago editions |
| Preview go/no-go (no scheduled prod email) | pending | Owner / Ops | Preview | | |
| Production env: `ALLOW_MOCK_PROVIDERS=false` | pending | Ops | Production | | Required |
| Production env: `DEMO_MODE=false` | pending | Ops | Production | | Required |
| Production `CRON_SECRET` set | pending | Ops | Production | | Required |
| Deploy Production | pending | Ops | Production | | |
| Production launch gates (runbook) | pending | Owner / Ops | Production | | |
| **STOP:** Enable scheduled Production email | pending | Owner | Production | | Only after gates pass |
| Secret rotation plan documented | pending | Ops | All | | |
| Rollback / pause plan acknowledged | pending | Owner / Ops | Production | | |

---

## Quick reference — scripts

| Command | Checkpoint |
| --- | --- |
| `npm run check:env` | Env present/missing/invalid |
| `npm run bootstrap:admin` | Admin profile + membership |
| `npm run seed` | Local checklist printout |
| `npm run test:market-smoke` | Live market smoke (opt-in) |
| `npm run test:pdf` | PDF renderer smoke |
| `npm run build` | Production build |
