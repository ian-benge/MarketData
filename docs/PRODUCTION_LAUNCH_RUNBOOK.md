# Production launch runbook

Go/no-go procedures for first Production cutover and recurring ops. Companion docs: [`MANUAL_BACKEND_SETUP.md`](./MANUAL_BACKEND_SETUP.md), [`BACKEND_SETUP_CHECKLIST.md`](./BACKEND_SETUP_CHECKLIST.md), [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md), [`owner-market-data-checklist.md`](./owner-market-data-checklist.md), [`operations-runbook.md`](./operations-runbook.md).

**Explicit rule:** do **not** enable scheduled Production email until all go/no-go gates below pass.

---

## 1. Go / no-go gates

Mark each gate **GO** or **NO-GO**. Any NO-GO blocks Production email and shared realtime activation.

| # | Gate | GO criteria | NO-GO if |
| --- | --- | --- | --- |
| G1 | Preview verified | Preview deploy healthy; real login; cron 200 with secret | Preview broken or untested |
| G2 | Mocks/demo off | `ALLOW_MOCK_PROVIDERS=false` (or unset), `DEMO_MODE=false` (or unset) | Either true in Production |
| G3 | Supabase | Migrations applied (init, RLS/search, market_data_realtime, close_postmarket_edition); seed applied intentionally; bucket `STORAGE_BUCKET` (default `reports`) private | Missing schema / open bucket |
| G4 | Bootstrap admin | Auth user + `npm run bootstrap:admin`; admin can sign in | Only demo cookies work |
| G5 | Invitations honesty | Team knows Admin invitations API still returns fixture responses; members provisioned via supported path | Assuming invite UI creates Supabase users |
| G6 | Cron | `CRON_SECRET` set; tick + worker authorize; unauthorized → 401 | Open cron or mismatch |
| G7 | Schedule understanding | Editions America/Chicago via 5-min UTC poll — 07:30 / 11:30 / 16:00 CT (`close_postmarket`), not fixed UTC clocks or a 15:30 close | Expecting UTC 07:30/11:30/15:30 or a fourth postmarket mail |
| G8 | Providers | Keys present for intended slots; `npm run check:env` clean for required set | Prod relying on mocks |
| G9 | Market license | Owner checklist complete; **written authorization** for shared/redistributed use; scope + `MARKET_DATA_LICENSE_ACKNOWLEDGED` set honestly (guardrail ≠ license) | Shared use on solo/dev scope or unacknowledged |
| G10 | Feed honesty | IEX never labeled SIP/NBBO/full-market; smoke optional | Mislabeling |
| G11 | Email domain | Resend domain verified **before** enabling schedule | Unverified `EMAIL_FROM` |
| G12 | Owner approval | Named owner approves Production schedules + email | No recorded approval |

**STOP — owner action required** for G9, G11, G12 (licensing, DNS/billing, approval).

---

## 2. Pre-launch verification sequence

Run in order. Record evidence in the checklist (no secret values).

1. `npm run check:env` against Production env export / Vercel (present/missing/invalid only).
2. Confirm Production flags: mocks off, demo off, `CRON_SECRET` set, `NEXT_PUBLIC_APP_URL` = Production HTTPS origin.
3. Confirm Supabase migrations + storage bucket.
4. Confirm bootstrap admin login on Production URL.
5. Authorized `POST /api/cron/tick` and `POST /api/cron/worker` → 200; bad secret → 401.
6. Optional: `MARKET_DATA_SMOKE=1 npm run test:market-smoke` from a trusted machine with Production-equivalent keys (read-only).
7. Generate **one** non-distributed test report (scope/surfaces that do **not** email) if market license allows in-app/PDF; confirm archive + storage.
8. Send a **manual** Resend test only if domain verified — still keep **scheduled** email disabled.
9. Owner signs G12.

---

## 3. Pause schedules and email

Use when entitlement fails, secret leak, bad deploy, or gate regression.

