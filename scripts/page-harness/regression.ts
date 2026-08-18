import type { EvaluationCompleteness } from "./schemas";

type VerifyLike = {
  name: string;
  ok: boolean;
  output: string;
  scope?: string;
};

type ClassifiedLike = {
  target: Array<{ name: string; ok: boolean }>;
  adjacent: VerifyLike[];
  staticChecks: Array<{ name: string; ok: boolean }>;
};

export type FailureCategory =
  | "strict_mode_violation"
  | "not_in_viewport"
  | "timeout"
  | "assertion"
  | "unknown";

export type FailureFingerprint = {
  id: string;
  file: string;
  title: string;
  project: string | null;
  category: FailureCategory;
  message: string;
};

export type RegressionDelta = {
  blocking: FailureFingerprint[];
  baselineDebt: FailureFingerprint[];
  resolved: FailureFingerprint[];
  incomparable: FailureFingerprint[];
  missingBaseline: boolean;
  missingRequiredAdjacent: boolean;
};

export type RegressionBaseline = {
  fingerprints: FailureFingerprint[];
  capturedFrom: string;
  adjacentSpecs: string[];
};

const SPEC_SEP = "(?:›|>|\u00BB|ΓÇ║)";
const EXECUTED_SPEC_RE = new RegExp(
  String.raw`[✓✔✘×xX]\s+\d+\s+\[([^\]]+)\]\s+${SPEC_SEP}\s+(.+?):(\d+):(\d+)\s+${SPEC_SEP}\s+(.+?)(?:\s+\(([\d.]+)\s*m?s\))?\s*$`,
  "gm",
);
const FAILURE_HEADER_RE = new RegExp(
  String.raw`^\s*\d+\)\s+\[([^\]]+)\]\s+${SPEC_SEP}\s+(.+?):\d+:\d+\s+${SPEC_SEP}\s+(.+?)\s*$`,
  "gm",
);

export function normalizeSpecPath(file: string): string {
  return file.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\.\//, "");
}

export function fingerprintId(file: string, title: string): string {
  const normalizedTitle = title
    .replace(/\s*(?:›|>|\u00BB|ΓÇ║)\s*/g, " › ")
    .trim();
  return `${normalizeSpecPath(file)}::${normalizedTitle}`;
}

export function classifyFailureCategory(message: string): FailureCategory {
  const text = message.toLowerCase();
  if (text.includes("strict mode violation")) return "strict_mode_violation";
  if (text.includes("tobeinviewport") || text.includes("viewport ratio")) {
    return "not_in_viewport";
  }
  if (text.includes("timed out") || text.includes("timeout")) return "timeout";
  if (text.includes("expect(") || text.includes("error:")) return "assertion";
  return "unknown";
}

export function extractExecutedSpecs(output: string): string[] {
  const found = new Set<string>();
  const text = output.replace(/\r\n/g, "\n");
  for (const match of text.matchAll(EXECUTED_SPEC_RE)) {
    found.add(normalizeSpecPath(match[2] ?? ""));
  }
  return [...found].filter(Boolean);
}

export function extractExecutedTestIds(output: string): Array<{
  file: string;
  title: string;
  project: string;
  passed: boolean;
}> {
  const rows: Array<{ file: string; title: string; project: string; passed: boolean }> = [];
  const text = output.replace(/\r\n/g, "\n");
  for (const match of text.matchAll(EXECUTED_SPEC_RE)) {
    const marker = match[0]?.trim().charAt(0) ?? "";
    const passed = marker === "✓" || marker === "✔";
    rows.push({
      project: match[1] ?? "",
      file: normalizeSpecPath(match[2] ?? ""),
      title: (match[5] ?? "").trim(),
      passed,
    });
  }
  return rows.filter((row) => row.file && row.title);
}

