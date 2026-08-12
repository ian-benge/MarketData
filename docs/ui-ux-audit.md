# IB Market Data UI/UX Audit

## Purpose and evidence

This audit records the pre-redesign product state, route and permission boundaries, UI-facing data contracts, and the issues that the redesign must resolve without changing established backend behavior. It is based on repository inspection and the rendered 1440px desktop and 375px mobile captures in [`docs/ui-screenshots/baseline`](./ui-screenshots/baseline/).

Representative evidence:

- [Desktop dashboard](./ui-screenshots/baseline/desktop-1440-dashboard.png) and [mobile dashboard](./ui-screenshots/baseline/mobile-375-dashboard.png)
- [Desktop archive](./ui-screenshots/baseline/desktop-1440-archive.png) and [mobile archive](./ui-screenshots/baseline/mobile-375-archive.png)
- [Desktop report](./ui-screenshots/baseline/desktop-1440-report.png) and [mobile report](./ui-screenshots/baseline/mobile-375-report.png)
- [Desktop admin team](./ui-screenshots/baseline/desktop-1440-admin-team.png), [desktop market-data admin](./ui-screenshots/baseline/desktop-1440-admin-market-data.png), and their mobile counterparts
- Login, forbidden, watchlist, and proposal captures at both widths in the same directory

The baseline set does not yet cover 768px, 1024px, or 1920px, nor deterministic loading, stale, empty, provider-error, rate-limit, or report-job states. Those are required in final visual QA.

## Executive assessment

The application has a sound compact component foundation and server-resolved role boundary, but it currently reads as a generic blue/navy FNIP operations dashboard rather than a distinctive IB Market Data research terminal. The desktop shell leaves substantial space unused, modules have nearly identical visual weight, and the dashboard has no chart despite having a bars API. At 375px, the horizontal application navigation truncates, archive controls overflow, and wide tables remain desktop tables inside narrow scroll containers instead of reprioritizing information.

The most important issues are not cosmetic. Several live-mode pages still read fixtures directly, the dashboard can silently substitute apparently fresh fixture data after an authenticated fetch failure, and an on-demand report redirects to an ID the detail route cannot resolve. A credible terminal redesign must make data origin and state explicit while preserving the existing server-side permission gates.

## Route and permission inventory

### Page routes

