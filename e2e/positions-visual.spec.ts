import { expect, test } from "@playwright/test";
import { demoLogin, expectNoPageHorizontalOverflow } from "./helpers";

test.describe("positions visual", () => {
  test("desktop blotter is dense and mock-labelled", async ({ page }) => {
    await demoLogin(page, "member");
    await page.goto("/positions");
    await expect(page.getByRole("heading", { name: "Positions", exact: true })).toBeVisible();
    await expect(page.getByText("Book snapshot")).toBeVisible();
    await expect(page.getByText("Total P&L").first()).toBeVisible();
    await expect(page.getByText("Portfolio").first()).toBeVisible();
    await expect(page.getByText("Account value").first()).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Main/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^IRA/ })).toBeVisible();
    await page.getByRole("tab", { name: /^IRA/ }).click();
    await expect(
      page.getByRole("region", { name: "Positions table", exact: true }),
    ).toContainText("GLD");
    await page.getByRole("button", { name: "New book" }).click();
    await page.getByLabel("New book title").fill("Taxable");
    await page.getByRole("button", { name: "Create book" }).click();
    await expect(page.getByRole("tab", { name: /^Taxable/ })).toBeVisible();
    await page.getByRole("tab", { name: /^Main/ }).click();
    await expect(
      page.getByRole("heading", { name: "Past positions" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Entries & exits" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Entries and exits" }),
    ).toContainText("AAPL");
    await expect(
      page.getByRole("columnheader", { name: "Realized" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /Demo Member/ })).toBeVisible();
    await expect(page.getByText(/Mock data/i).first()).toBeVisible();
    await expect(
      page.getByRole("group", { name: "P&L range" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "3M", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const chart = page.getByRole("img", { name: /cumulative book P&L/i });
    await expect(chart).toBeVisible();
    await expect(
      page.getByRole("list", { name: "P&L chart legend" }),
    ).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
    await page.screenshot({
      path: "tmp/positions-desktop.png",
      fullPage: true,
    });
    await chart.hover();
    await page.screenshot({
      path: "tmp/positions-pnl-chart.png",
    });
    await page.getByRole("button", { name: "Max", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Max", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(chart).toBeVisible();
    await page.screenshot({
      path: "tmp/positions-pnl-max.png",
    });
    await page.getByRole("tab", { name: /Demo Admin/ }).click();
    await expect(
      page.getByRole("region", { name: "Positions table", exact: true }),
    ).toContainText("NVDA");
    await expect(
      page.getByRole("region", { name: "Past positions table" }),
    ).toContainText("QQQ");
    await expect(
      page.getByRole("region", { name: "Entries and exits" }),
    ).toContainText("QQQ");
    await chart.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "tmp/positions-pnl-admin.png",
    });
  });

  test("inspector and add dialog stay within the shell", async ({ page }) => {
    await demoLogin(page, "member");
    await page.goto("/positions");
    await page.getByRole("button", { name: /AAPL/ }).first().click();
    const inspector = page.getByRole("region", { name: /AAPL lot blotter/i });
    await expect(inspector).toBeVisible();
    await inspector.scrollIntoViewIfNeeded();
    await expect(inspector.getByText("Daily series unavailable")).toHaveCount(0);
    await expect(inspector.getByText(/AAPL daily/i)).toBeVisible();
    await page.screenshot({ path: "tmp/positions-inspector.png" });
    await page.getByRole("button", { name: "Collapse row" }).click();
    await expect(inspector).toBeHidden();
    await page.getByRole("button", { name: "Add position" }).click();
    await expect(page.getByRole("dialog", { name: "Add position" })).toBeVisible();
    await page.screenshot({ path: "tmp/positions-add.png" });
  });
});

test.describe("positions visual mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("mobile blotter does not overflow", async ({ page }) => {
    await demoLogin(page, "member");
    await page.goto("/positions");
    await expect(page.getByRole("heading", { name: "Positions", exact: true })).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
    const table = page.getByRole("region", { name: "Positions table", exact: true });
    await table.scrollIntoViewIfNeeded();
    await expect(page.getByRole("columnheader", { name: "Day P&L" })).toBeInViewport();
    await expect(page.getByRole("columnheader", { name: "Total P&L" })).toBeInViewport();
    await expect(
      page.getByRole("columnheader", { name: "Realized" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Past positions" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Entries & exits" }),
    ).toBeVisible();
    await page.screenshot({
      path: "tmp/positions-mobile.png",
      fullPage: true,
    });
  });
});
