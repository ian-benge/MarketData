# Assumptions

Safe, reversible decisions made where the master prompt left room for interpretation.

| ID | Assumption | Rationale | Reversible? |
| --- | --- | --- | --- |
| A1 | Single firm / single-tenant schema (`firm_id` fixed to one row seeded as `default`) | Audience is one private team; multi-tenant adds complexity without benefit for v1 | Yes — add firm scoping later |
| A2 | Market data launch adapter: Finnhub free tier when `FINNHUB_API_KEY` set; otherwise mock | Free-first, replaceable behind `MarketDataProvider` | Yes |
| A3 | News launch adapter: Finnhub news + configured RSS feeds; mock when keys absent | Avoids scraping; RSS allowlisted | Yes |
| A4 | Macro: FRED when `FRED_API_KEY` set; economic calendar from FRED releases + static holiday calendar | Official series; calendar may be incomplete on free tier | Yes |
| A5 | Corporate events: SEC EDGAR Atom/JSON for filings; earnings from Finnhub (primary) union Alpha Vantage (secondary free CSV) | Primary filings + free calendars; no paid earnings vendor | Yes |
| A6 | Email: Resend adapter; console/file adapter in non-production or when unset | Free-tier friendly; replaceable | Yes |
| A7 | Scheduler: Vercel Cron hitting `/api/cron/tick` every 5 minutes UTC; due work computed in `America/Chicago` | Avoids hard-coded UTC edition times that break on DST | Yes |
| A8 | Demo/mock providers activate only when `ALLOW_MOCK_PROVIDERS=true` and `NODE_ENV !== 'production'` | Fail closed in production | Yes |
| A9 | First admin bootstrap via `BOOTSTRAP_ADMIN_EMAIL` + service-role seed script | Documented one-time path; no public signup | Yes |
| A10 | PDF via `@react-pdf/renderer` (no Chromium) | Serverless-compatible on Vercel | Yes |
| A11 | Package manager: npm (scaffold default) | Matches create-next-app output | Yes |
| A12 | Vitest for unit/integration; Playwright for e2e | Common Next.js pairing | Yes |
| A13 | On-demand report rate limit: 3 per user per hour | Prevents accidental job floods | Tunable |
| A14 | Market bar retention default: 90 days rolling | Cost control; configurable | Yes |
| A15 | Partial report delivery default: deliver only if quality gate severity ≠ `blocking` | Matches prompt default | Admin-configurable |

## Non-assumptions (locked by prompt)

- Editions at 7:30 / 11:30 / 4:00 America/Chicago (`close_postmarket`; collect may start at 3:00 p.m. CT). No separate 3:30 close report.
- Invite-only auth with admin/member roles
- Firm-wide reports (not per-user)
- Anthropic + Gemini adapters at launch (OpenAI removed)
