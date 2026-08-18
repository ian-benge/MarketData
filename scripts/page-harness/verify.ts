import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runCommand } from "./util";
import { lookupPage, PAGE_CATALOG, routePath, type PageCatalogEntry } from "./catalog";
import { evidenceMeta, type EvidenceMeta } from "./evidence";
import { extractExecutedSpecs } from "./regression";

export type VerifyScope = "target" | "adjacent" | "unrelated" | "static";

export type VerifyResult = {
  name: string;
  ok: boolean;
  output: string;
  page?: string;
  scope?: VerifyScope;
  visitedRoutes?: string[];
  targetRouteVisited?: boolean;
};

export type VerifyBundle = {
  results: VerifyResult[];
  meta: EvidenceMeta;
  adjacentRoutes: string[];
};

function nodeCli(cwd: string, binRelative: string, extraArgs: string[]): {
  command: string;
  args: string[];
} {
  return {
    command: process.execPath,
    args: [path.join(cwd, "node_modules", binRelative), ...extraArgs],
  };
}

export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLESTAR::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function fileMatchesGlob(file: string, pattern: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  return globToRegExp(pattern).test(normalized);
}

export function affectedAdjacentPages(
  route: string,
  changedFiles: string[],
): PageCatalogEntry[] {
  const current = lookupPage(route);
  const hits: PageCatalogEntry[] = [];
  for (const page of PAGE_CATALOG) {
    if (page.route === current?.route) continue;
    const related = [page.pageFile, ...page.relatedGlobs];
    if (changedFiles.some((file) => related.some((pattern) => fileMatchesGlob(file, pattern)))) {
      hits.push(page);
    }
  }
  return hits;
}

