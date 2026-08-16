import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { demoLogin, expectNoPageHorizontalOverflow } from "./helpers";

const outputDir = path.join(
  process.cwd(),
  "docs",
  "ui-screenshots",
  "market-dashboard",
);

test.beforeAll(async () => {
  await mkdir(outputDir, { recursive: true });
});

test("command center composes chart, book, movers, and catalysts", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await demoLogin(page, "member");
  await page.goto("/dashboard?state=fresh");

  await expect(page.getByRole("heading", { name: "Market Overview" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Book impact" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Desk intelligence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Primary market chart" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Name in focus" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Material movers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Earnings risk" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CME FedWatch" })).toBeVisible();
  await expect(
    page.locator("#fedwatch").getByText(/Demo mode does not call CME FedWatch/),
  ).toBeVisible({ timeout: 15_000 });
  await expectNoPageHorizontalOverflow(page);

  await page.screenshot({
    path: path.join(outputDir, "desktop-1440-command-center.png"),
    fullPage: true,
  });
});

test("focus, movers, and coverage drill into the rest of the workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await demoLogin(page, "member");
  await page.goto("/dashboard?state=fresh");

  const watchlist = page.getByRole("region", { name: "Watchlist table" });
  await watchlist.getByRole("button", { name: "Select IWM" }).click();
  await expect(page).toHaveURL(/symbol=IWM/);
  await expect(page.getByRole("heading", { name: "Name in focus" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Why moving" })).toBeVisible();

  await page.getByRole("link", { name: "Why moving" }).click();
  await expect(page).toHaveURL(/\/news\?q=/);
  await expect(page.getByRole("heading", { name: "Material News" })).toBeVisible();

  await page.goto("/dashboard?state=fresh");
  await page.getByRole("link", { name: "Open Positions" }).click();
  await expect(page).toHaveURL(/\/positions/);

  await page.goto("/dashboard?state=fresh");
  await page.getByRole("link", { name: "Coverage" }).first().click();
  await expect(page).toHaveURL(/\/watchlists/);
});

test("degraded fixture states stay honest and do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await demoLogin(page, "member");

  await page.goto("/dashboard?state=stale");
  await expect(page.getByText(/Deterministic stale preview/)).toBeVisible();
  await expectNoPageHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(outputDir, "desktop-1280-stale.png"),
    fullPage: true,
  });

  await page.goto("/dashboard?state=empty");
  await expect(page.getByText(/Deterministic empty preview/)).toBeVisible();
  await expect(
    page.getByText("No names currently clear material-mover thresholds"),
  ).toBeVisible();
  await expectNoPageHorizontalOverflow(page);

  await page.goto("/dashboard?state=provider-error");
  await expect(page.getByText(/Deterministic provider-error preview/)).toBeVisible();
  await expectNoPageHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(outputDir, "desktop-1280-provider-error.png"),
    fullPage: true,
  });
});
