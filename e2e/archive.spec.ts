import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

test.describe("archive", () => {
  test("member can search the archive and reset an empty result", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await page.goto("/archive");
    await expect(page).toHaveURL(/\/archive/);
    await expect(
      page.getByRole("heading", { name: "Research Archive" }),
    ).toBeVisible();
    await expect(page.getByLabel("Edition")).toContainText(
      "Close / Postmarket",
    );

    await page
      .getByRole("searchbox", { name: "Search research" })
      .fill("no-such-report");
    await page.getByRole("button", { name: "Apply filters" }).click();

    await expect(page).toHaveURL(/q=no-such-report/);
    await expect(
      page.getByRole("heading", {
        name: "No reports match these filters",
      }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Reset archive filters" }).click();
    await expect(page).toHaveURL(/\/archive$/);
    await expect(
      page.getByRole("heading", { name: "Archived research" }),
    ).toBeVisible();
  });
});
