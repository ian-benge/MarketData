import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { lookupPage, PAGE_CATALOG, type PageRole } from "./catalog";

export type DiscoveredRoute = {
  route: string;
  pageFile: string;
  inCatalog: boolean;
  catalogTitle?: string;
  recommendedRisk: "low" | "medium" | "critical";
  role: PageRole;
  reason: string;
};

function walkPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkPages(full, acc);
    else if (entry === "page.tsx" || entry === "page.ts") acc.push(full);
  }
  return acc;
}

export function fileToRoute(repoRoot: string, file: string): string {
  const rel = path.relative(path.join(repoRoot, "src/app"), file).replace(/\\/g, "/");
  const withoutPage = rel.replace(/\/page\.tsx?$/, "");
  const segments = withoutPage
    .split("/")
    .filter((segment) => segment && !/^\(.*\)$/.test(segment));
  if (segments.length === 0) return "/";
  return `/${segments.join("/")}`.replace(/\[([^\]]+)\]/g, ":$1");
}

function recommendRisk(route: string): {
  risk: "low" | "medium" | "critical";
  role: PageRole;
  reason: string;
} {
  const catalog = lookupPage(route);
  if (catalog?.critical) {
    return { risk: "critical", role: catalog.role, reason: "catalog-critical trading surface" };
  }
  if (catalog) {
    return {
      risk: catalog.role === "admin" ? "critical" : catalog.role === "public" ? "low" : "medium",
      role: catalog.role,
      reason: `catalog ${catalog.role} page`,
    };
  }
  if (route.startsWith("/admin") || route === "/positions" || route === "/dashboard") {
    return { risk: "critical", role: "admin", reason: "privileged or book-critical path" };
  }
  if (route.startsWith("/login") || route.startsWith("/denied") || route.startsWith("/invite") || route.startsWith("/auth")) {
    return { risk: "low", role: "public", reason: "auth/edge page with limited data" };
  }
  return { risk: "medium", role: "member", reason: "uncatalogued app route; treat as medium until audited" };
}

export function inventoryRoutes(repoRoot: string): DiscoveredRoute[] {
  const appDir = path.join(repoRoot, "src/app");
  const files = walkPages(appDir);
  const discovered = files.map((file) => {
    const route = fileToRoute(repoRoot, file);
    const rec = recommendRisk(route);
    const catalog = lookupPage(route);
    return {
      route,
      pageFile: path.relative(repoRoot, file).replace(/\\/g, "/"),
      inCatalog: Boolean(catalog),
      catalogTitle: catalog?.title,
      recommendedRisk: rec.risk,
      role: rec.role,
      reason: rec.reason,
    };
  });
  const known = new Set(discovered.map((row) => row.route));
  for (const page of PAGE_CATALOG) {
    if (known.has(page.route)) continue;
    discovered.push({
      route: page.route,
      pageFile: page.pageFile,
      inCatalog: true,
      catalogTitle: page.title,
      recommendedRisk: page.critical ? "critical" : page.role === "public" ? "low" : "medium",
      role: page.role,
      reason: "catalog entry without matching page.tsx walk (dynamic or aliased)",
    });
  }
  return discovered.sort((a, b) => a.route.localeCompare(b.route));
}

export function formatRouteInventory(rows: DiscoveredRoute[]): string {
  const lines = [
    "Route inventory (read-only; no files modified)",
    "",
    "route\trisk\trole\tcatalog\tfile",
    ...rows.map(
      (row) =>
        `${row.route}\t${row.recommendedRisk}\t${row.role}\t${row.inCatalog ? "yes" : "no"}\t${row.pageFile}`,
    ),
    "",
    "Notes:",
    ...rows.map((row) => `- ${row.route}: ${row.reason}`),
  ];
  return lines.join("\n");
}

export function appShellHrefs(repoRoot: string): string[] {
  try {
    const text = readFileSync(
      path.join(repoRoot, "src/components/layout/AppShell.tsx"),
      "utf8",
    );
    return [...text.matchAll(/href:\s*"([^"]+)"/g)].map((match) => match[1]!);
  } catch {
    return [];
  }
}
