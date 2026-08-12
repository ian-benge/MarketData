import type { ReactNode } from "react";
import type { ReportDocumentModel } from "@/lib/reports/content-builder";
import {
  formatPrice,
  formatSignedPct,
  sleeveRows,
} from "@/lib/reports/analytics";
import { SECTION_TITLES } from "@/lib/reports/section-keys";
import { THESIS_STATUS_LABELS } from "@/lib/reports/thesis";
import {
  formatLevelRange,
  riskRewardBarPercents,
} from "@/lib/reports/trade-ideas";
import { reportSectionId } from "@/components/reports/report-format";

function heatClass(pct: number | null): string {
  if (pct == null) return "bg-[var(--ib-surface-3)] text-[var(--ib-text-muted)]";
  if (pct > 0.4) return "bg-[var(--market-positive)] text-white";
  if (pct > 0)
    return "bg-[color-mix(in_srgb,var(--market-positive)_35%,transparent)] text-[var(--report-ink)]";
  if (pct > -0.4)
    return "bg-[color-mix(in_srgb,var(--market-negative)_35%,transparent)] text-[var(--report-ink)]";
  return "bg-[var(--market-negative)] text-white";
}

function signedClass(n: number | null | undefined): string {
  if (n == null) return "text-[var(--report-ink-secondary)]";
  return n >= 0
    ? "text-[var(--market-positive)]"
    : "text-[var(--market-negative)]";
}

