import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

test.describe("market data labels & admin authz", () => {
  test("member sees feed label on dashboard", async ({ page }) => {
    await demoLogin(page, "member");
    await expect(page.getByTestId("tape-feed-label")).toBeVisible();
    await expect(page.getByTestId("provider-feed-label")).toContainText(
      /Mock|IEX|Real-time|Unavailable|Delayed/i,
    );
  });

  test("admin sees licensing warning/status on market data tab", async ({
    page,
  }) => {
    await demoLogin(page, "admin");
    await page.goto("/admin?tab=market-data");
    await expect(
      page.getByRole("heading", {
        name: "Data Operations",
        exact: true,
      }),
    ).toBeVisible();
    const refreshStatus = page.getByRole("button", {
      name: "Refresh status",
    });
    await expect(refreshStatus).toBeVisible();
    await refreshStatus.click();
    await expect(page.getByTestId("admin-feed-label")).toContainText(
      /Mock|IEX|Unavailable|Delayed/i,
    );
    await expect(page.getByTestId("admin-license-warning")).toBeVisible();
    await expect(page.getByTestId("admin-license-warning")).toContainText(
      /Licensing|license|acknowledgement/i,
    );
  });

  test("member is blocked from admin market-data POST", async ({ page }) => {
    await demoLogin(page, "member");
    const res = await page.request.post("/api/admin/market-data");
    expect(res.status()).toBe(403);
  });
});
