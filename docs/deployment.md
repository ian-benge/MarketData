# Deployment

**Canonical owner walkthrough:** [`MANUAL_BACKEND_SETUP.md`](./MANUAL_BACKEND_SETUP.md).

Also use:

| Doc | Topic |
| --- | --- |
| [`BACKEND_SETUP_CHECKLIST.md`](./BACKEND_SETUP_CHECKLIST.md) | Checkbox tracker |
| [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md) | Full env inventory |
| [`PRODUCTION_LAUNCH_RUNBOOK.md`](./PRODUCTION_LAUNCH_RUNBOOK.md) | Go/no-go, pause, rotation, rollback |
| [`owner-market-data-checklist.md`](./owner-market-data-checklist.md) | Shared realtime licensing |

This page is a short operational summary. Prefer the manual for Local → Preview → Production sequencing, STOP markers, and rollback notes.

## Supabase

1. Create a project; copy URL, anon key, and service role key into Vercel / `.env`.  
2. Apply migrations and seed (see [`supabase/README.md`](../supabase/README.md)), including realtime market-data `20260811000000_market_data_realtime.sql` and briefing edition files `20260812000000_close_postmarket_edition.sql` then `20260812000001_close_postmarket_data.sql` (SQL Editor: two separate runs — new enum values cannot be used until committed):

```bash
supabase link --project-ref <project-ref>
supabase db push
# intentional bootstrap only:
psql "$DATABASE_URL" -f supabase/seed.sql
```

3. Create a Storage bucket named by `STORAGE_BUCKET` (default `reports`) for PDF artifacts. Restrict public access; serve via signed URLs from the app.

Secrets (API keys) stay in environment variables — not in `provider_configs` or `provider_license_configs` rows.

There is no required in-repo `supabase/config.toml`; migrations + `seed.sql` are the source of truth under `supabase/`.

## Vercel

1. Import the repo; set root to the app directory.  
2. Configure env vars from [`.env.example`](../.env.example) / [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md). Production must have:

   - `NODE_ENV=production` (platform default)  
   - `ALLOW_MOCK_PROVIDERS` unset or `false`  
   - `DEMO_MODE` unset or `false`  
   - `CRON_SECRET` (long random)  
   - Supabase URL + anon + service role  
   - Provider keys you intend to use  

3. [`vercel.json`](../vercel.json) registers crons for `/api/cron/tick` and `/api/cron/worker` every 5 minutes. Vercel sends the cron secret; ensure `CRON_SECRET` matches the project’s cron authorization setup (Bearer or `x-cron-secret` as implemented).

4. Set `NEXT_PUBLIC_APP_URL` to the production HTTPS origin (used for archive links, EDGAR User-Agent fallback, redirects).

5. Do **not** enable scheduled Production email until [`PRODUCTION_LAUNCH_RUNBOOK.md`](./PRODUCTION_LAUNCH_RUNBOOK.md) gates pass.

### Market-data refresh via existing cron tick

No separate Vercel cron is required for quotes. `/api/cron/tick` (5-minute cadence) enqueues due report editions **and** runs market-data refresh when the adaptive session interval is due (open / extended / closed seconds from env). Overlapping ticks rely on an advisory lock so only one refresh fetches. Do not enable aggressive client-side polling of vendor APIs.

Editions are computed in **America/Chicago** (07:30 / 11:30 / 16:00, Close / Postmarket collect from 15:00); the UTC tick is a poll interval, not fixed UTC edition times. See [`automated-briefing-setup.md`](./automated-briefing-setup.md).

**Shared production real-time is not activated by deploy alone.** Complete [`owner-market-data-checklist.md`](./owner-market-data-checklist.md) before treating the desk as licensed for team/redistributed use. `MARKET_DATA_LICENSE_ACKNOWLEDGED` is an operational guardrail only — not proof of a license.

### Required market-data secrets & config

| Variable | Required when |
| --- | --- |
| `ALPACA_DATA_KEY_ID` | Alpaca primary/fallback |
| `ALPACA_DATA_SECRET_KEY` | Alpaca primary/fallback |
| `ALPACA_STOCK_FEED` | `iex` (default) or `sip` if entitled |
| `ALPACA_DATA_BASE_URL` | Optional; default `https://data.alpaca.markets` |
| `MASSIVE_API_KEY` | Massive primary/fallback |
| `MASSIVE_API_BASE_URL` | Optional; default `https://api.massive.com` |
| `MARKET_DATA_PRIMARY` | e.g. `alpaca` |
| `MARKET_DATA_FALLBACK` | `none` \| `massive` \| `finnhub` |
| `MARKET_DATA_LICENSE_SCOPE` | Scope enum matching authorized use |
| `MARKET_DATA_LICENSE_ACKNOWLEDGED` | `true` only after owner verified current terms (guardrail, not a license) |
| `MARKET_DATA_REFRESH_OPEN_SECONDS` | Default 60 |
| `MARKET_DATA_REFRESH_EXTENDED_SECONDS` | Default 120 |
| `MARKET_DATA_REFRESH_CLOSED_SECONDS` | Default 300 |
| `MARKET_DATA_STALE_AFTER_SECONDS` | Default 180 |
| `MARKET_DATA_MAX_UNIVERSE_SIZE` | Default 80 |

Optional delayed path: `FINNHUB_API_KEY` when using Finnhub as fallback or legacy market slot. Optional free secondary earnings calendar: `ALPHA_VANTAGE_API_KEY`.

## Cron secrets

- Never expose `CRON_SECRET` to the browser.  
- Routes return 401 when the secret is wrong.  
- Locally, if `CRON_SECRET` is unset, cron is allowed only when demo/fixtures mode is on.
- Production requires `CRON_SECRET`.

## Storage

- PDFs and attachments go to Supabase Storage bucket `STORAGE_BUCKET`.  
- Download routes should authorize the session user (member+) then stream or redirect to a short-lived signed URL.

## Email

- Set `RESEND_API_KEY` and a verified `EMAIL_FROM` domain in Resend.  
- Without Resend in non-production + mocks, delivery writes to `tmp/email-outbox/`.  
- Scheduled Production email stays off until launch runbook gates pass.

## Bootstrap admin

Invite-only: no public signup.

1. Create the user in Supabase Auth (dashboard or admin API) with email matching `BOOTSTRAP_ADMIN_EMAIL`.  
2. Run `npm run bootstrap:admin` (`scripts/bootstrap-admin.ts`) with service role so a `profiles` row and **admin** `team_memberships` attach to the Research Desk firm.  
3. Confirm login works; then provision members carefully — `src/app/api/admin/invitations/route.ts` still returns fixture responses (real `inviteUserByEmail` not fully wired).

Until Supabase is configured, local **demo sessions** (`DEMO_MODE`) provide admin/member cookies for UI development only. `npm run seed` (`scripts/seed-local.ts`) is checklist-only; DB seed is `supabase/seed.sql`.

Optional: `FIRM_ID` UUID override (see env docs). Verify config with `npm run check:env` without printing secret values.