| Route             | Access           | Primary task                           | URL state and notable behavior                                                                                                               |
| ----------------- | ---------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`               | Public           | Session entry point                    | Redirects to `/dashboard` when a session resolves, otherwise `/login`.                                                                       |
| `/login`          | Public           | Password or local demo sign-in         | Reads `next`; credential and demo success both call `router.replace(next)`.                                                                  |
| `/invite/[token]` | Public           | Accept a team invitation               | Literal tokens `invalid`, `expired`, and `accepted` simulate those states; every other token renders the form.                               |
| `/denied`         | Public           | Explain forbidden access               | Static message and dashboard return action.                                                                                                  |
| `/dashboard`      | Member and admin | Scan market state and request a report | Server-rendered dashboard; on-demand action posts a fixed midday request.                                                                    |
| `/archive`        | Member and admin | Find a report                          | GET parameters: `q`, `edition`, `from`, `to`. Results deep-link to report detail.                                                            |
| `/reports/[id]`   | Member and admin | Read and download a report             | Fixture lookup; unknown IDs invoke the generic framework 404. PDF action appears only when `pdfAvailable`.                                   |
| `/watchlists`     | Member and admin | Review shared watchlists and sectors   | Read-only fixture presentation even though both roles have edit permissions.                                                                 |
| `/proposals`      | Member and admin | Review change proposals                | Read-only fixture queue even though members can submit and admins can approve.                                                               |
| `/admin`          | Admin only       | Team and operational administration    | `tab` values: `team`, `schedule`, `sources`, `market-data`, `ai-routing`, `jobs`, `deliveries`, `audit`; unknown values normalize to `team`. |

There is no `/reports` index page; the archive is the report index. There is no dedicated generation route, account/preferences route, or sign-out control. No custom `loading.tsx`, `error.tsx`, or `not-found.tsx` currently gives edge routes the product identity.

### Role model

The active application role is `admin` or `member`. A live session is valid only when Supabase returns a user with an active team membership. A missing or inactive membership resolves as no application session rather than a distinct disabled-account state.

Member capabilities:

- view dashboard and reports;
- download reports and generate an on-demand report;
- edit shared watchlists and sectors;
- submit proposals.

Admin adds:

- email on-demand reports and approve proposals;
- invite, deactivate, and change user roles;
- configure schedules, providers, AI routing, recipients, and thresholds;
- retry/cancel jobs, resend delivery, and view operational diagnostics/audit history.

The authenticated layout resolves the user before rendering the shell. The Admin navigation item is filtered by the server-provided role, and `/admin` independently redirects a member to `/denied`. This prevents privileged controls from flashing during role resolution and must be preserved.

Current UI coverage is narrower than the permission vocabulary. There are no UI controls for watchlist/sector editing, proposal submission/approval, role changes, schedule/provider/AI configuration, job retry/cancel, recipient configuration, or threshold configuration.

### API authorization and actions used by the UI

| Endpoint/action                                   | Required permission                      | Important request/response behavior                                                                               |
| ------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /api/dashboard`                              | `viewDashboard`                          | Returns a `DashboardSnapshot`; cache-miss response is marked stale/unavailable but still contains fixture values. |
| `GET /api/reports`                                | `viewReports`                            | Accepts the archive's `q`, `edition`, `from`, and `to` filters.                                                   |
| `POST /api/reports`                               | `generateOnDemandReport`                 | Body supports `premarket`, `midday`, or `close_postmarket`; UI radios send the selected edition.                  |
| `GET /api/reports/[id]`                           | `viewReports`                            | Returns fixture detail or 404.                                                                                    |
| `GET /api/reports/[id]/jobs`                      | `viewReports`                            | Returns the fixture job or a derived fallback job. No current page consumes/polls it.                             |
| `GET /api/reports/[id]/pdf`                       | `downloadReports`                        | Returns a demo PDF only for known reports with `pdfAvailable`.                                                    |
| `GET/POST /api/watchlists`                        | View/edit permissions                    | GET and POST are fixture/stub responses; POST accepts name, optional description, and symbols.                    |
| `GET /api/sectors`                                | `viewDashboard`                          | Read-only fixture response; no mutation endpoint.                                                                 |
| `GET/POST /api/proposals`                         | `submitProposals`                        | Supports four proposal types, but the current page does not expose submission. No approval endpoint exists.       |
| `GET/POST /api/admin/invitations`                 | Admin                                    | UI creates only `member` invites although API accepts either role.                                                |
| `POST /api/admin/deliveries/[id]/resend`          | `resendDelivery`                         | Returns queued status; current UI ignores response and failure.                                                   |
| `GET/POST /api/admin/market-data`                 | Admin                                    | Loads non-secret license/feed/freshness/quota config and forces a refresh.                                        |
| `GET /api/market/quotes`                          | `viewDashboard` plus surface entitlement | `symbols` is comma-separated, 1-80. Cache responses include per-quote stale state.                                |
| `GET /api/market/bars`                            | `viewDashboard` plus surface entitlement | `symbol`, `interval`, `limit`, and `surface`; fixture mode deliberately returns no bars.                          |
| `GET /api/market/movers` and `/api/market/status` | `viewDashboard`                          | Expose coverage notes, freshness, session, licensing, and provider usage.                                         |

Market API edge responses are part of the UI contract: entitlement failures are `403` with a machine `code`, an open provider circuit is `429` with `backoffMs`, and missing provider configuration is `503`. These states are not currently surfaced by any page.

## UI-facing data contracts and truthfulness constraints

### Dashboard and market observations

`DashboardSnapshot` contains:

- `asOf`, `dataCutoff`, and `stale`;
- quote tape, material movers, headlines, calendar events, provider health, and nullable latest report;
- optional `latencyCoverageLabel`, `feedCoverage`, `latencyClass`, `marketSession`, `licenseWarning`, `breadthSupported`, and `breadthExplanation`.

Quote, bar, and mover prices, changes, and volumes are nullable. Missing data must remain an em dash or an explicit unavailable state, never zero. Normalized observations carry provider time, retrieval time, provider name, session, delay, currency, source quality, and optional coverage notes.

The market-data layer distinguishes these values and the UI must not collapse them:

