import { expect, test } from "@playwright/test";
import { demoLogin, expectNoPageHorizontalOverflow } from "./helpers";

test.describe("scanner center", () => {
  test("loads momentum and desk scanners from a server snapshot", async ({ page }) => {
    await demoLogin(page, "member");
    await page.goto("/scanner");
    await expect(page.getByRole("heading", { name: "Scanner Center" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Scanner Center" })).toBeVisible();
    await expect(page.getByText(/polling|mock|not a live socket|not live|not SIP/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /ross.*warrior trading/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Desk Intelligence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select ABCD" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Select ABCD" }).click();
    await expect(page.getByRole("heading", { name: /ABCD · event detail/i })).toBeVisible();
    await expect(page.getByText(/FDA clearance|Confirmed catalyst/i).first()).toBeVisible();
    const tapeItems = page.getByRole("list").getByRole("listitem");
    await expect.poll(async () => tapeItems.count()).toBeGreaterThan(8);
    await page.getByRole("button", { name: "Desk Intelligence" }).click();
    await expect(page).toHaveURL(/system=desk/);
    await expect(page.getByRole("navigation", { name: "Scanner strategies" })).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
  });

  test("session presets change the strategy set without overflowing", async ({ page }) => {
    await demoLogin(page, "member");
    await page.goto("/scanner?system=momentum&preset=premarket");
    await expect(page.getByRole("heading", { name: "Scanner Center" })).toBeVisible();
    await page.getByRole("button", { name: "After Hours" }).click();
    await expect(page).toHaveURL(/preset=after_hours/);
    await expect(page.getByRole("navigation", { name: "Scanner strategies" })).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
  });
});
