import { expect, test } from "@playwright/test";
import { demoLogin, expectNoPageHorizontalOverflow, openCreateCoverage } from "./helpers";

test.describe("research workspace interactions", () => {
  test("command search navigates by keyboard", async ({ page }) => {
    await demoLogin(page, "member");

    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+K" : "Control+K",
    );
    const dialog = page.getByRole("dialog", { name: "Headlines and destinations" });
    await expect(dialog).toBeVisible();

    const commandInput = dialog.getByRole("combobox", {
      name: "Search headlines and destinations",
    });
    await expect(commandInput).toBeFocused();
    await commandInput.fill("Research Archive");
    await commandInput.press("Enter");

    await expect(page).toHaveURL(/\/archive$/);
    await expect(
      page.getByRole("heading", { name: "Research Archive" }),
    ).toBeVisible();
  });

  test("material news search is a first-class workspace", async ({ page }) => {
    await demoLogin(page, "member");
    await page.goto("/news");
    await expect(
      page.getByRole("heading", { name: "Material News" }),
    ).toBeVisible();
    const search = page.getByRole("textbox", { name: "Search headlines" });
    await expect(search).toBeVisible();
    await expect(page.getByRole("heading", { name: "Event feed" })).toBeVisible({
      timeout: 20_000,
    });
    await search.fill("why is IREN down today");
    await expect(
      page.getByRole("heading", { name: "Why IREN is moving" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Confirmed company catalyst|Likely catalyst/i).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /DEMO: IREN Limited files 8-K/i }).first(),
    ).toBeVisible();
    await expect(page.getByText(/because/i)).toHaveCount(0);
    await expectNoPageHorizontalOverflow(page);
  });

  test("market chart exposes accessible symbol and range inspection", async ({
    page,
  }) => {
    await demoLogin(page, "member");

    await expect(
      page.getByRole("heading", { name: "Primary market chart" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /SPY 3M daily series/i }),
    ).toBeHidden();

    await page
      .locator("#primary-market-chart-panel > details > summary")
      .click();
    await expect(
      page.getByRole("img", { name: /SPY 3M daily series/i }),
    ).toBeVisible();

    const oneMonth = page.getByRole("button", { name: "1M", exact: true });
    await oneMonth.click();
    await expect(oneMonth).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("img", { name: /SPY 1M daily series/i }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "QQQ", exact: true }).click();
    await expect(page).toHaveURL(/symbol=QQQ/);
    await expect(
      page.getByRole("img", { name: /QQQ 1M daily series/i }),
    ).toBeVisible();

    const oneDay = page.getByRole("button", { name: "1D", exact: true });
    await oneDay.click();
    await expect(oneDay).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("img", { name: /QQQ 1D intraday series/i }),
    ).toBeVisible();

    const watchlistIwm = page.getByRole("button", {
      name: "Inspect IWM chart",
    });
    await watchlistIwm.click();
    await expect(page).toHaveURL(/symbol=IWM/);
    await expect(
      page.getByRole("img", { name: /IWM 1D intraday series/i }),
    ).toBeVisible();

    const symbolSort = page.getByRole("button", { name: "Symbol" });
    await symbolSort.click();
    await expect(symbolSort).toHaveAttribute("aria-pressed", "true");
    await expect(
      page
        .getByRole("region", { name: "Watchlist table" })
        .locator("tbody tr")
        .first(),
    ).toContainText("AAPL");
  });

  test("member can queue a firm-wide brief without opening an unfinished report", async ({
    page,
  }) => {
    await demoLogin(page, "member");

    await page
      .getByRole("button", { name: "Generate brief", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Generate brief" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/session-only fixture job/i)).toBeVisible();

    await dialog.getByRole("radio", { name: "Close / Postmarket" }).check();
    await dialog.getByRole("button", { name: "Queue firm-wide brief" }).click();

    await expect(
      dialog.getByRole("heading", { name: "Request accepted" }),
    ).toBeVisible();
    await expect(dialog.getByText("queued", { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Open Research Archive" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("member can access an authorized archived PDF", async ({ page }) => {
    await demoLogin(page, "member");
    await page.goto("/reports/rpt-demo-001");

    const download = page.getByRole("link", { name: "Download PDF" });
    const href = await download.getAttribute("href");
    expect(href).toBeTruthy();
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
  });

  test("watchlist validation and optimistic session save remain usable", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await page.goto("/watchlists");
    await openCreateCoverage(page);

    await page.getByLabel("Watchlist name").fill("E2E coverage");
    await page.getByLabel("Ticker symbols").fill("spy spy");
    await page.getByRole("button", { name: "Create watchlist" }).click();
    await expect(
      page.getByText("Remove duplicate symbols: SPY."),
    ).toBeVisible();
    await expect(page.getByLabel("Ticker symbols")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await page.getByLabel("Ticker symbols").fill("spy qqq");
    await page.getByRole("button", { name: "Create watchlist" }).click();
    await expect(
      page.getByText("Shared watchlist accepted and added to this session"),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /E2E coverage/ }),
    ).toBeVisible();
  });

  test("member can classify coverage as a sector theme on the boards below", async ({
    page,
  }) => {
    await demoLogin(page, "member");
    await page.goto("/watchlists");
    await openCreateCoverage(page);

    await page.getByRole("radio", { name: "Sector / theme" }).check();
    await page.getByLabel("Name", { exact: true }).fill("E2E theme basket");
    await page.getByLabel("Ticker symbols").fill("NVDA AMD");
    await page.getByRole("button", { name: "Create theme" }).click();

    await expect(
      page.getByText("Theme accepted and added to this session"),
    ).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: "Sectors and themes" }).getByRole("tab", {
        name: /E2E theme basket/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Sector heatmap" }).getByRole("button", {
        name: /E2E theme basket/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Rotation board" }),
    ).toContainText("E2E theme basket");
  });

  test("member can inspect and add a session position", async ({ page }) => {
    await demoLogin(page, "member");
    await page.goto("/positions");

    await expect(page.getByRole("heading", { name: "Positions", exact: true })).toBeVisible();
    await expect(page.getByText("Book snapshot")).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect brokerage" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Import past trades" })).toHaveCount(0);
    await expect(page.getByText("Brokerage sync needs SnapTrade keys")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add position" })).toBeVisible();
    await expect(page.getByText("$175,000.00")).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Demo Member/ }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("region", { name: "Positions table", exact: true }),
    ).toContainText("AAPL");
    await expect(
      page.getByRole("region", { name: "Positions table", exact: true }),
    ).toContainText("−$122.00");
    await expect(
      page.getByRole("heading", { name: "Past positions" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Past positions table" }),
    ).toContainText("AAPL");
    await expect(
      page
        .getByRole("region", { name: "Past positions table" })
        .getByRole("columnheader", { name: "Date entered" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Past positions table" })
        .getByRole("columnheader", { name: "Date closed" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Past positions pages" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Past positions per page"),
    ).toHaveValue("10");
    await expect(
      page.getByRole("region", { name: "Past positions table" }),
    ).toContainText("−$122.00");
    await expect(
      page.getByRole("heading", { name: "Entries & exits" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Entries and exits" }),
    ).toContainText("AAPL");
    await expect(
      page.getByRole("region", { name: "Entries and exits" }),
    ).toContainText("Exit");
    await expect(
      page.getByRole("navigation", { name: "Entries and exits pages" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Entries and exits per page"),
    ).toHaveValue("10");
    await expect(page.getByText(/Mock data/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Add position" }).click();
    const dialog = page.getByRole("dialog", { name: "Add position" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Ticker").fill("IEF");
    await dialog.getByLabel("Shares / contracts").fill("40");
    await dialog.getByLabel("Entry price").fill("95.4");
    await dialog.getByLabel("Strategy (optional)").fill("Rates overlay");
    await dialog.getByRole("button", { name: "Add to book" }).click();
    await expect(
      page.getByText("Position added to this session", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Positions table", exact: true }),
    ).toContainText("IEF");

    await page.getByRole("button", { name: /IEF/ }).first().click();
    const iefInspector = page.getByRole("region", { name: /IEF lot blotter/i });
    await expect(iefInspector).toBeVisible();
    await iefInspector.getByRole("button", { name: "Close position" }).click();
    await iefInspector.getByLabel("Quantity to close").fill("10");
    await iefInspector.getByRole("button", { name: "Confirm partial close" }).click();
    await expect(page.getByText(/Closed 10 of 40/)).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Positions table", exact: true }),
    ).toContainText("IEF");
    await expect(
      page.getByRole("region", { name: "Past positions table" }),
    ).toContainText("IEF");

    await page.getByRole("button", { name: /AAPL/ }).first().click();
    const inspector = page.getByRole("region", { name: /AAPL lot blotter/i });
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("Since entry")).toBeVisible();
    await expect(inspector.getByText("Realized")).toBeVisible();
    await expect(inspector.getByText("Daily series unavailable")).toHaveCount(0);
    await expect(inspector.getByText(/AAPL daily/i)).toBeVisible();
    await inspector.getByRole("button", { name: "Collapse row" }).click();
    await expect(inspector).toBeHidden();

    await page.getByRole("tab", { name: /Demo Admin/ }).click();
    await expect(
      page.getByRole("region", { name: "Positions table", exact: true }),
    ).toContainText("NVDA");
    await expect(
      page.getByRole("region", { name: "Positions table", exact: true }),
    ).toContainText("+$456.00");
    await expect(
      page.getByRole("region", { name: "Past positions table" }),
    ).toContainText("QQQ");
    await expect(
      page.getByRole("region", { name: "Past positions table" }),
    ).toContainText("NVDA");
    await expect(
      page.getByRole("region", { name: "Entries and exits" }),
    ).toContainText("QQQ");
    await expect(
      page.getByRole("region", { name: "Entries and exits" }),
    ).toContainText("NVDA");
    await expect(page.getByText("View only").first()).toBeVisible();
  });

  test("member can submit a proposal for admin review", async ({ page }) => {
    await demoLogin(page, "member");
    await page.goto("/proposals");

    await page.getByRole("button", { name: "Submit proposal" }).click();
    await expect(
      page.getByText("Enter a concise proposal title."),
    ).toBeVisible();
    await expect(
      page.getByText("Explain the requested change and why it is needed."),
    ).toBeVisible();

    await page.getByLabel("Proposal title").fill("Add rates monitor");
    await page
      .getByLabel("Rationale and requested change")
      .fill(
        "Add IEF to the shared macro list for the daily duration read-through.",
      );
    await page.getByRole("button", { name: "Submit proposal" }).click();
    await expect(
      page.getByText("Proposal accepted for admin review"),
    ).toBeVisible();
    await expect(
      page
        .getByText("Add rates monitor", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
  });

  test("deterministic data-quality previews stay explicit and mock-labelled", async ({
    page,
  }) => {
    await demoLogin(page, "member");

    for (const state of [
      "loading",
      "delayed",
      "partial",
      "stale",
      "empty",
      "rate-limit",
      "provider-error",
    ]) {
      await page.goto(`/dashboard?state=${state}`);
      await expect(
        page.getByRole("heading", { name: `Deterministic ${state} preview` }),
      ).toBeVisible();
      await expect(
        page.getByText(/mock (data|fixture)/i).first(),
      ).toBeVisible();
    }
  });
});

test.describe("mobile workspace layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("critical member routes avoid page-level horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expectNoPageHorizontalOverflow(page);

    await page.getByRole("button", { name: "Enter as member" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    const routes = [
      { path: "/dashboard", heading: "Market Overview" },
      { path: "/news", heading: "Material News" },
      { path: "/archive", heading: "Research Archive" },
      { path: "/reports/rpt-demo-001", heading: "Midday market brief" },
      { path: "/watchlists", heading: "Watchlists & Sectors" },
      { path: "/positions", heading: "Positions" },
      { path: "/proposals", heading: "Proposals" },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(
        page.getByRole("heading", { name: route.heading, exact: true }),
      ).toBeVisible();
      await expectNoPageHorizontalOverflow(page);
    }
  });
});
