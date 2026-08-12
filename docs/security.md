# Security

## Threat model (v1)

| Asset | Threat | Mitigation |
| --- | --- | --- |
| Firm reports & watchlists | Unauthorized read/write | Invite-only auth; RLS; role checks |
| Admin ops (invites, retries, providers) | Privilege escalation | `admin` role + `hasPermission`; `/admin` redirects members to `/denied` |
| Cron enqueue/worker | Public abuse / job floods | `CRON_SECRET`; no browser exposure |
| Provider API keys | Leakage | Server-only env; never in client bundles or DB config blobs |
| RSS fetch | SSRF to internal networks | Allowlist feeds; http(s) only; block private IPs; size limit |
| AI output | Invented prices / uncited claims | Evidence-bound prompts; quality gate; citation validation |
| Demo mode | Accidental prod demo | Disabled when `NODE_ENV=production` or Supabase configured |

## Secrets

| Secret | Where |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (pipeline, cron, bootstrap) |
| `CRON_SECRET` | Cron callers only |
| `FINNHUB_API_KEY`, `FRED_API_KEY`, AI keys, `RESEND_API_KEY` | Server env / Vercel |
| Anon key | Browser-safe with RLS |

Rotate via Vercel env + redeploy. Do not commit `.env.local`.

## RLS

Postgres policies use `auth_firm_id()`, `auth_is_active_member()`, `auth_is_admin()` (see Supabase migrations). Service role bypasses RLS — use only in trusted server paths. Client uses anon key + user JWT.

## SSRF notes (RSS)

[`RssNewsProvider`](../src/lib/providers/rss/news.ts) only fetches URLs listed in `NEWS_RSS_FEEDS`. Before fetch:

- Scheme must be `http:` or `https:`  
- Host must not resolve to loopback, RFC1918, link-local, or cloud metadata ranges  
- Response body truncated at a hard size cap  

Do not add user-supplied arbitrary URLs to the fetch path without the same guards.

## Invite-only

- No self-serve registration in product flows.  
- Admins create invitations; accept via `/invite/[token]`.  
- `BOOTSTRAP_ADMIN_EMAIL` is a one-time ops bootstrap, not an open signup endpoint.  
- Demo cookie auth is local-only and must not be enabled in production.
