import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  lookupPage,
  PROJECT_CONTEXT_FILES,
  type PageCatalogEntry,
} from "./catalog";
import { fileMatchesGlob } from "./verify";
import { sha256Text } from "./util";

export type RouteContextSource = {
  path: string;
  sha256: string;
  kind: "page" | "component" | "api" | "test" | "schema" | "design" | "inspect" | "other";
};

export type RouteContextBundle = {
  route: string;
  digest: string;
  catalog: PageCatalogEntry | null;
  files: string[];
  apis: string[];
  tests: { e2e: string[]; unit: string[] };
  designSystem: string[];
  sources: RouteContextSource[];
  inspectPath: string | null;
  performancePath: string | null;
};

const DESIGN_SYSTEM_FILES = [
  "docs/ib-market-data-design-system.md",
  "src/app/globals.css",
  "src/components/layout/AppShell.tsx",
  "src/components/ui/Panel.tsx",
  "src/components/ui/PageHeader.tsx",
  "src/components/ui/Badge.tsx",
];

const MAX_BUNDLE_FILES = 48;

function kindFor(file: string): RouteContextSource["kind"] {
  if (file.includes("/api/")) return "api";
  if (file.endsWith(".spec.ts") || file.includes(".test.")) return "test";
  if (file.includes("globals.css") || file.includes("design-system")) return "design";
  if (file.includes("page.tsx")) return "page";
  if (file.includes("/components/")) return "component";
  if (file.includes("/lib/") && /schema|types|permission/.test(file)) return "schema";
  return "other";
}

function listMatching(repoRoot: string, pattern: string, cap: number): string[] {
  const normalized = pattern.replace(/\\/g, "/");
  if (!normalized.includes("*")) {
    return existsSync(path.join(repoRoot, normalized)) ? [normalized] : [];
  }
  const star = normalized.indexOf("*");
  const base = normalized.slice(0, star).replace(/\/$/, "") || ".";
  const abs = path.join(repoRoot, base);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    if (out.length >= cap) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= cap) return;
      const full = path.join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      const rel = path.relative(repoRoot, full).replace(/\\/g, "/");
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".git" || entry === ".worktrees") continue;
        walk(full);
      } else if (fileMatchesGlob(rel, normalized)) {
        out.push(rel);
      }
    }
  };
  walk(abs);
  return out;
}

export function buildRouteContextBundle(input: {
  repoRoot: string;
  route: string;
  inspectPath?: string | null;
  performancePath?: string | null;
}): RouteContextBundle {
  const catalog = lookupPage(input.route);
  const candidates = new Set<string>();
  if (catalog) {
    candidates.add(catalog.pageFile);
    for (const spec of catalog.e2e) candidates.add(spec);
    for (const unit of catalog.unit) {
      if (unit.endsWith(".ts") || unit.endsWith(".tsx")) candidates.add(unit);
      else {
        for (const file of listMatching(input.repoRoot, `${unit.replace(/\/$/, "")}/**/*.{ts,tsx}`, 12)) {
          candidates.add(file);
        }
      }
    }
    for (const glob of catalog.relatedGlobs) {
      for (const file of listMatching(input.repoRoot, glob, 16)) candidates.add(file);
    }
  }
  for (const file of DESIGN_SYSTEM_FILES) candidates.add(file);
  candidates.add("docs/ib-market-data-design-system.md");

  const files = [...candidates]
    .filter((file) => existsSync(path.join(input.repoRoot, file)))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_BUNDLE_FILES);

  const sources: RouteContextSource[] = files.map((file) => {
    const abs = path.join(input.repoRoot, file);
    const body = readFileSync(abs);
    return {
      path: file,
      sha256: createHash("sha256").update(body).digest("hex"),
      kind: kindFor(file),
    };
  });
  if (input.inspectPath && existsSync(input.inspectPath)) {
    sources.push({
      path: input.inspectPath.replace(/\\/g, "/"),
      sha256: sha256Text(readFileSync(input.inspectPath, "utf8")),
      kind: "inspect",
    });
  }
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        route: input.route,
        sources: sources.map((row) => ({ path: row.path, sha256: row.sha256, kind: row.kind })),
      }),
    )
    .digest("hex");

  return {
    route: input.route,
    digest,
    catalog,
    files,
    apis: catalog?.apis ?? [],
    tests: { e2e: catalog?.e2e ?? [], unit: catalog?.unit ?? [] },
    designSystem: DESIGN_SYSTEM_FILES.filter((file) => existsSync(path.join(input.repoRoot, file))),
    sources,
    inspectPath: input.inspectPath ?? null,
    performancePath: input.performancePath ?? null,
  };
}

export function routeContextPromptBlock(bundle: RouteContextBundle): string {
  const fileList = (bundle.files ?? []).map((file) => `- ${file}`).join("\n");
  const tests = [...(bundle.tests?.e2e ?? []), ...(bundle.tests?.unit ?? [])]
    .map((file) => `- ${file}`)
    .join("\n");
  const design = (bundle.designSystem ?? []).map((file) => `- ${file}`).join("\n");
  return `Provenance-bound route context (digest ${bundle.digest}):
Target route: ${bundle.route}
APIs: ${(bundle.apis ?? []).join(", ") || "(none cataloged)"}
Prefer these files. Do not explore the repository broadly unless a cited file is insufficient for a specific gate.

Target and connected files:
${fileList || "- (catalog empty)"}

Cataloged tests:
${tests || "- (none)"}

Design-system primitives:
${design || "- (none)"}

Unused project-wide files such as ${PROJECT_CONTEXT_FILES.filter((file) => !bundle.files?.includes(file)).slice(0, 4).join(", ") || "unrelated modules"} are out of scope unless a dispute names them.`;
}
