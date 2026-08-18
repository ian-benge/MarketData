import { writeFileSync } from "node:fs";
import path from "node:path";
import type { APIResponse, BrowserContext, Page } from "@playwright/test";
import { redactSecrets } from "./util";

export const DEMO_ROLE_COOKIE = "demo_role";

export type DemoRole = "admin" | "member";

export type DemoAuthResult = {
  ok: true;
  role: DemoRole;
  status: number;
  cookiePresent: boolean;
  cookieAppliedFromSetCookieHeader: boolean;
};

export class InspectAuthError extends Error {
  readonly diagnostics: Record<string, unknown>;

  constructor(message: string, diagnostics: Record<string, unknown> = {}) {
    super(message);
    this.name = "InspectAuthError";
    this.diagnostics = diagnostics;
  }
}

export function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url.split("?")[0] || "/";
  }
}

export function originOf(url: string): string {
  const parsed = new URL(url);
  return parsed.origin;
}

export function cookieListHasDemoRole(
  cookies: Array<{ name: string; value: string }>,
  role: DemoRole,
): boolean {
  return cookies.some((cookie) => cookie.name === DEMO_ROLE_COOKIE && cookie.value === role);
}

export function setCookieHeaderHasDemoRole(
  header: string | string[] | undefined,
  role: DemoRole,
): boolean {
  const raw = Array.isArray(header) ? header.join("\n") : (header ?? "");
  const pattern = new RegExp(`(?:^|[\\n,;\\s])${DEMO_ROLE_COOKIE}=${role}(?:;|$|\\s|,)`, "i");
  return pattern.test(raw);
}

export function demoAuthBodyAccepted(body: unknown, role: DemoRole): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as { ok?: unknown; role?: unknown };
  return record.ok === true && record.role === role;
}

export function pageLooksLikeLogin(input: {
  pathname: string;
  title: string;
  bodyText: string;
  headings: string[];
}): boolean {
  if (input.pathname === "/login" || input.pathname.startsWith("/login/")) return true;
  if (/sign in/i.test(input.title)) return true;
  if (input.headings.some((heading) => /^h1:\s*sign in$/i.test(heading))) return true;
  return /the demo session could not be started/i.test(input.bodyText);
}

export function pageLooksLikeErrorBoundary(input: {
  title: string;
  bodyText: string;
}): boolean {
  return (
    /application error|this page couldn[’']t be loaded|unhandled runtime error|digest:/i.test(
      input.bodyText,
    ) || /application error/i.test(input.title)
  );
}

export function assertInspectedRoute(input: {
  requestedRoute: string;
  finalUrl: string;
  expectedOrigin: string;
  title: string;
  bodyText: string;
  headings?: string[];
}): { pathname: string; origin: string } {
  let origin: string;
  try {
    origin = originOf(input.finalUrl);
  } catch {
    throw new InspectAuthError(
      `Baseline final URL is not a valid URL: ${input.finalUrl}`,
      { finalUrl: input.finalUrl, requestedRoute: input.requestedRoute },
    );
  }
  const expectedOrigin = originOf(input.expectedOrigin);
  if (origin !== expectedOrigin) {
    throw new InspectAuthError(
      `Inspected origin ${origin} does not match harness origin ${expectedOrigin}.`,
      { origin, expectedOrigin, finalUrl: input.finalUrl },
    );
  }
  const pathname = pathnameOf(input.finalUrl);
  const requested = input.requestedRoute.split("?")[0] || "/";
  const headings = input.headings ?? [];
  if (requested !== "/login" && pageLooksLikeLogin({ pathname, title: input.title, bodyText: input.bodyText, headings })) {
    throw new InspectAuthError(
      `Requested ${requested} but the browser is on the login page (${pathname}). Unauthenticated evidence is invalid.`,
      { pathname, requested, title: input.title },
    );
  }
  if (pageLooksLikeErrorBoundary({ title: input.title, bodyText: input.bodyText })) {
    throw new InspectAuthError(
      `Requested ${requested} but the browser is showing an error boundary.`,
      { pathname, title: input.title },
    );
  }
  if (pathname !== requested && !pathname.startsWith(`${requested}/`)) {
    throw new InspectAuthError(
      `Requested ${requested} but the browser finished at ${pathname}.`,
      { pathname, requested, finalUrl: input.finalUrl },
    );
  }
  return { pathname, origin };
}