- coverage: `iex`, `sip`, `fmv`, `full_market`, `official_release`, `delayed_15m`, `eod`, `unknown`;
- latency: `realtime`, `delayed_15m`, `eod`, `stale`, `unavailable`, `mock`;
- sessions: overnight in the newer market-data schema, plus premarket, regular, after-hours, and closed;
- licensed surfaces: dashboard, server calculations, archived normalized data, derived charts, in-app reports, PDF, email attachment, and AI analysis input.

The dashboard currently mixes live cached tape/movers with fixture headlines, calendar, and latest report. A single global “live” presentation would therefore overstate the provenance of the full screen. Each module needs truthful source/freshness treatment at the narrowest useful scope.

### Reports

Report runs use the stable stages `queued`, `collecting_sources`, `normalizing_market_data`, `detecting_material_events`, `analyzing_and_drafting`, `validating_claims`, `rendering_pdf`, `archiving`, `delivering_email`, then `completed`, `partial`, `failed`, or `cancelled`.

Three related shapes currently coexist:

1. fixture summary/detail objects used by archive and HTML detail;
2. database report runs, reports, sections, claims, citations, files, and deliveries;
3. the PDF `ReportDocumentModel`, which also includes data cutoff, claims, source references, methodology, confidentiality, and demo state.

The redesigned report UI should consume an explicit view model/adapter rather than assuming these shapes are interchangeable. Persisted report market snapshots are immutable; dashboard refreshes must not make archived report values look live.

### Team content and operations

- Watchlists expose ID, name, optional description, default flag, and symbols. Database records additionally have creator and timestamps; do not display those fields until a real adapter supplies them.
- Sectors expose ID, slug, name, and symbols; persisted sectors additionally have description, order, and timestamps.
- Proposals support `watchlist_add`, `watchlist_remove`, `sector_change`, and `threshold_change`; states are pending, approved, rejected, and withdrawn.
- Invitation states are pending, accepted, revoked, and expired. The current public invite page's token-derived states are demo behavior, not a validated live contract.
- Delivery states include queued, sending, delivered, failed, bounced, and skipped. The current admin fixture shows only delivered and failed.
- Provider health is currently an open string in dashboard/admin view models. The UI recognizes healthy, degraded, down, and disabled, and should gracefully represent unknown values.

## Baseline visual and interaction audit

### Brand and product identity

- The shell, login, root metadata, and demo PDF still use “FNIP” or “Financial News Intelligence Platform.” The blue/navy palette and pale blue accent create a generic infrastructure-console identity rather than IB Market Data.
- The existing body gradient reinforces the blue product identity and competes with the requested near-black, restrained maroon workspace.
- The compact type and borders are directionally appropriate, but the serif display face plus undifferentiated panels do not yet establish a technical terminal hierarchy.
- Branding is inconsistent across application chrome, metadata, auth, PDF output, email footer, and health identifiers. Only user-visible product copy should change; infrastructure identifiers and environment keys must remain stable.

### Shell and navigation

- Desktop navigation is a single horizontal header. It does not provide enough separation among market work, research, team configuration, and admin operations.
- The 1440px dashboard leaves oversized unused areas instead of using the viewport for market state, charting, or a useful inspector.
- At 375px the same horizontal navigation truncates into an overflow strip. There is no drawer/bottom navigation, scroll affordance, or reliable account access; user and role text disappear at the `sm` breakpoint.
- Active navigation is conveyed visually but lacks `aria-current`. There is no skip link or global command/search affordance.
- Admin navigation is another wrapping horizontal tab row. On mobile it becomes a dense cluster without category hierarchy; on desktop it treats team access, data operations, reports, delivery, and audit as peers in one flat line.

### Hierarchy, density, and scan speed

- Nearly every module is the same bordered `Panel` with the same header, padding, and surface. This creates flat card hierarchy: system warnings, market tape, primary research, and secondary metadata compete at equal weight.
- The dashboard is compact but not command-center dense. It surfaces values and lists without a dominant market-regime/chart workspace or a clear “what changed” path.
- The first viewport does include tape, movers, news, catalysts, latest report, and provider health, but the equal panel treatment slows scanning and spreads attention across boxes.
- Provider/license truth is visible, which is a strong foundation, but repeated feed/session/as-of copy consumes space without a unified freshness/status primitive.
- Watchlists render symbols as long text strings and sectors as another generic table, reducing comparison speed and making team scope/editability unclear.
- Proposals show useful status and submitter information but no diff, rationale inspection, member action, or admin decision path.

### Workflow friction and actions

