export type PageRole = "member" | "admin" | "public";

export type PageCatalogEntry = {
  route: string;
  title: string;
  pageFile: string;
  role: PageRole;
  critical: boolean;
  relatedGlobs: string[];
  apis: string[];
  e2e: string[];
  unit: string[];
};

export const PAGE_CATALOG: PageCatalogEntry[] = [
  {
    route: "/dashboard",
    title: "Market Overview",
    pageFile: "src/app/(app)/dashboard/page.tsx",
    role: "member",
    critical: true,
    relatedGlobs: [
      "src/components/dashboard/**",
      "src/lib/dashboard/**",
      "src/app/api/dashboard/**",
      "src/app/api/market/**",
    ],
    apis: [
      "/api/dashboard",
      "/api/market/quotes",
      "/api/market/status",
      "/api/market/bars",
      "/api/market/movers",
    ],
    e2e: [
      "e2e/dashboard-command-center.spec.ts",
      "e2e/market-data.spec.ts",
      "e2e/market-pulse-visual.spec.ts",
      "e2e/workspace.spec.ts",
    ],
    unit: [
      "src/components/dashboard/WatchlistTable.test.tsx",
      "src/components/dashboard/SectorHeatmap.test.tsx",
      "src/components/dashboard/MaterialMoversPanel.test.tsx",
    ],
  },
  {
    route: "/news",
    title: "Material News",
    pageFile: "src/app/(app)/news/page.tsx",
    role: "member",
    critical: true,
    relatedGlobs: ["src/components/news/**", "src/app/api/news/**", "src/lib/desk-intel/**"],
    apis: ["/api/news", "/api/intel/move", "/api/intel/ask"],
    e2e: ["e2e/workspace.spec.ts"],
    unit: ["src/components/news/NewsWorkspace.test.tsx", "src/components/news/EventCard.test.tsx"],
  },
  {
    route: "/scanner",
    title: "Scanner Center",
    pageFile: "src/app/(app)/scanner/page.tsx",
    role: "member",
    critical: true,
    relatedGlobs: ["src/components/scanner/**", "src/lib/scanner/**", "src/app/api/scanner/**"],
    apis: ["/api/scanner", "/api/scanner/presets", "/api/scanner/actions"],
    e2e: ["e2e/scanner.spec.ts"],
    unit: [],
  },
  {
    route: "/positions",
    title: "Positions",
    pageFile: "src/app/(app)/positions/page.tsx",
    role: "member",
    critical: true,
    relatedGlobs: [
      "src/components/positions/**",
      "src/lib/positions/**",
      "src/app/api/positions/**",
    ],
    apis: ["/api/positions", "/api/positions/snapshot", "/api/positions/books"],
    e2e: ["e2e/positions-visual.spec.ts"],
    unit: [],
  },
  {
    route: "/archive",
    title: "Research Archive",
    pageFile: "src/app/(app)/archive/page.tsx",
    role: "member",
    critical: false,
    relatedGlobs: ["src/components/reports/**", "src/app/api/reports/**"],
    apis: ["/api/reports"],
    e2e: ["e2e/archive.spec.ts", "e2e/report-quality.spec.ts"],
    unit: [],
  },
  {
    route: "/watchlists",
    title: "Watchlists & Sectors",
    pageFile: "src/app/(app)/watchlists/page.tsx",
    role: "member",
    critical: false,
    relatedGlobs: [
      "src/components/watchlists/**",
      "src/app/api/watchlists/**",
      "src/app/api/sectors/**",
    ],
    apis: ["/api/watchlists", "/api/sectors"],
    e2e: ["e2e/workspace.spec.ts"],
    unit: [],
  },
  {
    route: "/proposals",
    title: "Proposals",
    pageFile: "src/app/(app)/proposals/page.tsx",
    role: "member",
    critical: false,
    relatedGlobs: ["src/components/proposals/**", "src/app/api/proposals/**"],
    apis: ["/api/proposals"],
    e2e: ["e2e/workspace.spec.ts"],
    unit: [],
  },
  {
    route: "/settings",
    title: "Settings",
    pageFile: "src/app/(app)/settings/page.tsx",
    role: "member",
    critical: false,
    relatedGlobs: ["src/components/settings/**"],
    apis: ["/api/admin/users", "/api/admin/invitations", "/api/positions/unlock/reset"],
    e2e: ["e2e/settings.spec.ts"],
    unit: ["src/components/settings"],
  },
  {
    route: "/admin",
    title: "Data Operations",
    pageFile: "src/app/(app)/admin/page.tsx",
    role: "admin",
    critical: true,
    relatedGlobs: ["src/components/admin/**", "src/app/api/admin/**"],
    apis: ["/api/admin/market-data", "/api/admin/users", "/api/admin/invitations"],
    e2e: ["e2e/demo-auth.spec.ts"],
    unit: [],
  },
  {
    route: "/login",
    title: "Sign in",
    pageFile: "src/app/(auth)/login/page.tsx",
    role: "public",
    critical: false,
    relatedGlobs: ["src/components/ui/AccessFrame.tsx", "src/lib/auth/**"],
    apis: ["/api/auth/demo"],
    e2e: ["e2e/demo-auth.spec.ts", "e2e/accessibility.spec.ts"],
    unit: [],
  },
  {
    route: "/denied",
    title: "Access denied",
    pageFile: "src/app/denied/page.tsx",
    role: "public",
    critical: false,
    relatedGlobs: ["src/components/ui/AccessFrame.tsx"],
    apis: [],
    e2e: ["e2e/demo-auth.spec.ts", "e2e/accessibility.spec.ts"],
    unit: [],
  },
];

export const HARNESS_DEFAULTS = {
  port: 3200,
  maxIterations: 3,
  maxDurationMinutes: 90,
  maxContractRounds: 3,
  maxAgentRuns: 40,
  maxTotalTokens: 2_000_000,
  isolation: "worktree" as const,
  distDir: ".next-harness",
  risk: "medium" as const,
};

export const BASELINE_VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1440", width: 1440, height: 1000 },
] as const;

export const FULL_VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 900 },
  { name: "desktop-1440", width: 1440, height: 1000 },
] as const;

export const PROJECT_CONTEXT_FILES = [
  "docs/ib-market-data-design-system.md",
  "docs/architecture.md",
  "docs/ui-ux-audit.md",
  "src/app/globals.css",
  "src/components/layout/AppShell.tsx",
  "playwright.config.ts",
  "e2e/helpers.ts",
  "package.json",
];

export function normalizeRoute(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("A target page or route is required.");
  if (trimmed.startsWith("src/")) {
    const match = PAGE_CATALOG.find((page) => page.pageFile === trimmed.replace(/\\/g, "/"));
    if (match) return match.route;
  }
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const [path, query] = withSlash.split("?");
  const collapsed = path.replace(/\/+$/, "") || "/";
  return query ? `${collapsed}?${query}` : collapsed;
}

export function routePath(route: string): string {
  return route.split("?")[0] || "/";
}

export function lookupPage(route: string): PageCatalogEntry | null {
  const path = routePath(route);
  return PAGE_CATALOG.find((page) => page.route === path) ?? null;
}

export function slugForRoute(route: string): string {
  return routePath(route)
    .replace(/^\//, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "") || "root";
}