export function parsePlaywrightFailures(output: string): FailureFingerprint[] {
  const text = output.replace(/\r\n/g, "\n");
  const blocks = splitFailureBlocks(text);
  const byId = new Map<string, FailureFingerprint>();
  for (const block of blocks) {
    const header = new RegExp(
      String.raw`^\s*\d+\)\s+\[([^\]]+)\]\s+${SPEC_SEP}\s+(.+?):\d+:\d+\s+${SPEC_SEP}\s+(.+?)\s*$`,
      "m",
    ).exec(block);
    if (!header) continue;
    const file = normalizeSpecPath(header[2] ?? "");
    const title = (header[3] ?? "").trim();
    const id = fingerprintId(file, title);
    const message = block.slice(0, 1200).trim();
    byId.set(id, {
      id,
      file,
      title,
      project: header[1] ?? null,
      category: classifyFailureCategory(block),
      message,
    });
  }
  if (byId.size === 0) {
    for (const match of text.matchAll(FAILURE_HEADER_RE)) {
      const file = normalizeSpecPath(match[2] ?? "");
      const title = (match[3] ?? "").trim();
      const id = fingerprintId(file, title);
      byId.set(id, {
        id,
        file,
        title,
        project: match[1] ?? null,
        category: classifyFailureCategory(text),
        message: title,
      });
    }
  }
  for (const row of extractExecutedTestIds(output)) {
    if (row.passed || byId.has(fingerprintId(row.file, row.title))) continue;
    const id = fingerprintId(row.file, row.title);
    byId.set(id, {
      id,
      file: row.file,
      title: row.title,
      project: row.project || null,
      category: classifyFailureCategory(output),
      message: row.title,
    });
  }
  return [...byId.values()];
}

function splitFailureBlocks(output: string): string[] {
  const idx = output.search(/^\s*1\)\s+\[/m);
  if (idx < 0) return [];
  const rest = output.slice(idx);
  const parts = rest.split(/^\s*(?=\d+\)\s+\[)/m).filter((part) => /^\s*\d+\)/.test(part));
  return parts.map((part) => {
    const cut = part.search(/\n\s+\d+ failed\b/);
    return cut >= 0 ? part.slice(0, cut) : part;
  });
}

export function fingerprintsFromVerifyResults(results: VerifyLike[]): FailureFingerprint[] {
  const adjacentJobs = results.filter(
    (row) => row.scope === "adjacent" && row.name.startsWith("playwright-"),
  );
  const source = adjacentJobs.length ? adjacentJobs : results.filter((row) => !row.ok);
  const merged = new Map<string, FailureFingerprint>();
  for (const row of source) {
    if (row.ok) continue;
    for (const fingerprint of parsePlaywrightFailures(row.output)) {
      merged.set(fingerprint.id, fingerprint);
    }
  }
  return [...merged.values()];
}

export function compareFailureFingerprints(
  baseline: FailureFingerprint[],
  current: FailureFingerprint[],
): Pick<RegressionDelta, "blocking" | "baselineDebt" | "resolved" | "incomparable"> {
  const baselineById = new Map(baseline.map((row) => [row.id, row]));
  const currentById = new Map(current.map((row) => [row.id, row]));
  const blocking: FailureFingerprint[] = [];
  const baselineDebt: FailureFingerprint[] = [];
  const incomparable: FailureFingerprint[] = [];
  const resolved: FailureFingerprint[] = [];

  for (const row of current) {
    const previous = baselineById.get(row.id);
    if (!previous) {
      blocking.push(row);
      continue;
    }
    if (previous.category !== row.category && previous.category !== "unknown" && row.category !== "unknown") {
      blocking.push(row);
      continue;
    }
    if (previous.category === "unknown" || row.category === "unknown") {
      if (previous.category !== row.category) {
        incomparable.push(row);
        continue;
      }
    }
    baselineDebt.push(row);
  }

  for (const row of baseline) {
    if (!currentById.has(row.id)) resolved.push(row);
  }

  return { blocking, baselineDebt, resolved, incomparable };
}

