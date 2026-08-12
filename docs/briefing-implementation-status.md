# Briefing implementation status

Last updated: 2026-08-12

Canonical schedule and setup: [`automated-briefing-setup.md`](./automated-briefing-setup.md), [`scheduling-and-jobs.md`](./scheduling-and-jobs.md).

## Mandate

Exactly **three** scheduled reports per valid U.S. equity trading day, all times **America/Chicago**:

| Edition | Collect | Publish (regular session) |
| --- | --- | --- |
| `premarket` | 07:30 | 07:30 |
| `midday` | 11:30 | 11:30 |
| `close_postmarket` | 15:00 | 16:00 |

There is **no** 15:30 `close` email and **no** fourth postmarket email. On NYSE 1:00 p.m. ET early-close days, Close / Postmarket publishes at official close **+ 1 hour**. Full-day holidays and weekends skip all editions.

Single source of truth: [`src/lib/reports/editions.ts`](../src/lib/reports/editions.ts) (`SCHEDULE_VERSION = v3-close-postmarket`).

## Code complete

- Edition enum, labels, PDF slugs, idempotency `{tradingDate}:{edition}:{scheduleVersion}:{firmId}`
- Migrations [`20260812000000_close_postmarket_edition.sql`](../supabase/migrations/20260812000000_close_postmarket_edition.sql) then [`20260812000001_close_postmarket_data.sql`](../supabase/migrations/20260812000001_close_postmarket_data.sql) (enum add must commit before use; unused PG value `close` remains)
- Chicago scheduler with collect vs publish windows, injected clock, early-close calendar 2024–2027, admin `calendar_overrides`
- Cron tick/worker enqueue via `SupabaseReportJobStore` (unique idempotency; demo fixtures no-op)
- Pipeline holds `rendering_pdf` / `archiving` / `delivering_email` until `publish_after`
- Prior-edition thesis audit (`CONFIRMED` / `PENDING` / `WEAKENED` / `INVALIDATED` / `TARGET_REACHED`); ids never dropped
- Combined Close / Postmarket sections (regular recap, changes since midday, first-hour AH, trade-book, next session)
- Quality gate: prior trail, quiet-AH sentence, options language, edition enum
- PDF/email filename `IB_Market_Data_YYYY-MM-DD_Close_Postmarket.pdf`
- Archive filter, on-demand radios, admin schedule table, dashboard next-brief, report-reader same-day nav
- Fixtures: `rpt-demo-003` is `close_postmarket`; midday includes Changes Since Premarket

## Owner actions (not in code)

Production still needs the owner to apply the new migration, set `CRON_SECRET`, verify Resend domain, supply an AI key, and complete the market-data license checklist. See [`automated-briefing-setup.md`](./automated-briefing-setup.md).

Expected live cadence after that: **three emails per regular trading day** at 07:30 / 11:30 / 16:00 America/Chicago (or early-close + 1 hour). Recipients are active `team_memberships` + `profiles` emails. If none exist, the worker archives the PDF and skips email.

## Out of scope (intentional)

- Separate 15:30 close report or fourth postmarket report
- Autonomous order routing
- Claiming OPRA / full-tape unusual options without a licensed feed
- Rewriting dashboard market pulse, earnings calendar (`postmarket` there means AMC timing), or live quote routing
- Loading firm schedule overrides from `report_configs` at runtime (column exists; scheduler remains hardcoded SSOT for this pass)

## Validation

Recorded when this pass landed. Re-run after further briefing changes.

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test` | 237 passed (58 files) |
| `npm run lint` | briefing files clean; pre-existing dashboard/fedwatch hook errors remain |
| `npm run test:pdf` | pass (`tmp/fixture-report.pdf`) |
| `npm run test:e2e` (workspace / archive / demo-auth) | briefing assertions pass; unrelated market-chart IWM timeout |
| `npm run build` | pass |
