import React from "react";
import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReportDocumentModel } from "@/lib/reports/content-builder";
import { editionLabel } from "@/lib/reports/editions";
import { formatPrice, formatSignedPct, sleeveRows } from "@/lib/reports/analytics";
import { SECTION_TITLES } from "@/lib/reports/section-keys";
import { THESIS_STATUS_LABELS } from "@/lib/reports/thesis";
import {
  formatLevelRange,
  riskRewardBarPercents,
} from "@/lib/reports/trade-ideas";
import type { TapeRow } from "@/lib/reports/analytics";
import { formatMarketDateTime } from "@/lib/utils/format";

const colors = {
  navy: "#0B1F33",
  maroon: "#500000",
  slate: "#334155",
  muted: "#64748B",
  line: "#C9C5BB",
  paper: "#F5F3EE",
  white: "#FFFFFF",
  inset: "#ECE9E1",
  green: "#1B7A4E",
  red: "#B42318",
  ink: "#18191B",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: colors.slate,
    backgroundColor: colors.white,
  },
  coverBanner: {
    backgroundColor: colors.navy,
    padding: 16,
    marginBottom: 12,
  },
  coverBrand: {
    color: "#D7A6AF",
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  coverTitle: {
    color: colors.white,
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  coverMeta: {
    color: "#E2E8F0",
    fontSize: 8,
    marginBottom: 2,
  },
  kpiRow: {
    flexDirection: "row",
    marginBottom: 10,
    gap: 6,
  },
  kpi: {
    flex: 1,
    backgroundColor: colors.inset,
    padding: 8,
    borderLeftWidth: 2,
    borderLeftColor: colors.maroon,
  },
  kpiLabel: {
    fontSize: 7,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 3,
  },
  kpiValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.navy,
  },
  kpiSub: {
    fontSize: 8,
    marginTop: 2,
  },
  h1: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.navy,
    marginBottom: 6,
    marginTop: 12,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  body: {
    fontSize: 9,
    lineHeight: 1.4,
    color: colors.slate,
    marginBottom: 6,
  },
  bullet: {
    fontSize: 8.5,
    lineHeight: 1.4,
    marginBottom: 3,
    paddingLeft: 6,
  },
  table: {
    marginTop: 4,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 3,
  },
  th: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: colors.navy,
    textTransform: "uppercase",
  },
  td: {
    fontSize: 8,
    color: colors.slate,
  },
  heatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  heatCell: {
    width: "16.66%",
    padding: 5,
    marginBottom: 2,
  },
  heatLabel: {
    fontSize: 6.5,
    color: colors.white,
    fontFamily: "Helvetica-Bold",
  },
  heatVal: {
    fontSize: 8,
    color: colors.white,
    marginTop: 2,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  barLabel: {
    width: "22%",
    fontSize: 7.5,
    color: colors.navy,
  },
  barTrack: {
    width: "58%",
    height: 7,
    backgroundColor: colors.inset,
    flexDirection: "row",
  },
  barMid: {
    width: "50%",
    borderRightWidth: 1,
    borderRightColor: colors.navy,
  },
  barVal: {
    width: "20%",
    fontSize: 7.5,
    textAlign: "right",
  },
  chain: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: colors.paper,
    borderLeftWidth: 2,
    borderLeftColor: colors.maroon,
  },
  chainK: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: colors.maroon,
    textTransform: "uppercase",
    marginTop: 3,
  },
  chainV: {
    fontSize: 8,
    lineHeight: 1.35,
    color: colors.slate,
  },
  trade: {
    marginBottom: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tradeHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 6,
    fontSize: 7,
    color: colors.muted,
  },
  confidential: {
    marginTop: 12,
    padding: 8,
    backgroundColor: colors.inset,
    color: colors.navy,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  sourceLink: {
    color: colors.maroon,
    fontSize: 8,
    marginBottom: 2,
    textDecoration: "underline",
  },
  pos: { color: colors.green },
  neg: { color: colors.red },
});

function signedStyle(n: number | null | undefined) {
  if (n == null) return styles.td;
  return n >= 0 ? [styles.td, styles.pos] : [styles.td, styles.neg];
}

function heatBg(pct: number | null): string {
  if (pct == null) return "#94A3B8";
  if (pct > 1.2) return "#145A38";
  if (pct > 0.4) return "#1B7A4E";
  if (pct > 0) return "#5AA67A";
  if (pct > -0.4) return "#D96B6B";
  if (pct > -1.2) return "#B42318";
  return "#7A1210";
}