export function compareAdjacentRegression(options: {
  policy: { requireAdjacentRegression: boolean };
  classified: ClassifiedLike;
  baselineFingerprints: FailureFingerprint[] | null;
  adjacentRequired: boolean;
}): RegressionDelta {
  const adjacentJobs = options.classified.adjacent.filter((row) =>
    row.name.startsWith("playwright-"),
  );
  const current = fingerprintsFromVerifyResults(options.classified.adjacent);
  const missingRequiredAdjacent =
    options.policy.requireAdjacentRegression &&
    options.adjacentRequired &&
    adjacentJobs.length === 0;
  if (!options.policy.requireAdjacentRegression) {
    return {
      blocking: [],
      baselineDebt: [],
      resolved: [],
      incomparable: [],
      missingBaseline: false,
      missingRequiredAdjacent,
    };
  }
  if (missingRequiredAdjacent) {
    return {
      blocking: [],
      baselineDebt: [],
      resolved: [],
      incomparable: [],
      missingBaseline: false,
      missingRequiredAdjacent: true,
    };
  }
  if (current.length === 0) {
    return {
      blocking: [],
      baselineDebt: [],
      resolved: [],
      incomparable: [],
      missingBaseline: false,
      missingRequiredAdjacent: false,
    };
  }
  const missingBaseline = options.baselineFingerprints == null;
  if (missingBaseline) {
    return {
      blocking: [...current],
      baselineDebt: [],
      resolved: [],
      incomparable: [...current],
      missingBaseline: true,
      missingRequiredAdjacent: false,
    };
  }
  const compared = compareFailureFingerprints(options.baselineFingerprints ?? [], current);
  return {
    ...compared,
    blocking: [...compared.blocking, ...compared.incomparable],
    missingBaseline: false,
    missingRequiredAdjacent: false,
  };
}

export function evaluateCompleteRequiredPass(options: {
  evaluationPassed: boolean;
  completeness: EvaluationCompleteness;
  skepticRequired: boolean;
  skepticPassed: boolean | null;
  classified: ClassifiedLike;
  regression: RegressionDelta;
  freshnessOk: boolean;
  performanceRegressions: number;
  routeError: boolean;
}): { passed: boolean; testsFailed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const targetFailed = options.classified.target.some((row) => !row.ok);
  const staticFailed = options.classified.staticChecks.some((row) => !row.ok);
  const testsFailed =
    targetFailed ||
    staticFailed ||
    options.regression.blocking.length > 0 ||
    options.regression.missingRequiredAdjacent ||
    options.regression.missingBaseline;
  if (options.routeError) reasons.push("inspect route error");
  if (!options.evaluationPassed) reasons.push("evaluator required gates incomplete");
  if (options.completeness.failed.length) reasons.push("completeness failed gates");
  if (options.completeness.ineligibleEvidence.length) {
    reasons.push("ineligible evidence");
  }
  if (options.completeness.missing.length) reasons.push("unevaluated gates");
  if (options.skepticRequired && options.skepticPassed !== true) {
    reasons.push("skeptic required and incomplete");
  }
  if (targetFailed) reasons.push("target verification failed");
  if (staticFailed) reasons.push("static verification failed");
  if (options.regression.missingRequiredAdjacent) {
    reasons.push("required adjacent verification missing");
  }
  if (options.regression.missingBaseline && options.regression.blocking.length) {
    reasons.push("adjacent failures incomparable without baseline evidence");
  } else if (options.regression.blocking.length) {
    reasons.push("new or worsened adjacent regressions");
  }
  if (!options.freshnessOk) reasons.push("stale evidence");
  if (options.performanceRegressions > 0) reasons.push("performance regressions");
  const structural =
    options.completeness.failed.length > 0 ||
    options.completeness.missing.length > 0 ||
    options.completeness.noEvidence.length > 0 ||
    options.completeness.illegalNotApplicable.length > 0 ||
    options.completeness.unprovenConditional.length > 0 ||
    options.completeness.ineligibleEvidence.length > 0;
  const passed =
    !options.routeError &&
    options.evaluationPassed &&
    !structural &&
    (!options.skepticRequired || options.skepticPassed === true) &&
    !testsFailed &&
    options.performanceRegressions === 0 &&
    options.freshnessOk;
  return { passed, testsFailed, reasons };
}

export function selectBudgetRestoreCommit(options: {
  best: { completeRequiredPass: boolean; commit: string } | null;
  startCommit: string | null;
}): {
  commit: string | null;
  restoreKind: "passing_checkpoint" | "baseline" | "none";
} {
  if (options.best?.completeRequiredPass && options.best.commit) {
    return { commit: options.best.commit, restoreKind: "passing_checkpoint" };
  }
  if (options.startCommit) {
    return { commit: options.startCommit, restoreKind: "baseline" };
  }
  return { commit: null, restoreKind: "none" };
}
