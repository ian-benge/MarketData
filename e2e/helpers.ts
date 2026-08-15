import { expect, type Page } from "@playwright/test";

export async function demoLogin(page: Page, role: "admin" | "member") {
  const response = await page.request.post("/api/auth/demo", {
    data: { role },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

export async function openCreateCoverage(page: Page) {
  const panel = page.locator("#create-coverage");
  await expect(panel).toBeVisible();
  const expanded = await panel.evaluate(
    (node) => node instanceof HTMLDetailsElement && node.open,
  );
  if (!expanded) {
    await panel.locator("summary").click();
  }
  await expect
    .poll(async () =>
      panel.evaluate((node) => node instanceof HTMLDetailsElement && node.open),
    )
    .toBe(true);
  await expect(page.locator("#watchlist-name")).toBeVisible();
}

export async function expectNoPageHorizontalOverflow(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      }),
    )
    .toBeLessThanOrEqual(1);
}
