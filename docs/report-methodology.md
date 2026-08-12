# Report methodology

How editions are drafted, labeled, and gated before archive/email.

## Coverage language

- Every market/news/macro/corporate record includes `providerName`, timestamps, `delayStatus` / `latencyClass`, `feedCoverage`, and `sourceQuality` (`primary` | `secondary` | `estimated` | `mock`).
- Prefer `latencyCoverageLabel({ feedCoverage, latencyClass })` for human-readable UI and report labels (e.g. “Real-time — IEX”, “15-minute delayed”).
- Free-tier Finnhub prints are treated as **delayed** (`delayed_15m`) unless a future adapter proves realtime.
- **IEX ≠ SIP:** never describe IEX prints as SIP, NBBO, or full-market consolidated.
- Report methodology section states that prices/percents come only from the evidence snapshot — no fabricated prints ([`content-builder.ts`](../src/lib/reports/content-builder.ts)).
- Demo/fixture runs must disclose DEMO and must not be used for trading decisions.

## Session baselines

Session-aware change math lives in [`session-math.ts`](../src/lib/market-data/session-math.ts):

| Session | Primary baseline | Notes |
| --- | --- | --- |
| Premarket / regular | **Prior regular-session close** | Day change vs prior close |
| After-hours | Prior regular close (day) **and** today’s **official close** (AH leg) | Do not confuse AH % with day % |
| Overnight / closed | Prior regular close when a last exists | AH fields null |

Missing prices stay **null** — never coerce to zero. Gap % (open vs prior close) is optional and separate.

## Material mover rules

Implemented in [`detectMaterialMovers`](../src/lib/domain/material-movers.ts):

| Rule | Default |
| --- | --- |
| Percent threshold by market cap | mega 1.5% · large 2% · mid 3% · small 5% · micro 8% (unknown → mid) |
| Extended hours | ×1.5 threshold (premarket / afterhours) |
| Watchlist boost | ×0.7 threshold |
| Min price | $1 |
| Min volume | 50,000 (when present) |
| Relative volume | ≥ 0.5 when average known |
| Max bid–ask spread | 5% of mid (bad-tick filter) |
| Unmonitored ETFs | suppressed unless watchlisted / monitored |
| Extreme move | >40% without volume support rejected |

Candidates start with `causalStatus: "unclear"` until catalysts are attached.

### IEX / tracked-universe movers wording

Alpaca (and other universe-scoped adapters) rank movers **only within the configured refresh universe**, not the full exchange tape. Coverage notes must say so (e.g. “Tracked-universe movers only” plus IEX single-exchange disclaimer). Do not imply exchange-wide “top gainers/losers” when the feed or universe is limited.

## Frozen snapshots

At the `normalizing_market_data` pipeline stage, live runs freeze observations, session baselines, and provenance into an immutable `report_market_snapshots` payload (see migration + report-snapshot helper). Later stages (AI, PDF, email) must read the freeze — not a live re-fetch — so editions stay reproducible and license-scoped.

## Causality labels

Allowed labels ([`CausalStatusSchema`](../src/lib/providers/types.ts)):

| Label | Meaning |
| --- | --- |
| `confirmed` | Primary source directly supports the claim |
| `reported` | Credible secondary/wire reports the link |
| `inferred` | Reasonable inference; weaker evidence |
| `unclear` | No adequate catalyst in the bundle |

AI and content builders must keep causal language within these labels and back material claims with `sourceIds`.

## Citations

[`validateClaimsHaveCitations`](../src/lib/domain/citations.ts): every **material** claim must have one or more `sourceIds` that exist in the report sources list. Missing or unknown IDs fail the quality gate as **blocking**.

## Quality gate

[`runQualityGate`](../src/lib/reports/quality-gate.ts) checks:

1. Document schema validity  
2. Required sections present ([`REQUIRED_SECTION_KEYS`](../src/lib/reports/section-keys.ts))  
3. Empty section bodies → warning  
4. Material claim citations  
5. Numbers in prose appear in the evidence bundle (no invented figures)  
6. No duplicate mover tickers  
7. **Market-data extensions (follow-up):** stale core observations; coverage too narrow for claims made; **license surface** blocks for `pdf_inclusion` / `email_attachment` / `ai_analysis_input` when scope forbids them; latency/coverage label mismatch vs freeze provenance  
8. **Edition / cutoff:** document edition matches the run; midday and `close_postmarket` include a prior-edition thesis trail; thesis ids from earlier same-day editions are never dropped  
9. **After-hours (`close_postmarket`):** when `materialChangeDetected === false`, the AH block must include the required quiet-session sentence  
10. **Options language:** rows cannot claim bought/sold/bullish without cited evidence  

Severity: `blocking` | `warning` | `ok`. Delivery of partial reports defaults to **only when severity ≠ `blocking`** (assumption A15). Disallowed product surfaces fail closed (do not ship PDF/email that the license scope does not permit).  

## Edition content notes

Premarket / midday / Close / Postmarket editions use distinct framing notes (`EDITION_CONTENT_NOTES` in [`editions.ts`](../src/lib/reports/editions.ts)):

- **Premarket** — overnight futures, premarket movers, today’s calendar  
- **Midday** — opens with Changes Since Premarket (audit of premarket theses)  
- **Close / Postmarket** — regular-session recap, changes since midday only, first-hour after-hours, final thesis status, overnight setup. Published at 16:00 America/Chicago (or early close + 1 hour). Not a 15:30 close report and not a fourth postmarket report.

Structured theses, trade ideas, and the AH block live on the canonical document (`reports.canonical_json`) so later editions can audit them without parsing Markdown.
