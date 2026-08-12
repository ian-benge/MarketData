# Environment variables

Inventory of every variable in [`src/lib/env.ts`](../src/lib/env.ts). **No secret values** belong in this document. Template: [`.env.example`](../.env.example). Verify with `npm run check:env` (present / missing / invalid — does not print values).

**Public vs server-only:** names starting with `NEXT_PUBLIC_` are exposed to the browser. All other keys are server-only and must never be embedded in client bundles.

**Environments:** Local = `.env.local`; Preview / Production = Vercel (or equivalent) project env. “Needed?” means required for that environment’s intended real posture — demo Local can omit most live keys.

| Legend | Meaning |
| --- | --- |
| Secret? | Yes = treat as credential / high sensitivity |
| L / Pr / P | Local / Preview / Production |
| ✓ | Typically required for real (non-demo) use |
| ○ | Optional / conditional |
| — | Usually unset or false |

---

## Application & flags

| Variable | Purpose | Secret? | Public? | L | Pr | P | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production` (default `development`) | No | No | ✓ | ✓ | ✓ | Runtime / platform | `check:env`; platform default on Vercel |
| `NEXT_PUBLIC_APP_URL` | Canonical app origin (links, EDGAR UA fallback, redirects). Default `http://localhost:3000` | No | **Yes** | ✓ | ✓ | ✓ | You / Vercel domain | Must be valid URL matching the deploy |
| `CRON_SECRET` | Authorizes `/api/cron/tick` and `/api/cron/worker` (`Bearer` or `x-cron-secret`) | **Yes** | No | ○ | ✓ | ✓ | Generate long random | Unauthorized → 401; Local may omit only when demo/fixtures allow cron |
| `ALLOW_MOCK_PROVIDERS` | Allow mock adapters when live keys missing; **ignored / forbidden path in production** (`mocksAllowed`) | No | No | ○ | — | — | You | Production must be `false` / unset |
| `DEMO_MODE` | Enables demo auth path when Supabase unset (with mocks). Demo auth off if `NODE_ENV=production` or Supabase configured | No | No | ○ | — | — | You | Production must be `false` / unset |

---

## Supabase & firm

| Variable | Purpose | Secret? | Public? | L | Pr | P | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | No | **Yes** | ○ | ✓ | ✓ | Supabase dashboard | Login / API against project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (RLS-enforced client) | Sensitive | **Yes** | ○ | ✓ | ✓ | Supabase dashboard | Session works; RLS holds |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (bypasses RLS) for pipeline, cron, bootstrap | **Yes** | No | ○ | ✓ | ✓ | Supabase dashboard | Bootstrap / server jobs only |
| `BOOTSTRAP_ADMIN_EMAIL` | Target email for one-time admin bootstrap | No | No | ○ | ✓ | ✓ | Owner | Matches Auth user; `bootstrap:admin` |
| `FIRM_ID` | Optional UUID override for firm id (tick/worker use `FIRM_ID ??` seeded Research Desk UUID). Prefer the seeded UUID when overriding | No | No | ○ | ○ | ○ | You / seed | Must be UUID if set; blank = unset |

Seeded Research Desk firm id: `a0000000-0000-4000-8000-000000000001` (`supabase/seed.sql`).

---

## Market / news / macro (legacy + secondary)

| Variable | Purpose | Secret? | Public? | L | Pr | P | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `FINNHUB_API_KEY` | Finnhub quotes/news/earnings; delayed fallback or legacy market | **Yes** | No | ○ | ○ | ○ | Finnhub | Live call or smoke; optional if Alpaca/Massive primary |
| `ALPHA_VANTAGE_API_KEY` | Free secondary earnings calendar (`EARNINGS_CALENDAR` CSV) and historical `EARNINGS` JSON. Cached ~12h; not used for quotes | **Yes** | No | ○ | ○ | ○ | Alpha Vantage | `/api/market/earnings` `meta.sources.alphaVantage`; history panel AV chip |
| `FRED_API_KEY` | FRED macro series | **Yes** | No | ○ | ○ | ○ | FRED | Macro observations succeed |
| `CME_FEDWATCH_ACCESS_TOKEN` | Optional OAuth bearer for the official CME FedWatch REST API | **Yes** | No | ○ | ○ | ○ | CME Market Data API | `/forecasts/latest` succeeds; otherwise dashboard uses public ZQ + NY Fed |
| `CME_FEDWATCH_API_BASE` | Official FedWatch API base. Default `https://markets.api.cmegroup.com/fedwatch_rt/v1` when a token is set. Host must be `markets.api.cmegroup.com` | No | No | ○ | ○ | ○ | CME | Allowlisted https host only |
| `NEWS_RSS_FEEDS` | Comma-separated allowlisted RSS https URLs | No | No | ○ | ○ | ○ | You | Feeds fetch; SSRF allowlist only |
| `EDGAR_USER_AGENT` | Descriptive SEC User-Agent; else derived from app URL | No | No | ○ | ○ | ○ | You | Filings fetch; SEC fair-access compliant string |

---

## Market-data routing & licensing