function barFill(row: TapeRow, maxAbs: number) {
  const v = row.vsSpyPct ?? 0;
  const pct = maxAbs === 0 ? 0 : Math.min(50, (Math.abs(v) / maxAbs) * 50);
  return {
    positive: v >= 0,
    width: `${pct}%`,
  };
}

export type ReportDocumentProps = {
  document: ReportDocumentModel;
};

export function ReportDocument({ document }: ReportDocumentProps) {
  const editionLabelText = editionLabel(document.edition);
  const analytics = document.analytics;
  const spy = document.quotes.find((q) => q.ticker === "SPY");
  const qqq = document.quotes.find((q) => q.ticker === "QQQ");
  const tlt = document.quotes.find((q) => q.ticker === "TLT");
  const vixy = document.quotes.find((q) => q.ticker === "VIXY");
  const maxAbs = Math.max(
    0.5,
    ...(analytics?.relativeBars ?? []).map((r) => Math.abs(r.vsSpyPct ?? 0)),
  );
  const sleeves = sleeveRows(analytics?.aiInfrastructure ?? []);

  return (
    <Document
      title={document.title}
      author={document.firmName}
      subject={`Financial intelligence ${document.edition} ${document.tradingDate}`}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.coverBanner}>
          <Text style={styles.coverBrand}>
            {document.firmName} · Proprietary research
          </Text>
          <Text style={styles.coverTitle}>{document.title}</Text>
          <Text style={styles.coverMeta}>
            {editionLabelText} · {document.tradingDate} · Cutoff{" "}
            {formatMarketDateTime(document.dataCutoff)}
            {document.isDemo ? " · DEMO FIXTURES — NOT FOR TRADING" : ""}
          </Text>
        </View>

        <View style={styles.kpiRow}>
          {(
            [
              ["SPY", spy],
              ["QQQ", qqq],
              ["TLT", tlt],
              ["VIXY", vixy],
            ] as const
          ).map(([label, q]) => (
            <View key={label} style={styles.kpi}>
              <Text style={styles.kpiLabel}>{label}</Text>
              <Text style={styles.kpiValue}>{formatPrice(q?.last)}</Text>
              <Text
                style={[
                  styles.kpiSub,
                  (q?.changePercent ?? 0) >= 0 ? styles.pos : styles.neg,
                ]}
              >
                {formatSignedPct(q?.changePercent)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.h1}>{SECTION_TITLES.executive_summary}</Text>
        <Text style={styles.body}>{document.executiveSummary}</Text>
        {document.executiveBullets.map((b, i) => (
          <Text key={`eb-${i}`} style={styles.bullet}>
            • {b}
          </Text>
        ))}

        <Text style={styles.h1}>{SECTION_TITLES.market_snapshot}</Text>
        <Text style={styles.body}>
          Session percent vs SPY — answers who is leading the tape, not
          decoration. Missing proxies are omitted.
        </Text>
        <View style={styles.heatRow}>
          {(analytics?.heatmap ?? []).map((cell) => (
            <View
              key={cell.key}
              style={[
                styles.heatCell,
                { backgroundColor: heatBg(cell.changePercent) },
              ]}
            >
              <Text style={styles.heatLabel}>{cell.key}</Text>
              <Text style={styles.heatVal}>
                {formatSignedPct(cell.changePercent)}
              </Text>
            </View>
          ))}
        </View>
        {(analytics?.relativeBars ?? []).slice(0, 8).map((row) => {
          const fill = barFill(row, maxAbs);
          return (
            <View key={row.key} style={styles.barRow} wrap={false}>
              <Text style={styles.barLabel}>{row.ticker ?? row.key}</Text>
              <View style={styles.barTrack}>
                <View
                  style={{
                    width: "50%",
                    height: 7,
                    flexDirection: "row",
                    justifyContent: "flex-end",
                  }}
                >
                  {fill.positive ? null : (
                    <View
                      style={{
                        width: fill.width,
                        backgroundColor: colors.red,
                        height: 7,
                      }}
                    />
                  )}
                </View>
                <View style={{ width: "50%", height: 7 }}>
                  {fill.positive ? (
                    <View
                      style={{
                        width: fill.width,
                        backgroundColor: colors.green,
                        height: 7,
                      }}
                    />
                  ) : null}
                </View>
              </View>
              <Text style={[styles.barVal, signedStyle(row.vsSpyPct)]}>
                vs SPY {formatSignedPct(row.vsSpyPct)}
              </Text>
            </View>
          );
        })}
        <Text style={styles.body}>{analytics?.breadthNote}</Text>

        <Text style={styles.h1}>{SECTION_TITLES.what_is_moving}</Text>
        {(analytics?.causality ?? []).slice(0, 3).map((chain) => (
          <View key={chain.id} style={styles.chain}>
            <Text style={styles.chainK}>Event · {chain.causalStatus}</Text>
            <Text style={styles.chainV}>{chain.event}</Text>
            <Text style={styles.chainK}>Why it matters</Text>
            <Text style={styles.chainV}>{chain.whyItMatters}</Text>
            <Text style={styles.chainK}>Market impact</Text>
            <Text style={styles.chainV}>{chain.marketImpact}</Text>
            <Text style={styles.chainK}>Company / sector</Text>
            <Text style={styles.chainV}>{chain.companySectorImpact}</Text>
            <Text style={styles.chainK}>Potential trade</Text>
            <Text style={styles.chainV}>{chain.potentialTrade}</Text>
          </View>
        ))}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${document.firmName} · ${document.title} · Confidential · ${pageNumber} / ${totalPages}`
          }
        />
      </Page>

      <Page size="LETTER" style={styles.page}>
        {(analytics?.causality ?? []).length > 3 ? (
          <View>
            <Text style={styles.h1}>
              {SECTION_TITLES.what_is_moving} (continued)
            </Text>
            {(analytics?.causality ?? []).slice(3, 6).map((chain) => (
              <View key={chain.id} style={styles.chain}>
                <Text style={styles.chainK}>Event · {chain.causalStatus}</Text>
                <Text style={styles.chainV}>{chain.event}</Text>
                <Text style={styles.chainK}>Why it matters</Text>
                <Text style={styles.chainV}>{chain.whyItMatters}</Text>
                <Text style={styles.chainK}>Potential trade</Text>
                <Text style={styles.chainV}>{chain.potentialTrade}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.h1}>{SECTION_TITLES.material_movers}</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.th, { width: "14%" }]}>Ticker</Text>
            <Text style={[styles.th, { width: "18%" }]}>Last</Text>
            <Text style={[styles.th, { width: "16%" }]}>Change</Text>
            <Text style={[styles.th, { width: "52%" }]}>Catalyst</Text>
          </View>
          {document.movers.map((m) => (
            <View key={m.ticker} style={styles.tableRow} wrap={false}>
              <Text style={[styles.td, { width: "14%" }]}>{m.ticker}</Text>
              <Text style={[styles.td, { width: "18%" }]}>
                {formatPrice(m.price)}
              </Text>
              <Text style={[signedStyle(m.changePercent), { width: "16%" }]}>
                {formatSignedPct(m.changePercent)}
              </Text>
              <Text style={[styles.td, { width: "52%" }]}>
                {m.catalystSummary}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.h1}>{SECTION_TITLES.ai_infrastructure}</Text>
        {sleeves.length === 0 ? (
          <Text style={styles.body}>
            No AI-infrastructure names in this snapshot. Sleeves omitted, not
            estimated.
          </Text>
        ) : (
          sleeves.map((sleeve) => (
            <View key={sleeve.sleeve} wrap={false}>
              <Text style={[styles.body, { fontFamily: "Helvetica-Bold" }]}>
                {sleeve.label}
              </Text>
              {sleeve.names.map((n) => (
                <Text key={n.key} style={styles.bullet}>
                  {n.ticker} {formatPrice(n.last)} (
                  {formatSignedPct(n.changePercent)}; vs SPY{" "}
                  {formatSignedPct(n.vsSpyPct)})
                </Text>
              ))}
            </View>
          ))
        )}

        <Text style={styles.h1}>{SECTION_TITLES.pm_playbook}</Text>
        {document.tradeIdeas.map((idea) => {
          const bar = riskRewardBarPercents(idea.rewardRisk1);
          return (
            <View key={idea.id} style={styles.trade} wrap={false}>
              <View style={styles.tradeHead}>
                <Text
                  style={{ fontFamily: "Helvetica-Bold", color: colors.navy }}
                >
                  {idea.action} {idea.direction.toUpperCase()} {idea.ticker}
                  {idea.pairLeg ? ` / ${idea.pairLeg}` : ""} · {idea.strategyType}
                </Text>
                <Text>
                  Conf {idea.confidence}/5 · T1 R/R {idea.rewardRisk1 ?? "n/a"} ·
                  T2 {idea.rewardRisk2 ?? "n/a"}
                </Text>
              </View>
              <Text style={styles.chainV}>{idea.thesis}</Text>
              <Text style={styles.chainK}>Catalyst</Text>
              <Text style={styles.chainV}>{idea.catalyst}</Text>
              <Text style={styles.chainV}>
                Entry {formatLevelRange(idea.entryLow, idea.entryHigh)} · Trigger:{" "}
                {idea.trigger} · Stop {idea.stop} · T1 {idea.target1} / T2{" "}
                {idea.target2} · Hold {idea.holdingPeriod}
              </Text>
              <Text style={styles.chainV}>
                Invalidation: {idea.invalidationFact}
              </Text>
              <Text style={styles.chainV}>Monitor: {idea.monitor}</Text>
              <Text style={styles.chainV}>
                Options: {idea.optionsStructure ?? "none — no IV/flow in bundle"}
              </Text>
              <View style={{ flexDirection: "row", marginTop: 4, height: 6 }}>
                <View
                  style={{
                    width: `${bar.riskPct}%`,
                    backgroundColor: colors.red,
                    height: 6,
                  }}
                />
                <View
                  style={{
                    width: `${bar.rewardPct}%`,
                    backgroundColor: colors.green,
                    height: 6,
                  }}
                />
              </View>
              <Text style={{ fontSize: 7, color: colors.muted, marginTop: 2 }}>
                Risk to stop (red) vs reward to T1 (green), scaled to this
                idea's R/R — not live vol.
              </Text>
            </View>
          );
        })}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${document.firmName} · ${document.title} · Confidential · ${pageNumber} / ${totalPages}`
          }
        />
      </Page>

      <Page size="LETTER" style={styles.page}>
        {document.priorEditionChanges.length > 0 ? (
          <View>
            <Text style={styles.h1}>
              {SECTION_TITLES.changes_since_previous}
            </Text>
            {document.priorEditionChanges.map((row, index) => (
              <Text key={`${row.thesisId}-${index}`} style={styles.bullet}>
                • {THESIS_STATUS_LABELS[row.previousStatus]} →{" "}
                {THESIS_STATUS_LABELS[row.currentStatus]} · {row.priorThesis} ·{" "}
                {row.whatChanged} {row.affectsTrade ? "AFFECTS TRADE." : ""}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.h1}>{SECTION_TITLES.scenarios_and_variants}</Text>
        <Text style={styles.body}>
          BULL: {analytics?.scenarios.bull}
        </Text>
        <Text style={styles.body}>
          BASE: {analytics?.scenarios.base}
        </Text>
        <Text style={styles.body}>
          BEAR: {analytics?.scenarios.bear}
        </Text>
        <Text style={styles.body}>
          CHANGE MY MIND: {analytics?.scenarios.whatWouldChangeMyMind}
        </Text>
        {(analytics?.variantViews ?? []).map((v, i) => (
          <Text key={`v-${i}`} style={styles.bullet}>
            • {v}
          </Text>
        ))}

        <Text style={styles.h1}>{SECTION_TITLES.macro_rates}</Text>
        <Text style={styles.body}>
          {document.sections.find((s) => s.sectionKey === "macro_rates")?.body}
        </Text>

        <Text style={styles.h1}>{SECTION_TITLES.options_desk}</Text>
        <Text style={styles.body}>
          {analytics?.optionsDesk.reason}
        </Text>

        <Text style={styles.h1}>{SECTION_TITLES.earnings_calendar}</Text>
        <Text style={styles.body}>
          {
            document.sections.find((s) => s.sectionKey === "earnings_calendar")
              ?.body
          }
        </Text>

        {document.sections
          .filter((section) =>
            [
              "watchlist",
              "news_catalysts",
              "regular_session_recap",
              "after_hours_developments",
              "trade_book_status",
              "next_session_setup",
            ].includes(section.sectionKey),
          )
          .map((section) => (
            <View key={section.sectionKey}>
              <Text style={styles.h1}>{section.title}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </View>
          ))}

        <Text style={styles.h1}>{SECTION_TITLES.sources}</Text>
        {document.sources.map((s) => (
          <Link key={s.id} src={s.url} style={styles.sourceLink}>
            {s.id}: {s.title}
          </Link>
        ))}

        <Text style={styles.h1}>{SECTION_TITLES.methodology}</Text>
        <Text style={styles.body}>{document.methodology}</Text>
        <Text style={styles.confidential}>{document.confidentiality}</Text>

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${document.firmName} · ${document.title} · Confidential · ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
