# IB Market Data Design System

## Purpose

This document is the implementation contract for the IB Market Data interface. It translates the product brief and the current UI audit into one visual, interaction, data-display, and accessibility system.

IB Market Data is a private market-intelligence workspace. It should feel precise, fast, restrained, and proprietary. It is not a public marketing site, a brokerage terminal, a retail trading application, or a visual imitation of another financial product.

The authenticated product is dark-first, with an optional light theme and system preference under Settings. Long-form report reading may use a light document canvas within the shell. The system favors alignment, dividers, tables, and structured inspection over decorative cards.

## Design principles

1. **Truth before polish.** Freshness, coverage, provider, latency, session, entitlement, and mock state are never hidden to make a surface appear live.
2. **Dense, not crowded.** The first viewport prioritizes market state and what changed. Containers exist only where they define a real task or analytical boundary.
3. **Capability creates the high-tech feel.** Search, keyboard access, stable tables, precise charts, and visible system state matter more than decorative effects.
4. **Identity is distinct from financial meaning.** Maroon communicates IB Market Data identity, selection, and primary action. Green and red communicate positive and negative financial movement; they are not general brand accents.
5. **State never depends on color alone.** Signs, arrows, icons, labels, shape, or position accompany every semantic color.
6. **Refreshes preserve context.** Current values, chart range, sort order, filters, selection, expansion, and scroll position remain stable during background updates.
7. **One system across every route.** Authentication, market surfaces, reports, watchlists, proposals, administration, and edge states share the same tokens and primitives.

## Brand identity

### Name and mark

- Display name: **IB Market Data**.
- The primary mark is an original, text-based `IB` monogram paired with the full product name.
- The full name must appear beside the monogram in the expanded desktop navigation and in authentication contexts. A collapsed rail may show only the monogram when an accessible label and tooltip preserve the name.
- Do not use logos, typography, layouts, or wording that imply affiliation with Interactive Brokers, Texas A&M, or another institution.
- Existing route paths, API names, environment variables, database identifiers, package names, and persisted domain values are not renamed for branding.

### Product language

Use these display labels where they match the existing capability:

| Existing destination             | Display label        |
| -------------------------------- | -------------------- |
| `/dashboard`                     | Market Overview      |
| `/archive` and `/reports/[id]`   | Research Archive     |
| `/news`                           | Material News        |
| `/scanner`                        | Scanner Center       |
| Existing on-demand report action | Generate Brief       |
| `/proposals`                     | Proposals            |
| `/settings`                      | Settings             |
| `/admin`                         | Data Operations      |

Use concise working language: `Open research`, `Download PDF`, `Edit shared watchlist`, `Submit proposal`, and `Generate brief`.

## Color tokens

All component color must resolve through semantic custom properties. Raw color values belong in the token layer, charts that require canvas-compatible values, and generated-document styles only.

```css
:root {
  /* Brand identity */
  --ib-maroon-950: #260012;
  --ib-maroon-900: #3c001c;
  --ib-maroon-800: #500000;
  --ib-maroon-650: #732f2f;
  --ib-maroon-500: #9a4d5b;
  --ib-maroon-300: #d7a6af;

  /* Dark workspace */
  --ib-canvas: #08090b;
  --ib-surface-1: #0d1013;
  --ib-surface-2: #12161a;
  --ib-surface-3: #181d22;
  --ib-surface-inset: #090c0f;
  --ib-surface-hover: #171c21;
  --ib-surface-selected: #21151a;

  /* Boundaries */
  --ib-border-subtle: #23292f;
  --ib-border-strong: #353d45;
  --ib-border-control: #59636d;
  --ib-focus: #d7a6af;

  /* Text */
  --ib-text-primary: #f3f4f4;
  --ib-text-secondary: #b5bbc1;
  --ib-text-muted: #7e8790;
  --ib-text-inverse: #111315;
  --ib-warm-neutral: #d6d3c4;

  /* Financial meaning */
  --market-positive: #42b883;
  --market-negative: #e06666;
  --market-unchanged: #9aa3ab;

  /* Non-directional information */
  --state-warning: #d7a84b;
  --state-info: #68a4d8;
  --state-neutral: #9aa3ab;
  --state-mock: #b7addb;

  /* Comparison series */
  --series-1: #d7a6af;
  --series-2: #68a4d8;
  --series-3: #d7a84b;
  --series-4: #8e83c8;
  --series-5: #69aaa5;

  /* Light report canvas */
  --report-paper: #f5f3ee;
  --report-paper-inset: #ece9e1;
  --report-ink: #18191b;
  --report-ink-secondary: #4d5155;
  --report-rule: #c9c5bb;
}
```

