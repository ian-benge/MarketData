# Page Improvement Harness v2

Deterministic TypeScript orchestration for aggressive, evidence-driven improvement of one IB Market Data page at a time. Agents provide judgment. TypeScript owns sequencing, permissions, validation, budgets, checkpoints, evidence freshness, and completion.

This is not a Next.js app. It is a developer CLI in `scripts/page-harness/`, the same pattern as `scripts/capture-ui.ts`.

## Commands

```bash
npm run page:login
npm run page:models
npm run page:harness-check
npm run page:routes
npm run page:inspect -- /settings
npm run page:audit -- /settings
npm run page:improve -- /denied --objective "Tighten keyboard access" --max-iterations 1 --risk low
npm run page:status
npm run page:prompts -- <run-id>
npm run page:report -- <run-id>
npm run page:resume -- <run-id>
npm run page:resume -- <run-id> --max-total-tokens <higher> --max-minutes <higher> --max-agent-runs <higher>
```

| Command | What it does |
| --- | --- |
| `page:login` | Mint a local SDK key via `Cursor.auth.login()` (value is not printed) |
| `page:models` | Call `Cursor.models.list()`, pin Grok 4.6 xhigh, print the catalog |
| `page:harness-check` | Hooks, the same sandbox `Agent.create` options used in live runs, worktree smoke, then pin Grok 4.6 xhigh |
| `page:routes` | Inventory `src/app/**/page.tsx` + catalog; recommend risk; **does not modify code** |
| `page:inspect -- <route>` | Demo server + Playwright evidence only (no agents) |
| `page:audit -- <route>` | Deterministic preflight, one planner, independent contract review, locked contract, independent evaluation, required skeptic on critical |
| `page:improve -- <route>` | Isolated worktree, locked contract, build/verify/evaluate/repair |
| `page:status [-- run-id]` | Authoritative process status: reusable vs resumable, contract result, skeptic, budgets, next action |
| `page:prompts [-- run-id]` | Exact composed prompts persisted for the run |
| `page:report [-- run-id]` | Print `artifacts/report.md` |
| `page:resume -- <run-id>` | Resume an incomplete run from last atomically completed state. Refuses routes and never starts a new run. Budget exhaustion requires a strictly higher cap. |

There is **no** unattended auto-merge or auto-deploy command.

### Flags

`--objective`, `--objective-file`, `--audit-only`, `--skeptic` / `--no-skeptic`, `--max-iterations`, `--max-minutes` (alias `--max-duration-minutes`), `--max-contract-rounds`, `--max-agent-runs`, `--max-total-tokens`, `--reviewers 1|2`, `--risk low|medium|critical`, `--from-audit <run-id>`, `--resume <run-id>`, `--allow-no-sandbox`, `--isolation worktree|branch|none`, `--role`, `--base-url`, `--port`, `--cleanup-worktree`.

`--from-audit` reuses an audit only when it is **reusable**: completed, provenance-valid, and `assessAuditReuseValidity` passes. Invalid `--from-audit` **stops**. It never falls back to a fresh plan.

`reusable` and `resumable` are separate persisted flags. A failed run may be `reusable=false` and still `resumable=true` when the interruption is retryable (network, SDK connection, process death, recoverable server, **budget exhaustion**) and artifacts are internally consistent. `page:resume` continues from the last atomically completed phase or role. It does **not** treat `reusable=false` as non-resumable. Completed audits are reusable via `--from-audit` and are not resumable.

`budget_exhausted` is a distinct retryable category. Resume may only **increase** `--max-total-tokens`, `--max-minutes`, and/or `--max-agent-runs`. Consumed tokens, active runtime, agent runs, and contract rounds never reset. Offline downtime stays excluded from active runtime. An immutable `budget-extensions.json` record captures old limits, new limits, timestamp, and reason. Contract-round increases are never silent: pass an explicit higher `--max-contract-rounds`. Permission, security, provenance, artifact corruption, and worktree/SHA mismatch stay non-resumable.