| Action | How |
| --- | --- |
| Pause cron work | Rotate or clear `CRON_SECRET` so Vercel cron gets 401 **or** disable cron jobs in Vercel project settings |
| Pause market refresh | Same cron pause; or set primary to safe config only after owner approval — do not enable mocks in Production |
| Pause email | Remove/unset `RESEND_API_KEY` or stop worker delivery stage; keep scheduled email disabled until gates re-pass |
| Pause shared realtime claim | Set `MARKET_DATA_LICENSE_ACKNOWLEDGED=false` and/or narrow `MARKET_DATA_LICENSE_SCOPE` to match actual authorization; fail closed |

**STOP — owner action required** before re-enabling after a license or billing incident.

---

## 4. Secret rotation

Rotate without committing values. After each rotation, redeploy or restart so runtime picks up env.

| Secret | Rotation notes |
| --- | --- |
| `CRON_SECRET` | Update Vercel env and ensure cron auth still matches Bearer / `x-cron-secret`; expect brief 401s during cutover |
| `SUPABASE_SERVICE_ROLE_KEY` | Rotate in Supabase; update Vercel immediately; never expose to client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Rotate with care; clients must refresh |
| Provider API keys (Alpaca, Massive, Finnhub, FRED, AI, Resend) | Rotate in vendor dashboards; update Vercel; re-run `check:env` + smoke |
| `ALPACA_DATA_*` / `MASSIVE_API_KEY` | Confirm entitlements still valid after rotation |

Never store keys in `provider_configs` or git.

---

## 5. Rollback

| Scenario | Steps |
| --- | --- |
| Bad app deploy | Revert to previous Vercel deployment; re-check cron and login |
| Bad migration | Forward-fix migration preferred; do **not** `db reset` Production |
| Bad seed re-apply | Avoid destructive re-seed; repair rows intentionally |
| Provider outage | Fail closed; use entitled fallback only; do not mock in Production |
| License / entitlement failure | Follow [`operations-runbook.md`](./operations-runbook.md); pause shared surfaces; do not broaden labels |

---

## 6. Incident quick checklist

- [ ] Cron 401s → `CRON_SECRET` mismatch
- [ ] Demo/mock behavior in Production → flags wrong; treat as sev-1 config
- [ ] Empty dashboard → providers fail-closed, license gate, or RLS
- [ ] Stale forever → refresh lock, keys, cadence
- [ ] Wrong feed label (IEX as SIP) → sev-1 provenance; pause redistribution
- [ ] Email bounce / domain → Resend + DNS; do not blast retries
- [ ] Invitation UI “works” but users missing → known fixture gap; provision via Supabase Auth

Escalate with timestamps, environment, and gate IDs — not raw secrets.

---

## 7. Recurring maintenance

| Cadence | Task |
| --- | --- |
| Each deploy | `check:env` mentality; mocks/demo still false in Production |
| Weekly / as used | Admin market-data status, usage, delivery failures |
| On vendor change | Re-run owner market-data checklist; re-verify written terms |
| On feed upgrade (IEX→SIP) | Confirm entitlement; update `ALPACA_STOCK_FEED`; verify labels |
| On domain change | Update `NEXT_PUBLIC_APP_URL`, Resend, EDGAR user-agent |
| Quarterly | Secret rotation review; cron auth test; storage permissions |

---

## 8. Enabling scheduled Production email (final)

Only after **all** gates G1–G12 are GO:

1. Confirm `EMAIL_FROM` domain verified in Resend.
2. Confirm license scope permits `email_attachment` (`redistributable` in default surface matrix — requires real authorization).
3. Owner records approval (who / when).
4. Enable delivery path (Resend key present; worker cron healthy).
5. Watch first Chicago trading-day editions (07:30 / 11:30 / 16:00 America/Chicago, or early-close + 1 hour) via cron tick — not fixed UTC clocks. Confirm three archive rows; no 15:30 close mail.
6. Keep pause plan ready (section 3).

If any gate flips to NO-GO, **disable scheduled email immediately**.