Temporary compatibility aliases may map the old token names to the new system while components migrate:

```css
:root {
  --background: var(--ib-canvas);
  --foreground: var(--ib-text-primary);
  --surface: var(--ib-surface-1);
  --surface-2: var(--ib-surface-2);
  --border: var(--ib-border-strong);
  --border-subtle: var(--ib-border-subtle);
  --muted: var(--ib-text-muted);
  --fg: var(--ib-text-primary);
  --accent: var(--ib-maroon-800);
  --accent-fg: var(--ib-text-primary);
  --accent-hover: var(--ib-maroon-650);
  --up: var(--market-positive);
  --down: var(--market-negative);
  --warn: var(--state-warning);
}
```

### Color usage rules

- `--ib-maroon-800` is for the brand mark, primary actions, selected navigation, and controlled emphasis.
- Small active text, focus rings, and thin active indicators use the lighter `--ib-maroon-300` or `--ib-maroon-500` because deep maroon is not visible enough on dark surfaces.
- Green and red are reserved for signed market movement. A confirmed system failure may use the negative red only when an explicit failure label and icon are also present; routine workflow success should use a neutral check or informational treatment rather than an `up` color.
- Warning amber does not mean negative performance. It denotes stale, delayed, partial, degraded, or attention-required state.
- Mock data uses its own violet-neutral token, never maroon and never the real-time information treatment.
- Input boundaries use `--ib-border-control`; subtle panel dividers are not strong enough to identify controls.
- The large blue radial gradient from the previous interface is removed. The canvas may use an extremely faint grid or noise treatment only on otherwise empty shell backgrounds.

## Typography and numerical precision

### Font families

- Retain **IBM Plex Sans** for navigation, headings, labels, controls, and body copy.
- Retain **IBM Plex Mono** for prices, yields, percentages, timestamps, identifiers, source codes, compact statuses, axes, and comparable table values.
- Do not use Source Serif in authenticated application chrome. If an editorial face is retained for report content, it is isolated to the report canvas and is not a third primary UI family.

```css
:root {
  --font-ui:
    var(--font-plex-sans), "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-data: var(--font-plex-mono), "IBM Plex Mono", ui-monospace, monospace;

  --text-2xs: 0.6875rem; /* 11px */
  --text-xs: 0.75rem; /* 12px */
  --text-sm: 0.8125rem; /* 13px */
  --text-base: 0.875rem; /* 14px */
  --text-md: 1rem; /* 16px */
  --text-lg: 1.125rem; /* 18px */
  --text-xl: 1.5rem; /* 24px */
  --text-2xl: 2rem; /* 32px */
}
```

| Role                            | Size / line height | Weight  | Notes                                                              |
| ------------------------------- | ------------------ | ------- | ------------------------------------------------------------------ |
| Provenance, axes, overlines     | 11px / 16px        | 500     | Mono for time and numeric content; uppercase only for short labels |
| Dense table and symbol metadata | 12px / 16px        | 400-500 | Mono for comparable values                                         |
| Standard table rows             | 13px / 18px        | 400-500 | Default desktop data density                                       |
| Body and primary controls       | 14px / 20px        | 400-500 | Default prose and controls                                         |
| Section headings                | 16-18px / 22-24px  | 600     | Sans, restrained tracking                                          |
| Page title                      | 24px / 30px        | 600     | No marketing-scale hero typography                                 |
| Major market number             | 24-32px / 30-36px  | 500-600 | Mono; reserve width to prevent refresh jitter                      |