- “On-demand report” immediately submits a fixed midday request. It does not explain archive scope, edition, delivery rights, estimate, or job progress.
- Archive search is correctly URL-driven, but there is no clear/reset action, result-state summary beyond count, or preserved sort state.
- A created invitation is acknowledged only by inline text and does not enter the visible pending list.
- Delivery resend has no pending state, success confirmation, or inline failure/retry feedback.
- Market-data status begins as placeholders and requires manual load; retry and refresh status use similar visual emphasis despite different operational impact.
- Many advertised permission-backed workflows are absent from the UI rather than merely unpolished.

### Charts

- There is no chart component in the current dashboard. The cross-asset tape provides point values only, so users cannot inspect intraday direction, session transitions, gaps, or volume.
- The bars API supports `1m`, `5m`, `15m`, `1h`, and `1d`, but no range/interval URL state, comparison model, session overlay, crosshair, legend, or accessible tabular alternative exists.
- Fixture bars intentionally return an empty array. Chart implementation must include a truthful no-history state and may use only a deterministic development fixture isolated to the existing contract.
- Cache/provider/fixture responses are a union with different metadata. The chart frame must not infer consolidated coverage or realtime status solely from timestamps.

### Tables

- `DataTable` provides semantic table markup, tabular numerals, manual alignment, horizontal containment, and a generic empty row. It lacks sorting, sortable-header semantics, stable/minimum column widths, sticky headers, column priorities, loading rows, row inspection, captions, pagination, and preserved state.
- On the 375px archive capture, the summary is crushed into a narrow column while lower-value columns retain space. The containing horizontal scroll does not communicate how to reach hidden information.
- Archive filters overflow at 375px because From, To, and Apply remain in one flex row below the responsive grid breakpoint.
- Movers, catalysts, proposals, sectors, members, jobs, deliveries, and audit tables keep their desktop column structure on mobile. They scroll rather than reprioritize or offer a compact primary row plus detail disclosure.
- Numeric alignment is generally good where configured, but precision, sign, units, and timestamp zone are not centralized. Dates use browser locale and often do not state Chicago time.
- Generic “No rows” does not explain whether the state means first use, no filter matches, unsupported coverage, or a failed load.

### Report reading

- Report detail is a stack of dark application panels, not a focused editorial document canvas. Long-form hierarchy, line length, section navigation, and print/PDF relationship are weak.
- Edition, date, status, summary, citations, and download are visible, but data cutoff, methodology, provenance, job stage, requested-by, generation timing, delivery state, and archive-snapshot semantics are absent.
- There is no queued/running/failed report treatment even though those statuses exist. Unknown on-demand IDs fall into the generic framework 404.
- Citation links are usable, but citation/source context is reduced to label and URL; claims and causal status are not represented.

### Admin

- Eight top-level tabs wrap without grouping or hierarchy. “Market data” is operationally richer than the other fixture-only tabs but receives the same navigation treatment.
- Team, schedule, source, routing, jobs, delivery, and audit data are readable yet flat. There is no master/detail inspection, log density control, filtering, or distinction between configuration and observation.
- License warning visibility is a positive baseline. Feed, quota, breadth, freshness, and configured-provider state need a consistent status matrix and explicit not-loaded/loading/error states.
- Destructive or organization-wide concepts are not currently exposed, so the redesign must not invent them or imply mutations that no endpoint supports.

## State coverage and gaps

