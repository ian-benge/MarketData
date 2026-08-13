# Supabase

Postgres schema, RLS policies, full-text search, and seed data for IB Market Data.

Hosted project: `grelplmmgywqoliqzrfi` (`grelplmmgywqoliqzrfi.supabase.co`).

## Layout

| Path | Purpose |
| --- | --- |
| `config.toml` | Local CLI config (`supabase start`) |
| `migrations/*.sql` | Versioned schema — source of truth for remote `db push` |
| `seed.sql` | Research Desk firm, instruments, sectors, Core watchlist, Chicago report config, provider configs |

Secrets (API keys) are **not** stored in `provider_configs`. Keep keys in environment variables / Vercel secrets.

## Apply migrations (preferred)

Cursor is configured to talk to this project via [Supabase MCP](https://supabase.com/docs/guides/getting-started/mcp) (`.cursor/mcp.json`). After a one-time OAuth login in **Cursor Settings → Tools & MCP**, the agent can `apply_migration` / `execute_sql` without the SQL editor.

CLI fallback (needs `npx supabase login` once, then `npm run db:link`):

```bash
npm run db:push
```

Do not `db reset` the hosted project.

## Local apply (Docker)

```bash
# From repo root
npx supabase start
npx supabase db reset   # applies migrations + seed.sql
```

Or apply migrations without resetting:

```bash
npx supabase migration up
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