Numerical rules:

- Use tabular numerals globally and IBM Plex Mono for comparable financial values.
- Right-align numeric table columns and reserve sensible minimum widths.
- Show explicit `+`, Unicode minus `−`, and `0.00%` or an explicit unchanged label.
- Format precision by instrument type; do not force every instrument to two decimals.
- Always include the relevant currency, percent, basis-point, yield, volume, or time-zone unit.
- `null`, unavailable, or unsupported values render as `—`, never `0` and never positive green.
- Market timestamps default to `America/Chicago` and include `CT` in visible working context.

## Spacing, sizing, radii, and elevation

The spacing foundation is 4px.

```css
:root {
  --space-1: 0.25rem; /* 4px */
  --space-2: 0.5rem; /* 8px */
  --space-3: 0.75rem; /* 12px */
  --space-4: 1rem; /* 16px */
  --space-5: 1.25rem; /* 20px */
  --space-6: 1.5rem; /* 24px */
  --space-8: 2rem; /* 32px */
  --space-10: 2.5rem; /* 40px */
  --space-12: 3rem; /* 48px */

  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-pill: 999px;

  --control-compact: 28px;
  --control-default: 32px;
  --control-form: 36px;
  --control-touch: 44px;

  --shadow-float: 0 12px 36px rgb(0 0 0 / 32%);
}
```

- Data modules use 12px padding by default and 16px when content needs breathing room.
- Module gaps are 8-12px; major section gaps are 16-24px.
- Panels and controls generally use a 4px radius. Menus, dialogs, and large inspectors may use 6-8px.
- Pill radius is limited to compact statuses, tags, and segmented indicators. Do not make every control a pill.
- Panels rely on tonal separation and one-pixel borders. Shadows are reserved for floating menus, command palette, dialogs, tooltips, and drawers.
- Desktop data controls may use 28-32px heights. Mobile and standalone form controls use a 44px interaction target; dense controls may retain a smaller visible shape inside a 44px hit area.

## Surfaces and hierarchy

| Surface             | Token                   | Use                                                      |
| ------------------- | ----------------------- | -------------------------------------------------------- |
| Canvas              | `--ib-canvas`           | Authenticated workspace background                       |
| Primary module      | `--ib-surface-1`        | Panels, sidebar, top bar                                 |
| Secondary/inset row | `--ib-surface-2`        | Table headers, secondary controls, grouped rows          |
| Elevated            | `--ib-surface-3`        | Menus, popovers, drawers, focused inspection             |
| Inset analytical    | `--ib-surface-inset`    | Charts, code/data wells, recessed controls               |
| Selected            | `--ib-surface-selected` | Active navigation or selected row, paired with indicator |
| Report paper        | `--report-paper`        | Long-form HTML report within the dark shell              |

Avoid wrapping each metric in a separate card. Prefer a panel containing a compact table, matrix, tape, chart, timeline, or split view. A panel needs a real analytical boundary, title, task, or state.

Hierarchy inside the market workspace:

1. Session, freshness, coverage, and system trust.
2. Broad market direction and the selected instrument.
3. What is moving abnormally.
4. Why it is moving and the next catalyst.
5. Latest research and job state.
6. Provider methodology and deeper operational detail.

## Application shell

### Desktop at 1024px and wider

- Use a persistent left navigation rail and a compact top working bar.
- Expanded rail width: 216px. Collapsed rail width: 64px.
- Top working bar height: 44px. Optional market ribbon height: 36-40px.
- Main content is edge-to-edge within the remaining workspace, with 16px gutters at 1024px and 24px at 1440px and above.
- Use a 12-column grid with 12px gaps for complex market layouts.
- The rail includes the mark/name, Market Overview, Research Archive, Watchlists & Sectors, Generate Brief, Proposals, and role-gated Data Operations.
- Account controls are separated from primary navigation.
- Active navigation uses selected surface, stronger typography, and a 2px indicator. It also exposes `aria-current="page"`.
- Role resolution happens on the server. Inaccessible admin destinations are absent rather than disabled and never flash during hydration.

