# Scheduling and jobs

## Time zone

All edition local times are **America/Chicago**. DST is handled via `date-fns-tz` (`fromZonedTime` / `formatInTimeZone`) in [`chicago-schedule.ts`](../src/lib/scheduling/chicago-schedule.ts) — do not hard-code fixed UTC offsets for 07:30 / 11:30 / 16:00.

Canonical edition ids, labels, PDF slugs, and `SCHEDULE_VERSION` live in [`editions.ts`](../src/lib/reports/editions.ts). Setup: [`automated-briefing-setup.md`](./automated-briefing-setup.md).

## Edition schedule

| Edition | Collect (America/Chicago) | Publish (regular session) |
| --- | --- | --- |
| `premarket` | 07:30 | 07:30 |
| `midday` | 11:30 | 11:30 |
| `close_postmarket` | 15:00 | 16:00 |

Jobs enqueue only on US equity trading days (weekdays minus static NYSE holiday set for 2024–2027). There is no 15:30 `close` edition.

On NYSE **early-close** days (1:00 p.m. ET calendar in [`nyse-early-close.ts`](../src/lib/scheduling/nyse-early-close.ts)), Close / Postmarket collect starts at the official close and **publish = close + 1 hour** (do not wait until 16:00 CT).

## UTC cron tick

Vercel Cron hits (GET, which the routes accept and treat as POST):

- `/api/cron/tick` every 5 minutes  
- `/api/cron/worker` every 5 minutes  
- `/api/cron/intel` every 15 minutes  

See [`vercel.json`](../vercel.json). Auth: `Authorization: Bearer $CRON_SECRET` or `x-cron-secret` header ([`verifyCronSecret`](../src/lib/api/http.ts)).

Brokerage holdings sync is **not** a Vercel cron. The canonical clock is Supabase `pg_cron` (`brokerage-holdings-sync`, 10s) calling `/api/cron/brokerage`. Do not add that path to `vercel.json`.

The tick computes **due** work in Chicago time; the 5-minute UTC cadence is only the polling interval.

With Supabase service role: tick inserts `report_runs` on unique `idempotency_key`; worker advances stages via [`SupabaseReportJobStore`](../src/lib/reports/supabase-job-store.ts). PDF/archive/email wait until `publish_after`.

## Grace window

`getDueEditions(now, { graceMinutes: 15 })` includes a collect or publish instant when `now` is within **0–15 minutes after** that Chicago instant. That covers cron jitter without double-firing far after the window. Collect and publish share the same idempotency key.

## Idempotency

Key format: `{tradingDate}:{edition}:{scheduleVersion}:{firmId}` via `buildIdempotencyKey` (`SCHEDULE_VERSION = v3-close-postmarket`). Enqueue must skip when a run already exists for that key so duplicate cron ticks do not create duplicate reports or duplicate email.

## Pipeline stages

Ordered executable stages ([`PIPELINE_STAGES`](../src/lib/reports/stages.ts)):

1. `queued`  
2. `collecting_sources`  
3. `normalizing_market_data`  
4. `detecting_material_events`  
5. `analyzing_and_drafting`  
6. `validating_claims`  
7. `rendering_pdf`  
8. `archiving`  
9. `delivering_email`  

Terminal: `completed` | `partial` | `failed` | `cancelled`.

`rendering_pdf`, `archiving`, and `delivering_email` are **publish-gated**. Worker may run through `validating_claims` in the collect window and must not render or mail until `now >= publish_after`. Completed stages (including email) are skipped on retry.

## Demo cron

When fixtures/demo auth is active, tick and worker return a successful no-op (`enqueued: 0`) so local demos do not require a live job store or send mail.
