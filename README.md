# IB Market Data

Private market-intelligence workspace for scheduled briefings (premarket / midday / Close / Postmarket in **America/Chicago**), a market overview, research archive, shared watchlists, proposals, and Data Operations. Built with Next.js App Router, Supabase, and replaceable provider adapters.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run check:env
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`. If the execution policy blocks the `npm.ps1` shim, use `npm.cmd` for the npm commands. Do not overwrite an existing `.env.local` that contains credentials.

The template already enables the fixture demo. Keep `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` blank; do not add placeholder credentials. Setting both the Supabase URL and anon key disables demo-cookie sign-in even when `DEMO_MODE=true`.

Open [http://localhost:3000](http://localhost:3000), then use **Enter as admin** or **Enter as member** on `/login`. No Supabase project or paid provider key is required for this local path.

### Demo mode

| Flag | Effect |
| --- | --- |
| `DEMO_MODE=true` | Cookie-based demo sessions when Supabase is not configured |
| `ALLOW_MOCK_PROVIDERS=true` | Mock market/news/macro/corporate/AI/email when live keys are missing (`NODE_ENV !== production`) |

Mocks are **forbidden in production** (`mocksAllowed` fail-closed). Fixture dashboard/archive data is served when demo auth is active.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest unit/integration |
| `npm run test:e2e` | Playwright e2e (starts `npm run dev` with demo env) |
| `npm run build` | Production build |
| `npm run seed` | Local seed helper (checklist only; DB seed via Supabase) |
| `npm run bootstrap:admin` | Bootstrap admin profile/membership (service role) |
| `npm run check:env` | Report present/missing/invalid env (no values printed) |
| `npm run test:pdf` | Smoke-render a PDF via `@react-pdf/renderer` |
| `npm run test:market-smoke` | Opt-in live market smoke (`MARKET_DATA_SMOKE=1`) |

## Backend setup

Owner-facing stand-up (Supabase, Vercel, providers, licensing, Production gates):

| Doc | Topic |
| --- | --- |
| [docs/MANUAL_BACKEND_SETUP.md](docs/MANUAL_BACKEND_SETUP.md) | Full walkthrough (canonical) |
| [docs/BACKEND_SETUP_CHECKLIST.md](docs/BACKEND_SETUP_CHECKLIST.md) | Checkbox tracker |
| [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) | Env inventory from `src/lib/env.ts` |
| [docs/PRODUCTION_LAUNCH_RUNBOOK.md](docs/PRODUCTION_LAUNCH_RUNBOOK.md) | Go/no-go, pause, rotation, rollback |
| [docs/owner-market-data-checklist.md](docs/owner-market-data-checklist.md) | Shared realtime licensing steps |

Production must keep `ALLOW_MOCK_PROVIDERS=false` and `DEMO_MODE=false`. Do not enable scheduled Production email until the launch runbook gates pass.

## Environment overview

See [`.env.example`](.env.example) and [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md). Important groups:

- **App / cron:** `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`
- **Flags:** `ALLOW_MOCK_PROVIDERS`, `DEMO_MODE`
- **Supabase:** URL, anon key, service role, `BOOTSTRAP_ADMIN_EMAIL`, optional `FIRM_ID`
- **Market routing:** `MARKET_DATA_*`, `ALPACA_*`, `MASSIVE_*`
- **Market / news / macro:** `FINNHUB_API_KEY`, `ALPHA_VANTAGE_API_KEY` (secondary earnings calendar), `FRED_API_KEY`, `NEWS_RSS_FEEDS` (comma-separated allowlisted URLs), optional `EDGAR_USER_AGENT`
- **AI:** OpenAI / Anthropic / Gemini keys + models, `AI_DEFAULT_PROVIDER`
- **Email:** `RESEND_API_KEY`, `EMAIL_FROM`
- **Storage:** `STORAGE_BUCKET` (default `reports`)

## Documentation

| Doc | Topic |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Boundaries, data flow, adapters |
| [docs/data-sources.md](docs/data-sources.md) | Finnhub, FRED, RSS, EDGAR, Resend |
| [docs/report-methodology.md](docs/report-methodology.md) | Coverage, movers, causality, citations |
| [docs/scheduling-and-jobs.md](docs/scheduling-and-jobs.md) | Chicago schedule, cron, stages |
| [docs/automated-briefing-setup.md](docs/automated-briefing-setup.md) | Env, migrations, cron, recipients, fixture mode |
| [docs/briefing-implementation-status.md](docs/briefing-implementation-status.md) | Three-edition briefing status |
| [docs/deployment.md](docs/deployment.md) | Short deploy pointer → MANUAL_BACKEND_SETUP |
| [docs/security.md](docs/security.md) | Threat model, RLS, SSRF, invite-only |
| [docs/operations-runbook.md](docs/operations-runbook.md) | Failures, retries, delivery |
| [docs/assumptions.md](docs/assumptions.md) | Product assumptions |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Phased plan |
| [docs/implementation-status.md](docs/implementation-status.md) | Status log |

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase · Zod · Vitest · Playwright · `@react-pdf/renderer`