### Top working bar

The top bar contains:

- global search entry and `Cmd/Ctrl + K` command affordance;
- market session and the next trusted transition when derivable;
- exact latest successful refresh time;
- concise coverage label;
- compact provider/system health;
- current user/account entry.

The command palette may navigate routes, open known reports, search supported entities, and trigger existing authorized actions. It must not invent backend search or bypass permissions and confirmations.

### Market ribbon

When trusted data exists, show a small set of indices or proxies, rates, volatility, FX, and commodities. Each item includes identity, value, signed change, and freshness. The ribbon does not continuously auto-scroll. It is horizontally user-scrollable on constrained widths and remains keyboard accessible.

### Mobile below 768px

- Use a 44px compact header with the IB mark, concise session/freshness state, and a menu or command trigger.
- Prioritize Market, Research, Watchlists, and one overflow destination in a small bottom navigation or well-managed drawer.
- Do not shrink the desktop rail into a narrow unusable column.
- Account and role details remain reachable through the overflow/account area.
- Drawers trap focus while open, restore focus when closed, respect safe-area insets, and fit above the on-screen keyboard.

## Shared component rules

Component APIs express intent rather than raw color. Preferred examples include `tone="positive"`, `status="delayed"`, `health="degraded"`, and `density="compact"`. Do not reuse a financial `up` badge to mean an approved proposal or completed job.

Required primitives:

- app shell, sidebar, top bar, market ribbon, command palette, and mobile navigation;
- page header, section header, panel, inset surface, split pane, and inspector drawer;
- button, button-link, icon button, link, and destructive confirmation;
- field, input, search, select, checkbox, radio, date/time input, and text area;
- tabs or route links with correct semantics, segmented controls, menu, popover, dialog, drawer, and tooltip;
- status badge, market change, ticker identity, freshness, coverage, provider health, and job progress;
- data table, sortable header, responsive wrapper, empty row, pagination, and row inspector;
- chart frame, legend, controls, tooltip, annotation, overlays, and accessibility summary;
- inline alert, stale banner, empty state, error state, forbidden state, skeleton, and toast.

Never nest a button inside a link. Use a button-link primitive or style the link directly.

## Dashboard composition

The dashboard should answer session/trust, broad direction, abnormal movement, cause, next catalyst, and latest research in under ten seconds.

Recommended desktop order:

1. **Session control strip:** session, exact as-of time, coverage, refresh state, health, and next report edition.
2. **Market pulse:** compact major index/proxy movement, breadth when supported, rates, volatility, and regime facts.
3. **Primary chart workspace:** selected instrument with interval/range, value/change, OHLCV inspection, and data-quality state.
4. **Cross-asset monitor:** a dense tape or matrix rather than individual metric cards.
5. **Mover scanner:** sortable supported fields, with selection feeding the primary chart or inspector.
6. **News and catalyst stream:** time, source, affected symbols, source quality, summary, and supported evidence fields.
7. **Catalyst radar:** timed events with actual, consensus, previous, units, importance, source, and explicit CT time.
8. **Research desk:** latest report, completion/job state, next edition, open/download, and Generate Brief.

At 1440px, the primary chart normally occupies 8 columns and the adjacent high-priority context 4 columns. Movers and news may use a 7/5 split. Provider-level detail belongs in an inspector or Data Operations unless it is actively degraded.

## Financial chart system

Use one focused, locally rendered chart library capable of performant financial time series, candlesticks, volume, crosshairs, and resizing. Do not embed a hosted, branded third-party widget.

### Frame and dimensions