export function InstitutionalReportView({
  document,
}: {
  document: ReportDocumentModel;
}) {
  const analytics = document.analytics;
  const maxAbs = Math.max(
    0.5,
    ...(analytics?.relativeBars ?? []).map((r) => Math.abs(r.vsSpyPct ?? 0)),
  );
  const sleeves = sleeveRows(analytics?.aiInfrastructure ?? []);
  const kpis = ["SPY", "QQQ", "TLT", "VIXY"].map((ticker) => {
    const q = document.quotes.find((row) => row.ticker === ticker);
    return { ticker, q };
  });

  const blocks: Array<{ title: string; id: string; node: ReactNode }> = [];

  function push(title: string, node: ReactNode) {
    const index = document.sections.findIndex((s) => s.title === title);
    blocks.push({
      title,
      id: reportSectionId(title, index >= 0 ? index : blocks.length),
      node,
    });
  }

  push(
    SECTION_TITLES.executive_summary,
    <>
      <p className="text-[15px] leading-7 text-[var(--report-ink-secondary)]">
        {document.executiveSummary}
      </p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--report-ink)]">
        {document.executiveBullets.map((b) => (
          <li key={b}>• {b}</li>
        ))}
      </ul>
    </>,
  );

  push(
    SECTION_TITLES.market_snapshot,
    <>
      <p className="mb-3 text-sm text-[var(--report-ink-secondary)]">
        Heatmap and relative bars answer who is leading the session versus SPY.
        Missing proxies are omitted, not estimated.
      </p>
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
        {(analytics?.heatmap ?? []).map((cell) => (
          <div
            key={cell.key}
            className={`min-h-16 p-2 ${heatClass(cell.changePercent)}`}
          >
            <p className="font-mono text-[10px] font-semibold tracking-wide">
              {cell.key}
            </p>
            <p className="mt-1 font-mono text-sm">
              {formatSignedPct(cell.changePercent)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1.5">
        {(analytics?.relativeBars ?? []).slice(0, 10).map((row) => {
          const width = Math.min(
            50,
            (Math.abs(row.vsSpyPct ?? 0) / maxAbs) * 50,
          );
          const pos = (row.vsSpyPct ?? 0) >= 0;
          return (
            <div
              key={row.key}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)_6.5rem] items-center gap-2 text-xs"
            >
              <span className="font-mono text-[var(--report-ink)]">
                {row.ticker ?? row.key}
              </span>
              <div className="flex h-2 overflow-hidden bg-[var(--report-paper-inset)]">
                <div className="flex w-1/2 justify-end">
                  {pos ? null : (
                    <div
                      className="h-2 bg-[var(--market-negative)]"
                      style={{ width: `${width}%` }}
                    />
                  )}
                </div>
                <div className="w-1/2">
                  {pos ? (
                    <div
                      className="h-2 bg-[var(--market-positive)]"
                      style={{ width: `${width}%` }}
                    />
                  ) : null}
                </div>
              </div>
              <span className={`text-right font-mono ${signedClass(row.vsSpyPct)}`}>
                vs SPY {formatSignedPct(row.vsSpyPct)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-[var(--report-ink-secondary)]">
        {analytics?.breadthNote}
      </p>
    </>,
  );

  push(
    SECTION_TITLES.what_is_moving,
    <div className="space-y-3">
      {(analytics?.causality ?? []).slice(0, 5).map((chain) => (
        <article
          key={chain.id}
          className="border-l-2 border-[var(--ib-maroon-650)] bg-[var(--report-paper-inset)] p-3"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ib-maroon-650)]">
            Event · {chain.causalStatus}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--report-ink)]">
            {chain.event}
          </h3>
          <dl className="mt-2 space-y-1.5 text-sm leading-6 text-[var(--report-ink-secondary)]">
            <div>
              <dt className="font-semibold text-[var(--report-ink)]">Why it matters</dt>
              <dd>{chain.whyItMatters}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--report-ink)]">Market impact</dt>
              <dd className="font-mono text-xs">{chain.marketImpact}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--report-ink)]">
                Company / sector
              </dt>
              <dd>{chain.companySectorImpact}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[var(--report-ink)]">Potential trade</dt>
              <dd>{chain.potentialTrade}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>,
  );

  push(
    SECTION_TITLES.material_movers,
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">Material movers</caption>
        <thead>
          <tr className="border-b border-[var(--report-rule)] text-[10px] uppercase tracking-[0.08em] text-[var(--report-ink-secondary)]">
            <th className="py-2">Ticker</th>
            <th className="py-2">Last</th>
            <th className="py-2">Change</th>
            <th className="py-2">Catalyst</th>
          </tr>
        </thead>
        <tbody>
          {document.movers.map((m) => (
            <tr key={m.ticker} className="border-b border-[var(--report-rule)]">
              <td className="py-2 font-mono">{m.ticker}</td>
              <td className="py-2 font-mono">{formatPrice(m.price)}</td>
              <td className={`py-2 font-mono ${signedClass(m.changePercent)}`}>
                {formatSignedPct(m.changePercent)}
              </td>
              <td className="py-2 text-[var(--report-ink-secondary)]">
                {m.catalystSummary}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );

  push(
    SECTION_TITLES.ai_infrastructure,
    sleeves.length === 0 ? (
      <p className="text-sm text-[var(--report-ink-secondary)]">
        No AI-infrastructure names in this snapshot. Sleeves omitted, not estimated.
      </p>
    ) : (
      <div className="space-y-3">
        {sleeves.map((sleeve) => (
          <div key={sleeve.sleeve}>
            <h3 className="text-sm font-semibold text-[var(--report-ink)]">
              {sleeve.label}
            </h3>
            <ul className="mt-1 space-y-1">
              {sleeve.names.map((n) => (
                <li
                  key={n.key}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)_7rem] items-center gap-2 font-mono text-xs"
                >
                  <span className="text-[var(--report-ink)]">{n.ticker}</span>
                  <span className="text-[var(--report-ink-secondary)]">
                    {formatPrice(n.last)} ({formatSignedPct(n.changePercent)})
                  </span>
                  <span className={`text-right ${signedClass(n.vsSpyPct)}`}>
                    vs SPY {formatSignedPct(n.vsSpyPct)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ),
  );

  push(
    SECTION_TITLES.pm_playbook,
    <div className="space-y-3">
      {document.tradeIdeas.map((idea) => {
        const bar = riskRewardBarPercents(idea.rewardRisk1);
        return (
          <article
            key={idea.id}
            className="border border-[var(--report-rule)] p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--report-ink)]">
                {idea.action} {idea.direction.toUpperCase()} {idea.ticker}
                {idea.pairLeg ? ` / ${idea.pairLeg}` : ""} · {idea.strategyType}
              </h3>
              <p className="font-mono text-xs">
                Conf {idea.confidence}/5 · T1 R/R {idea.rewardRisk1 ?? "n/a"} ·
                T2 R/R {idea.rewardRisk2 ?? "n/a"}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--report-ink-secondary)]">
              {idea.thesis}
            </p>
            <dl className="mt-2 grid gap-1 text-xs leading-5 text-[var(--report-ink-secondary)] sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-[var(--report-ink)]">
                  Catalyst
                </dt>
                <dd>{idea.catalyst}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--report-ink)]">
                  Trigger
                </dt>
                <dd>{idea.trigger}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--report-ink)]">
                  Levels
                </dt>
                <dd className="font-mono">
                  Entry {formatLevelRange(idea.entryLow, idea.entryHigh)} · Stop{" "}
                  {idea.stop} · T1 {idea.target1} · T2 {idea.target2}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--report-ink)]">
                  Invalidation
                </dt>
                <dd>{idea.invalidationFact}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--report-ink)]">
                  Monitor
                </dt>
                <dd>{idea.monitor}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--report-ink)]">
                  Risks
                </dt>
                <dd>{idea.majorRisks.slice(0, 3).join(" · ")}</dd>
              </div>
            </dl>
            {idea.variantNote ? (
              <p className="mt-2 text-xs text-[var(--report-ink-secondary)]">
                Variant: {idea.variantNote}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-[var(--report-ink-secondary)]">
              Options: {idea.optionsStructure ?? "none — no IV/flow in bundle"}
            </p>
            <div className="mt-2 flex h-1.5 overflow-hidden">
              <div
                className="bg-[var(--market-negative)]"
                style={{ width: `${bar.riskPct}%` }}
              />
              <div
                className="bg-[var(--market-positive)]"
                style={{ width: `${bar.rewardPct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--report-ink-secondary)]">
              Risk to stop vs reward to T1, scaled to this idea&apos;s R/R — not
              live vol.
            </p>
          </article>
        );
      })}
    </div>,
  );

  if (document.priorEditionChanges.length > 0) {
    push(
      SECTION_TITLES.changes_since_previous,
      <ul className="space-y-2 text-sm leading-6 text-[var(--report-ink-secondary)]">
        {document.priorEditionChanges.map((row) => (
          <li key={row.thesisId}>
            <span className="font-mono text-xs text-[var(--ib-maroon-650)]">
              {THESIS_STATUS_LABELS[row.previousStatus]} →{" "}
              {THESIS_STATUS_LABELS[row.currentStatus]}
            </span>
            <span className="mt-0.5 block text-[var(--report-ink)]">
              {row.priorThesis}
            </span>
            {row.whatChanged} {row.affectsTrade ? "AFFECTS TRADE." : ""}
          </li>
        ))}
      </ul>,
    );
  }

  push(
    SECTION_TITLES.scenarios_and_variants,
    <>
      <dl className="space-y-2 text-sm leading-6">
        <div>
          <dt className="font-semibold text-[var(--report-ink)]">Bull</dt>
          <dd className="text-[var(--report-ink-secondary)]">
            {analytics?.scenarios.bull}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--report-ink)]">Base</dt>
          <dd className="text-[var(--report-ink-secondary)]">
            {analytics?.scenarios.base}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--report-ink)]">Bear</dt>
          <dd className="text-[var(--report-ink-secondary)]">
            {analytics?.scenarios.bear}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--report-ink)]">
            What would change my mind
          </dt>
          <dd className="text-[var(--report-ink-secondary)]">
            {analytics?.scenarios.whatWouldChangeMyMind}
          </dd>
        </div>
      </dl>
      <ul className="mt-3 space-y-2 text-sm text-[var(--report-ink-secondary)]">
        {(analytics?.variantViews ?? []).map((v) => (
          <li key={v}>• {v}</li>
        ))}
      </ul>
    </>,
  );

  for (const key of [
    "macro_rates",
    "options_desk",
    "earnings_calendar",
    "watchlist",
    "news_catalysts",
    "regular_session_recap",
    "after_hours_developments",
    "trade_book_status",
    "next_session_setup",
    "methodology",
  ]) {
    const section = document.sections.find((s) => s.sectionKey === key);
    if (!section) continue;
    push(
      section.title,
      <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--report-ink-secondary)]">
        {section.body}
      </p>,
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpis.map(({ ticker, q }) => (
          <div
            key={ticker}
            className="border-l-2 border-[var(--ib-maroon-650)] bg-[var(--report-paper-inset)] px-3 py-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--report-ink-secondary)]">
              {ticker}
            </p>
            <p className="mt-1 font-mono text-lg text-[var(--report-ink)]">
              {formatPrice(q?.last)}
            </p>
            <p className={`font-mono text-xs ${signedClass(q?.changePercent)}`}>
              {formatSignedPct(q?.changePercent)}
            </p>
          </div>
        ))}
      </div>

      {blocks.map((block, index) => (
        <section
          key={block.id}
          id={block.id}
          aria-labelledby={`${block.id}-heading`}
          className="scroll-mt-20 border-t border-[var(--report-rule)] pt-6"
        >
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ib-maroon-650)]">
            Section {String(index + 1).padStart(2, "0")}
          </p>
          <h2
            id={`${block.id}-heading`}
            className="mt-2 text-xl font-semibold tracking-[-0.01em] text-[var(--report-ink)]"
          >
            {block.title}
          </h2>
          <div className="mt-3">{block.node}</div>
        </section>
      ))}
    </div>
  );
}