| Area               | Present                                                                             | Missing or misleading                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication     | Credential error alert, demo roles, unauthenticated redirect, forbidden page        | Demo controls appear even when disabled; inactive membership state; sign-out; safe validated `next`; branded loading/error.                                                                          |
| Invitation         | Ready/invalid/expired/accepted visual variants                                      | States are token-string simulations; live acceptance returns 501; submitted name/password are ignored; login ignores `invited`.                                                                      |
| Dashboard          | Fresh fixture, stale banner, breadth unsupported, license warning, no latest report | Initial skeleton, background refresh, retained last-good data, fetch error, offline, partial module coverage, rate limit, unavailable quote set, no qualifying movers, exact delayed/EOD treatments. |
| Charts             | Bars endpoint only                                                                  | Entire visual/interaction system; empty history, provider error, entitlement, rate limit, stale overlay, session awareness, keyboard/accessibility alternative.                                      |
| Archive            | Filtered results and generic empty table                                            | Loading/indexing/error, no-match explanation, reset, sortable state, queued/running/failed/delivery distinctions.                                                                                    |
| Report             | Completed/partial badge, empty citations, conditional PDF                           | Job lifecycle, unavailable/failed PDF explanation, delivery state, provenance/methodology, immutable snapshot cue, custom missing/error state.                                                       |
| Watchlists/sectors | Read-only populated fixture                                                         | First use, empty list, invalid/duplicate symbol, optimistic save, conflict, provider unavailable, save failure, permissions/action audit.                                                            |
| Proposals          | Pending/approved fixture rows                                                       | Submit form, withdrawn/rejected detail, diff/history, admin review, confirmation and errors.                                                                                                         |
| Admin              | Loaded fixture tables, market-data placeholders, license warning                    | Explicit loading/error/empty states, status refresh progress, resend result, quota exhaustion, provider disabled/unconfigured, job retry/cancel states.                                              |
| Global shell       | Demo banner and visible email/role on desktop                                       | Command/search, session countdown, unified health/freshness, account controls, mobile navigation, route transition state.                                                                            |

## Accessibility audit

Positive foundations include semantic landmarks, real buttons and links, associated form labels, actual table markup, global `focus-visible`, textual direction/status labels, and tabular numerals.

Priority gaps:

- Active navigation needs `aria-current`; a skip link is absent.
- Mobile navigation is truncated rather than represented by a keyboard- and touch-appropriate control with managed focus.
- Standard buttons are 28-32px high, below the roughly 44px target expected for frequent mobile touch controls.
- Horizontal table scroll has no affordance or alternative information hierarchy. Important content may be functionally undiscoverable at 200% zoom.
- Table sorting does not exist; any implementation needs button headers, state announcements, and keyboard operation.
- Background refresh, job progress, invitations, resend, and provider status changes are not announced. Use restrained status/live regions rather than making all market ticks noisy.
- Loading controls do not consistently expose `aria-busy`; several async actions have no pending/error treatment.
- Current muted text, subtle borders, maroon additions, focus rings, and semantic colors require WCAG 2.2 AA contrast verification on every intended surface.
- `up`, `down`, and status color are paired with signs/text in many places, but the component API encourages reusing market movement colors for system success/failure. Semantics must also be conveyed through wording/icon/shape.
- Time formatting follows the viewer's locale even where the product says Chicago. Visible timezone and accessible datetime context must agree.
- No chart summary or data-table alternative exists because there is no chart yet.
- Layered interactions required by the redesign (command palette, drawers, dialogs, tooltips) will require escape handling, focus return, focus trapping where appropriate, and reduced-motion support.

## Component and semantic-system findings

- Global variables centralize the current palette, but their names (`--accent`, `--up`, `--down`, `--warn`) are too broad for a larger terminal. Raw blue values also remain in the body gradient.
- `Badge` exposes visual `up`/`down` tones rather than semantic market-positive, market-negative, success, error, delayed, coverage, and provider-health intents.
- Red/down styling is reused for login errors, licensing warnings, provider failure, market decline, and delivery failure. Those meanings need distinct semantic APIs even if some resolve to related colors.
- Report status, provider health, proposal status, invitation state, and delivery state are each mapped ad hoc in route components. Unknown states often silently become neutral.
- `Panel`, `PageHeader`, and `DataTable` are useful primitives but have one dominant geometry and visual weight. Additional inset, document, inspection, status, and split-pane semantics are needed without creating near-duplicate components.
- Inputs and selects repeat long Tailwind class strings instead of using consistent field, description, validation, and error primitives.
- There is no unified numeric value/change formatter, freshness indicator, coverage indicator, ticker identity, job-progress component, state panel, tooltip, drawer, dialog, toast, or skeleton system.

## Functional risks to account for during redesign

### Severity 0: correctness, security, and truthful data

