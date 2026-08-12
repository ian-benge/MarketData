import { expect, test } from "@playwright/test";
import { demoLogin, expectNoPageHorizontalOverflow } from "./helpers";

test.describe("institutional report reader", () => {
  test("midday brief renders tape, causality, and playbook", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await demoLogin(page, "member");
    await page.goto("/reports/rpt-demo-001");

    await expect(
      page.getByRole("heading", { name: "Midday market brief" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cross-Asset Tape" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Transmission & Causality" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "PM Playbook" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "AI Infrastructure Map" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Options Desk" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Earnings, Estimates & Guidance" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Vertiv cites data-center cooling/i).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "HOLD LONG VRT · event_driven" }),
    ).toBeVisible();
    await expect(
      page.getByText(/not in this evidence bundle/i).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What Changed Since the Last Report" }),
    ).toBeVisible();

    await expectNoPageHorizontalOverflow(page);
    await page.screenshot({
      path: "tmp/report-reader-midday.png",
      fullPage: true,
    });
  });
});
