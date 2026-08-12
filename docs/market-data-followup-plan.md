# Market-data follow-up — plan (2026-08-10)

## Audit summary

Existing app already has:
- Monolithic `MarketDataProvider` (quotes, bars, breadth, movers) + Finnhub/mock adapters
- Normalized quote/bar schemas with delay/session/provenance fields (extend, don’t replace)
- Dashboard API + fixtures, report pipeline with `normalizing_market_data` stage
- Cron tick/worker, Chicago schedule, quality gate

## Plan

1. Add capability-specific contracts + feed/latency/license/surface schemas (extend `types.ts`)
2. Migration for refresh runs, observations, usage, licensing config (non-secret)
3. Alpaca REST adapter (IEX/SIP) + Massive REST adapter with fixtures/tests
4. Capability router + production license fail-closed
5. Centralized adaptive refresh (lock, universe, cache, quotas)
6. Wire dashboard/admin freshness labels; freeze snapshots in reports/quality gate
7. Docs + owner checklist; full validation

## Risks

- Alpaca retail plans may forbid shared redistribution — enforce license scope
- Massive inactive until key + scope; don’t claim full market from IEX
- Overlapping cron ticks → request storms (advisory lock required)
- Breadth disabled unless coverage is truly broad

## Default mode

Local: mock when `ALLOW_MOCK_PROVIDERS` + not production.  
Primary when entitled: `MARKET_DATA_PRIMARY=alpaca` with `ALPACA_STOCK_FEED=iex`.  
Production shared surfaces require `MARKET_DATA_LICENSE_SCOPE` ∈ {internal_team, redistributable} + `MARKET_DATA_LICENSE_ACKNOWLEDGED=true`.