- Primary desktop chart reserved height: 420px.
- Small laptop/tablet chart height: 340px.
- Mobile chart height: 280px minimum.
- Reserve axis and toolbar space before data arrives to prevent layout shift.
- Chart background: `--ib-surface-inset`.
- Grid: one-pixel `--ib-border-subtle`, visually subordinate to data.
- Axes and crosshair labels: IBM Plex Mono, 11px.
- Price and volume use aligned panes and synchronized crosshairs when both are shown.

### Financial behavior

- Render real timestamps and real gaps. Never interpolate missing bars as trades.
- Use actual OHLCV values from the normalized bar contract.
- Distinguish premarket, regular, and after-hours sessions with restrained bands or boundary markers when the metadata supports them.
- Show timezone, as-of time, provider, latency, and coverage near the chart.
- Crosshair inspection includes exact CT time, open, high, low, close, volume, and change when available.
- Support only ranges and intervals the provider and endpoint can supply.
- Persist symbol, range, interval, comparison series, and zoom state through polling. URL parameters are preferred for shareable analytical state.
- Update or append observations instead of recreating the chart instance on every refresh.
- No smoothed curves that imply unobserved values. Area fill remains at or below 10% opacity.
- Comparison series use `--series-1` through `--series-5`; maroon is not used where it could be mistaken for loss.
- Every important chart has a concise accessible summary and a table alternative or data-view action.

### Chart states

The chart frame reserves its geometry and renders explicit overlays for initial loading, refreshing, stale, delayed, partial, empty, unavailable, rate-limited, entitlement-blocked, mock, and terminal error states. Background refresh never blanks the prior valid series.

## Market tables and scanners

### Geometry

- Compact header height: 32px.
- Compact desktop row height: 34px; supported range is 32-40px.
- Identity columns remain left-aligned and stable.
- Comparable numeric columns are right-aligned, tabular, and assigned fixed or sensible minimum widths.
- Long tables use sticky headers.
- The table wrapper, not the page, owns horizontal scrolling.
- At narrow widths, preserve symbol, last, signed change, and primary action; hide or move secondary columns into row detail rather than forcing every desktop field onto the screen.

### Interaction and accessibility

- Sort headers are real buttons with an accessible name and `aria-sort` on the active column.
- Sort, filters, selected row, expansion, and supported pagination persist in the URL or stable local state.
- Row hover is paired with keyboard focus. A selected row uses surface plus indicator, not color alone.
- Truncated content exposes the full value on focus as well as hover.
- Update feedback uses a non-layout-shifting background tint for 700ms and is disabled under reduced motion.
- Empty tables explain the actual condition, such as `No qualifying movers in the configured universe` or `No reports match these filters`.
- Unsupported numeric fields render `—`; they are never coerced to zero.

## Data-quality and workflow semantics

Every market-data module exposes the most relevant subset of provider, as-of time, receive time, latency, coverage, session, source, last success, stale threshold, and entitlement state. Critical warnings remain visible; lower-level metadata may live in an accessible popover or inspector.

### Display state precedence

When several states apply, present the highest-impact state first:

1. entitlement or licensing blocked;
2. unavailable, provider down, offline, or terminal error;
3. stale;
4. delayed, partial, or rate limited;
5. indicative or end of day;
6. fresh real-time;
7. background refreshing as a secondary modifier.

### Standard labels

| State        | Required visible language                                          | Visual treatment                                | Behavior                                                  |
| ------------ | ------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------- |
| Real-time    | `Real-time · IEX`, `Real-time · SIP`, or the exact supported label | Information icon/label; no vague `Live`         | Show exact as-of time nearby                              |
| Delayed      | `15-minute delayed` or trusted delay class                         | Amber clock plus text                           | Keep last value; never imply real-time                    |
| Stale        | `Stale · last update 11:24:08 a.m. CT`                             | Amber persistent border/label                   | Preserve last valid value and expose retry/impact         |
| Partial      | `Partial coverage · 28 of 34 symbols` when counts exist            | Amber split/coverage icon plus text             | Explain what is missing                                   |
| Indicative   | `Indicative`                                                       | Blue information treatment                      | Explain non-executable or estimated nature where relevant |
| End of day   | `End of day`                                                       | Neutral calendar/close icon                     | Show observation date and prevent live interpretation     |
| Unavailable  | `Unavailable`                                                      | Strong neutral/error boundary and explicit icon | No numeric zero; state impact and safe retry              |
| Rate limited | `Rate limited · retry after …` when known                          | Amber timer                                     | Preserve last good data and respect provider backoff      |
| Mock         | `Mock data`                                                        | Violet-neutral persistent label                 | Never share real-time visual treatment                    |
| Refreshing   | `Refreshing` or compact progress cue                               | Subtle informational cue                        | Retain current data and user state                        |

