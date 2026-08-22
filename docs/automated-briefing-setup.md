# Automated briefing setup

How to run the three-edition briefing pipeline in demo vs production. Companion: [`briefing-implementation-status.md`](./briefing-implementation-status.md), [`scheduling-and-jobs.md`](./scheduling-and-jobs.md), [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md), [`MANUAL_BACKEND_SETUP.md`](./MANUAL_BACKEND_SETUP.md).

## What you get

On each valid U.S. equity trading day (weekdays minus the static NYSE holiday set):

1. **Premarket** — collect and publish 07:30 America/Chicago  
2. **Midday** — collect and publish 11:30 America/Chicago  
3. **Close / Postmarket** — collect from 15:00 CT; PDF, archive, and email wait until **16:00 CT** (or official NYSE early close + 1 hour)

Do not expect a 15:30 close mail or a later fourth postmarket mail. Earnings “postmarket / AMC” on the dashboard is session timing, not a briefing edition.

Filenames: `IB_Market_Data_YYYY-MM-DD_{Premarket|Midday|Close_Postmarket}.pdf`.

## Fixture / demo mode (no live email)

Local demo (`DEMO_MODE=true`, Supabase keys blank, `ALLOW_MOCK_PROVIDERS=true`, `NODE_ENV !== production`):

- Archive, on-demand generator, and PDFs use fixtures.
- `POST /api/reports` returns a session-only stub (`rpt-demo-ondemand-…`, `demo: true`, message contains `"fixture session only"`). It does **not** run the pipeline.
- `POST /api/cron/tick` and `/api/cron/worker` authorize with `CRON_SECRET` when set, then **no-op enqueue** (`enqueued: 0`) so the demo never sends live mail.
- Mocks are forbidden in production (`mocksAllowed` fail-closed).

## On-demand Generate brief (live)

