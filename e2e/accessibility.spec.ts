import { expect, test, type Page } from "@playwright/test";
import { demoLogin } from "./helpers";

type AuditResult = {
  duplicateIds: string[];
  unlabeledControls: string[];
  unnamedActions: string[];
  h1Count: number;
  hasMain: boolean;
};

async function auditDocument(page: Page): Promise<AuditResult> {
  return page.evaluate(() => {
    const visible = (element: HTMLElement) =>
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden";
    const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]")).map(
      (element) => element.id,
    );
    const duplicateIds = [
      ...new Set(ids.filter((id, index) => ids.indexOf(id) !== index)),
    ];
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>("input, select, textarea"),
    ).filter(visible);
    const unlabeledControls = controls
      .filter((control) => {
        const id = control.id;
        return !(
          control.getAttribute("aria-label") ||
          control.getAttribute("aria-labelledby") ||
          (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
          control.closest("label")
        );
      })
      .map(
        (control) =>
          `${control.tagName.toLowerCase()}#${control.id || "(no-id)"}`,
      );
    const actions = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], [role="button"]',
      ),
    ).filter(visible);
    const unnamedActions = actions
      .filter(
        (action) =>
          !action.textContent?.trim() &&
          !action.getAttribute("aria-label") &&
          !action.getAttribute("aria-labelledby") &&
          !action.getAttribute("title"),
      )
      .map(
        (action) => `${action.tagName.toLowerCase()}#${action.id || "(no-id)"}`,
      );

    return {
      duplicateIds,
      unlabeledControls,
      unnamedActions,
      h1Count: document.querySelectorAll("h1").length,
      hasMain: Boolean(document.querySelector("main")),
    };
  });
}

async function expectCriticalSemantics(page: Page) {
  await expect.poll(async () => (await auditDocument(page)).h1Count).toBe(1);
  const result = await auditDocument(page);
  expect(result.duplicateIds).toEqual([]);
  expect(result.unlabeledControls).toEqual([]);
  expect(result.unnamedActions).toEqual([]);
  expect(result.h1Count).toBe(1);
  expect(result.hasMain).toBe(true);
}

test("critical public and member routes expose baseline accessible semantics", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expectCriticalSemantics(page);

  await demoLogin(page, "member");
  for (const path of [
    "/dashboard",
    "/news",
    "/archive",
    "/reports/rpt-demo-001",
    "/watchlists",
    "/positions",
    "/proposals",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toHaveCount(1);
    await expectCriticalSemantics(page);
  }
});

test("admin Data Operations exposes baseline accessible semantics", async ({
  page,
}) => {
  await demoLogin(page, "admin");
  await page.goto("/admin?tab=market-data");
  await expect(
    page.getByRole("button", { name: "Refresh status" }),
  ).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expectCriticalSemantics(page);
});