Only display entitlement labels supported by the provider contract. A current timestamp alone does not prove SIP, OPRA, consolidated coverage, or redistribution rights.

### Financial movement

| Meaning      | Treatment                                                             |
| ------------ | --------------------------------------------------------------------- |
| Positive     | `--market-positive`, explicit `+`, upward icon or position            |
| Negative     | `--market-negative`, Unicode minus, downward icon or position         |
| Unchanged    | `--market-unchanged`, explicit zero or `Unchanged`                    |
| Unknown/null | Primary or muted neutral text with `—`; never positive/negative color |

### Workflow and provider states

- Queued and running jobs use informational styling plus stage and last update.
- Partial jobs use warning styling and explain the incomplete stage or delivery impact.
- Completed jobs use a neutral check and explicit `Completed`; do not misuse the financial positive tone.
- Failed jobs use an explicit failure icon, stage, impact, last update, and safe retry when authorized.
- Canceled and disabled states are neutral and explicit.
- Provider `healthy`, `degraded`, `down`, `disabled`, and `not configured` remain distinct. Healthy is not an `up` market move; degraded is not necessarily down; disabled is not failure.

## Responsive system

Use these behavior thresholds, aligned with the required validation widths:

| Width            | Behavior                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Below 640px      | Single-column focused briefing; mobile header/navigation; 44px controls; prioritized table columns |
| 640-767px        | Wider mobile forms and two-up secondary content only when it remains legible                       |
| 768-1023px       | Tablet layout; compact/collapsed rail or mobile shell; chart above secondary modules               |
| 1024-1279px      | Small-laptop 12-column grid; persistent rail; reduced secondary density                            |
| 1280-1439px      | Full desktop composition with compact gutters                                                      |
| 1440-1919px      | Standard command-center composition and 8/4 primary chart split                                    |
| 1920px and above | Use additional width for comparison and inspection, not oversized empty margins or typography      |

Required verification widths are 375px, 768px, 1024px, 1440px, and 1920px.

Responsive rules:

- No accidental page-level horizontal scrolling.
- Grid children that contain tables or charts use `min-width: 0`.
- Dense tables may scroll inside a clearly bounded wrapper with an affordance.
- Dashboard modules reorder by user priority: trust and market state first, then chart/movers/catalysts, then operational detail.
- Charts reserve adequate height and never clip axes, legends, crosshairs, or tooltips.
- Critical stale, delayed, entitlement, and provider warnings remain visible on every width.
- Report reading uses a centered paper canvas no wider than roughly 860px, with navigation and download remaining accessible on mobile.
- At 200% zoom, the interface may reflow to its narrower layout; functionality must remain available.

## Accessibility

Critical routes and interactions target WCAG 2.2 AA.

