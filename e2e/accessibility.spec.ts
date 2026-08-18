import { expect, test, type Page } from "@playwright/test";
import { demoLogin, expectNoPageHorizontalOverflow } from "./helpers";

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
  test.setTimeout(120_000);
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
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toHaveCount(1);
    await expectCriticalSemantics(page);
  }
});

test("admin Data Operations exposes baseline accessible semantics", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await demoLogin(page, "admin");
  await page.goto("/admin?tab=market-data");
  await expect(
    page.getByRole("button", { name: "Refresh status" }),
  ).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expectCriticalSemantics(page);
});

async function openSettings(page: Page) {
  await page.goto("/settings", { waitUntil: "load", timeout: 45_000 });
  await expect(page).toHaveURL(/\/settings/);
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 }),
  ).toBeVisible();
}

function settingsMain(page: Page) {
  return page.locator("#main-content");
}

function pageAlert(page: Page, text: string | RegExp) {
  return page.getByRole("alert").filter({ hasText: text });
}

test("unauthenticated /settings redirects to login with next=/settings", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/settings", { waitUntil: "load", timeout: 45_000 });
  await expect(page).toHaveURL(/\/login/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/settings");
});

test.describe("settings member control center", () => {
  test.describe.configure({ timeout: 60_000 });

  test("exposes one Settings heading and critical semantics", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await openSettings(page);
    await expect(
      page.getByRole("heading", { name: "Settings", level: 1 }),
    ).toHaveCount(1);
    await expectCriticalSemantics(page);
  });

  test("Sign out ends the demo session after DELETE 2xx", async ({ page }) => {
    await demoLogin(page, "member");
    await openSettings(page);

    await expect(
      settingsMain(page).getByText("member@demo.local"),
    ).toBeVisible();
    const deleted = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().includes("/api/auth/demo") &&
        response.ok(),
    );
    await settingsMain(page).getByRole("button", { name: "Sign out" }).click();
    await deleted;
    await expect(page).toHaveURL(/\/login/);
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

    const signOut = settingsMain(page).getByRole("button", { name: "Sign out" });
    await signOut.click();
    await expect(signOut).toHaveAttribute("aria-busy", "true");
    await expect(signOut).toBeDisabled();
    await signOut.click({ force: true });
    await expect(pageAlert(page, "Demo sign-out failed")).toBeVisible();
    await expect(page).toHaveURL(/\/settings/);
    expect(deletes).toHaveLength(1);
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
    await expect(pageAlert(page, "Unlock reset failed")).toBeVisible();
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
    await expect(
      page.getByRole("status").filter({ hasText: "Demo session only" }),
    ).toBeVisible();
  });

  test("member desk unlock reset is forbidden", async ({ page }) => {
    await demoLogin(page, "member");
    const response = await page.request.post("/api/positions/unlock/reset", {
      data: { scope: "desk" },
    });
    expect(response.status()).toBe(403);
  });

  test("does not overflow on phone, tablet, laptop, or desktop", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await openSettings(page);
      await expectNoPageHorizontalOverflow(page);
    }
  });
});

test.describe("settings admin", () => {
  test.describe.configure({ timeout: 60_000 });

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
    await expect(pageAlert(page, "Passwords do not match")).toBeVisible();

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
    await expect.poll(() => deskPosts.length).toBe(1);
    expect(JSON.parse(deskPosts[0] ?? "{}")).toMatchObject({ scope: "desk" });
  });
});
