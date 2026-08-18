import { expect, test, type Page } from "@playwright/test";
import {
  demoLogin,
  expectNoPageHorizontalOverflow,
} from "./helpers";

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

async function openSettings(page: Page) {
  await page.goto("/settings", { waitUntil: "load", timeout: 45_000 });
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
}

test("unauthenticated /settings redirects to login with next=/settings", async ({
  page,
}) => {
  await page.goto("/settings", { waitUntil: "load", timeout: 45_000 });
  await expect(page).toHaveURL(/\/login/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/settings");
});

test.describe("settings member", () => {
  test("exposes one Settings heading and critical semantics", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await openSettings(page);

    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toHaveCount(
      1,
    );
    const result = await auditDocument(page);
    expect(result.duplicateIds).toEqual([]);
    expect(result.unlabeledControls).toEqual([]);
    expect(result.unnamedActions).toEqual([]);
    expect(result.h1Count).toBe(1);
    expect(result.hasMain).toBe(true);
  });

  test("shows session facts, grant unavailable copy, and member-only controls", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await openSettings(page);

    const headings = (await page.locator("h1, h2").allTextContents()).map((text) =>
      text.trim(),
    );
    expect(headings.indexOf("Settings")).toBeGreaterThanOrEqual(0);
    expect(headings.indexOf("Session")).toBeGreaterThan(headings.indexOf("Settings"));
    expect(headings.indexOf("Appearance")).toBeGreaterThan(
      headings.indexOf("Session"),
    );
    expect(headings.indexOf("Teammate book access")).toBeGreaterThan(
      headings.indexOf("Appearance"),
    );

    const session = page.getByRole("heading", { name: "Session", level: 2 });
    await expect(session).toBeVisible();
    const sessionPanel = page.locator("section").filter({ has: session });
    await expect(sessionPanel.getByText("member@demo.local")).toBeVisible();
    await expect(sessionPanel.getByText("member", { exact: true })).toBeVisible();
    await expect(sessionPanel.getByText("demo", { exact: true })).toBeVisible();
    await expect(sessionPanel.getByText("America/Chicago")).toBeVisible();
    await expect(
      sessionPanel.getByRole("button", { name: "Sign out" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: /time zone|timezone/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /time zone|timezone/i }),
    ).toHaveCount(0);

    await expect(
      page.getByText("Unlock grant inventory is unavailable in this environment"),
    ).toBeVisible();
    await expect(
      page.getByText(/This browser holds 0 teammate unlock grant/),
    ).toHaveCount(0);
    await expect(page.getByText(/for 8 hours/)).toBeVisible();
    await expect(
      page.getByText("Demo mode only clears unlocks in this browser."),
    ).toBeVisible();
    await expect(page.getByText(/stored in this browser/)).toBeVisible();
    await expect(page.getByText("Mock workspace")).toBeVisible();
    await expect(page.getByText(/Fixture data/)).toBeVisible();

    await expect(page.getByRole("heading", { name: "Add user" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Desk members" })).toHaveCount(
      0,
    );
    await expect(page.locator("#team-email")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reset all unlocks" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Lock my book" })).toBeVisible();
  });

  test("theme radios persist Light across reload and move with arrows", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await openSettings(page);

    const group = page.getByRole("radiogroup", { name: "Theme preference" });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);

    await page.getByRole("radio", { name: "Light" }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.dataset.theme),
      )
      .toBe("light");
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem("ib-theme")))
      .toBe("light");
    await expect(page.getByText(/Active · (dark|light)/)).toBeVisible();

    await page.reload({ waitUntil: "load" });
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.dataset.theme),
      )
      .toBe("light");
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem("ib-theme")))
      .toBe("light");

    await page.getByRole("radio", { name: "Dark" }).click();
    const dark = page.getByRole("radio", { name: "Dark" });
    await expect(dark).toHaveAttribute("aria-checked", "true");
    await expect(dark).toHaveAttribute("tabindex", "0");
    await expect(page.getByRole("radio", { name: "Light" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    await expect(page.getByRole("radio", { name: "System" })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    await dark.focus();
    await page.keyboard.press("ArrowRight");
    const light = page.getByRole("radio", { name: "Light" });
    await expect(light).toBeFocused();
    await expect(light).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.dataset.theme),
      )
      .toBe("light");
  });

  test("Lock my book posts scope self once while pending and surfaces error", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await openSettings(page);

    const posts: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/positions/unlock/reset")
      ) {
        posts.push(request.postData() ?? "");
      }
    });

    await page.route("**/api/positions/unlock/reset", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unlock reset failed" }),
      });
    });

    const lock = page.getByRole("button", { name: /Lock my book|Locking\.\.\./ });
    await lock.click();
    await expect(lock).toHaveAttribute("aria-busy", "true");
    await expect(lock).toBeDisabled();
    await expect(lock).toHaveText("Locking...");
    await lock.click({ force: true });
    await expect(page.getByRole("alert")).toContainText("Unlock reset failed");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0] ?? "{}")).toMatchObject({ scope: "self" });
  });

  test("successful lock shows Demo session only from payload.demo", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await openSettings(page);

    const posted = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/positions/unlock/reset"),
    );
    await page.getByRole("button", { name: "Lock my book" }).click();
    const request = await posted;
    expect(JSON.parse(request.postData() ?? "{}")).toMatchObject({
      scope: "self",
    });
    await expect(page.getByRole("status").filter({ hasText: "Demo session only" })).toBeVisible();
  });

  test("member desk unlock reset is forbidden", async ({ page }) => {
    await demoLogin(page, "member");
    const response = await page.request.post("/api/positions/unlock/reset", {
      data: { scope: "desk" },
    });
    expect(response.status()).toBe(403);
  });

  test("does not overflow on a phone viewport", async ({ page }) => {
    await demoLogin(page, "member");
    await page.setViewportSize({ width: 375, height: 812 });
    await openSettings(page);
    await expectNoPageHorizontalOverflow(page);
  });

  test("Sign out DELETE is pending-once and stays on settings on error", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await openSettings(page);

    const deletes: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "DELETE" &&
        request.url().includes("/api/auth/demo")
      ) {
        deletes.push(request.url());
      }
    });

    await page.route("**/api/auth/demo", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Demo sign-out failed" }),
      });
    });

    const signOut = page.getByRole("button", { name: "Sign out" });
    await signOut.click();
    await expect(signOut).toHaveAttribute("aria-busy", "true");
    await expect(signOut).toBeDisabled();
    await signOut.click({ force: true });
    await expect(page.getByRole("alert")).toContainText("Demo sign-out failed");
    await expect(page).toHaveURL(/\/settings/);
    expect(deletes).toHaveLength(1);
  });

  test("Sign out ends the demo session after DELETE 2xx", async ({ page }) => {
    await demoLogin(page, "member");
    await openSettings(page);

    const deleted = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().includes("/api/auth/demo") &&
        response.ok(),
    );
    await page.getByRole("button", { name: "Sign out" }).click();
    await deleted;
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("settings admin", () => {
  test("adds a user through POST /api/admin/users and requires desk reset confirm", async ({
    page,
  }) => {
    await demoLogin(page, "admin");
    await openSettings(page);

    await expect(page.getByRole("heading", { name: "Add user" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Desk members" })).toBeVisible();
    await expect(page.locator("#team-password")).toHaveAttribute(
      "type",
      "password",
    );

    await page.locator("#team-email").fill("new.trader@demo.local");
    await page.locator("#team-password").fill("desk-pass-1");
    await page.locator("#team-confirm").fill("other-pass");
    await page.getByRole("button", { name: "Add user" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Passwords do not match",
    );

    await page.locator("#team-confirm").fill("desk-pass-1");
    const created = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/api/admin/users"),
    );
    await page.getByRole("button", { name: "Add user" }).click();
    await created;
    await expect(
      page.getByRole("status").filter({ hasText: "Demo session only" }),
    ).toBeVisible();
    await expect(page.locator("#team-password")).toHaveValue("");
    await expect(page.locator("#team-confirm")).toHaveValue("");

    const deskPosts: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/positions/unlock/reset")
      ) {
        deskPosts.push(request.postData() ?? "");
      }
    });
    await page.getByRole("button", { name: "Reset all unlocks" }).click();
    await expect(page.getByRole("button", { name: "Confirm reset" })).toBeVisible();
    expect(deskPosts).toHaveLength(0);
    await page.getByRole("button", { name: "Confirm reset" }).click();
    await expect
      .poll(() => deskPosts.length)
      .toBe(1);
    expect(JSON.parse(deskPosts[0] ?? "{}")).toMatchObject({ scope: "desk" });
  });
});