- Normal text contrast is at least 4.5:1; large text and non-text interactive boundaries meet at least 3:1.
- Use the persistent 2px `--ib-focus` focus ring with a 2px offset. Never remove focus without an equivalent replacement.
- Provide a skip link to main content.
- Use semantic landmarks, one page `h1`, ordered section headings, lists, forms, links, buttons, and real table markup.
- Current route links expose `aria-current="page"`. True tabs use `tablist`, `tab`, `aria-selected`, keyboard arrow behavior, and associated tab panels; route navigation uses links instead.
- Every form control has a visible label. Errors use `aria-invalid` and `aria-describedby`; general async errors use a restrained live region.
- Loading buttons expose `aria-busy`, remain stable in width, and prevent duplicate submission.
- Dialogs, drawers, menus, and command palette manage initial focus, focus containment, Escape, and focus restoration.
- Icon-only buttons have accessible names and at least a 44px mobile target.
- Charts provide a text summary and accessible data alternative. Essential values never require pointer hover.
- Status announcements are polite and limited to meaningful changes. Rapid quote updates are not individually announced.
- Color is always paired with sign, text, icon, shape, or position.
- All functionality works by keyboard, at 200% zoom, with browser text scaling, and with reduced motion.

## Motion and update feedback

Motion explains state; it does not decorate the terminal.

```css
:root {
  --duration-fast: 100ms;
  --duration-default: 140ms;
  --duration-slow: 180ms;
  --duration-value-flash: 700ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

- Use opacity, border color, background color, or a 1-2px positional change only when it clarifies interaction.
- Do not animate whole route panels, chart entry, large gradients, glows, scan lines, or decorative ambient elements.
- Live indicators do not pulse indefinitely.
- Skeleton motion is limited to initial loading and matches final geometry.
- Value-change feedback fades within 700ms, does not move layout, and runs only when a value genuinely changes.
- Under `prefers-reduced-motion: reduce`, remove nonessential transforms and animated scrolling, stop skeleton pulsing, and make update feedback immediate or near-immediate.

## Route-specific application

- **Authentication and invitations:** full IB Market Data mark/name, invite-only language, focused dark form, deliberate invalid/expired/accepted/loading states, and no raw invitation token presentation.
- **Market Overview:** command-center hierarchy, primary chart, sortable movers, material news, catalyst radar, persistent trust state, and research desk.
- **Research Archive:** search is primary; compact report table exposes edition, generated/completed time, status, and supported actions; no-results and failure states are explicit.
- **Report detail:** light editorial canvas in the dark shell, metadata and job state, citations and caveats, sticky outline where useful, and a correctly styled PDF link rather than nested controls.
- **Watchlists & Sectors:** shared-team scope is explicit; use table or master-detail editing with validation, optimistic state, conflict, retry, and save-failure handling where supported.
- **Generate Brief:** focused request surface that states the result enters the firm-wide archive and shows queued/running stage until a resolvable report exists.
- **Proposals:** distinguish member request from admin decision; expose submitter, rationale, status, reviewed-by/time, and supported before/after detail.
- **Data Operations:** group team, schedule/delivery, market providers, AI routing, jobs/failures, and audit history using dense tables and inspectors. Secret values never render.
- **Edge routes:** not-found, forbidden, provider outage, no entitlement, maintenance, and unexpected error surfaces use the same system and offer one safe next action.

## Validation requirements

Implementation is not complete from code inspection alone.

- Inspect every major route at 375px and 1440px; inspect dashboard, chart, and Data Operations additionally at 768px, 1024px, and 1920px.
- Capture and review fresh, stale/delayed, empty, provider-error, mock, and forbidden states.
- Verify no page-level overflow, table/axis clipping, width jitter, unreadable text, or hidden critical state.
- Keyboard-test navigation, command palette, forms, table sorting, chart controls/alternative, dialogs/drawers, report download, and role-gated destinations.
- Run automated accessibility checks on authentication, dashboard, archive, report detail, watchlists, and Data Operations.
- Respect existing permissions, provider quotas, cache/polling behavior, immutable report snapshots, scheduled jobs, PDF delivery, and authenticated redirects.

## Governance

- Improve existing primitives before adding a second UI system.
- Use one chart stack and one table strategy.
- New component variants require a semantic use case, not a page-specific color request.
- New raw colors must first be added to this token document and checked for contrast and semantic conflict.
- New market surfaces must define fresh, refreshing, empty, delayed/stale, unavailable/error, and mock behavior before they are considered complete.
- Any intentional deviation from this document should be recorded with the accessibility, data-truthfulness, performance, or product reason.
