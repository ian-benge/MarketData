import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { demoLogin, expectNoPageHorizontalOverflow } from "./helpers";

const outputDir = path.join(
  process.cwd(),
  "docs",
  "ui-screenshots",
  "market-pulse",
);

test.beforeAll(async () => {
  await mkdir(outputDir, { recursive: true });
});

test("Market Pulse is composed and interactive at desktop width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await demoLogin(page, "member");
  await page.goto("/dashboard?state=fresh");
  await expect(page.getByRole("heading", { name: "Constructive" })).toBeVisible();
  await expect(page.getByText("Pulse history", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Signal methodology" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Signal methodology" }).click();
  await expect(
    page
      .getByLabel("Market Pulse signal methodology")
      .getByRole("table"),
  ).toBeVisible();
  await expect(
    page.getByText("Drag to reposition", { exact: true }),
  ).toBeVisible();
  await expectNoPageHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(outputDir, "desktop-1440-dashboard.png"),
    fullPage: true,
  });
});

test("Market Pulse preserves hierarchy without page overflow on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await demoLogin(page, "member");
  await page.goto("/dashboard?state=fresh");
  await expect(page.getByRole("heading", { name: "Constructive" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Watchlists, themes, and tape" })).toBeVisible();
  await expectNoPageHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(outputDir, "mobile-375-dashboard.png"),
    fullPage: true,
  });
});