`--risk low|medium|critical` selects a typed workflow (`resolveWorkflowPolicy()`): reviewer count, skeptic, adjacent regression, Playwright timeout, inspect samples. Critical default: one planner, two independent contract reviewers, deterministic reconciliation, target/static verification, one evaluator, required skeptic. Medium/low may use one reviewer unless `--reviewers 2` overrides. Requested and effective policy are recorded in `request.json`, `workflow-policy.json`, `final-state.json`, and reports. Critical skeptic, evaluator, target verification, adjacent regression, provenance, and isolation requirements are not weakened.

A completed audit is reusable only when target verification ran against a live harness-owned origin, required evaluation roles (including skeptic when policy or `--skeptic` requires it) completed, and provenance is valid. Infrastructure failures (`ECONNREFUSED`, server-readiness, origin mismatch) are not product test failures and cannot produce a reusable audit.

Reports separate **process status** (`audit_complete`) from **contract result** (`passed` | `failed`). Audit-only reports never copy baseline measurements into after fields. SDK token usage is `measured`, `unknown`, or `partial` (known totals are a lower bound when earlier attempts were unmeasured). The total-token limit is not claimed as fully enforced retrospectively when usage is partial. Planner, reviewers, builder, evaluator, and skeptic all count toward agent-run, token, and time budgets, including failed invocations. Budget cancellation restores the best **complete passing** checkpoint when one exists. It does not restore baseline merely because an unchanged adjacent failure is baseline debt, and it does not start another model run after the budget is exhausted. Deterministic inspect/verify may still run if time remains; otherwise the passing checkpoint is reported as preserved but not integration-ready.

`report.md`, `report.json`, `run-status.json`, `final-state.json`, and `page:status` must agree. Successful remediation clears stale failure text.

## Architecture

TypeScript is the state machine. Phases are explicit, persisted under `tmp/page-harness/<run-id>/machine.json`, and resumable:

`PRECHECK → WORKTREE → BASELINE → PLAN → CONTRACT_DRAFT → DUAL_REVIEW → CONTRACT_LOCK → BUILD → VERIFY → EVALUATE → OPTIONAL_SKEPTIC → CHECKPOINT → REPAIR_OR_FINISH → RESTORE_BEST → REPORT`

**Deterministic preflight runs before the planner.** BASELINE validates worktree SHA, demo-server lease/health, authentication and expected role, target route/origin, baseline inspect/performance, and configured static plus target Playwright checks. Infrastructure failures stop before model spend. Product-test failures become `verify-preflight.json` baseline evidence and do not automatically block the audit.

A provenance-bound **route context bundle** (`route-context.json`) is attached to planner, reviewers, evaluator, and skeptic. It prefers the target route/components, cataloged tests, connected APIs/schemas, baseline inspect/performance, and design-system primitives. Prompts must not send agents on repository-wide exploration.

Once an SDK invocation returns a valid structured result, the harness **atomically persists** invocation status, the validated role artifact, usage, proposal/evidence hashes, and the phase decision — then enforces token/time/agent-run budgets. A cap crossed after persist leaves that role completed and stops before the next invocation (`budget_exhausted`). Truncated or unvalidated output is never promoted.

Every phase record has typed input, result, status, timestamps, and failure state. Completed expensive work is not repeated on resume. **No edits occur before `CONTRACT_LOCK`.** The contract-round limit is a safety ceiling, not a target. A conflict-free critical audit should lock after the first independent review (planner + two reviewers). One disagreement should add at most one or two dispute-only calls. If reviewers still disagree at the cap, the run stops as `contract_exhausted` with unresolved gates and **does not BUILD**.

Fits this repo:

