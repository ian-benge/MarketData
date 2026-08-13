import { chromium, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

type CapturePhase = "baseline" | "interim" | "final";

const phase = (process.argv[2] ?? "baseline") as CapturePhase;
if (phase !== "baseline" && phase !== "interim" && phase !== "final") {
  throw new Error(
    "Usage: npx tsx scripts/capture-ui.ts [baseline|interim|final]",
  );
}

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
const outputDir = path.join(process.cwd(), "docs", "ui-screenshots", phase);

const baselineViewports = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1440", width: 1440, height: 1000 },
] as const;

const finalViewports = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 900 },
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "wide-1920", width: 1920, height: 1080 },
] as const;

const viewports = phase === "final" ? finalViewports : baselineViewports;

const memberRoutes = [
  ["dashboard", "/dashboard"],
  ["archive", "/archive"],
  ["report", "/reports/rpt-demo-001"],
  ["watchlists", "/watchlists"],
  ["positions", "/positions"],
  ["proposals", "/proposals"],
] as const;

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle");
  await page
    .locator("h1")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => window.scrollY === 0);
}

async function capture(page: Page, viewportName: string, name: string) {
  await settle(page);
  const overflow = await page.evaluate(() => ({
    document:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  if (overflow.document > 1 || overflow.body > 1) {
    throw new Error(
      `${viewportName}-${name} has page-level horizontal overflow: ${JSON.stringify(overflow)}`,
    );
  }
  await page.screenshot({
    path: path.join(outputDir, `${viewportName}-${name}.png`),
    fullPage: true,
  });
}

async function signIn(page: Page, role: "admin" | "member") {
  const response = await page.request.post(`${baseURL}/api/auth/demo`, {
    data: { role },
  });
  if (!response.ok()) {
    throw new Error(`Demo ${role} sign-in failed (${response.status()})`);
  }
  await page.goto(`${baseURL}/dashboard`);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const browserErrors: string[] = [];

  function observe(page: Page, label: string) {
    page.on("pageerror", (error) =>
      browserErrors.push(`${label}: ${error.message}`),
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        browserErrors.push(`${label}: ${message.text()}`);
    });
  }

  try {
    for (const viewport of viewports) {
      const publicContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: "dark",
        reducedMotion: "reduce",
      });
      const publicPage = await publicContext.newPage();
      observe(publicPage, `${viewport.name}-public`);
      await publicPage.goto(`${baseURL}/login`);
      await capture(publicPage, viewport.name, "login");
      await publicContext.close();

      const memberContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: "dark",
        reducedMotion: "reduce",
      });
      const memberPage = await memberContext.newPage();
      observe(memberPage, `${viewport.name}-member`);
      await signIn(memberPage, "member");
      const routesToCapture =
        phase === "interim" ? memberRoutes.slice(0, 1) : memberRoutes;
      for (const [name, route] of routesToCapture) {
        await memberPage.goto(`${baseURL}${route}`);
        await capture(memberPage, viewport.name, name);
      }
      if (phase === "final" && viewport.name === "desktop-1440") {
        for (const state of [
          "fresh",
          "delayed",
          "stale",
          "empty",
          "provider-error",
        ] as const) {
          await memberPage.goto(`${baseURL}/dashboard?state=${state}`);
          await capture(memberPage, viewport.name, `dashboard-${state}`);
        }
      }
      if (phase !== "interim") {
        await memberPage.goto(`${baseURL}/admin`);
        await capture(memberPage, viewport.name, "denied");
      }
      await memberContext.close();

      const adminContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: "dark",
        reducedMotion: "reduce",
      });
      const adminPage = await adminContext.newPage();
      observe(adminPage, `${viewport.name}-admin`);
      await signIn(adminPage, "admin");
      await adminPage.goto(`${baseURL}/admin`);
      await capture(adminPage, viewport.name, "admin-team");
      if (phase !== "interim") {
        await adminPage.goto(`${baseURL}/admin?tab=market-data`);
        await settle(adminPage);
        const refreshStatus = adminPage.getByRole("button", {
          name: "Refresh status",
        });
        await refreshStatus.click();
        await adminPage.waitForFunction(() => {
          const label = document.querySelector(
            '[data-testid="admin-feed-label"]',
          );
          const text = label?.textContent?.trim();
          return Boolean(text && text !== "—");
        });
        await capture(adminPage, viewport.name, "admin-market-data");
      }
      await adminContext.close();
    }
  } finally {
    await browser.close();
  }

  if (browserErrors.length) {
    throw new Error(
      `Browser console/page errors:\n${browserErrors.join("\n")}`,
    );
  }

  console.log(`Captured ${phase} UI screenshots in ${outputDir}`);
}

void main();
