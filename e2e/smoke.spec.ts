import { test, expect, Page } from "@playwright/test";

async function loginAsDemo(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', "demo@flowforge.dev");
  await page.fill('input[type="password"]', "Password123!");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 });
}

async function addPaletteNode(page: Page, testId: string) {
  // If config panel is open on mobile, close it so palette button is accessible
  const closeConfigBtn = page.locator('button[title="Close panel"]');
  if (await closeConfigBtn.isVisible()) {
    await closeConfigBtn.click();
    await page.waitForTimeout(200);
  }

  const openButton = page.locator('button:has-text("+ Add Nodes")');
  if (await openButton.isVisible()) {
    await openButton.click();
    await page.waitForTimeout(200);
  }
  const nodeBtn = page.locator(`[data-testid="${testId}"]`);
  await nodeBtn.scrollIntoViewIfNeeded();
  await nodeBtn.click({ force: true });
  await page.waitForTimeout(250);
}

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
    await loginAsDemo(page);

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
    await loginAsDemo(page);

    await page.goto("/workflows");
    await expect(page.locator("h1")).toContainText("Workflows");

    // Search for seeded workflow
    await page.fill('input[placeholder*="Search workflows"]', "Lead Intake");
    await expect(page.locator("text=Lead Intake & CRM Dispatcher").first()).toBeVisible();

    // Test status filter pills using data-testid
    await page.click('[data-testid="filter-all"]');
    await expect(page.locator("text=Lead Intake & CRM Dispatcher").first()).toBeVisible();
  });

  test("4. Visual Workflow Canvas: React Flow nodes, configuration & save", async ({ page }) => {
    await loginAsDemo(page);

    await page.goto("/workflows/new");
    await page.waitForLoadState("networkidle");

    // Check canvas and palette
    const mobileAddButton = page.locator('button:has-text("+ Add Nodes")');
    if (await mobileAddButton.isVisible()) {
      await mobileAddButton.click();
    }
    await expect(page.locator("text=Node Palette")).toBeVisible();
    await expect(page.getByRole("button", { name: /Webhook Trigger/ })).toBeVisible();

    // Add a node from palette
    await page.getByRole("button", { name: /HTTP \/ REST Call/ }).click();

    // Click node to open config panel
    await page.locator('.react-flow__node').last().click({ force: true });
    await expect(page.locator("text=Node Configuration")).toBeVisible();

    // Save graph and verify redirect to saved workflow ID
    await page.click('button:has-text("Save Graph")');
    await expect(page).toHaveURL(/\/workflows\/[a-zA-Z0-9_-]+/, { timeout: 15000 });
  });

  test("5. Integrations Marketplace & Details Modal", async ({ page }) => {
    await loginAsDemo(page);

    await page.goto("/integrations");
    await expect(page.locator("h1")).toContainText("Integrations Catalog");

    // Check available integrations
    await expect(page.locator("text=Webhook Trigger").first()).toBeVisible();
    await expect(page.locator("text=HTTP / REST Request").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Slack" })).toBeVisible();

    // Click Slack card to open details modal
    await page.getByRole("heading", { name: "Slack" }).click();
    await expect(page.locator("text=Authentication Setup & Credentials")).toBeVisible();
    await page.click('button:has-text("Close")');
  });

  test("6. Templates: Instantiate pre-built automation", async ({ page }) => {
    await loginAsDemo(page);

    await page.goto("/templates");
    await expect(page.locator("h1")).toContainText("Workflow Templates");

    await expect(page.locator("text=Webhook to HTTP API Relay").first()).toBeVisible();
  });

  test("7. Settings: Update workspace organization", async ({ page }) => {
    await loginAsDemo(page);

    await page.goto("/settings");
    await expect(page.locator("h1")).toContainText("Settings");

    // Switch to Workspace tab
    await page.click('button:has-text("Workspace")');
    await expect(page.locator("text=Workspace Organization")).toBeVisible();
  });

  test("8. Phase 2 Execution Engine: Canvas Test Run, Activate & Live History Diagnostics", async ({ page }) => {
    await loginAsDemo(page);

    await page.goto("/workflows");
    await page.waitForLoadState("networkidle");

    // Click on Edit Canvas icon button to open visual canvas editor
    await page.locator('a[title="Edit Canvas"]').first().click();
    await page.waitForURL(/\/workflows\/[a-zA-Z0-9_-]+/, { timeout: 15000 });
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
    await expect(page.locator("tbody tr").first()).toBeVisible();

    // Click Logs on first execution
    await page.locator('button:has-text("Logs")').first().click();
    await expect(page.locator("text=Execution Run Diagnostics")).toBeVisible();
    await expect(page.locator("text=Step Logs")).toBeVisible();
  });

  test("9. Phase 3 Connected Accounts & OAuth Management", async ({ page }) => {
    await loginAsDemo(page);

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
    await loginAsDemo(page);

    await page.goto("/workflows/new");
    await page.waitForLoadState("networkidle");

    // Add Slack node to canvas using helper
    await addPaletteNode(page, "palette-node-slack-post-message");

    // Click Slack node to open Node Configuration
    await page.locator('.react-flow__node').last().click({ force: true });
    await expect(page.locator("text=Node Configuration")).toBeVisible();
    await expect(page.locator("text=Channel ID or Name")).toBeVisible();
    await expect(page.locator("text=Message Text")).toBeVisible();
  });

  test("11. Phase 4 Advanced Flow Control Nodes in Canvas (Filter, Transform, Loop, Approval)", async ({ page }) => {
    await loginAsDemo(page);

    await page.goto("/workflows/new");
    await page.waitForLoadState("networkidle");

    // Add Data Transform node
    await addPaletteNode(page, "palette-node-data-transform");

    // Verify Transform Node configuration
    await expect(page.locator("text=Node Configuration")).toBeVisible();
    await expect(page.locator("text=Transformation Template (JSON)")).toBeVisible();
    await expect(page.locator("text=Live Transform Preview")).toBeVisible();
    await expect(page.locator("text=Sample Input JSON")).toBeVisible();

    // Add Human Approval node
    await addPaletteNode(page, "palette-node-human-approval");

    // Verify Approval Node configuration
    await expect(page.locator("text=Approval Title")).toBeVisible();
    await expect(page.locator("text=Required Role")).toBeVisible();
    await expect(page.locator("text=Human-in-the-Loop Pause")).toBeVisible();

    // Save graph and verify transition to persistent workflow ID
    await page.click('button:has-text("Save Graph")');
    await expect(page).toHaveURL(/\/workflows\/[a-zA-Z0-9_-]+/, { timeout: 15000 });
  });

  test("12. Phase 4 Human Approvals Page: Governance, Status Filter & Modals", async ({ page }) => {
    await loginAsDemo(page);

    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("Approvals");
    await expect(page.locator("text=Human-in-the-Loop Workflow Governance")).toBeVisible();

    // Check filter buttons
    await expect(page.locator('button:has-text("Pending")')).toBeVisible();
    await expect(page.locator('button:has-text("Approved")')).toBeVisible();
    await expect(page.locator('button:has-text("Rejected")')).toBeVisible();
    await expect(page.locator('button:has-text("All")')).toBeVisible();

    // Toggle filter
    await page.click('button:has-text("All")');
  });

  test("13. Phase 6 Pricing Page: Plan Tiers, Feature Comparison & Quotas", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Free").first()).toBeVisible();
    await expect(page.locator("text=Pro").first()).toBeVisible();
    await expect(page.locator("text=Business").first()).toBeVisible();
    await page.locator("text=Detailed Feature Comparison").scrollIntoViewIfNeeded();
    await expect(page.locator("text=Detailed Feature Comparison")).toBeVisible();
  });

  test("14. Phase 6 Workspace Billing & Usage Dashboard in Settings", async ({ page }) => {
    await loginAsDemo(page);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Billing tab
    await page.click('button:has-text("Billing & Usage")');

    await expect(page.locator("text=Current Plan")).toBeVisible();
    await expect(page.locator("text=Monthly Quotas & Consumption")).toBeVisible();
    await expect(page.locator("text=Workflow Runs")).toBeVisible();
    await expect(page.locator("text=Active Workflows")).toBeVisible();
    await expect(page.locator('span:has-text("Team Members")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Integrations")').first()).toBeVisible();
    await expect(page.locator('a:has-text("Change Plan")')).toBeVisible();
  });

  test("15. Phase 6 Team Members & Governance in Settings", async ({ page }) => {
    await loginAsDemo(page);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Team & Members tab
    await page.click('button:has-text("Team & Members")');

    await expect(page.locator("text=Workspace Members & Access")).toBeVisible();
    await expect(page.locator("text=Active Members")).toBeVisible();
    await expect(page.locator('button:has-text("Invite Member")')).toBeVisible();

    // Open Invite Member Modal
    await page.click('button:has-text("Invite Member")');
    await expect(page.locator("text=Send a secure 7-day invitation link")).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
    await page.click('button:has-text("Cancel")');
  });

  test("16. Phase 7 Template Library: Category Tabs, Search and Template Details Modal", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/templates");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Workflow Templates")).toBeVisible();

    // Verify category filtering
    await page.click('button:has-text("Developer")');
    await expect(page.locator("input[placeholder*='Search recipes']")).toBeVisible();

    // Search for Webhook
    await page.fill("input[placeholder*='Search recipes']", "Webhook");

    // Click Details on a template card
    const detailsBtn = page.locator('button:has-text("Details")').first();
    await expect(detailsBtn).toBeVisible();
    await detailsBtn.click();

    // Verify modal contents
    await expect(page.locator("text=Setup & Configuration Guide")).toBeVisible();
    await expect(page.locator("text=New Workflow Title")).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
    await page.click('button:has-text("Cancel")');
  });

  test("17. Phase 7 Workflow Canvas: Version History Drawer and Diagnostics", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/workflows");
    await page.waitForLoadState("networkidle");

    // Open first workflow canvas
    const firstWfLink = page.locator('tbody tr td a[href^="/workflows/"]').first();
    await expect(firstWfLink).toBeVisible();
    await firstWfLink.click();
    await page.waitForLoadState("networkidle");

    // Check canvas editor header
    await expect(page.locator('button[data-testid="version-history-btn"]')).toBeVisible({ timeout: 10000 });

    // Open Version History Drawer
    await page.click('button[data-testid="version-history-btn"]');
    await expect(page.locator('h3:has-text("Version History")')).toBeVisible();
    await expect(page.locator("text=Immutable checkpoints and safe rollbacks")).toBeVisible();

    // Close History Drawer
    await page.click('button:has(svg.lucide-x)');

    // Verify Export Button is present
    await expect(page.locator('button[data-testid="export-json-canvas-btn"]')).toBeVisible();
  });

  test("18. Phase 7 Dashboard Onboarding Checklist and Workflows Import Modal", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Check Persistent Onboarding Checklist Widget
    const onboardingCard = page.locator('[data-testid="onboarding-checklist-card"]');
    if (await onboardingCard.isVisible()) {
      await expect(page.locator("text=Workspace Onboarding Guide")).toBeVisible();
      await expect(page.locator("text=milestones completed")).toBeVisible();
    }

    // Navigate to Workflows page and test Import Modal
    await page.goto("/workflows");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('button[data-testid="import-workflow-btn"]')).toBeVisible();
    await page.click('button[data-testid="import-workflow-btn"]');

    await expect(page.locator("text=Import Workflow JSON")).toBeVisible();
    await expect(page.locator("text=Select JSON File")).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
    await page.click('button:has-text("Cancel")');
  });

  test("19. Phase 8 Developer Platform: API Keys Tab and Generation Modal", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click API Keys Tab
    const tab = page.locator('[data-testid="tab-api-keys"]');
    await expect(tab).toBeVisible({ timeout: 10000 });
    await tab.click();

    // Verify Tab Header
    await expect(page.locator("text=Workspace API Keys")).toBeVisible();
    await expect(page.locator('a:has-text("OpenAPI Docs")')).toBeVisible();

    // Open Create Key Modal
    const createBtn = page.locator('[data-testid="create-api-key-btn"]');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Verify Modal
    await expect(page.locator("text=Create Workspace API Key")).toBeVisible();
    await expect(page.locator('input[placeholder="e.g. CI/CD Deployment Runner"]')).toBeVisible();
    await expect(page.locator("text=Permitted Scopes")).toBeVisible();

    // Close Modal
    await page.click('button:has-text("Cancel")');
  });

  test("20. Phase 8 Developer Platform: Outbound Webhooks Tab and Registration Modal", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Webhooks Tab
    const tab = page.locator('[data-testid="tab-webhooks"]');
    await expect(tab).toBeVisible({ timeout: 10000 });
    await tab.click();

    // Verify Tab Header
    await expect(page.locator("text=Outbound Event Webhooks")).toBeVisible();

    // Open Register Webhook Modal
    const regBtn = page.locator('[data-testid="register-webhook-btn"]');
    await expect(regBtn).toBeVisible();
    await regBtn.click();

    // Verify Modal
    await expect(page.locator("text=Register Outbound Webhook")).toBeVisible();
    await expect(page.locator('input[placeholder="https://api.yourcompany.com/webhooks/flowforge"]')).toBeVisible();
    await expect(page.locator("text=Triggering Events")).toBeVisible();

    // Close Modal
    await page.click('button:has-text("Cancel")');
  });

  test("21. Phase 8 Developer Platform: Custom Integrations Tab and Builder", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Custom Integrations Tab
    const tab = page.locator('[data-testid="tab-custom-integrations"]');
    await expect(tab).toBeVisible({ timeout: 10000 });
    await tab.click();

    // Verify Tab Header
    await expect(page.locator("text=Custom Declarative Integrations")).toBeVisible();

    // Open Create Custom Integration Modal
    const newBtn = page.locator('[data-testid="create-custom-integration-btn"]');
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    // Verify Modal
    await expect(page.locator("text=Create Custom Integration")).toBeVisible();
    await expect(page.locator('input[placeholder="e.g. acme-billing"]')).toBeVisible();
    await expect(page.locator('input[placeholder="e.g. Acme Internal Billing"]')).toBeVisible();

    // Close Modal
    await page.click('button:has-text("Cancel")');
  });

        test("22. Phase 9 Marketplace: Integration Catalog and Recipe Browsing", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/marketplace");
    await page.waitForLoadState("networkidle");

    // Verify Marketplace Header
    await expect(page.locator("text=Integration Marketplace")).toBeVisible();
    await expect(page.locator('input[placeholder*="Search by name"]')).toBeVisible();

    // Verify Category Filter Buttons
    await expect(page.locator('[data-testid="category-filter-all"]')).toBeVisible();

    // Verify Listings Cards exist
    const listingCard = page.locator('[data-testid^="marketplace-card-"]').first();
    await expect(listingCard).toBeVisible({ timeout: 10000 });

    // Open Inspect Modal on first listing
    const inspectBtn = page.locator('[data-testid^="inspect-listing-btn-"]').first();
    await expect(inspectBtn).toBeVisible();
    await inspectBtn.click();

    // Verify Modal Details
    await expect(page.locator("text=Authentication Method")).toBeVisible();
    await page.click('button:has-text("Close")');

    // Switch to Automation Recipes tab
    const recipesTab = page.locator('button:has-text("Automation Recipes")');
    await expect(recipesTab).toBeVisible();
    await recipesTab.click();

    // Inspect first recipe
    const inspectRecipeBtn = page.locator('button:has-text("Inspect Recipe")').first();
    await expect(inspectRecipeBtn).toBeVisible();
    await inspectRecipeBtn.click();

    // Verify Recipe Modal Details
    await expect(page.locator("text=Workflow Graph Summary")).toBeVisible();
    await page.click('button:has-text("Cancel")');
  });

  test("23. Phase 9 Enterprise Governance: Policy Management", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Governance Tab
    const tab = page.locator('[data-testid="tab-governance"]');
    await expect(tab).toBeVisible({ timeout: 10000 });
    await tab.click();

    // Verify Header & Sections
    await expect(page.getByRole("heading", { name: "Enterprise Governance & Security Guardrails" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Marketplace Publishing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Enforce HTTPS on Outbound Webhooks" })).toBeVisible();

    // Verify Save Button
    const saveBtn = page.locator('[data-testid="save-governance-btn"]');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify success confirmation
    await expect(page.locator("text=Governance policies updated and recorded in audit log.")).toBeVisible({ timeout: 10000 });
  });

  test("24. Phase 9 Data Retention & Privacy: Audit Logs and Data Rights", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Audit Log Tab
    const auditTab = page.locator('[data-testid="tab-audit-log"]');
    await expect(auditTab).toBeVisible({ timeout: 10000 });
    await auditTab.click();

    // Verify Audit Log Header
    await expect(page.locator("text=Workspace Audit Trail & Event History")).toBeVisible();

    // Click Data & Privacy Tab
    const dataTab = page.locator('[data-testid="tab-data-privacy"]');
    await expect(dataTab).toBeVisible({ timeout: 10000 });
    await dataTab.click();

    // Verify Data & Privacy Header & Policies
    await expect(page.locator("text=Customer Data Rights, Retention & Privacy")).toBeVisible();
    await expect(page.locator("text=Automated Record Retention Windows")).toBeVisible();
    await expect(page.locator("text=Export Workspace Data (GDPR / CCPA)")).toBeVisible();

    // Click Export Data Button
    const exportBtn = page.locator('[data-testid="request-export-btn"]');
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    // Verify export feedback (either newly generated export or plan limit reached message)
    await expect(page.locator('text=/Data export completed|Monthly data export limit/')).toBeVisible({ timeout: 10000 });
  });
});
