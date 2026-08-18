import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page, type Request, type Response } from "@playwright/test";
import { BASELINE_VIEWPORTS } from "./catalog";
import { evidenceMeta, type EvidenceMeta } from "./evidence";
import {
  InspectAuthError,
  establishDemoSession,
  pathnameOf,
  verifyPageMatchesRoute,
  writeInspectDiagnostics,
  type DemoAuthResult,
} from "./inspect-auth";
import { redactSecrets } from "./util";

export type Viewport = { name: string; width: number; height: number };

export type NetworkEntry = {
  method: string;
  url: string;
  status: number;
  resourceType: string;
  durationMs: number | null;
  encodedKb: number | null;
  fromServiceWorker: boolean;
};

export type KeyboardStop = {
  tag: string;
  text: string;
  href: string | null;
};

export type InspectReport = {
  route: string;
  baseUrl: string;
  role: "member" | "admin" | "public";
  title: string;
  finalUrl: string;
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
  failedRequests: Array<{ method: string; url: string; status: number }>;
  network: NetworkEntry[];
  duplicateGets: Array<{ url: string; count: number }>;
  transferKb: number;
  documentRequests: number;
  jsTransferKb: number;
  navigationMs: number | null;
  navigationSamplesMs: number[];
  navigationMsMedian: number | null;
  navigationMsVariance: number | null;
  overflowByViewport: Record<string, number>;
  landmarks: { banner: number; main: number; navigation: number; contentinfo: number };
  keyboardTabOrder: KeyboardStop[];
  a11y: {
    h1Count: number;
    hasMain: boolean;
    duplicateIds: string[];
    unlabeledControls: string[];
    unnamedActions: string[];
  };
  headings: string[];
  screenshots: string[];
  states: { loading: boolean; empty: boolean; error: boolean; degraded: boolean };
  reactEvidence: { supported: boolean; note: string };
  measuredAt: string;
  meta: EvidenceMeta;
  finalPathname: string;
  routeVerified: boolean;
  auth: {
    attempted: boolean;
    ok: boolean;
    cookiePresent: boolean;
    endpointStatus: number | null;
  };
};

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (/key|secret|token|password|auth|cookie/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return redactSecrets(raw);
  }
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    // Live pages may keep polling; continue after the idle timeout.
  }
  await page.evaluate(`(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  })()`);
}

async function a11yAudit(page: Page): Promise<InspectReport["a11y"] & { headings: string[] }> {
  return page.evaluate(`(() => {
    const visible = (element) =>
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden";
    const ids = Array.from(document.querySelectorAll("[id]")).map(
      (element) => element.id,
    );
    const duplicateIds = [
      ...new Set(ids.filter((id, index) => ids.indexOf(id) !== index)),
    ];
    const controls = Array.from(
      document.querySelectorAll("input, select, textarea"),
    ).filter(visible);
    const unlabeledControls = controls
      .filter((control) => {
        const id = control.id;
        return !(
          control.getAttribute("aria-label") ||
          control.getAttribute("aria-labelledby") ||
          (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')) ||
          control.closest("label")
        );
      })
      .map((control) => control.tagName.toLowerCase() + "#" + (control.id || "(no-id)"));
    const actions = Array.from(
      document.querySelectorAll('button, a[href], [role="button"]'),
    ).filter(visible);
    const unnamedActions = actions
      .filter(
        (action) =>
          !action.textContent?.trim() &&
          !action.getAttribute("aria-label") &&
          !action.getAttribute("aria-labelledby") &&
          !action.getAttribute("title"),
      )
      .map((action) => action.tagName.toLowerCase() + "#" + (action.id || "(no-id)"));
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((node) => node.tagName.toLowerCase() + ": " + (node.textContent?.trim() ?? ""))
      .filter((line) => line.length > 4)
      .slice(0, 40);
    return {
      h1Count: document.querySelectorAll("h1").length,
      hasMain: Boolean(document.querySelector("main")),
      duplicateIds,
      unlabeledControls,
      unnamedActions,
      headings,
    };
  })()`) as Promise<InspectReport["a11y"] & { headings: string[] }>;
}

