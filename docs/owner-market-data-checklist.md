# Owner market-data checklist

Account-owner steps before treating **shared** or **scheduled** real-time market data as authorized in this app.

This repository **does not purchase** vendor plans and **does not claim** that production shared real-time is activated. Complete every step yourself.

## Guardrail (read first)

`MARKET_DATA_LICENSE_ACKNOWLEDGED=true` is an **operational guardrail** confirming you verified the provider’s **current** terms for your intended use. It is **not** proof of a license, entitlement, or redistribution right. Setting it without a real authorization is incorrect and unsafe.

## Nine owner steps

1. **Select provider**  
   Choose Alpaca and/or Massive (Finnhub optional as delayed fallback). Set `MARKET_DATA_PRIMARY` / `MARKET_DATA_FALLBACK`. Prefer IEX-only Alpaca for low-cost solo development unless you have SIP entitlement.

2. **Confirm entitlements**  
   In the vendor dashboard, confirm API access, feed (IEX vs SIP / delayed vs realtime / FMV), symbol and rate limits. Official references: [Alpaca docs](https://docs.alpaca.markets/), [Alpaca data plans](https://alpaca.markets/data), [Massive docs](https://massive.com/docs/), [Massive pricing](https://massive.com/pricing) / [business](https://massive.com/business).

3. **Obtain written authorization**  
   If the desk is multi-user, displays data to others, archives/PDF/emails prints, or otherwise redistributes, obtain **written** authorization from the vendor (or a business plan that explicitly covers that use). Do not assume retail/individual plans allow team redistribution — Alpaca’s public FAQ states redistribution of API data is not permitted under standard terms ([support article](https://alpaca.markets/support/redistribute-alpaca-api)).

4. **Configure secrets**  
   Set `ALPACA_DATA_KEY_ID`, `ALPACA_DATA_SECRET_KEY`, `ALPACA_STOCK_FEED`, and/or `MASSIVE_API_KEY` (and base URLs if needed) in Vercel / `.env`. Never commit secrets or store them in `provider_configs`.

5. **Set scope + surfaces**  
   Set `MARKET_DATA_LICENSE_SCOPE` to match authorized use (`single_user_development` | `internal_team` | `redistributable`). Understand default permitted surfaces in [`licensing.ts`](../src/lib/market-data/licensing.ts). Only then set `MARKET_DATA_LICENSE_ACKNOWLEDGED=true` as the ops guardrail.

6. **Smoke test (read-only)**  
   With keys present, run the opt-in smoke script (e.g. `npm run test:market-smoke` when available). Confirm snapshots return, feed labels are correct, and no CI-default live calls are required.

7. **Verify labels**  
   On dashboard / admin status: confirm latency + coverage labels (e.g. “Real-time — IEX”), as-of timestamps, and that IEX is **never** labeled SIP/NBBO/full-market. Confirm movers wording is tracked-universe only when applicable.

8. **Non-distributed test report**  
   Generate one edition in a non-distributed configuration (scope/surfaces that do not email or broadly redistribute). Confirm frozen snapshot provenance, quality gate, and PDF/in-app content match the freeze. Do not send redistributed email until step 3 and scope allow `email_attachment`.

9. **Approve scheduled activation**  
   Explicitly approve turning on cron-driven refresh + scheduled editions for the entitled configuration. Document who approved and when. Until this step, treat shared production real-time as **not activated**.

## After activation

- Monitor Admin market-data status, usage counters, and health events.  
- Re-verify terms when changing providers, feeds (IEX→SIP), or product surfaces (adding PDF/email).  
- On entitlement or license failure, follow [`operations-runbook.md`](./operations-runbook.md) — fail closed, do not broaden labels.
