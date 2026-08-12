import { z } from "zod";
import {
  validateClaimsHaveCitations,
  type ClaimForCitationCheck,
  type SourceForCitationCheck,
} from "@/lib/domain/citations";
import { ReportEditionSchema } from "@/lib/reports/editions";
import { requiredSectionKeysFor } from "@/lib/reports/section-keys";
import {
  ThesisRecordSchema,
  assertNoDroppedTheses,
  type ThesisRecord,
} from "@/lib/reports/thesis";

export type QualitySeverity = "blocking" | "warning" | "ok";

export type QualityIssue = {
  code: string;
  severity: Exclude<QualitySeverity, "ok">;
  message: string;
  path?: string;
};

export type QualityGateResult = {
  ok: boolean;
  severity: QualitySeverity;
  issues: QualityIssue[];
};

export const QualityGateSectionSchema = z.object({
  sectionKey: z.string(),
  title: z.string(),
  body: z.string(),
});

export const QualityGateMoverSchema = z.object({
  ticker: z.string(),
  price: z.number().nullable().optional(),
  changePercent: z.number().nullable().optional(),
  catalystSummary: z.string().optional(),
});

export const QualityGateClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  material: z.boolean().default(true),
  sourceIds: z.array(z.string()).default([]),
});

export const QualityGateDocumentSchema = z.object({
  title: z.string().min(1),
  edition: ReportEditionSchema,
  tradingDate: z.string().min(1),
  executiveSummary: z.string().min(1),
  sections: z.array(QualityGateSectionSchema).min(1),
  movers: z.array(QualityGateMoverSchema).default([]),
  claims: z.array(QualityGateClaimSchema).default([]),
  sources: z
    .array(
      z.object({
        id: z.string(),
        url: z.string().optional(),
        title: z.string().optional(),
      }),
    )
    .default([]),
  labels: z.array(z.string()).default([]),
  theses: z.array(ThesisRecordSchema).default([]),
  afterHours: z
    .object({
      materialChangeDetected: z.boolean(),
      quietStatement: z.string().optional(),
    })
    .optional(),
  optionsObservations: z
    .array(
      z.object({
        interpretation: z.string().optional(),
        side: z.string().optional(),
      }),
    )
    .optional(),
});

export type QualityGateDocument = z.infer<typeof QualityGateDocumentSchema>;

export type EvidenceBundle = {
  /** Flattened numeric evidence tokens (prices, percents, volumes, etc.). */
  numberTokens: string[];
  /** Raw text blobs that numbers may appear in (quotes JSON, news, etc.). */
  textBlobs?: string[];
};

function collectIssuesSeverity(issues: QualityIssue[]): QualitySeverity {
  if (issues.some((i) => i.severity === "blocking")) return "blocking";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "ok";
}

/** Normalize a number for fuzzy membership in evidence (2–4 dp). */
export function normalizeNumberToken(n: number): string[] {
  if (!Number.isFinite(n)) return [];
  const tokens = new Set<string>();
  tokens.add(String(n));
  tokens.add(n.toFixed(2));
  tokens.add(n.toFixed(1));
  tokens.add(n.toFixed(0));
  tokens.add(Math.abs(n).toFixed(2));
  tokens.add(Math.abs(n).toFixed(1));
  return [...tokens];
}

export function buildEvidenceNumberTokens(
  values: Array<number | null | undefined>,
): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (v == null) continue;
    for (const t of normalizeNumberToken(v)) out.add(t);
  }
  return [...out];
}

/**
 * Comma-grouped numbers must include at least one thousands separator so
 * `97742.35` is not split into `977` + `42.35`. A hyphen between two numbers
 * (entry ranges) is not a minus sign — lookbehind rejects a preceding digit.
 * Letter-hyphen slugs (`finnhub-news-8338114`) are identifiers, not quantities.
 */
const NUMBER_IN_TEXT =
  /(?<![A-Za-z0-9.])(?<![A-Za-z]-)[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|(?<![A-Za-z0-9.])(?<![A-Za-z]-)[-+]?\d+(?:\.\d+)?%?/g;

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s)\]]+/gi, " ");
}

/**
 * Extract numeric literals from free text for invented-number checks.
 */
export function extractNumbersFromText(text: string): string[] {
  const matches = stripUrls(text).match(NUMBER_IN_TEXT) ?? [];
  return matches.map((m) => m.replace(/,/g, "").replace(/%$/, ""));
}

function numberSupported(
  token: string,
  evidence: Set<string>,
  evidenceText: string,
): boolean {
  if (evidence.has(token)) return true;
  // Allow substring match for longer precision forms present in evidence text
  if (evidenceText.includes(token)) return true;
  const asNum = Number(token);
  if (!Number.isFinite(asNum)) return false;
  for (const candidate of normalizeNumberToken(asNum)) {
    if (evidence.has(candidate) || evidenceText.includes(candidate)) {
      return true;
    }
  }
  return false;
}