async function landmarkAudit(page: Page): Promise<InspectReport["landmarks"]> {
  return page.evaluate(`(() => {
    const count = (selector) => document.querySelectorAll(selector).length;
    return {
      banner: count('header, [role="banner"]'),
      main: count('main, [role="main"]'),
      navigation: count('nav, [role="navigation"]'),
      contentinfo: count('footer, [role="contentinfo"]'),
    };
  })()`) as Promise<InspectReport["landmarks"]>;
}

async function stateAudit(page: Page): Promise<InspectReport["states"]> {
  return page.evaluate(`(() => {
    const text = (document.body.innerText || "").toLowerCase();
    return {
      loading: Boolean(document.querySelector('[aria-busy="true"], [data-loading="true"]')),
      empty: /no (results|rows|positions|items)|nothing to show/.test(text),
      error: Boolean(document.querySelector('[role="alert"]')) || /failed to load|unavailable/.test(text),
      degraded: /delayed|stale|fixture|mock data|degraded/.test(text),
    };
  })()`) as Promise<InspectReport["states"]>;
}

async function reactAudit(page: Page): Promise<InspectReport["reactEvidence"]> {
  return page.evaluate(`(() => {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    const next = Boolean(window.__next_f || document.querySelector("script[src*='/_next/']"));
    if (!hook || !hook.renderers || hook.renderers.size === 0) {
      return {
        supported: false,
        note: next
          ? "Next.js scripts present; React profiler is not attached in this headless session"
          : "No React profiler hook",
      };
    }
    return { supported: true, note: "React DevTools hook present" };
  })()`) as Promise<InspectReport["reactEvidence"]>;
}