| Variable | Purpose | Secret? | Public? | L | Pr | P | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MARKET_DATA_PRIMARY` | `alpaca` \| `massive` \| `finnhub` \| `mock` (default `alpaca`). `mock` only with mocks, non-prod | No | No | ○ | ✓ | ✓ | You | Admin status / router |
| `MARKET_DATA_FALLBACK` | `massive` \| `finnhub` \| `none` (default `none`) | No | No | ○ | ○ | ○ | You | Fallback path on primary failure |
| `MARKET_DATA_LICENSE_SCOPE` | `single_user_development` \| `internal_team` \| `redistributable` (default solo) | No | No | ○ | ✓ | ✓ | Owner | Must match written authorization |
| `MARKET_DATA_LICENSE_ACKNOWLEDGED` | Ops guardrail that owner verified **current** terms — **not** proof of a license | No | No | ○ | ○ | ✓* | Owner | `true` only after checklist; shared prod |
| `MARKET_DATA_REFRESH_OPEN_SECONDS` | Refresh cadence when regular session open (default `60`) | No | No | ○ | ○ | ○ | You | Tick refresh behavior |
| `MARKET_DATA_REFRESH_EXTENDED_SECONDS` | Extended hours cadence (default `120`) | No | No | ○ | ○ | ○ | You | |
| `MARKET_DATA_REFRESH_CLOSED_SECONDS` | Closed/overnight cadence (default `300`) | No | No | ○ | ○ | ○ | You | |
| `MARKET_DATA_STALE_AFTER_SECONDS` | Age before observations labeled stale (default `180`) | No | No | ○ | ○ | ○ | You | Stale banners |
| `MARKET_DATA_MAX_UNIVERSE_SIZE` | Cap on refresh universe size (default `80`) | No | No | ○ | ○ | ○ | You | Universe builder |

\* Shared Production realtime: acknowledgement expected **after** written authorization and owner checklist — still not a substitute for a license.

---

## Alpaca

| Variable | Purpose | Secret? | Public? | L | Pr | P | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ALPACA_DATA_KEY_ID` | Alpaca Market Data key id | **Yes** | No | ○ | ○ | ○† | Alpaca | Required when Alpaca primary/fallback |
| `ALPACA_DATA_SECRET_KEY` | Alpaca Market Data secret | **Yes** | No | ○ | ○ | ○† | Alpaca | |
| `ALPACA_STOCK_FEED` | `iex` (default) \| `sip` (only if entitled) | No | No | ○ | ○ | ○ | You / entitlement | Labels must match feed |
| `ALPACA_DATA_BASE_URL` | Fixed host default `https://data.alpaca.markets` | No | No | ○ | ○ | ○ | Default / approved mirror | Do not point at arbitrary SSRF hosts |

† Required when `MARKET_DATA_PRIMARY` or fallback uses Alpaca.

---

## Massive

| Variable | Purpose | Secret? | Public? | L | Pr | P | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `MASSIVE_API_KEY` | Massive (formerly Polygon) API key | **Yes** | No | ○ | ○ | ○† | Massive | Adapter inactive without key |
| `MASSIVE_API_BASE_URL` | Default `https://api.massive.com` | No | No | ○ | ○ | ○ | Default / approved | |

† Required when primary/fallback is Massive.

---

## AI

| Variable | Purpose | Secret? | Public? | L | Pr | P | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API access | **Yes** | No | ○ | ○ | ○ | OpenAI | At least one AI key for live drafting |
| `OPENAI_MODEL` | Default `gpt-4.1-mini` | No | No | ○ | ○ | ○ | You | |
| `ANTHROPIC_API_KEY` | Anthropic API access | **Yes** | No | ○ | ○ | ○ | Anthropic | |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-4-20250514` | No | No | ○ | ○ | ○ | You | |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Generative AI / Gemini | **Yes** | No | ○ | ○ | ○ | Google AI | |
| `GEMINI_MODEL` | Default `gemini-2.0-flash` | No | No | ○ | ○ | ○ | You | |
| `AI_DEFAULT_PROVIDER` | `openai` \| `anthropic` \| `gemini` (default `openai`) | No | No | ○ | ○ | ○ | You | Must match a configured key |

---

## Email & storage

| Variable | Purpose | Secret? | Public? | L | Pr | P | Source | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | Resend delivery | **Yes** | No | ○ | ○ | ○ | Resend | Live send or mock outbox in non-prod |
| `EMAIL_FROM` | From header; must be allowed on Resend domain | No | No | ○ | ○ | ○ | You / DNS | Domain verified |
| `STORAGE_BUCKET` | Supabase Storage bucket for PDFs (default `reports`) | No | No | ○ | ✓ | ✓ | You / Supabase | Bucket exists; private |

---

## Production posture (required)

| Setting | Production requirement |
| --- | --- |
| `ALLOW_MOCK_PROVIDERS` | `false` or unset |
| `DEMO_MODE` | `false` or unset |
| `CRON_SECRET` | Set; matches Vercel cron auth |
| Supabase trio | URL + anon + service role set |
| Market license | Scope matches use; acknowledgement only after owner verification + written auth for shared/redistributed use |

---

## Not in schema / not adapters

This schema does **not** include BLS, BEA, Treasury, or EIA keys — those adapters do not exist in this repository.

Related ops docs: [`MANUAL_BACKEND_SETUP.md`](./MANUAL_BACKEND_SETUP.md), [`deployment.md`](./deployment.md), [`owner-market-data-checklist.md`](./owner-market-data-checklist.md).
