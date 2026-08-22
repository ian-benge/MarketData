# Desk intelligence handoff

IB Market Data now has a grounded desk-intelligence layer. It is not a chatbot. It compiles the current tape, clustered headlines, coverage, and book into evidence packs, optionally asks a model to tighten the wording, then throws away anything that invents numbers, citations, tickers, or attribution upgrades.

## What the audit found

- The product already had a real intelligence stack (`src/lib/intelligence/`): ingest → cluster → classify → attribute → search. Material News, Why-it’s-moving, and dashboard joins were deterministic on purpose.
- Report drafting called LLMs in `analyzeAndDraft` and then discarded the output, publishing `buildReportDocument()` only. `ai_usage_events` existed and was unused.
- Positions, watchlists, catalysts, and cron ticks were live. A generic assistant would have been the wrong surface: traders need cited explanations next to the tape, not a sidebar chat.

## What shipped

User-facing workflows:

1. **Market Overview — Desk intelligence** — session brief with material-now, unexplained tape, in-book flags, themes, and a constrained Ask.
2. **Why-it’s-moving narratives** — watchlist inspector, selected watchlist row, selected material mover, and Material News why panel. Unknown stays unknown.
3. **Material News** — “What’s material” digest, Ask this session (also deep-link `/news?ask=` and command palette “Ask the desk”).
4. **Positions — Book risk** — open lots vs unexplained tape / catalysts / concentration. Hidden while an owner blotter is locked.
5. **Reports** — model synthesis/exec/editorial are merged only when numbers and `sourceIds` pass the quality gate.

Runtime:

- `src/lib/desk-intel/` — evidence packs, prompts, rules compile, grounding, generate (rules-first), cache, rate limits.
- `src/lib/ai/gateway-adapter.ts` — Vercel AI SDK `generateText` via `"provider/model"` strings, with provider fallbacks still in `AiOrchestration`.
- APIs: `GET/POST /api/intel/session`, `GET /api/intel/move`, `POST /api/intel/moves`, `GET /api/intel/book-risk`, `GET /api/intel/digest`, `POST /api/intel/ask`.
- Cron: `/api/cron/intel` every 15 minutes; tick also writes a session brief after news ingest.
- Schema: `public.desk_intelligence_briefs` (applied to hosted project `grelplmmgywqoliqzrfi`). Writes are service-role only; members may SELECT their firm rows.

## Architecture decisions

- **Rules first, model overlay second.** Every product has a deterministic compilation. Missing keys, fixture mode, model errors, and failed grounding all show that compilation.
- **No causal story for `unknown`.** Those names never go to the model.
- **Evidence packs, not RAG chat.** The model sees a hashed, sanitized JSON bundle. Untrusted headlines are wrapped in `BEGIN_UNTRUSTED_EVIDENCE`. Instruction-like questions are not sent to the model.
- **Gateway preferred, direct keys as fallback.** Fast tasks: Gemini Flash. Strong tasks: Claude Sonnet. Direct adapters: Anthropic and Gemini.
- **No streaming.** Answers are grounded before display so a trader never watches a hallucination get walked back.
- **Query interpret is optional.** Natural-language Material News queries can pick up extra tickers/types from the model; tests and missing credentials skip it. Lexical `parseNewsQuery` still owns the default path.

## Setup (manual credentials only)

No dashboard SQL is required. The `desk_intelligence` migration is already applied.

For live model overlay (rules still work without this):

1. Prefer Vercel AI Gateway: set `AI_GATEWAY_API_KEY`, or `vercel env pull` so `VERCEL_OIDC_TOKEN` is present on the deployment.
2. Or set at least one of `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`.
3. Optional: `DESK_INTEL_MODEL_FAST`, `DESK_INTEL_MODEL_STRONG`, `DESK_INTEL_ENABLED` (default true), `DESK_INTEL_IN_FIXTURES` (default false).
4. Copy from `.env.example`. Do not commit secrets.

Demo/fixture mode never calls the model unless `DESK_INTEL_IN_FIXTURES=true`. `NODE_ENV=test` never calls the model unless a test passes `forceModel`.

## Tests performed

- Unit: grounding (invented numbers, attribution upgrade, uncited facts), rules compile (IREN 8-K vs unexplained XYZ, injection refusal, book concentration), generate (unknown not sent to model, invented SPX 5123 dropped, grounded IREN overlay kept, injection blocked), report-merge, sanitize, query-interpret.
- API: `/api/intel/session` and `/api/intel/ask` with mocked service.
- UI: SessionIntelligence + GroundedNarrative jsdom; existing NewsWorkspace fetch mock covers `/api/intel/`.
- Scenario eval: `npm run test:desk-intel` (no live model).
- Hosted schema: `desk_intelligence_briefs` created with RLS.

## Known limitations

- Live model quality still depends on having a gateway or provider key in the runtime. Without keys, the UI is the rules compilation — useful, but less tight prose.
- Evidence is the current process cache / `market_news_items` window, not a multi-year filing archive. Second-order names can be thin.
- Ask is session-scoped retrieval, not a research analyst with tools. “Insufficient evidence” is a success state.
- In-process rate limits reset on cold start. Postgres cache is the durable layer.
- Streaming, embeddings, and reaction-at-publish were deliberately skipped.
- Gateway adapter uses JSON-in-text plus Zod rather than SDK structured output, so provider JSON-mode differences are absorbed by `extractJsonPayload`.

## Highest-value next work

1. **Labeled eval set** of 30–50 live sessions (confirmed 8-K, sympathy, unknown tape, injection, invented print) scored for citation validity and unknown preservation.
2. **Reaction-at-publish** — join new primary filings to the open book within a minute and surface a book-risk flash without waiting for the 15-minute cron.
3. **Embeddings / hybrid search** over `market_news_items` once the lexical search ceiling is obvious in production.
4. **Per-firm token budgets** persisted from `ai_usage_events` (the table is already there).
5. **Streaming only after** the evidence pack is frozen and the UI can paint rules copy first, then replace with a grounded overlay.