export type MarketDataQualityContext = {
  /** Core observations older than this many seconds are stale. */
  staleAfterSeconds?: number;
  /** ISO timestamp of the frozen market cutoff / as-of. */
  dataCutoff?: string | null;
  now?: Date;
  feedCoverage?: string | null;
  /** Declared latency/coverage label on the document (e.g. from provenance). */
  declaredLatencyLabel?: string | null;
  /** Actual label derived from feed+latency — mismatch is blocking. */
  expectedLatencyLabel?: string | null;
  /** Surfaces the license permits. */
  permittedSurfaces?: string[] | null;
  /** Surfaces this delivery/path will use (pdf/email/ai). */
  requestedSurfaces?: string[] | null;
  /** When true, breadth/full-market style claims are blocked for narrow feeds. */
  claimsRequireBroadCoverage?: boolean;
  /** Text blobs that assert breadth / SIP / full market (checked against coverage). */
  coverageSensitiveClaimTexts?: string[];
};

export type QualityGateOptions = {
  requiredSections?: readonly string[];
  marketData?: MarketDataQualityContext;
  priorThesisIds?: string[];
};

const BROAD_COVERAGE_CLAIM =
  /\b(sip|nbbo|full[\s-]?market|exchange[\s-]?wide\s+breadth|advancers?\s+\/\s+decliners?)\b/i;

/** Drop honest IEX disclaimers so "not SIP" is not treated as a SIP claim. */
function stripCoverageNegations(text: string): string {
  return text
    .replace(/not\s+labeled\s+as\s+sip/gi, " ")
    .replace(/not\s+sip\/full[\s-]?market/gi, " ")
    .replace(/not\s+full[\s-]?market/gi, " ")
    .replace(/not\s+sip/gi, " ")
    .replace(/not\s+nbbo/gi, " ");
}

function claimsBroadCoverage(text: string): boolean {
  return BROAD_COVERAGE_CLAIM.test(stripCoverageNegations(text));
}

function labelsIexAsSip(text: string): boolean {
  return /\bsip\b/i.test(stripCoverageNegations(text));
}

/**
 * Quality gate: required sections, citations, no invented numbers,
 * schema validity, duplicate movers, market-data license/freshness/coverage.
 */
