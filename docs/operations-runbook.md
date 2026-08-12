# Operations runbook

## Failed providers

1. Check Admin / provider health banner and `SourceRegistry` last error fields.  
2. Confirm env keys on Vercel; watch vendor status (Alpaca, Massive, Finnhub, FRED, Resend, LLM).  
3. Rate limits (429): registry / usage backoff; reduce universe size (`MARKET_DATA_MAX_UNIVERSE_SIZE`) or upgrade tier.  
4. Temporary disable via source registry / admin config if a source poisons jobs.  
5. Local: `ALLOW_MOCK_PROVIDERS=true` only for development — never as a prod workaround.

## Market-data entitlement failures

Symptoms: `EntitlementError` with codes `unauthorized_feed`, `plan_limit`, `feature_unavailable`, `license_scope`, `http_401`, `http_403`; health events with status `entitlement`.

1. Confirm `ALPACA_*` / `MASSIVE_*` credentials and that the plan includes the requested feed (`ALPACA_STOCK_FEED=sip` requires SIP entitlement).  
2. Confirm `MARKET_DATA_LICENSE_SCOPE` matches how the app is used (solo dev vs internal team vs redistributable).  
3. Confirm `MARKET_DATA_LICENSE_ACKNOWLEDGED=true` only after the owner verified **current** vendor terms — acknowledgement is an **operational guardrail, not proof of a license**.  
4. Production shared surfaces fail closed without `internal_team` or `redistributable` + acknowledgement.  
5. Do not “fix” entitlement by switching labels (e.g. claiming IEX is SIP) or enabling mocks in production.

## Rate limits & quotas

- Usage counters (minute/hour/day) warn near configured limits; circuit breaker backs off.  
- On 429: honor `Retry-After` when present; skip overlapping refresh via advisory lock.  
- Shrink universe or lengthen `MARKET_DATA_REFRESH_*_SECONDS` if limits persist.

## Stale data

- Cache age > `MARKET_DATA_STALE_AFTER_SECONDS` → show stale banner / `latencyClass: "stale"`.  
- Failed refresh must **keep last valid** observation (no zero-fill).  
- If refresh never succeeds after deploy: check lock stuck, credentials, or primary provider down.  
- Reports should freeze at normalize time; a live dashboard may be stale while a frozen edition remains valid for its cutoff.

## Provider switching

1. Set `MARKET_DATA_PRIMARY` / `MARKET_DATA_FALLBACK` (`alpaca` | `massive` | `finnhub` | `none`).  
2. Deploy env change; confirm Admin market-data status shows new primary and feed label.  
3. Fallback keeps **its own** provenance — verify UI does not show primary’s feed on fallback prints.  
4. After switch, run a manual admin refresh (if available) and confirm usage counters increment on the new provider.  
5. Finnhub remains a valid delayed fallback when keyed.

## License fail-closed recovery

| Condition | Recovery |
| --- | --- |
| Scope `single_user_development` in multi-user prod | Stop shared use; obtain proper vendor authorization; set `internal_team` or `redistributable` only if terms allow |
| Acknowledgement false in prod | Owner verifies terms, then sets `MARKET_DATA_LICENSE_ACKNOWLEDGED=true` |
| Surface blocked (PDF/email/AI) | Narrow product features or upgrade license scope after written authorization |
| Unauthorized feed (401/403) | Fix keys/feed entitlement; do not broaden `feedCoverage` in code |

## Partial reports

- Quality gate severity `warning` → report may complete as **`partial`** and still deliver if policy allows (default: deliver unless **`blocking`**).  
- `blocking` issues (schema, missing sections, uncited material claims, invented numbers, duplicate movers, disallowed license surfaces) → do not treat as successful full delivery; mark `failed` or hold for ops.  
- Surface `coverageNotes` / data cutoff on the report and email so readers see gaps.

## Retries

- Cron **worker** re-enters non-terminal pipeline stages; prefer stage-level idempotency (e.g. skip PDF re-upload if object exists).  
- Admin **retry job** / **resend delivery** / market-data refresh require admin permissions.  
- Cap automatic retries (registry `retry.maxAttempts`); escalate to manual after exhaustion.  
- On-demand generation is rate-limited (assumption A13: 3/user/hour) to avoid floods.

## Duplicate prevention

- Idempotency key `{tradingDate}:{edition}:{scheduleVersion}:{firmId}` — tick must no-op when a run already exists.  
- Grace window (15 minutes) limits how long a collect or publish instant stays “due”; collect and publish share one key.  
- Close / Postmarket: collection may start at 15:00 CT; PDF/email wait until 16:00 CT (or early close + 1 hour).  
- Completed `delivering_email` is not re-sent on worker retry.  
- Market refresh advisory lock prevents overlapping ticks from double-fetching.  
- News clustering uses canonical URLs + content hashes to reduce duplicate headlines in a single run.

## Delivery failures

1. Inspect delivery rows / Resend dashboard for bounces and domain verification.  
2. Confirm `EMAIL_FROM` is allowed on the Resend account.  
3. Admin **resend** for a specific delivery id after fixing the cause.  
4. Mock/dev: check `tmp/email-outbox/*.json` — if files appear, the pipeline reached email but Resend was not configured.  
5. If PDF missing, verify Storage bucket permissions and re-run from `rendering_pdf` / `archiving` rather than only resending empty mail.  
6. If quality gate blocks on `email_attachment` / `pdf_inclusion`, fix license scope before retrying delivery.

## Escalation checklist

- [ ] Cron 401s → `CRON_SECRET` mismatch  
- [ ] Empty dashboard in prod → providers failing closed, license gate, or RLS blocking reads  
- [ ] Stale forever → refresh lock, keys, or cadence misconfig  
- [ ] Wrong feed label → provenance bug; treat as P0 if IEX shown as SIP  
- [ ] Members seeing admin → should not; verify role in `team_memberships`  
- [ ] DST oddities → confirm Chicago helpers, not hardcoded UTC edition times  
