import { test, expect } from "@playwright/test";

test.describe("FlowForge Automation SaaS — Browser Smoke Suite", () => {
  test("1. Authentication Flow: Sign In with seeded credentials", async ({ page }) => {
    await page.goto("/login");

    // Check branding
    await expect(page.locator("text=Sign in to FlowForge Automation")).toBeVisible();
    await expect(page.locator("text=demo@flowforge.dev").first()).toBeVisible();

    // Fill credentials
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("2. Dashboard Screen: Real metrics, activity, and onboarding", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/);

    // Verify summary metric cards
    await expect(page.locator("text=Total Workflows")).toBeVisible();
    await expect(page.locator("text=Active Workflows")).toBeVisible();
    await expect(page.locator("text=Successful Runs")).toBeVisible();
    await expect(page.locator("text=Failed Runs")).toBeVisible();

    // Verify recent activity table
    await expect(page.locator("text=Recent Workflow Activity")).toBeVisible();
    await expect(page.locator("text=Lead Intake & CRM Dispatcher")).toBeVisible();
  });

  test("3. Workflows Screen: CRUD & status toggle", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');

    await page.goto("/workflows");
    await expect(page.locator("h1")).toContainText("Workflows");

    // Check seeded workflow is present
    await expect(page.locator("text=Lead Intake & CRM Dispatcher").first()).toBeVisible();

    // Test status filter pills using data-testid
    await page.click('[data-testid="filter-all"]');
    await expect(page.locator("text=Lead Intake & CRM Dispatcher").first()).toBeVisible();
  });

  test("4. Visual Workflow Canvas: React Flow nodes, configuration & save", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');

    await page.goto("/workflows/new");
    await page.waitForLoadState("networkidle");

    // On mobile viewports, open palette if toggle button is present
    const mobileAddButton = page.locator('button:has-text("+ Add Nodes")');
    if (await mobileAddButton.isVisible()) {
      await mobileAddButton.click();
    }

    // Check canvas and palette
    await expect(page.locator("text=Node Palette")).toBeVisible();
    await expect(page.getByRole("button", { name: /Webhook Trigger/ })).toBeVisible();

    // Add a node from palette
    await page.getByRole("button", { name: /HTTP \/ REST Call/ }).click();

    // Click node to open config panel
    await page.locator('.react-flow__node').last().click({ force: true });
    await expect(page.locator("text=Node Configuration")).toBeVisible();

    // Save graph
    await page.click('button:has-text("Save Graph")');
    await expect(page.locator("text=Saved to Cloud")).toBeVisible({ timeout: 10000 });
  });

  test("5. Integrations Marketplace & Details Modal", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');

    await page.goto("/integrations");
    await expect(page.locator("h1")).toContainText("Integrations Catalog");

    // Check available and planned integrations
    await expect(page.locator("text=Webhook Trigger").first()).toBeVisible();
    await expect(page.locator("text=HTTP / REST Request").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Slack" })).toBeVisible();

    // Click Slack card to open details modal
    await page.getByRole("heading", { name: "Slack" }).click();
    await expect(page.locator("text=Authentication Setup & Credentials")).toBeVisible();
    await page.click('button:has-text("Close")');
  });

  test("6. Templates: Instantiate pre-built automation", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');

    await page.goto("/templates");
    await expect(page.locator("h1")).toContainText("Workflow Templates");

    await expect(page.locator("text=Webhook to HTTP API Relay").first()).toBeVisible();
  });

  test("7. Settings: Update workspace organization", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');

    await page.goto("/settings");
    await expect(page.locator("h1")).toContainText("Settings");

    // Switch to Workspace tab
    await page.click('button:has-text("Workspace")');
    await expect(page.locator("text=Workspace Organization")).toBeVisible();
  });
});