- Isolated git worktrees under `.worktrees/` (gitignored). `node_modules` is a junction to the parent install. Turbopack panics if that link escapes the project, so the demo server sets `HARNESS_TURBOPACK_ROOT` to the parent repo when `next.config.ts` supports it, otherwise Next starts with `--webpack`.
- **Phase-aware server lease:** the demo server is acquired only before BASELINE, VERIFY, EVALUATE, or OPTIONAL_SKEPTIC. A resume at DUAL_REVIEW does not start Next; transitioning into verification probes the persisted handle and restarts if it is stale.
- Artifacts under `tmp/page-harness/<run-id>/` (gitignored via `tmp/`)
- Playwright demo auth (`POST /api/auth/demo`) and Chrome from `playwright.config.ts`
- Design system: `docs/ib-market-data-design-system.md` and `src/app/globals.css`

## Model

Before **every** reasoning agent, the harness calls `Cursor.models.list()` with the active credentials, discovers the Grok 4.6 catalog entry, and pins the catalog-provided parameter id/value for **xhigh**. A **fresh** SDK agent is created for every role and iteration. Agents are never resumed or reused across planner, reviewer, builder, evaluator, or skeptic contexts.

The resolved model id and params are recorded in `model.json` and per-agent `model-resolution-latest.json`. The SDK run's reported model (`system` init and `run.wait()` result) must match. If Grok 4.6 xhigh is unavailable or differs at runtime, the CLI stops and prints the catalog. It never uses Auto, default, another effort, or another model.

Set `CURSOR_API_KEY` in the shell or `.env.local`, or run `npm run page:login`. Do not add the key to `src/lib/env.ts`.

## Threat model

Prompts are not security controls. Evidence is untrusted.

| Control | Where it lives |
| --- | --- |
| Tool allowlists / denylists per role | `scripts/page-harness/permissions.ts` + `Agent.create({ tools, disallowedTools })` |
| Custom-tool Zod validation, artifact allowlists, size caps, route/origin/path containment | `agents.ts`, `containment.ts` |
| Immutable deny of merge/push/deploy/secrets/destructive FS | `.cursor/hooks.json` + `.cursor/hooks/*.mjs` (`failClosed: true`) |
| Local sandbox when the SDK helper supports filesystem isolation | Central `resolveSandboxPolicy()` in `scripts/page-harness/sandbox.ts`. Same options object is passed to `Agent.create`, preflight, and `page:harness-check`. Windows is always unsupported (proxy-only helper). `{ enabled: false }` is passed explicitly so `~/.cursor/sandbox.json` cannot re-enable it. |
| Read-only audit without filesystem sandbox | Recorded `SANDBOX_UNAVAILABLE` fallback after verifying planner/evaluator/reviewer have no mutating tools |
| Improvement / builder without filesystem sandbox | Fails before worktree/server unless `--allow-no-sandbox` |
| `settingSources: []` | Prevents loading project Supabase MCP into harness agents |
| Subagents (`task`) | Disallowed in SDK tool lists **and** `subagentStart` / `preToolUse` hooks while `PAGE_HARNESS_ACTIVE=1` |
| Browser inspection | Harness-owned `http://127.0.0.1:<port>` only |
| Untrusted evidence wrapping | `injection.ts` — page content, APIs, comments, fixtures, logs, screenshots, artifacts, repair text cannot override role, contract, model, or policy |

Always-on hook denies (IDE agents included): `git push --force`, `git reset --hard`, `supabase db reset`, `vercel --prod`, `npm publish`. Ordinary `git push` stays allowed in the IDE. While the harness is active, push, merge, rebase, deploy, hosted `supabase db push`, `.env` reads/writes, credential dump, and recursive deletes are denied.

There is no programmatic hook callback API in `@cursor/sdk`. Policy is file-based only.

## Page contract

Every acceptance gate must include: stable id, dimension, `required` or `conditional`, user/trader outcome, exact observable, verification method, evidence artifact, binary or quantitative expected result, baseline value where applicable, failure severity, targeted repair context. Conditional gates also need `activationCondition`.

Vague language (`looks professional`, `works correctly`, `feels fast`, `is intuitive`) is rejected at parse time. Implementation prescriptions (`export const`, `src/*.ts`, named helpers) are moved to `repairContext` or rejected unless `architectureConstraint` is true.

