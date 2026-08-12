import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

test.describe("demo auth", () => {
  test("member can open dashboard and is blocked from admin", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await expect(
      page.getByRole("heading", { name: "Market Overview" }),
    ).toBeVisible();

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/denied/);
    await expect(
      page.getByRole("heading", { name: "Access denied" }),
    ).toBeVisible();
  });

  test("admin can open admin", async ({ page }) => {
    await demoLogin(page, "admin");

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(
      page.getByRole("heading", {
        name: "Data Operations",
        exact: true,
      }),
    ).toBeVisible();

    await page.goto("/admin?tab=schedule");
    await expect(
      page.getByRole("heading", { name: "Edition schedule" }),
    ).toBeVisible();
    await expect(page.getByText("Premarket", { exact: true })).toBeVisible();
    await expect(page.getByText("Midday", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Close / Postmarket", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("16:00", { exact: true })).toBeVisible();
    await expect(page.getByText(/early close/i)).toBeVisible();
  });
});