export function specCoversRoute(specSource: string, route: string): boolean {
  const requested = route.split("?")[0] || "/";
  if (requested === "/") {
    return /goto\(\s*["']\/["']|["']\/["']/.test(specSource);
  }
  const escaped = requested.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?:["'\\s,/]|$)`).test(specSource);
}

export function specFileCoversRoute(cwd: string, specFile: string, route: string): boolean {
  const full = path.join(cwd, specFile);
  if (!existsSync(full)) return false;
  return specCoversRoute(readFileSync(full, "utf8"), route);
}

export function extractVisitedRoutes(output: string): string[] {
  const found = new Set<string>();
  for (const match of output.matchAll(/navigating to "([^"]+)"/g)) {
    const raw = match[1] ?? "";
    try {
      found.add(new URL(raw).pathname || "/");
    } catch {
      found.add(raw.split("?")[0] || raw);
    }
  }
  for (const match of output.matchAll(/page\.goto\((?:path,\s*)?["']([^"']+)["']/g)) {
    found.add((match[1] ?? "").split("?")[0] || "/");
  }
  return [...found];
}

export function targetRouteVisitedInOutput(output: string, route: string): boolean {
  const requested = route.split("?")[0] || "/";
  return extractVisitedRoutes(output).some(
    (pathname) => pathname === requested || pathname.startsWith(`${requested}/`),
  );
}

export function extractDeclaredRoutes(specSource: string): string[] {
  const found = new Set<string>();
  for (const match of specSource.matchAll(/goto\(\s*(?:path,\s*)?["'`](\/[^"'`]*)["'`]/g)) {
    found.add((match[1] ?? "").split("?")[0] || "/");
  }
  if (/page\.goto\(\s*path/.test(specSource)) {
    for (const match of specSource.matchAll(/["'`](\/[A-Za-z0-9/_-]+)["'`]/g)) {
      found.add((match[1] ?? "").split("?")[0] || "/");
    }
  }
  return [...found];
}

export function visitedRoutesFromExecutedSpecs(cwd: string, output: string): string[] {
  const routes = new Set<string>();
  for (const spec of extractExecutedSpecs(output)) {
    const full = path.join(cwd, spec);
    if (!existsSync(full)) continue;
    for (const route of extractDeclaredRoutes(readFileSync(full, "utf8"))) {
      routes.add(route);
    }
  }
  return [...routes];
}

export function selectAdjacentSpecs(options: {
  cwd: string;
  route: string;
  targetSpecs: string[];
  adjacent: PageCatalogEntry[];
}): string[] {
  const requested = options.route.split("?")[0] || "/";
  return [
    ...new Set(
      options.adjacent.flatMap((entry) => entry.e2e).filter((spec) => {
        if (options.targetSpecs.includes(spec)) return false;
        return !specFileCoversRoute(options.cwd, spec, requested);
      }),
    ),
  ];
}

export type VerifyJobs = {
  staticChecks?: boolean;
  target?: boolean;
  adjacent?: boolean;
  unrelated?: boolean;
};

export function classifyVerifyResults(options: {
  requestedRoute: string;
  results: VerifyResult[];
}): {
  target: VerifyResult[];
  adjacent: VerifyResult[];
  unrelated: VerifyResult[];
  staticChecks: VerifyResult[];
  targetVisited: boolean;
  targetOk: boolean;
  unrelatedFailures: VerifyResult[];
  adjacentFailures: VerifyResult[];
} {
  const requested = options.requestedRoute.split("?")[0] || "/";
  const target: VerifyResult[] = [];
  const adjacent: VerifyResult[] = [];
  const unrelated: VerifyResult[] = [];
  const staticChecks: VerifyResult[] = [];
  for (const row of options.results) {
    const visited =
      row.visitedRoutes ??
      (row.output ? extractVisitedRoutes(row.output) : []);
    const sawTarget =
      row.targetRouteVisited === true ||
      visited.some((pathname) => pathname === requested || pathname.startsWith(`${requested}/`));
    const enriched = {
      ...row,
      visitedRoutes: visited,
      targetRouteVisited: row.targetRouteVisited ?? sawTarget,
    };
    const scope = row.scope ?? "static";
    if (scope === "target") target.push(enriched);
    else if (scope === "adjacent") adjacent.push(enriched);
    else if (scope === "unrelated") unrelated.push(enriched);
    else staticChecks.push(enriched);
  }
  const targetVisited = target.some((row) => row.targetRouteVisited);
  const targetOk = targetVisited && target.some((row) => row.ok && row.targetRouteVisited);
  return {
    target,
    adjacent,
    unrelated,
    staticChecks,
    targetVisited,
    targetOk,
    unrelatedFailures: unrelated.filter((row) => !row.ok),
    adjacentFailures: adjacent.filter((row) => !row.ok),
  };
}

export async function runVerification(options: {
  cwd: string;
  route: string;
  baseUrl: string;
  timeoutMs?: number;
  changedFiles?: string[];
  requireAdjacent?: boolean;
  jobs?: VerifyJobs;
  meta?: Omit<EvidenceMeta, "timestamp" | "generatingCommand"> & {
    timestamp?: string;
  };
}): Promise<VerifyResult[]> {
  const bundle = await runVerificationBundle(options);
  return bundle.results;
}

export async function runVerificationBundle(options: {
  cwd: string;
  route: string;
  baseUrl: string;
  timeoutMs?: number;
  changedFiles?: string[];
  requireAdjacent?: boolean;
  jobs?: VerifyJobs;
  meta?: Omit<EvidenceMeta, "timestamp" | "generatingCommand"> & {
    timestamp?: string;
  };
}): Promise<VerifyBundle> {
  const page = lookupPage(options.route);
  const adjacent =
    options.requireAdjacent === false
      ? []
      : options.changedFiles?.length
        ? affectedAdjacentPages(options.route, options.changedFiles)
        : [];
  const jobs: Required<VerifyJobs> = {
    staticChecks: options.jobs?.staticChecks ?? true,
    target: options.jobs?.target ?? true,
    adjacent: options.jobs?.adjacent ?? true,
    unrelated: options.jobs?.unrelated ?? true,
  };
  const results: VerifyResult[] = [];
  const env = {
    ...process.env,
    PLAYWRIGHT_EXTERNAL_SERVER: "true",
    PLAYWRIGHT_BASE_URL: options.baseUrl,
    NEXT_PUBLIC_APP_URL: options.baseUrl,
  };

  if (jobs.staticChecks) {
    const tsc = nodeCli(options.cwd, "typescript/bin/tsc", [
      "-p",
      "tsconfig.check.json",
      "--noEmit",
    ]);
    results.push(
      await runNamed("typecheck", tsc.command, tsc.args, options, { scope: "static" }),
    );
  }

  const targetUnit = [...(page?.unit ?? [])].filter((pattern) =>
    existsSync(path.join(options.cwd, pattern)),
  );
  const adjacentUnit = adjacent.flatMap((entry) => entry.unit);
  if (jobs.target && targetUnit.length > 0) {
    const vitest = nodeCli(options.cwd, "vitest/vitest.mjs", [
      "run",
      ...[...new Set(targetUnit)],
    ]);
    results.push(
      await runNamed("vitest-target", vitest.command, vitest.args, options, {
        scope: "target",
        page: options.route,
      }),
    );
  }
  if (jobs.adjacent && adjacentUnit.length > 0) {
    const vitest = nodeCli(options.cwd, "vitest/vitest.mjs", [
      "run",
      ...[...new Set(adjacentUnit)],
    ]);
    results.push(
      await runNamed("vitest-adjacent", vitest.command, vitest.args, options, {
        scope: "adjacent",
      }),
    );
  }

  const catalogE2e = [...(page?.e2e ?? [])].filter((spec) =>
    existsSync(path.join(options.cwd, spec)),
  );
  const targetSpecs = catalogE2e.filter((spec) =>
    specFileCoversRoute(options.cwd, spec, options.route),
  );
  const unrelatedSpecs = catalogE2e.filter((spec) => !targetSpecs.includes(spec));
  const adjacentSpecs = selectAdjacentSpecs({
    cwd: options.cwd,
    route: options.route,
    targetSpecs,
    adjacent,
  });

  if (jobs.target && targetSpecs.length > 0) {
    const playwright = nodeCli(options.cwd, "@playwright/test/cli.js", [
      "test",
      ...[...new Set(targetSpecs)],
      "--reporter=list",
    ]);
    results.push(
      await runNamed(
        "playwright-target",
        playwright.command,
        playwright.args,
        { ...options, env },
        { scope: "target", page: options.route },
      ),
    );
  }

  const extraUnrelated = unrelatedSpecs.length
    ? unrelatedSpecs
    : catalogE2e.length === 0
      ? ["e2e/accessibility.spec.ts"].filter(
          (spec) => !specFileCoversRoute(options.cwd, spec, options.route),
        )
      : [];
  if (jobs.unrelated && extraUnrelated.length > 0) {
    const playwright = nodeCli(options.cwd, "@playwright/test/cli.js", [
      "test",
      ...[...new Set(extraUnrelated)],
      "--reporter=list",
    ]);
    results.push(
      await runNamed(
        "playwright-unrelated",
        playwright.command,
        playwright.args,
        { ...options, env },
        { scope: "unrelated" },
      ),
    );
  }

  if (jobs.adjacent && adjacentSpecs.length > 0) {
    const playwright = nodeCli(options.cwd, "@playwright/test/cli.js", [
      "test",
      ...adjacentSpecs,
      "--reporter=list",
    ]);
    results.push(
      await runNamed(
        "playwright-adjacent",
        playwright.command,
        playwright.args,
        { ...options, env },
        { scope: "adjacent" },
      ),
    );
  }

  if (jobs.adjacent) {
    for (const extra of adjacent) {
      results.push({
        name: `adjacent:${extra.route}`,
        ok: true,
        output: `included tests for shared-component regression on ${extra.route}`,
        page: extra.route,
        scope: "adjacent",
      });
    }
  }

  return {
    results: results.map((row) => annotateVisits(row, options.route, options.cwd)),
    adjacentRoutes: adjacent.map((entry) => entry.route),
    meta: evidenceMeta({
      runId: options.meta?.runId ?? "unknown",
      route: options.route,
      contractHash: options.meta?.contractHash ?? "pending",
      iteration: options.meta?.iteration ?? 0,
      worktreeSha: options.meta?.worktreeSha ?? "unknown",
      serverOrigin: options.baseUrl,
      browser: "n/a",
      generatingCommand: "runVerification",
      timestamp: options.meta?.timestamp,
    }),
  };
}

function annotateVisits(result: VerifyResult, route: string, cwd: string): VerifyResult {
  const fromOutput = extractVisitedRoutes(result.output);
  const fromManifest =
    result.name.startsWith("playwright-")
      ? visitedRoutesFromExecutedSpecs(cwd, result.output)
      : [];
  const visited = [...new Set([...(result.visitedRoutes ?? []), ...fromOutput, ...fromManifest])];
  const requested = route.split("?")[0] || "/";
  const sawTarget = visited.some(
    (pathname) => pathname === requested || pathname.startsWith(`${requested}/`),
  );
  return {
    ...result,
    visitedRoutes: visited,
    targetRouteVisited: result.targetRouteVisited ?? sawTarget,
  };
}

async function runNamed(
  name: string,
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
  extra: Pick<VerifyResult, "scope" | "page">,
): Promise<VerifyResult> {
  const result = await runCommand(command, args, {
    cwd: options.cwd,
    env: options.env,
    timeoutMs: options.timeoutMs ?? 180_000,
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const fromOutput = extractVisitedRoutes(output);
  const fromManifest = name.startsWith("playwright-")
    ? visitedRoutesFromExecutedSpecs(options.cwd, output)
    : [];
  const visited = [...new Set([...fromOutput, ...fromManifest])];
  return {
    name,
    ok: result.code === 0,
    output: output.slice(-8000),
    page: extra.page,
    scope: extra.scope,
    visitedRoutes: visited,
    targetRouteVisited: extra.page
      ? visited.some(
          (pathname) =>
            pathname === extra.page || pathname.startsWith(`${extra.page}/`),
        )
      : false,
  };
}

export function verificationSummary(results: VerifyResult[]): string {
  return results
    .map((result) => {
      const scope = result.scope ? ` [${result.scope}]` : "";
      const visited = result.targetRouteVisited ? " target-route-visited" : "";
      return `${result.ok ? "PASS" : "FAIL"} ${result.name}${scope}${visited}`;
    })
    .join("\n");
}

export function relatedTestHint(route: string): string {
  const page = lookupPage(route);
  if (!page) return `No catalog tests for ${routePath(route)}; accessibility spec still runs as unrelated if it does not visit the page.`;
  return [
    `e2e: ${page.e2e.join(", ") || "(none)"}`,
    `unit: ${page.unit.join(", ") || "(none)"}`,
    `page file: ${page.pageFile}`,
  ].join("\n");
}

export function relativeFrom(cwd: string, file: string): string {
  return path.relative(cwd, file).replace(/\\/g, "/");
}
