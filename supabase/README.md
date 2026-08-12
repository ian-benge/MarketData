# Supabase

Postgres schema, RLS policies, full-text search, and seed data for IB Market Data.

## Layout

| Path | Purpose |
| --- | --- |
| `migrations/20260810000000_init.sql` | Enums, tables, indexes, auth helpers, RLS |
| `migrations/20260810000001_rls_and_search.sql` | Report FTS triggers + GIN / trigram indexes |
| `migrations/20260811000000_market_data_realtime.sql` | License configs, observations, refresh runs, report freezes |
| `migrations/20260812000000_close_postmarket_edition.sql` | Adds enum value `close_postmarket` (own transaction; required before use) |
| `migrations/20260812000001_close_postmarket_data.sql` | Migrates `close` rows; thesis/calendar enums; run timing columns; `canonical_json` |
| `seed.sql` | Research Desk firm, instruments, sectors, Core watchlist, Chicago report config, provider configs |

Secrets (API keys) are **not** stored in `provider_configs`. Keep keys in environment variables / Vercel secrets.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (for local `supabase start`)
- Linked project for remote deploys (`supabase link`)

## Local apply

```bash
# From repo root
supabase start
supabase db reset   # applies migrations + seed.sql
```

Or apply migrations without resetting:

```bash
supabase migration up
psql "$DATABASE_URL" -f supabase/seed.sql
```

## Remote apply

```bash
supabase link --project-ref <project-ref>
supabase db push
# seed only when intentionally bootstrapping a new environment
psql "$DATABASE_URL" -f supabase/seed.sql
```

## Auth helpers

RLS policies use:

- `auth_firm_id()` — active membership firm
- `auth_is_active_member()`
- `auth_is_admin()`

The Supabase **service role** bypasses RLS (default). Use it only from trusted server code (report pipeline, cron, bootstrap).

## Bootstrap users

Seed does not create `auth.users` / `profiles`. After first deploy, run the app bootstrap path documented in [docs/deployment.md](../docs/deployment.md) (`BOOTSTRAP_ADMIN_EMAIL` + service-role script) to attach an admin membership to the Research Desk firm.

## Related docs

See [docs/deployment.md](../docs/deployment.md) for environment variables, Vercel, cron, and production cutover.