export function runQualityGate(
  document: unknown,
  evidence: EvidenceBundle,
  options: QualityGateOptions = {},
): QualityGateResult {
  const issues: QualityIssue[] = [];
  const parsed = QualityGateDocumentSchema.safeParse(document);
  if (!parsed.success) {
    issues.push({
      code: "schema_invalid",
      severity: "blocking",
      message: `Document failed schema validation: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => i.message)
        .join("; ")}`,
    });
    return { ok: false, severity: "blocking", issues };
  }

  const doc = parsed.data;
  const required =
    options.requiredSections ?? requiredSectionKeysFor(doc.edition);
  const present = new Set(doc.sections.map((s) => s.sectionKey));
  for (const key of required) {
    if (!present.has(key)) {
      issues.push({
        code: "missing_section",
        severity: "blocking",
        message: `Missing required section "${key}"`,
        path: key,
      });
    }
  }

  for (const section of doc.sections) {
    if (!section.body.trim()) {
      issues.push({
        code: "empty_section",
        severity: "warning",
        message: `Section "${section.sectionKey}" has empty body`,
        path: section.sectionKey,
      });
    }
  }

  const claims: ClaimForCitationCheck[] = doc.claims.map((c) => ({
    id: c.id,
    text: c.text,
    material: c.material,
    sourceIds: c.sourceIds,
  }));
  const sources: SourceForCitationCheck[] = doc.sources.map((s) => ({
    id: s.id,
    url: s.url,
  }));
  const citation = validateClaimsHaveCitations(claims, sources);
  for (const issue of citation.issues) {
    issues.push({
      code: `citation_${issue.reason}`,
      severity: "blocking",
      message: issue.detail,
      path: issue.claimId,
    });
  }

  const evidenceSet = new Set(evidence.numberTokens);
  const evidenceText = [
    ...evidence.numberTokens,
    ...(evidence.textBlobs ?? []),
  ].join(" ");

  const claimTexts = [
    doc.executiveSummary,
    ...doc.claims.map((c) => c.text),
    ...doc.sections.map((s) => s.body),
  ];

  for (const text of claimTexts) {
    for (const token of extractNumbersFromText(text)) {
      const n = Number(token);
      // Ignore tiny integers (list indices) and calendar years in prose/dates
      if (Number.isInteger(n) && Math.abs(n) < 10) continue;
      if (Number.isInteger(n) && n >= 1900 && n <= 2100) continue;
      if (!numberSupported(token, evidenceSet, evidenceText)) {
        issues.push({
          code: "invented_number",
          severity: "blocking",
          message: `Number "${token}" does not appear in the evidence bundle`,
        });
      }
    }
  }

  const seenTickers = new Set<string>();
  for (const mover of doc.movers) {
    const key = mover.ticker.toUpperCase();
    if (seenTickers.has(key)) {
      issues.push({
        code: "duplicate_mover",
        severity: "blocking",
        message: `Duplicate mover ticker "${key}"`,
        path: key,
      });
    }
    seenTickers.add(key);
  }

  if (doc.edition === "midday" || doc.edition === "close_postmarket") {
    const hasChanges = doc.sections.some(
      (s) => s.sectionKey === "changes_since_previous",
    );
    if (!hasChanges) {
      issues.push({
        code: "missing_prior_edition_trail",
        severity: "blocking",
        message: `${doc.edition} must include a prior-edition audit section.`,
      });
    }
  }

  if (options.priorThesisIds && options.priorThesisIds.length > 0) {
    const dropped = assertNoDroppedTheses(
      options.priorThesisIds,
      doc.theses as ThesisRecord[],
    );
    for (const id of dropped) {
      issues.push({
        code: "dropped_prior_thesis",
        severity: "blocking",
        message: `Prior thesis "${id}" was removed instead of audited.`,
        path: id,
      });
    }
  }

  if (doc.edition === "close_postmarket" && doc.afterHours) {
    if (
      !doc.afterHours.materialChangeDetected &&
      !doc.sections.some((s) =>
        /no material after-hours change/i.test(s.body),
      )
    ) {
      issues.push({
        code: "missing_quiet_after_hours_statement",
        severity: "blocking",
        message:
          "Close/postmarket must state that no material after-hours change was detected when none exists.",
      });
    }
  }

  const OPTIONS_FORBIDDEN =
    /\b(bought|sold|opening|closing|bullish|bearish)\b/i;
  for (const row of doc.optionsObservations ?? []) {
    const text = `${row.interpretation ?? ""} ${row.side ?? ""}`;
    if (OPTIONS_FORBIDDEN.test(text)) {
      issues.push({
        code: "unsupported_options_language",
        severity: "blocking",
        message:
          "Options rows cannot be labeled bought, sold, opening, closing, bullish, or bearish without supporting quote evidence.",
      });
    }
  }

  const md = options.marketData;
  if (md) {
    const now = md.now ?? new Date();
    const staleAfter = md.staleAfterSeconds ?? 180;
    if (md.dataCutoff) {
      const ageSec = (now.getTime() - Date.parse(md.dataCutoff)) / 1000;
      if (Number.isFinite(ageSec) && ageSec > staleAfter) {
        issues.push({
          code: "stale_core_observations",
          severity: "blocking",
          message: `Core market observations are stale (${Math.round(ageSec)}s > ${staleAfter}s stale-after).`,
        });
      }
    }

    if (
      md.declaredLatencyLabel &&
      md.expectedLatencyLabel &&
      md.declaredLatencyLabel !== md.expectedLatencyLabel
    ) {
      issues.push({
        code: "latency_label_mismatch",
        severity: "blocking",
        message: `Latency/coverage label mismatch: declared "${md.declaredLatencyLabel}" vs expected "${md.expectedLatencyLabel}".`,
      });
    }

    const feed = (md.feedCoverage ?? "").toLowerCase();
    const narrow =
      feed === "iex" ||
      feed === "fmv" ||
      feed === "delayed_15m" ||
      feed === "eod" ||
      feed === "unknown";
    const claimTexts = [
      doc.executiveSummary,
      ...doc.sections.map((s) => s.body),
      ...doc.claims.map((c) => c.text),
      ...(md.coverageSensitiveClaimTexts ?? []),
      ...doc.labels,
    ];
    if (md.claimsRequireBroadCoverage !== false && narrow) {
      for (const text of claimTexts) {
        if (claimsBroadCoverage(text)) {
          issues.push({
            code: "coverage_too_narrow",
            severity: "blocking",
            message: `Claim requires broad market coverage but feed is "${md.feedCoverage ?? "unknown"}".`,
          });
          break;
        }
      }
      if (feed === "iex" && claimTexts.some((t) => labelsIexAsSip(t))) {
        issues.push({
          code: "iex_labeled_as_sip",
          severity: "blocking",
          message: "IEX feed must not be labeled as SIP.",
        });
      }
    }

    const permitted = new Set(md.permittedSurfaces ?? []);
    const requested = md.requestedSurfaces ?? [];
    for (const surface of requested) {
      if (permitted.size > 0 && !permitted.has(surface)) {
        const blockingSurfaces = new Set([
          "pdf_inclusion",
          "email_attachment",
          "ai_analysis_input",
        ]);
        issues.push({
          code: "license_surface_blocked",
          severity: blockingSurfaces.has(surface) ? "blocking" : "warning",
          message: `License does not permit surface "${surface}".`,
          path: surface,
        });
      }
    }
  }

  const severity = collectIssuesSeverity(issues);
  return {
    ok: severity !== "blocking",
    severity,
    issues,
  };
}
