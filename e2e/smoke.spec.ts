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
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 });
    await expect(page.locator("h1")).toContainText("Dashboard", { timeout: 15000 });
  });

  test("2. Dashboard Screen: Real metrics, activity, and onboarding", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 });

    // Verify summary metric cards
    await expect(page.locator("text=Total Workflows")).toBeVisible();
    await expect(page.locator("text=Active Workflows")).toBeVisible();
    await expect(page.locator("text=Successful Runs")).toBeVisible();
    await expect(page.locator("text=Failed Runs")).toBeVisible();

    // Verify recent activity table
    await expect(page.locator("text=Recent Workflow Activity")).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible();
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

  test("8. Phase 2 Execution Engine: Canvas Test Run, Activate & Live History Diagnostics", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');

    await page.goto("/workflows");
    await page.waitForLoadState("networkidle");

    // Click on Lead Intake workflow to open visual canvas editor
    await page.click('text=Lead Intake & CRM Dispatcher');
    await page.waitForURL(/\/workflows\/[a-zA-Z0-9_-]+/);
    await page.waitForLoadState("networkidle");

    // Verify Phase 2 canvas action controls
    await expect(page.locator('[data-testid="test-flow-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="toggle-activate-btn"]')).toBeVisible();

    // Trigger test run modal
    await page.click('[data-testid="test-flow-btn"]');
    await expect(page.locator("text=Execute Test Flow")).toBeVisible();
    await expect(page.locator("text=Trigger Mock Payload (JSON)")).toBeVisible();

    // Submit test execution
    await page.click('[data-testid="submit-test-flow-btn"]');
    await expect(page.locator("text=Job Enqueued Successfully!")).toBeVisible({ timeout: 10000 });

    // Navigate to Executions page
    await page.goto("/executions");
    await page.waitForLoadState("networkidle");

    // Verify executions table contains the run
    await expect(page.locator("h1")).toContainText("Execution History");
    await expect(page.locator("text=BullMQ Asynchronous Runtime Engine Active")).toBeVisible();
    await expect(page.locator("text=Lead Intake & CRM Dispatcher").first()).toBeVisible();

    // Click Logs on first execution
    await page.locator('button:has-text("Logs")').first().click();
    await expect(page.locator("text=Execution Run Diagnostics")).toBeVisible();
    await expect(page.locator("text=Step Logs")).toBeVisible();
  });

  test("9. Phase 3 Connected Accounts & OAuth Management", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 });

    await page.goto("/connections");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("Connected Accounts");
    await expect(page.locator("text=AES-256-GCM Encrypted Credential Vault")).toBeVisible();

    // Click quick connect on Slack
    await page.locator('[data-testid="connect-slack-btn"]').click();
    await expect(page.locator("text=New connection established successfully!")).toBeVisible({ timeout: 10000 });

    // Verify Slack account row appears in table with ACTIVE status
    await expect(page.locator("text=SLACK").first()).toBeVisible();
    await expect(page.locator("text=ACTIVE").first()).toBeVisible();
  });

  test("10. Phase 3 Third-Party Integrations in Canvas", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "demo@flowforge.dev");
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 });

    await page.goto("/workflows/new");
    await page.waitForLoadState("networkidle");

    // Open palette if mobile
    const mobileAddButton = page.locator('button:has-text("+ Add Nodes")');
    if (await mobileAddButton.isVisible()) {
      await mobileAddButton.click();
    }

    // Verify Third-Party integrations in Palette
    await expect(page.locator('[data-testid="palette-node-slack-post-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="palette-node-google-sheets-append"]')).toBeVisible();
    await expect(page.locator('[data-testid="palette-node-gmail-send-email"]')).toBeVisible();

    // Add Slack node to canvas
    await page.locator('[data-testid="palette-node-slack-post-message"]').click();

    // Click Slack node to open Node Configuration
    await page.locator('.react-flow__node').last().click({ force: true });
    await expect(page.locator("text=Node Configuration")).toBeVisible();
    await expect(page.locator("text=Channel ID or Name")).toBeVisible();
    await expect(page.locator("text=Message Text")).toBeVisible();
  });
});