async function keyboardAudit(page: Page): Promise<KeyboardStop[]> {
  const stops: KeyboardStop[] = [];
  await page.keyboard.press("Home").catch(() => undefined);
  for (let i = 0; i < 16; i += 1) {
    await page.keyboard.press("Tab");
    const stop = (await page.evaluate(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return {
        tag: el.tagName,
        text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 80),
        href: el.getAttribute("href"),
      };
    })()`)) as KeyboardStop | null;
    if (stop) stops.push(stop);
  }
  return stops;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10
    : sorted[mid]!;
}

function variance(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sumSq = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.round((sumSq / (values.length - 1)) * 10) / 10;
}

export async function inspectRoute(options: {
  baseUrl: string;
  route: string;
  role: "member" | "admin" | "public";
  outDir: string;
  viewports?: readonly Viewport[];
  samples?: number;
  meta?: Omit<EvidenceMeta, "timestamp"> & { timestamp?: string };
  browserFactory?: () => Promise<Browser>;
}): Promise<InspectReport> {
  const viewports = options.viewports ?? BASELINE_VIEWPORTS;
  const samples = Math.max(1, options.samples ?? 3);
  mkdirSync(options.outDir, { recursive: true });
  const browser: Browser = await (options.browserFactory?.() ??
    chromium.launch({
      headless: true,
      channel: "chrome",
    }));
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: InspectReport["failedRequests"] = [];
  const network: NetworkEntry[] = [];
  const screenshots: string[] = [];
  const navigationSamplesMs: number[] = [];
  let title = "";
  let finalUrl = "";
  let overflowByViewport: Record<string, number> = {};
  let a11y: InspectReport["a11y"] = {
    h1Count: 0,
    hasMain: false,
    duplicateIds: [],
    unlabeledControls: [],
    unnamedActions: [],
  };
  let headings: string[] = [];
  let landmarks: InspectReport["landmarks"] = {
    banner: 0,
    main: 0,
    navigation: 0,
    contentinfo: 0,
  };
  let keyboardTabOrder: KeyboardStop[] = [];
  let states: InspectReport["states"] = {
    loading: false,
    empty: false,
    error: false,
    degraded: false,
  };
  let reactEvidence: InspectReport["reactEvidence"] = {
    supported: false,
    note: "not measured",
  };
  let auth: InspectReport["auth"] = {
    attempted: options.role !== "public",
    ok: options.role === "public",
    cookiePresent: false,
    endpointStatus: null,
  };
  let routeVerified = false;

  const bindPage = (page: Page, viewportName: string) => {
    const started = new Map<Request, number>();
    page.on("console", (message) => {
      const line = redactSecrets(`${viewportName}: ${message.text()}`);
      if (message.type() === "error") consoleErrors.push(line);
      if (message.type() === "warning") consoleWarnings.push(line);
    });
    page.on("pageerror", (error) => {
      pageErrors.push(redactSecrets(`${viewportName}: ${error.message}`));
    });
    page.on("request", (request) => {
      started.set(request, Date.now());
    });
    page.on("response", (response: Response) => {
      const request = response.request();
      const startedAt = started.get(request);
      const headers = response.headers();
      const length = Number(headers["content-length"] ?? "");
      const entry: NetworkEntry = {
        method: request.method(),
        url: redactUrl(request.url()),
        status: response.status(),
        resourceType: request.resourceType(),
        durationMs: startedAt ? Date.now() - startedAt : null,
        encodedKb: Number.isFinite(length) ? Math.round((length / 1024) * 10) / 10 : null,
        fromServiceWorker: response.fromServiceWorker(),
      };
      network.push(entry);
      if (entry.status >= 400) {
        failedRequests.push({
          method: entry.method,
          url: entry.url,
          status: entry.status,
        });
      }
    });
  };

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: "dark",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      bindPage(page, viewport.name);

      if (options.role !== "public") {
        try {
          const session: DemoAuthResult = await establishDemoSession(
            page,
            options.baseUrl,
            options.role,
          );
          auth = {
            attempted: true,
            ok: true,
            cookiePresent: session.cookiePresent,
            endpointStatus: session.status,
          };
        } catch (error) {
          await persistFailedInspect(page, options.outDir, error, {
            viewport: viewport.name,
            route: options.route,
            baseUrl: options.baseUrl,
            role: options.role,
          });
          throw error;
        }
      }
      const target = `${options.baseUrl}${options.route}`;
      const repeats = viewport.name.startsWith("desktop") ? samples : 1;
      for (let sample = 0; sample < repeats; sample += 1) {
        const navStart = Date.now();
        await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await settle(page);
        navigationSamplesMs.push(Date.now() - navStart);
      }
      title = await page.title();
      finalUrl = page.url();
      try {
        await verifyPageMatchesRoute(page, options.baseUrl, options.route);
        routeVerified = true;
      } catch (error) {
        await persistFailedInspect(page, options.outDir, error, {
          viewport: viewport.name,
          route: options.route,
          baseUrl: options.baseUrl,
          role: options.role,
          finalUrl,
          title,
        });
        throw error;
      }
      overflowByViewport[viewport.name] = (await page.evaluate(`(() => {
        const root = document.documentElement;
        return Math.max(
          root.scrollWidth - root.clientWidth,
          document.body.scrollWidth - document.body.clientWidth,
        );
      })()`)) as number;
      const audit = await a11yAudit(page);
      a11y = {
        h1Count: audit.h1Count,
        hasMain: audit.hasMain,
        duplicateIds: audit.duplicateIds,
        unlabeledControls: audit.unlabeledControls,
        unnamedActions: audit.unnamedActions,
      };
      headings = audit.headings;
      landmarks = await landmarkAudit(page);
      states = await stateAudit(page);
      reactEvidence = await reactAudit(page);
      if (viewport.name.startsWith("desktop")) {
        keyboardTabOrder = await keyboardAudit(page);
      }
      const shot = path.join(options.outDir, `${viewport.name}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      screenshots.push(shot);
      await context.close();
    }
  } catch (error) {
    if (!(error instanceof InspectAuthError)) {
      writeInspectDiagnostics(options.outDir, {
        kind: "inspect-failure",
        route: options.route,
        baseUrl: options.baseUrl,
        role: options.role,
        finalUrl,
        title,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  } finally {
    await browser.close();
  }

  const duplicateGets = countDuplicateGets(network);
  const documentRequests = network.filter((entry) => entry.resourceType === "document").length;
  const transferKb =
    Math.round(network.reduce((sum, entry) => sum + (entry.encodedKb ?? 0), 0) * 10) / 10;
  const jsTransferKb =
    Math.round(
      network
        .filter((entry) => entry.resourceType === "script")
        .reduce((sum, entry) => sum + (entry.encodedKb ?? 0), 0) * 10,
    ) / 10;
  const navigationMsMedian = median(navigationSamplesMs);
  const meta = evidenceMeta({
    runId: options.meta?.runId ?? "unknown",
    route: options.route,
    contractHash: options.meta?.contractHash ?? "pending",
    iteration: options.meta?.iteration ?? 0,
    worktreeSha: options.meta?.worktreeSha ?? "unknown",
    serverOrigin: options.baseUrl,
    browser: "chrome",
    viewport: viewports.map((viewport) => viewport.name).join(","),
    generatingCommand: "inspectRoute",
    timestamp: options.meta?.timestamp,
  });

  const report: InspectReport = {
    route: options.route,
    baseUrl: options.baseUrl,
    role: options.role,
    title,
    finalUrl,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 50),
    consoleWarnings: [...new Set(consoleWarnings)].slice(0, 50),
    pageErrors: [...new Set(pageErrors)].slice(0, 20),
    failedRequests: failedRequests.slice(0, 50),
    network: network.slice(0, 400),
    duplicateGets,
    transferKb,
    documentRequests,
    jsTransferKb,
    navigationMs: navigationMsMedian,
    navigationSamplesMs,
    navigationMsMedian,
    navigationMsVariance: variance(navigationSamplesMs),
    overflowByViewport,
    landmarks,
    keyboardTabOrder,
    a11y,
    headings,
    screenshots,
    states,
    reactEvidence,
    measuredAt: new Date().toISOString(),
    meta,
    finalPathname: pathnameOf(finalUrl),
    routeVerified,
    auth,
  };
  writeFileSync(
    path.join(options.outDir, "inspect.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  return report;
}

async function persistFailedInspect(
  page: Page,
  outDir: string,
  error: unknown,
  extra: Record<string, unknown>,
): Promise<void> {
  const shot = path.join(outDir, "failure.png");
  await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  writeInspectDiagnostics(outDir, {
    kind: "baseline-invalid",
    message: error instanceof Error ? error.message : String(error),
    diagnostics: error instanceof InspectAuthError ? error.diagnostics : undefined,
    finalUrl: page.url(),
    title: await page.title().catch(() => ""),
    bodyExcerpt: bodyText.slice(0, 1200),
    screenshot: shot,
    ...extra,
  });
}

function countDuplicateGets(network: NetworkEntry[]): Array<{ url: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of network) {
    if (entry.method !== "GET") continue;
    if (!/\/api\//.test(entry.url)) continue;
    const key = entry.url.split("?")[0];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 2)
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count);
}

export function compareInspect(before: InspectReport, after: InspectReport) {
  const regressions: string[] = [];
  const improvements: string[] = [];
  if (after.consoleErrors.length > before.consoleErrors.length) {
    regressions.push(
      `console errors ${before.consoleErrors.length} → ${after.consoleErrors.length}`,
    );
  } else if (after.consoleErrors.length < before.consoleErrors.length) {
    improvements.push(
      `console errors ${before.consoleErrors.length} → ${after.consoleErrors.length}`,
    );
  }
  if (before.transferKb > 0 && after.transferKb > before.transferKb * 1.35) {
    regressions.push(`transfer ${before.transferKb}kb → ${after.transferKb}kb`);
  } else if (before.transferKb > 0 && after.transferKb < before.transferKb * 0.85) {
    improvements.push(`transfer ${before.transferKb}kb → ${after.transferKb}kb`);
  }
  const beforeNav = before.navigationMsMedian ?? before.navigationMs;
  const afterNav = after.navigationMsMedian ?? after.navigationMs;
  if (beforeNav && afterNav && afterNav > beforeNav * 1.4) {
    regressions.push(`navigation median ${beforeNav}ms → ${afterNav}ms`);
  }
  if (after.duplicateGets.length > before.duplicateGets.length) {
    regressions.push("duplicate API GET volume increased");
  }
  if (after.failedRequests.length > before.failedRequests.length) {
    regressions.push(
      `failed requests ${before.failedRequests.length} → ${after.failedRequests.length}`,
    );
  }
  for (const [name, overflow] of Object.entries(after.overflowByViewport)) {
    const previous = before.overflowByViewport[name] ?? 0;
    if (overflow > 1 && overflow > previous) {
      regressions.push(`${name} horizontal overflow ${previous} → ${overflow}`);
    }
  }
  return { regressions, improvements };
}
