# Manual backend setup (owner guide)

Patient, dependency-ordered walkthrough for standing up IB Market Data backends against **this repository**. Read code-backed facts here; do not invent vendor entitlements or treat env flags as licenses.

**Canonical for owner setup.** Shorter pointers live in [`deployment.md`](./deployment.md). Variable inventory: [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md). Checkbox tracker: [`BACKEND_SETUP_CHECKLIST.md`](./BACKEND_SETUP_CHECKLIST.md). Production cutover: [`PRODUCTION_LAUNCH_RUNBOOK.md`](./PRODUCTION_LAUNCH_RUNBOOK.md). Market-data licensing: [`owner-market-data-checklist.md`](./owner-market-data-checklist.md).

---

## Table of contents

- [How to use this guide](#how-to-use-this-guide)
- [A. Prerequisites](#a-prerequisites)
- [B. Ownership matrix](#b-ownership-matrix)
- [C. Environment separation (Local / Preview / Production)](#c-environment-separation-local--preview--production)
- [D. Clone, install, and local demo (no Supabase)](#d-clone-install-and-local-demo-no-supabase)
- [E. Supabase project, migrations, seed, storage](#e-supabase-project-migrations-seed-storage)
- [F. Auth, bootstrap admin, invitations gap](#f-auth-bootstrap-admin-invitations-gap)
- [G. Provider accounts and API keys](#g-provider-accounts-and-api-keys)
- [H. Market-data licensing and refresh config](#h-market-data-licensing-and-refresh-config)
- [I. Vercel (Preview then Production) and cron](#i-vercel-preview-then-production-and-cron)
- [J. Verification, rollback, and maintenance](#j-verification-rollback-and-maintenance)
- [Dependency order (summary)](#dependency-order-summary)
- [Honest gaps and blockers](#honest-gaps-and-blockers)
- [Official documentation links](#official-documentation-links)

---

## How to use this guide

1. Work **Local → Preview → Production**. Do not skip Preview for first Production cutover.
2. Check off rows in [`BACKEND_SETUP_CHECKLIST.md`](./BACKEND_SETUP_CHECKLIST.md) as you finish each step.
3. Treat every **STOP — owner action required** as a hard pause (billing, DNS, licensing, production mutations).
4. Never paste secret values into tickets, chat, or git. Verify presence with `npm run check:env` (reports present / missing / invalid without printing values).
5. Package manager is **npm** only for this repo.

---

## A. Prerequisites

| Requirement | Notes |
| --- | --- |
| Node.js + npm | Match a current LTS that can run Next.js 16 / the repo’s `engines` if present |
| Git | Clone this repository |
| Supabase account | Needed for real auth/DB/storage; **not** required for local demo |
| Vercel account | Preview + Production hosting and cron |
| Docker (optional) | For local `supabase start` if you use the CLI locally |
| Supabase CLI (optional locally; recommended for remote push) | [CLI docs](https://supabase.com/docs/guides/cli) |
| Owner authority | Ability to create paid plans, verify DNS, and accept vendor terms |

**Repo scripts you will use** (from `package.json` + expected ops scripts):

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run test:e2e` | Playwright |
| `npm run test:pdf` | PDF smoke via `scripts/verify-pdf.ts` |
| `npm run test:market-smoke` | Opt-in live market smoke (`MARKET_DATA_SMOKE=1`) |
| `npm run seed` | Checklist-only local helper (`scripts/seed-local.ts`) — does **not** write DB rows by itself |
| `npm run bootstrap:admin` | Service-role bootstrap of admin profile/membership (`scripts/bootstrap-admin.ts`) |
| `npm run check:env` | Present / missing / invalid env report without printing secret values (`scripts/check-env.ts`) |

There is **no** `supabase/config.toml` required in-repo; migrations and seed live under `supabase/`.

---

## B. Ownership matrix

| Area | Owner (typical) | Implementer / ops | Notes |
| --- | --- | --- | --- |
| Supabase project + billing | Account owner | Ops | Create project; store URL / keys in Vercel |
| Auth invitations & member access | Account owner / admin | Ops | Invite-only intended; see [invitations gap](#f-auth-bootstrap-admin-invitations-gap) |
| Market-data vendor plans & written authorization | Account owner | — | **STOP** — app does not purchase plans |
| `MARKET_DATA_LICENSE_*` flags | Account owner | Ops sets env after owner approval | Acknowledgement is a **guardrail only**, not a license |
| AI provider keys (OpenAI / Anthropic / Google) | Account owner | Ops | At least one for live drafting |
| Resend + sending domain DNS | Account owner | Ops | **STOP** — DNS / billing |
| Vercel project, domains, cron | Account owner | Ops | Cron every 5 minutes per `vercel.json` |
| Production flag cutover (`DEMO_MODE`, mocks) | Account owner + ops | Ops | Production must be mocks/demo **off** |
| Secret rotation | Ops | Ops | See runbook |

---

## C. Environment separation (Local / Preview / Production)

| Concern | Local | Preview | Production |
| --- | --- | --- | --- |
| `DEMO_MODE` | Often `true` for UI without Supabase | Prefer `false` once Supabase is wired | **Must be `false` / unset** |
| `ALLOW_MOCK_PROVIDERS` | `true` for fixture providers | Prefer `false` when testing live keys | **Must be `false` / unset** |
| Supabase | Optional | Required for real auth/DB tests | Required |
| `CRON_SECRET` | Optional if demo/fixtures allow cron | Set and match caller | **Required** |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Preview HTTPS origin | Production HTTPS origin |
| Scheduled email | Off / mock outbox | Off until gates pass | **Do not enable until Production launch gates pass** |
| Market shared realtime | Dev / solo scope only | Smoke with entitled keys | Only after owner checklist + written authorization |

Schema source of truth: [`src/lib/env.ts`](../src/lib/env.ts). Template: [`.env.example`](../.env.example).

---

## D. Clone, install, and local demo (no Supabase)

Demo mode works **without** Supabase when Supabase URL/anon are unset and `DEMO_MODE` and/or `ALLOW_MOCK_PROVIDERS` are on (`src/lib/auth/demo.ts`). Use **Enter as admin** / **Enter as member** on `/login`.

### Steps

- [ ] Clone the repo; `cd` to the project root.
- [ ] `npm install`
- [ ] `cp .env.example .env.local` and edit for local (keep secrets out of git).
- [ ] Confirm `DEMO_MODE=true` and `ALLOW_MOCK_PROVIDERS=true` for fixture-only work.
- [ ] Leave Supabase vars blank/unset for pure demo auth.
- [ ] `npm run check:env` — expect optional live keys missing; app/demo flags present.
- [ ] `npm run seed` — prints a checklist only; it does **not** apply `supabase/seed.sql`.
- [ ] `npm run dev` → open `http://localhost:3000`.
- [ ] Smoke: `npm run lint`, `npm run typecheck`, `npm run test` as needed.

**Rollback:** delete `.env.local` or flip flags; no cloud resources created yet.

---

## E. Supabase project, migrations, seed, storage

Migrations in repo:

1. `supabase/migrations/20260810000000_init.sql`
2. `supabase/migrations/20260810000001_rls_and_search.sql`
3. `supabase/migrations/20260811000000_market_data_realtime.sql`
4. `supabase/migrations/20260812000000_close_postmarket_edition.sql` (enum value only — run this first and let it commit)
5. `supabase/migrations/20260812000001_close_postmarket_data.sql` (uses `close_postmarket`; SQL Editor cannot combine 4+5 in one paste)

Seed: `supabase/seed.sql` (Research Desk firm id `a0000000-0000-4000-8000-000000000001`, instruments, watchlist, report config, non-secret provider config rows). Seed does **not** create `auth.users` / `profiles`.

### STOP — owner action required

Create / bill the Supabase project and decide Local vs hosted DB.

### Steps

- [ ] Create a Supabase project ([dashboard](https://supabase.com/dashboard)).
- [ ] Copy **Project URL**, **anon (public) key**, and **service_role** key into `.env.local` / Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (server only — never ship to the browser)
- [ ] Apply migrations (see [`supabase/README.md`](../supabase/README.md)):

```bash
# Local (Docker + CLI)
supabase start
supabase db reset   # migrations + seed.sql

# Remote
supabase link --project-ref <project-ref>
supabase db push
# intentional bootstrap only:
psql "$DATABASE_URL" -f supabase/seed.sql
```

- [ ] Create a Storage bucket named by `STORAGE_BUCKET` (default **`reports`**). Restrict public access; app should use signed URLs for PDF artifacts.
- [ ] Confirm RLS helpers exist (`auth_firm_id`, `auth_is_active_member`, `auth_is_admin`) after migrations.
- [ ] Optional: set `FIRM_ID` to the Research Desk UUID if you need an explicit override (see env docs). Seed firm id is `a0000000-0000-4000-8000-000000000001`.

**Rollback notes:** do not re-run seed on a live Production DB without a plan (upserts may be OK; destructive resets are not). Prefer migration-forward fixes over `db reset` on shared environments.

When Supabase URL + anon are set, demo cookie auth is **disabled** even if `DEMO_MODE=true`.

---

## F. Auth, bootstrap admin, invitations gap

Auth is **invite-only** by product intent (no public signup). `BOOTSTRAP_ADMIN_EMAIL` is a one-time ops bootstrap target, not an open registration endpoint.

### Bootstrap admin

- [ ] Set `BOOTSTRAP_ADMIN_EMAIL` to the owner admin email.
- [ ] Create the Auth user in Supabase (dashboard invite or Admin API) with that email.
- [ ] Run `npm run bootstrap:admin` (`scripts/bootstrap-admin.ts`) with service role available so `profiles` + **admin** `team_memberships` attach to the Research Desk firm.
- [ ] Confirm login works with real Supabase session (demo buttons should be gone once Supabase is configured).

### Invitations — known gap

`src/app/api/admin/invitations/route.ts` still returns **fixture-style responses**. Real `inviteUserByEmail` is **not fully wired** (partial). Until that is completed:

- Prefer creating users via Supabase Auth dashboard / Admin API, then ensuring membership rows exist.
- Do not assume Admin → Invitations persists real invites to Supabase.

**STOP — owner action required** before treating invitation UI as production-ready.

---

## G. Provider accounts and API keys

Adapters present in this repo: **Finnhub**, **FRED**, **EDGAR**, **RSS**, **Alpaca**, **Massive**, **Resend**, and AI trio (**OpenAI**, **Anthropic**, **Google Generative AI**).

There are **no** BLS / BEA / Treasury / EIA adapters.

### STOP — owner action required

Each vendor account, plan purchase, and domain verification is owner-owned.

| Provider | Env (high level) | Official docs |
| --- | --- | --- |
| Alpaca Market Data | `ALPACA_DATA_KEY_ID`, `ALPACA_DATA_SECRET_KEY`, `ALPACA_STOCK_FEED`, optional base URL | [docs.alpaca.markets](https://docs.alpaca.markets/), [alpaca.markets/data](https://alpaca.markets/data) |
| Massive (formerly Polygon) | `MASSIVE_API_KEY`, optional base URL | [massive.com/docs](https://massive.com/docs/), [pricing](https://massive.com/pricing) |
| Finnhub | `FINNHUB_API_KEY` | Vendor Finnhub dashboard / docs |
| Alpha Vantage | `ALPHA_VANTAGE_API_KEY` | [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key) |
| FRED | `FRED_API_KEY` | [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html) |
| RSS | `NEWS_RSS_FEEDS` (comma-separated allowlisted https URLs) | Publisher feed URLs only |
| EDGAR | `EDGAR_USER_AGENT` (else derived from app URL) | [SEC fair access](https://www.sec.gov/os/webmaster-faq#developers) |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` | [platform.openai.com](https://platform.openai.com/docs) |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | [docs.anthropic.com](https://docs.anthropic.com/) |
| Google AI | `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_MODEL` | [ai.google.dev](https://ai.google.dev/) |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM` | [resend.com/docs](https://resend.com/docs) |

### Steps

- [ ] Create keys for the providers you will actually use.
- [ ] Put secrets in `.env.local` / Vercel — **never** in `provider_configs` DB rows.
- [ ] Set `AI_DEFAULT_PROVIDER` to `openai` | `anthropic` | `gemini` matching an available key.
- [ ] For email: verify sending domain in Resend (**STOP — DNS**). Without Resend in non-prod + mocks, delivery writes to `tmp/email-outbox/`.
- [ ] `npm run check:env` to confirm required keys for your intended configuration.
- [ ] Optional live market smoke: `MARKET_DATA_SMOKE=1 npm run test:market-smoke` (read-only; not CI-default).

---

## H. Market-data licensing and refresh config

Shared production real-time is **not** activated by deploy alone.

1. Complete [`owner-market-data-checklist.md`](./owner-market-data-checklist.md).
2. Obtain **written authorization** when multi-user display, PDF, email, or redistribution is intended.
3. Set `MARKET_DATA_PRIMARY` / `MARKET_DATA_FALLBACK` (`alpaca` | `massive` | `finnhub` | `none` / `mock` only with mocks in non-prod).
4. Set `MARKET_DATA_LICENSE_SCOPE` to match authorized use.
5. Set `MARKET_DATA_LICENSE_ACKNOWLEDGED=true` **only** after the owner verified **current** vendor terms. This flag is an **operational guardrail**, not legal proof of a license.

Refresh cadence (driven by existing `/api/cron/tick`, not a separate cron):

| Band | Env | Default (seconds) |
| --- | --- | --- |
| Regular open | `MARKET_DATA_REFRESH_OPEN_SECONDS` | 60 |
| Extended | `MARKET_DATA_REFRESH_EXTENDED_SECONDS` | 120 |
| Closed | `MARKET_DATA_REFRESH_CLOSED_SECONDS` | 300 |
| Stale after | `MARKET_DATA_STALE_AFTER_SECONDS` | 180 |
| Universe cap | `MARKET_DATA_MAX_UNIVERSE_SIZE` | 80 |

Default Alpaca feed is **IEX** (`ALPACA_STOCK_FEED=iex`). Never label IEX as SIP / NBBO / full-market.

**STOP — owner action required** before `LICENSE_ACKNOWLEDGED=true` or shared Production realtime.

---

## I. Vercel (Preview then Production) and cron

[`vercel.json`](../vercel.json) registers:

| Path | Schedule |
| --- | --- |
| `/api/cron/tick` | `*/5 * * * *` (every 5 minutes) |
| `/api/cron/worker` | `*/5 * * * *` (every 5 minutes) |

Auth: `Authorization: Bearer $CRON_SECRET` or `x-cron-secret` ([`verifyCronSecret`](../src/lib/api/http.ts)). In production, `CRON_SECRET` must be set; wrong secret → 401.

Editions are **America/Chicago** (`premarket` 07:30, `midday` 11:30, `close_postmarket` collect 15:00 / publish 16:00, or early close + 1 hour). The UTC 5-minute tick **polls** for due work; it is **not** fixed UTC edition clock times. DST handled via `date-fns-tz` in `chicago-schedule.ts`. See [`automated-briefing-setup.md`](./automated-briefing-setup.md).

### STOP — owner action required

Vercel project linking, custom domain / DNS, and Production env promotion.

### Steps

- [ ] Import the Git repo into Vercel; root = app directory.
- [ ] Configure **Preview** env first (Supabase + keys; prefer mocks/demo off for realistic tests).
- [ ] Set `NEXT_PUBLIC_APP_URL` to the Preview HTTPS origin.
- [ ] Set a strong `CRON_SECRET`; confirm Vercel cron authorization matches Bearer / header implementation.
- [ ] Deploy Preview; run login, one non-distributed report path, and optional market smoke.
- [ ] Promote to Production only after Preview gates pass — see [`PRODUCTION_LAUNCH_RUNBOOK.md`](./PRODUCTION_LAUNCH_RUNBOOK.md).
- [ ] Production env **must** have `ALLOW_MOCK_PROVIDERS=false` (or unset) and `DEMO_MODE=false` (or unset).

**Do not** enable scheduled Production email delivery until go/no-go gates pass.

**Rollback:** revert Vercel deployment; unset or rotate compromised secrets; pause cron by removing/disabling schedules or rotating `CRON_SECRET` so ticks 401 (coordinate carefully).

---

## J. Verification, rollback, and maintenance

### Minimum verification sequence

- [ ] `npm run check:env` (per environment)
- [ ] `npm run lint` && `npm run typecheck` && `npm run test`
- [ ] `npm run build`
- [ ] Login as bootstrap admin (real Supabase) or demo (local only)
- [ ] Cron: authorized POST to `/api/cron/tick` and `/api/cron/worker` returns 200; unauthorized returns 401
- [ ] Market labels honest (IEX ≠ SIP); optional `MARKET_DATA_SMOKE=1 npm run test:market-smoke`
- [ ] Storage bucket `reports` (or `STORAGE_BUCKET`) accepts PDF archive path
- [ ] Generate brief (fixtures off): queue an edition → job completes → PDF in Storage → row in `reports` → visible in Research Archive → download works
- [ ] Email: Resend verified **or** local mock outbox only — no Production schedule until runbook gates pass

### Recurring maintenance

- Re-verify vendor terms when changing providers, feeds (IEX→SIP), or surfaces (PDF/email).
- Rotate `CRON_SECRET`, service role, and provider keys on a schedule or after suspected leak.
- Monitor admin market-data status, usage, and delivery failures ([`operations-runbook.md`](./operations-runbook.md)).
- Keep migrations applied; do not store API keys in Postgres config tables.

---

## Dependency order (summary)

```text
1. npm install + .env.local (demo OK)
2. Supabase project → migrations → seed → storage bucket
3. BOOTSTRAP_ADMIN_EMAIL + Auth user + npm run bootstrap:admin
4. Provider keys (market / macro / news / AI / email) as needed
5. Market-data owner checklist + written authorization (if shared/redistributed)
6. Vercel Preview env + deploy + cron secret
7. Preview verification
8. Production env (mocks/demo off) + deploy
9. Production go/no-go (PRODUCTION_LAUNCH_RUNBOOK) — email last
```

---

## Honest gaps and blockers

| Gap | Impact |
| --- | --- |
| Demo without Supabase | Fine for UI; not a Production posture |
| Admin invitations API fixture responses | Real Supabase invite flow incomplete |
| `npm run seed` checklist-only | DB seed is `supabase/seed.sql` / `db reset` |
| `MARKET_DATA_LICENSE_ACKNOWLEDGED` | Guardrail only — needs written authorization for shared prod |
| No BLS/BEA/Treasury/EIA | Macro beyond FRED / calendar placeholders not covered |
| Production mocks/demo | Forbidden; `mocksAllowed` fail-closed |
| AI keys optional | Generate brief / worker mock-draft until OpenAI / Anthropic / Gemini keys are set; prices still live |

---

## Official documentation links

| Service | Link |
| --- | --- |
| Supabase | [https://supabase.com/docs](https://supabase.com/docs) |
| Supabase CLI | [https://supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli) |
| Vercel | [https://vercel.com/docs](https://vercel.com/docs) |
| Vercel Cron | [https://vercel.com/docs/cron-jobs](https://vercel.com/docs/cron-jobs) |
| Resend | [https://resend.com/docs](https://resend.com/docs) |
| OpenAI | [https://platform.openai.com/docs](https://platform.openai.com/docs) |
| Anthropic | [https://docs.anthropic.com/](https://docs.anthropic.com/) |
| Google AI / Gemini | [https://ai.google.dev/](https://ai.google.dev/) |
| Alpaca docs | [https://docs.alpaca.markets/](https://docs.alpaca.markets/) |
| Alpaca data plans | [https://alpaca.markets/data](https://alpaca.markets/data) |
| Massive docs | [https://massive.com/docs/](https://massive.com/docs/) |
| Massive pricing | [https://massive.com/pricing](https://massive.com/pricing) |
| FRED API keys | [https://fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html) |