export function assertInspectEvidence(input: {
  requestedRoute: string;
  expectedOrigin: string;
  finalUrl: string;
  title: string;
  headings: string[];
  routeVerified: boolean;
}): void {
  assertInspectedRoute({
    requestedRoute: input.requestedRoute,
    finalUrl: input.finalUrl,
    expectedOrigin: input.expectedOrigin,
    title: input.title,
    bodyText: input.headings.join("\n"),
    headings: input.headings,
  });
  if (!input.routeVerified) {
    throw new InspectAuthError(
      `Requested ${input.requestedRoute} but inspect.routeVerified is false.`,
      { requested: input.requestedRoute, finalUrl: input.finalUrl },
    );
  }
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        jsonSafe(val),
      ]),
    );
  }
  return value;
}

export function writeInspectDiagnostics(outDir: string, diagnostics: Record<string, unknown>): string {
  const file = path.join(outDir, "diagnostics.json");
  writeFileSync(file, `${JSON.stringify(jsonSafe(diagnostics), null, 2)}\n`, "utf8");
  return file;
}

export async function establishDemoSession(
  page: Page,
  baseUrl: string,
  role: DemoRole,
): Promise<DemoAuthResult> {
  const loginUrl = `${baseUrl}/login`;
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

  let response: APIResponse;
  try {
    response = await page.request.post(`${baseUrl}/api/auth/demo`, {
      data: { role },
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InspectAuthError(
      `Demo ${role} sign-in request failed before a response: ${message}`,
      { role, endpoint: "/api/auth/demo", networkError: true },
    );
  }

  const status = response.status();
  const setCookie = response.headers()["set-cookie"];
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok()) {
    const errorText =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${status}`;
    throw new InspectAuthError(
      `Demo ${role} sign-in failed (${status}): ${errorText}`,
      { role, status, bodyOk: false },
    );
  }

  if (!demoAuthBodyAccepted(body, role)) {
    throw new InspectAuthError(
      `Demo ${role} sign-in returned an unexpected body.`,
      { role, status, bodyOk: false },
    );
  }

  const context: BrowserContext = page.context();
  const fromHeader = setCookieHeaderHasDemoRole(setCookie, role);
  let fromJar = cookieListHasDemoRole(await context.cookies(), role);
  let cookieAppliedFromSetCookieHeader = false;
  if (!fromJar && fromHeader) {
    await context.addCookies([
      {
        name: DEMO_ROLE_COOKIE,
        value: role,
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    fromJar = cookieListHasDemoRole(await context.cookies(), role);
    cookieAppliedFromSetCookieHeader = fromJar;
  }
  if (!fromJar) {
    throw new InspectAuthError(
      `Demo ${role} sign-in succeeded but the ${DEMO_ROLE_COOKIE} session cookie was not present on the browser context.`,
      { role, status, cookiePresent: false },
    );
  }

  return {
    ok: true,
    role,
    status,
    cookiePresent: true,
    cookieAppliedFromSetCookieHeader,
  };
}

export async function verifyPageMatchesRoute(page: Page, baseUrl: string, route: string) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const headings = await page
    .locator("h1")
    .allInnerTexts()
    .catch(() => []);
  return assertInspectedRoute({
    requestedRoute: route,
    finalUrl: page.url(),
    expectedOrigin: baseUrl,
    title: await page.title(),
    bodyText,
    headings: headings.map((text) => `h1: ${text}`),
  });
}