Required gates can only **pass**. `not_applicable` on a required gate is a failure. Conditional `not_applicable` is allowed only when evidence proves the activation condition is false.

Independent reviewers operate on **one proposal hash** with structured operations (`accept_all`, `accept_gate`, `replace_gate`, `add_gate`, `remove_gate`, `dispute_gate`, and the constraint equivalents). They do not independently regenerate the entire contract. Legacy `accept` / `amend`+full contract still parse; full replacements are diffed into ops. Rationale and `repairContext` are non-normative.

Canonical hashing sorts object keys and set-like collections, excludes timestamps, rationale, repair notes, and reviewer prose, and preserves every materially normative distinction (`userOutcome`, `observable`, `expected`, classification, verification method, constraints, ordered workflow steps). Equivalent wording in `repairContext` cannot mint a new hash; genuinely different observables remain conflicts.

After the first independent review, agreed gates/constraints are **frozen**. `contract-disagreement.json` contains only unresolved normative differences. Later reviewers see the canonical proposal, accepted material, evidence, and unresolved disputes — not a fresh full-contract round. The planner and completed reviewers are never repeated. At the round cap, unresolved items are reported as `contract_exhausted`; agreement is never fabricated.

### Example gate

```json
{
  "id": "keyboard_workflow.primary_cta",
  "dimension": "keyboard_workflow",
  "classification": "required",
  "userOutcome": "A trader reaching /denied can activate Return to Market Overview from the keyboard.",
  "observable": "keyboardTabOrder in inspect.json includes an A element whose href is /dashboard within the first 16 Tab stops.",
  "verificationMethod": "keyboard",
  "evidenceArtifact": "inspect/after/inspect.json",
  "expected": { "kind": "binary", "result": true },
  "baselineValue": null,
  "failureSeverity": "blocker",
  "repairContext": "Make EdgeActionLink keyboard-focusable with a visible focus ring."
}
```

## Baseline and evidence

Before edits, TypeScript captures: route, base Git SHA, redacted server/config snapshot, desktop/laptop/tablet/mobile screenshots, DOM landmarks, overflow, a11y, keyboard tab order, console errors/warnings, failed requests, request count, transferred bytes, duplication, waterfall, loading/empty/error/degraded signals, tests, JS transfer, React profiler availability, repeated navigation timings (median + variance).

Every evidence artifact carries: run id, route, contract hash, iteration, **evaluated worktree SHA** (not the original base SHA after edits), timestamp, server origin, browser, viewport, generating command. Pre-lock baseline inspect keeps `contractHash=pending` and is rebound through `provenance.json` after lock — the inspect file is not rewritten. Pending or mismatched hashes cannot pass contract gates.

Performance gates use measured baseline values, explicit tolerances, and the same environment. A single noisy timing sample is not proof.

After every builder iteration TypeScript — not the evaluator — restarts measurement, runs typecheck plus targeted Vitest/Playwright, and, when shared components change, includes adjacent-page tests.

## Repair loop and checkpoints

Failed gates produce a targeted repair packet for a **new** Grok 4.6 xhigh builder. After each iteration: verify, git checkpoint, fresh evaluator, optional skeptic, rank against baseline and previous best.

Ranking:

1. A complete required-gate pass outranks every incomplete checkpoint.
2. Among complete passes, fewer severe warnings.
3. Then stronger performance / data-correctness evidence.
4. Then fewer regressions and a smaller diff.

If nothing fully passes, the worktree is restored to the original baseline checkpoint. Exhausted budgets are never treated as success. Adjacent Playwright failures are blocking only when they are new, worsened, or incomparable to baseline evidence; proven unchanged baseline failures are recorded as debt and do not prevent a complete pass.

## Artifacts

Under `tmp/page-harness/<run-id>/` (redacted):