When demo fixtures are off and a service-role client is available (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`):

1. **Generate brief** posts `POST /api/reports` with `{ edition, reason: "on_demand" }`.
2. The handler calls `runOnDemandReport`, which builds `ReportPipeline` via `createConfiguredReportPipeline` (same AI mock + archive persist as the cron worker).
3. Idempotency key is unique per click: `on_demand:{firmId}:{tradingDate}:{edition}:{nanoid}` — it does not collide with cron keys (`{tradingDate}:{edition}:{scheduleVersion}:{firmId}`).
4. `collectAfter` / `publishAfter` / `scheduledAt` are set to now so the publish gate does not hold.
5. The archive stage uploads the PDF to Storage bucket `STORAGE_BUCKET` (default `reports`) and upserts `reports` (including `canonical_json`), `report_sections`, `report_claims`, `source_documents` / `citations`, and `report_files`. Email is skipped unless the license permits `email_attachment` (redistributable), Resend is configured, and the firm has recipients.
6. The JSON response is `{ id, runId, status, demo: false, … }`. `id` is the archived `reports.id` when persist succeeds, otherwise the `report_runs.id`. Failed runs return 5xx with `error` plus `id` / `status` / `demo: false`.
7. Research Archive and `/reports/[id]` load live rows (lookup by `reports.id`, `reports.report_run_id`, or `report_runs.id`). PDF download uses the service role and `report_files.storage_path`.

Without a service-role client, live POST returns 503 `"Report generation is not connected in this environment."` GET list still returns `{ reports: [] }` (not 503).

Until `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`) / `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` are set, drafting uses mock AI with **live** prices. The API `message` says so. Desk intelligence on the dashboard still compiles a rules brief without keys.

### Generate brief smoke test (owner)

Disable demo fixtures (Supabase URL + anon set; `DEMO_MODE` / mocks off as you intend for live):

1. Sign in as a firm member with `generateOnDemandReport`.
2. Dashboard → **Generate brief** → queue Close / Postmarket (or any edition).
3. Job runs to `completed` or `partial` (or inspect `report_runs` / worker if you enqueue via cron instead).
4. Confirm a PDF object in Storage at `reports/{tradingDate}/{edition}/IB_Market_Data_…pdf`.
5. Confirm a `reports` row (and `report_files`) for that run.
6. Open **Research Archive** — the brief is listed; **Open research** loads `/reports/{id}`.
7. **Download PDF** returns `application/pdf`.

Email is skipped when the firm has no active `team_memberships` + `profiles.email`. Cron still uses `/api/cron/tick` and `/api/cron/worker` every 5 minutes (`vercel.json`).

## Production prerequisites

### 1. Environment

Required for scheduled live runs:

| Variable | Role |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Auth, RLS reads, cron job store (service role) |
| `CRON_SECRET` | Authorizes tick/worker (`Authorization: Bearer` or `x-cron-secret`) |
| `NEXT_PUBLIC_APP_URL` | Archive links in email |
| `RESEND_API_KEY` + `EMAIL_FROM` | Delivery; `EMAIL_FROM` domain must be verified |
| At least one of `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `AI_GATEWAY_API_KEY` | Draft + prior-edition audit |
| Market-data keys you intend to use (`ALPACA_*`, `FINNHUB_API_KEY`, …) | Collection; production must not rely on mocks |
| `MARKET_DATA_LICENSE_SCOPE` + `MARKET_DATA_LICENSE_ACKNOWLEDGED` | PDF/email surfaces fail closed if scope forbids them |
| `FIRM_ID` | Optional; default is seeded Research Desk UUID `a0000000-0000-4000-8000-000000000001` |
| `ALLOW_MOCK_PROVIDERS` / `DEMO_MODE` | Must be unset or `false` in Production |

`npm run check:env` reports present/missing/invalid only (does not print secret values).

### 2. Migrations and seed

Apply in order:

1. `20260810000000_init.sql`
2. `20260810000001_rls_and_search.sql`
3. `20260811000000_market_data_realtime.sql`
4. **`20260812000000_close_postmarket_edition.sql`** — `ALTER TYPE … ADD VALUE 'close_postmarket'` only. Must commit first (Postgres 55P04 if you use the value in the same SQL Editor paste).
5. **`20260812000001_close_postmarket_data.sql`** — migrates `close` rows, thesis/calendar enums, run timing columns, `reports.canonical_json`

Then apply `supabase/seed.sql` only as an intentional bootstrap (report config editions 07:30 / 11:30 / 16:00). Do not `db reset` a live Production database.

Postgres keeps unused enum value `close`; TypeScript no longer writes it.

### 3. RLS and cron identity

Authenticated members read firm-scoped reports under RLS. Tick and worker use the **service role** client (`SupabaseReportJobStore`) so enqueue/stage updates are not blocked by user RLS. Do not expose the service role to the browser.

Storage bucket `STORAGE_BUCKET` (default `reports`) must be private; serve PDFs via signed URLs.

### 4. Cron

[`vercel.json`](../vercel.json) hits `/api/cron/tick` and `/api/cron/worker` every 5 minutes UTC. That interval is a **poll**, not the edition clock. Due work is computed in America/Chicago (`date-fns-tz`).

- Tick: `INSERT report_runs` with unique `idempotency_key` (`ON CONFLICT` / unique violation → existing run). Same key for collect (15:00) and publish (16:00).
- Worker: claims stages; stops before PDF/email until `now >= publish_after`.
- Demo/fixtures: no-op as above. Without a service role key: `"Scheduler service not wired"` / `"Worker service not wired"`.

### 5. Recipients

The worker loads **active** `team_memberships` joined to `profiles.email`. Bootstrap at least one admin (and intended members) before enabling Production email. If the firm has no active emails, the run still archives the PDF and **skips** `delivering_email` rather than mailing a demo address.

### 6. Retry without duplicate email

- Idempotency key includes `scheduleVersion` (`v3-close-postmarket`). Duplicate ticks do not insert a second run.
- Completed pipeline stages are skipped on resume, including `delivering_email`.
- Admin resend is a separate delivery action after a failed send — not a second scheduled edition.

### 7. Licensing limits

- Do not enable scheduled Production email until [`PRODUCTION_LAUNCH_RUNBOOK.md`](./PRODUCTION_LAUNCH_RUNBOOK.md) gates pass.
- `email_attachment` / `pdf_inclusion` / `ai_analysis_input` are blocked when license scope does not permit them.
- Options language in reports requires public evidence; the app does not claim OPRA or place orders.
- IEX is not SIP/NBBO/full-market. Tracked-universe movers are not exchange-wide.

## Early close and holidays

Static NYSE full-day holidays and 1:00 p.m. ET early-close dates for 2024–2027 live in [`chicago-schedule.ts`](../src/lib/scheduling/chicago-schedule.ts) and [`nyse-early-close.ts`](../src/lib/scheduling/nyse-early-close.ts). Optional extras: `report_configs.calendar_overrides` (`extraHolidays`, extra early closes, `forceOpen`) — runtime load from that JSON is a later optional step; tests inject overrides via the schedule clock.

## Smoke checks

```bash
npm run check:env
npm run test
npm run test:pdf
# authorized:
curl -X POST "$NEXT_PUBLIC_APP_URL/api/cron/tick" -H "Authorization: Bearer $CRON_SECRET"
curl -X POST "$NEXT_PUBLIC_APP_URL/api/cron/worker" -H "Authorization: Bearer $CRON_SECRET"
```

Unauthorized cron must return 401. First live trading day: confirm three archive rows and three Resend sends (or skip-email note if no recipients).