1. `src/app/(app)/dashboard/page.tsx` makes an authenticated server-to-server request to `/api/dashboard` without forwarding the incoming cookies. A 401 or network failure silently returns `fixtureDashboard`, which is non-stale and lacks a mock/unavailable label. The redesign must never make this fallback appear live.
2. Live cached dashboard responses mix live market tape/movers with fixture headlines, calendar, and latest report. Provenance must be scoped by module, and the backend limitation must remain visible.
3. `POST /api/reports` returns a new `rpt-demo-ondemand-*` ID, then the dashboard navigates to `/reports/[id]`; report detail recognizes only the fixed fixture list, so the primary generation flow lands on a 404.
4. `/login?next=` is passed verbatim to `router.replace`. It must be restricted to an internal application path. Proxy-created redirects also preserve only the pathname, dropping the original query string.
5. Archive, report, watchlist, proposal, invitation, and much of admin remain fixture/stub data in both fixture and non-fixture branches. UI copy must not imply persistence or live multi-user behavior that is not wired.
6. Preserve server-side role resolution, Admin navigation filtering, page redirect, and API authorization. Do not introduce privileged client controls before role resolution.

### Severity 1: critical shell, responsive, and state foundations

1. Replace FNIP user-facing identity with IB Market Data and establish documented near-black/maroon semantic tokens without renaming infrastructure identifiers.
2. Build an authenticated desktop rail/top context bar and a deliberate mobile navigation pattern; include account access, active-route semantics, skip link, and no page-level overflow.
3. Create shared state primitives for loading, retained-data refresh, empty, no-match, recoverable error, forbidden, stale/delayed/EOD/mock, partial coverage, entitlement, rate limit, and offline behavior.
4. Create semantic field/button/badge/status APIs, consistent focus and validation treatment, and accessible async feedback.
5. Correct the 375px archive filter overflow and establish responsive content priority rules before route-specific polish.

### Severity 2: primary research workflows

1. Recompose the dashboard around immediate market regime/session/freshness, a professional chart workspace, movers, catalysts, news, and latest research. Use the available width rather than adding decorative cards.
2. Add a chart frame backed by the existing bars contract with truthful session/coverage annotations, range and interval state, empty/error/entitlement overlays, keyboard inspection, and an accessible data summary.
3. Upgrade tables with stable widths, sorting, semantic headers, intentional scroll containers, state preservation, and mobile row/detail variants that prioritize the useful fields.
4. Rework archive search/results, including reset, no-match, status/job/delivery distinctions only where supplied, and a legible 375px information hierarchy.
5. Present report detail on a readable document canvas with provenance, cutoff, immutable-snapshot language, job state, citations, methodology, and resilient PDF access when those fields exist.
6. Turn on-demand generation into a focused authorized flow with edition, firm-wide archive language, duplicate-submit prevention, job progress, and a valid result link.

### Severity 3: team and operations workflows

1. Reframe watchlists/sectors as unmistakably shared team data and expose editing only through existing authorized contracts, with validation/conflict/save states.
2. Add member proposal submission and admin decision UI only where matching API behavior exists; otherwise clearly document the functional gap rather than creating inert controls.
3. Group Admin into team access, report operations, data operations, and governance. Replace the wrapping flat tab list with hierarchical navigation that remains usable at 375px.
4. Add status matrices and inspectors for providers, licensing, quota, jobs, delivery, and audit; never expose secrets or imply unsupported configuration writes.
5. Finish invitation, resend, market refresh, and account/sign-out feedback paths.

### Severity 4: refinement and verification

1. Add command navigation/search and keyboard shortcuts using only existing search scopes and authorized actions.
2. Standardize formatters for precision, explicit signs, units, currency, Chicago time, and width-stable refreshes.
3. Add restrained update feedback and motion with complete `prefers-reduced-motion` behavior.
4. Run responsive review at 375, 768, 1024, 1440, and 1920px; keyboard-only and 200% zoom checks; automated accessibility checks; console/network inspection; and screenshot comparison against `docs/ui-screenshots/baseline`.

## Redesign acceptance guardrails

- No route, query parameter, API field, permission, persisted status, or report snapshot may be renamed for visual convenience.
- Admin destinations remain hidden from members and admin mutations remain server-authorized.
- Current/last-good data stays visible during safe background refresh, accompanied by precise state and timestamp.
- No market value, chart point, source, catalyst, entitlement, or delivery result may be invented to complete a composition.
- Fixture, unavailable, delayed, stale, partial, and live data remain visually and textually distinct.
- No page-level horizontal scrolling at target widths; deliberate table/chart overflow must be contained and discoverable.
- Existing E2E contracts should remain or be deliberately updated: demo-role button names, member denial redirect, page headings, and the feed/license test hooks.
- Final screenshots must include all major routes at 375px and 1440px, complex screens at the intermediate/large widths, and representative stale, empty, provider-error, mock, and forbidden states.