- `request.json`, `preflight.json`, `model.json`, `role-permissions.json`, `workflow-policy.json`
- `artifacts/prompts/` exact composed prompts
- `page-map.json`, `baseline.json`, `config.json`, `route-context.json`
- `inspect/before|after`, `performance/*`
- contract proposals, ops decisions, frozen gates, `contract-disagreement.json`, canonical contract, hash
- role transcripts (assistant text only; thinking is not persisted)
- builder summaries, verification, evaluations, skeptic
- `failed-approaches/`, `checkpoint-ranking.json`
- `report.md`, `report.json`, `final-state.json`, `handoff.json` (worktree, branch, base SHA, final SHA)
- `machine.json`, `resume-state.json`, `budget-extensions.json` (`reusable` vs `resumable`, incomplete reviewer, budgets)

Not persisted: hidden reasoning, secrets, cookies, authorization headers, raw env values, credential-bearing commands.

## Cost controls

Defaults: 3 repair iterations, 90 minutes, 3 contract rounds, 40 agent runs, 2_000_000 tokens. Crossing a limit after a valid persisted result stops as `budget_exhausted` without erasing that role. Improve loops may still restore the best **passing** checkpoint. Reports include measured / partial / unknown usage plus per-role and per-purpose agent runs, input, cached input, output, reasoning, total tokens, active runtime, contract rounds, and dispute-only calls.

A normal conflict-free critical audit is about five model calls: planner, two reviewers, evaluator, skeptic. Use `--max-iterations 1` and `--risk low` for cheap probes. `page:inspect` and `page:routes` spend no model tokens.

## Manual review and integration

1. Read `artifacts/report.md` and `handoff.json`.
2. Review the worktree branch (`page-improve/<slug>-<run-id>`). The original branch is untouched when isolation is `worktree`.
3. Diff against the recorded base SHA.
4. Run the page in the demo app. Check provenance copy, keyboard, and empty/error states yourself.
5. If you want it on a PR, create that PR **yourself**. The harness will not merge, push, or deploy.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Grok 4.6 xhigh unavailable | `npm run page:models`; catalog dump; API key from [Integrations](https://cursor.com/dashboard/integrations) |
| Runtime model mismatch | `model.json` vs run transcript; harness refuses to continue |
| `SANDBOX_UNAVAILABLE` | Expected on Windows (helper is proxy-only). Audits continue with `sandboxOptions.enabled=false`, hooks, autoReview, and read-only tool allowlists. Builder/improve runs stop unless `--allow-no-sandbox`. Check `sandbox.json`. |
| Baseline on `/login` | Invalid evidence. The harness now fails BASELINE, writes `inspect/before/diagnostics.json`, marks the run non-reusable, and does not start the planner. |
| Demo session / readiness | Server must pass `/api/health` and `/login` before auth. Member session is `POST /api/auth/demo`. Cookie and final pathname are verified. |
| Next fails in a worktree | `next.log`; Turbopack symlink — webpack fallback or `HARNESS_TURBOPACK_ROOT` |
| Contract will not lock | `contract-disagreement.json` / `contract-conflict-*.json`; unresolved gates only. `contract_exhausted` is not `unknown_fatal` and does not BUILD |
| Token cap after a finished reviewer | Role artifact should exist. Resume with a strictly higher `--max-total-tokens`. Consumed totals are not reset |
| Resume cannot find worktree | Isolation was `none` or `--cleanup-worktree` ran; start a new run |
| `page:resume` says not resumable | Failed runs can still be resumable. Check `resumable` separately from `reusable`. `budget_exhausted` needs a higher cap. Permission, provenance, corrupted artifacts, contract-round exhaustion (unless `--max-contract-rounds` is raised), security-policy, and worktree/SHA mismatch stay non-resumable. |
| Audit reuse refused | `from-audit-rejected.json` — invalid provenance, pending hash, missing target-route verification, aliased after-evidence, or fingerprint mismatch. The run does not start a planner. |

## Production-ready bar

Do not call a run production-ready unless: live Grok 4.6 xhigh was confirmed, harness tests passed, the audit and improve exercises produced valid evidence, and the original git branch was not modified by the improve worktree.
