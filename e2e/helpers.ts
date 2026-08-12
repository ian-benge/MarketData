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
