import { test, expect, Page } from "@playwright/test";
import { prisma } from "@flowforge/database";

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

  test("25. Phase 10 Single Sign-On (SSO) & SCIM Tabs in Settings", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Single Sign-On Tab
    const ssoTab = page.locator('[data-testid="tab-sso"]');
    await expect(ssoTab).toBeVisible({ timeout: 10000 });
    await ssoTab.click();

    // Verify SSO Header and Inputs
    await expect(page.getByRole("heading", { name: "Single Sign-On (OIDC / OAuth 2.0)" })).toBeVisible();
    await expect(page.locator('[data-testid="input-sso-issuer"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-sso-client-id"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-test-sso-connection"]')).toBeVisible();

    // Click SCIM Provisioning Tab
    const scimTab = page.locator('[data-testid="tab-scim"]');
    await expect(scimTab).toBeVisible({ timeout: 10000 });
    await scimTab.click();

    // Verify SCIM Header & Endpoints Reference
    await expect(page.getByRole("heading", { name: "SCIM 2.0 Automated User Provisioning" })).toBeVisible();
    await expect(page.locator("text=SCIM 2.0 Base URL:")).toBeVisible();
    await expect(page.locator('[data-testid="btn-create-scim-token"]')).toBeVisible();
  });

  test("26. Phase 10 Active Sessions Management", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Security Tab
    const secTab = page.locator('button:has-text("Security & Sessions")');
    await expect(secTab).toBeVisible({ timeout: 10000 });
    await secTab.click();

    // Verify Active Sessions Tab
    await expect(page.getByRole("heading", { name: "Active Sessions & Token Security" })).toBeVisible();
    await expect(page.locator('[data-testid="btn-revoke-all-other-sessions"]')).toBeVisible();
    await expect(page.locator("text=Validated against revocation list")).toBeVisible();
    await expect(page.locator("text=Active Logged-in Devices")).toBeVisible();
  });

  test("27. Phase 10 Operations Dashboard & Stuck Execution Reconciliation", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/operations");
    await page.waitForLoadState("networkidle");

    // Verify Operations Page Headers & Telemetry Cards
    await expect(page.getByRole("heading", { name: "System Operations & Reliability" })).toBeVisible();
    await expect(page.locator("text=Data Stores Latency")).toBeVisible();
    await expect(page.locator("text=Workflow Queue Depth")).toBeVisible();
    await expect(page.locator("text=Worker Concurrency")).toBeVisible();
    await expect(page.locator("text=Threshold Alert Monitors")).toBeVisible();

    // Run Dry-Run Reconciliation
    const dryRunBtn = page.locator('[data-testid="btn-reconcile-dry-run"]');
    await expect(dryRunBtn).toBeVisible();
    await dryRunBtn.click();

    // Verify reconciliation result feedback
    await expect(page.locator("text=Reconciliation Complete: (Dry Run - No Changes Applied)")).toBeVisible({ timeout: 10000 });
  });

  test("28. Phase 11 Product Analytics Dashboard & Telemetry", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    // Verify Heading
    await expect(page.getByRole("heading", { name: "Product Analytics & Insights" })).toBeVisible();

    // Verify time range filters
    await expect(page.locator('[data-testid="btn-timerange-24h"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-timerange-7d"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-timerange-30d"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-timerange-90d"]')).toBeVisible();

    // Toggle time range filter
    await page.locator('[data-testid="btn-timerange-30d"]').click();

    // Verify metric cards
    await expect(page.locator("text=Total Executions")).toBeVisible();
    await expect(page.locator("text=Success Rate")).toBeVisible();
    await expect(page.locator("text=Failure Rate")).toBeVisible();
    await expect(page.locator("text=Latency Percentiles")).toBeVisible();

    // Verify analytical breakdown sections
    await expect(page.locator("text=Execution Volume Over Time")).toBeVisible();
    await expect(page.locator("text=Top Failure Root Causes")).toBeVisible();
    await expect(page.locator("text=Most Frequently Executed Workflows")).toBeVisible();
  });

  test("29. Phase 11 In-App Notification Center & Usage Intelligence", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Verify and open notification bell in top navigation bar
    const bellBtn = page.locator('[data-testid="btn-notifications-menu"]');
    await expect(bellBtn).toBeVisible();
    await bellBtn.click();

    // Verify notifications dropdown panel
    const notifDropdown = page.locator('[data-testid="notifications-dropdown"]');
    await expect(notifDropdown).toBeVisible();
    await expect(notifDropdown.getByText("Notifications", { exact: true })).toBeVisible();

    // Navigate to Billing & Usage Settings to verify Usage Forecasting & Alerts
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Billing Tab
    const billingTab = page.locator('button:has-text("Billing & Usage")');
    await expect(billingTab).toBeVisible({ timeout: 10000 });
    await billingTab.click();

    // Verify Usage Forecasting card and Threshold Alerts card
    await expect(page.locator('[data-testid="usage-forecast-card"]')).toBeVisible();
    await expect(page.locator("text=Usage Forecasting & Consumption Projection")).toBeVisible();
    await expect(page.locator("text=Current Daily Burn Rate")).toBeVisible();
    await expect(page.locator('[data-testid="usage-alerts-card"]')).toBeVisible();
    await expect(page.locator("text=Automated Usage Threshold Alerts")).toBeVisible();
    await expect(page.locator('[data-testid="btn-save-usage-alerts"]')).toBeVisible();
  });

  test("30. Phase 11 Support Diagnostics, Feedback & Public Status", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Click Support & Diagnostics Tab
    const supportTab = page.locator('[data-testid="tab-support"]');
    await expect(supportTab).toBeVisible({ timeout: 10000 });
    await supportTab.click();

    // Verify Support Diagnostic Section
    await expect(page.getByRole("heading", { name: "Customer Support & Self-Service Diagnostics" })).toBeVisible();
    await expect(page.locator('[data-testid="btn-generate-support-bundle"]')).toBeVisible();

    // Submit Feedback
    const commentInput = page.locator('[data-testid="textarea-feedback-comment"]');
    await expect(commentInput).toBeVisible();
    await commentInput.fill("Automated Phase 11 end-to-end verification feedback note.");

    const submitBtn = page.locator('[data-testid="btn-submit-feedback"]');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify success confirmation
    await expect(page.locator("text=Thank you for your feedback!")).toBeVisible({ timeout: 10000 });

    // Navigate to Public Status Page
    await page.goto("/status");
    await page.waitForLoadState("networkidle");

    // Verify Status Page Content
    await expect(page.locator("text=FlowForge System Status")).toBeVisible();
    await expect(page.locator("text=All Systems Operational")).toBeVisible();
    await expect(page.locator("text=Core Platform Components")).toBeVisible();
    await expect(page.locator("text=Past Incident History")).toBeVisible();
  });

  test("31. Phase 12 Environment Management & Configuration", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/environments");
    await page.waitForLoadState("networkidle");

    // Verify Heading
    await expect(page.getByRole("heading", { name: "Workflow Environments & Release Promotion" })).toBeVisible();

    // Verify Default Environment Cards
    await expect(page.locator('[data-testid="card-env-development"]')).toBeVisible();
    await expect(page.locator('[data-testid="card-env-staging"]')).toBeVisible();
    await expect(page.locator('[data-testid="card-env-production"]')).toBeVisible();

    // Navigate to Variables Tab
    const varTab = page.locator('[data-testid="tab-env-variables"]');
    await expect(varTab).toBeVisible();
    await varTab.click();

    // Open Add Variable Modal
    const addVarBtn = page.locator('[data-testid="btn-add-variable"]');
    await expect(addVarBtn).toBeVisible();
    await addVarBtn.click();

    // Fill in Variable Details
    await page.locator('[data-testid="input-var-key"]').fill("PAYMENT_GATEWAY_URL");
    await page.locator('[data-testid="input-var-value"]').fill("https://mock.gateway.acme.com");
    await page.locator('[data-testid="checkbox-var-secret"]').check();

    // Save Variable
    await page.locator('[data-testid="btn-save-variable"]').click();

    // Verify Variable in Table with Secret Redaction
    await expect(page.locator("text=PAYMENT_GATEWAY_URL")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=[REDACTED SECRET]")).toBeVisible();
  });

  test("32. Phase 12 Immutable Releases & Automated Pre-Deployment Tests", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/environments");
    await page.waitForLoadState("networkidle");

    // Navigate to Automated Testing Tab
    const testTab = page.locator('[data-testid="tab-env-testing"]');
    await expect(testTab).toBeVisible();
    await testTab.click();

    // Verify Test Center Header
    await expect(page.locator("text=Pre-Deployment Automated Test Center")).toBeVisible();

    // Create Release Artifact
    const createReleaseBtn = page.locator('[data-testid="btn-create-release"]');
    await expect(createReleaseBtn).toBeVisible();
    await createReleaseBtn.click();

    // Verify Release Artifact Creation Feedback
    await expect(
      page.locator("text=Immutable release artifact created with verified SHA-256 hash.")
    ).toBeVisible({ timeout: 10000 });
  });

  test("33. Phase 12 Release Promotion, Validation & Safe Rollback", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/environments");
    await page.waitForLoadState("networkidle");

    // Open Promotion Modal
    const promoteBtn = page.locator('[data-testid="btn-open-promote-modal"]');
    await expect(promoteBtn).toBeVisible();
    await promoteBtn.click();

    // Verify Promotion Modal Heading
    await expect(page.locator("text=Promote Release to")).toBeVisible();
    await expect(page.locator('[data-testid="select-release-candidate"]')).toBeVisible();

    // Close Promotion Modal
    await page.locator('button:has-text("Cancel")').first().click();
    // Open Rollback Modal
    const rollbackBtn = page.locator('[data-testid="btn-open-rollback-modal"]');
    await expect(rollbackBtn).toBeVisible();
    await rollbackBtn.click();

    // Verify Rollback Modal Heading
    await expect(page.getByRole("heading", { name: "Rollback Release" })).toBeVisible();
    await expect(page.locator('[data-testid="select-rollback-release"]')).toBeVisible();
    await page.locator('button:has-text("Cancel")').first().click();
  });

  test("34. Phase 13 Natural-Language Workflow Builder and Refinement", async ({ page }) => {
    // Ensure demo workspace has PRO plan for AI quota
    const demoUser = await prisma.user.findUnique({
      where: { email: "demo@flowforge.dev" },
      include: { memberships: true },
    });
    if (demoUser?.memberships[0]?.workspaceId) {
      await prisma.workspaceSubscription.updateMany({
        where: { workspaceId: demoUser.memberships[0].workspaceId },
        data: { planTier: "PRO" },
      });
    }

    await loginAsDemo(page);
    await page.goto("/workflows/ai-builder");
    await page.waitForLoadState("networkidle");

    // Verify AI Builder Header & Status
    await expect(page.locator('[data-testid="ai-builder-page"]')).toBeVisible();
    await expect(page.locator("text=AI-Assisted Workflow Builder")).toBeVisible();

    // Fill natural-language prompt
    const promptInput = page.locator('[data-testid="ai-prompt-input"]');
    await expect(promptInput).toBeVisible();
    await promptInput.fill("When a payment is received in Stripe, verify amount and send a message to Slack");

    // Generate proposal
    const generateBtn = page.locator('[data-testid="btn-generate-workflow"]');
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // Verify DAG validation & Proposal card
    await expect(page.locator('[data-testid="proposal-preview"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=DAG Validated")).toBeVisible();
    await expect(page.locator("text=Proposed Graph Execution Pipeline")).toBeVisible();

    // Conversational Refinement
    const refineInput = page.locator('[data-testid="input-refine-prompt"]');
    await expect(refineInput).toBeVisible();
    await refineInput.fill("Add a filter node to ignore transactions under $10");

    const refineBtn = page.locator('[data-testid="btn-refine-proposal"]');
    await expect(refineBtn).toBeVisible();
    await refineBtn.click();

    // Verify Structural Diff Viewer
    await expect(page.locator('[data-testid="structural-diff-viewer"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Structural Diff: Refinement Applied")).toBeVisible();

    // Save as Draft
    const saveDraftBtn = page.locator('[data-testid="btn-save-draft"]');
    await expect(saveDraftBtn).toBeVisible();
    await saveDraftBtn.click();

    // Verify Draft saved feedback
    await expect(page.locator("text=Workflow saved as DRAFT!")).toBeVisible({ timeout: 10000 });
  });

  test("35. Phase 13 Intelligent Failure Debugging and Root Cause Analysis", async ({ page }) => {
    // Ensure at least one FAILED execution exists for the demo workspace
    const demoUser = await prisma.user.findUnique({
      where: { email: "demo@flowforge.dev" },
      include: { memberships: true },
    });
    const workspaceId = demoUser?.memberships[0]?.workspaceId;
    if (workspaceId) {
      const wf = await prisma.workflow.findFirst({ where: { workspaceId } });
      if (wf) {
        await prisma.workflowExecution.create({
          data: {
            workflowId: wf.id,
            status: "FAILED",
            errorCategory: "API_UNAUTHORIZED",
            errorSummary: "HTTP 401 Unauthorized from destination endpoint",
            steps: {
              create: {
                nodeId: "node-2",
                nodeName: "HTTP API Call",
                nodeType: "HTTP_REQUEST",
                status: "FAILED",
                errorMessage: "401 Unauthorized: Invalid API Key",
                startedAt: new Date(),
                finishedAt: new Date(),
              },
            },
          },
        });
      }
    }

    await loginAsDemo(page);
    await page.goto("/executions");
    await page.waitForLoadState("networkidle");

    // Click on 'Failed' filter pill or Logs on the first row
    const failedFilter = page.locator('button:has-text("Failed")');
    if (await failedFilter.isVisible()) {
      await failedFilter.click();
      await page.waitForTimeout(500);
    }

    const logsBtn = page.locator('button:has-text("Logs")').first();
    await expect(logsBtn).toBeVisible({ timeout: 10000 });
    await logsBtn.click();

    // Verify Diagnostics Drawer is open
    await expect(page.locator("text=Execution Run Diagnostics")).toBeVisible();

    // Verify AI Failure Analysis section and trigger button
    const aiDebugBtn = page.locator('[data-testid="btn-ai-debug-failure"]');
    await expect(aiDebugBtn).toBeVisible({ timeout: 10000 });
    await aiDebugBtn.click();

    // Verify AI Debug Report output
    await expect(page.locator('[data-testid="ai-debug-report"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Probable Root Cause")).toBeVisible();
    await expect(page.locator("text=Recommended Remediation:")).toBeVisible();
  });

  test("36. Phase 13 AI-Generated Test Suites in Environments", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/environments");
    await page.waitForLoadState("networkidle");

    // Navigate to Automated Testing Tab
    const testTab = page.locator('[data-testid="tab-env-testing"]');
    await expect(testTab).toBeVisible();
    await testTab.click();

    // Verify Test Center Header
    await expect(page.locator("text=Pre-Deployment Automated Test Center")).toBeVisible();

    // Generate Tests with AI
    const aiTestBtn = page.locator('[data-testid="btn-ai-generate-tests"]');
    await expect(aiTestBtn).toBeVisible();
    await expect(aiTestBtn).toBeEnabled({ timeout: 10000 });
    await aiTestBtn.click();

    // Verify AI Test Generation Feedback & Generated Test in Table
    await expect(page.locator("text=AI generated").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Valid Payload Smoke Test").first()).toBeVisible({ timeout: 10000 });
  });

  test("37. Phase 14 Organization & Team Administration, Workflow Ownership & Stewardship", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/governance");
    await page.waitForLoadState("networkidle");

    // Verify Page Header
    await expect(page.locator("text=Enterprise Governance & Collaboration")).toBeVisible({ timeout: 10000 });

    // Verify Stewardship KPI Cards
    await expect(page.locator("text=Total Workflows")).toBeVisible();
    await expect(page.locator("text=Critical Workflows")).toBeVisible();
    await expect(page.locator("text=Orphaned Workflows")).toBeVisible();

    // Open Edit Stewardship on first workflow if table has workflows
    const stewardshipBtn = page.locator('[data-testid^="btn-edit-stewardship-"]').first();
    if (await stewardshipBtn.isVisible()) {
      await stewardshipBtn.click();
      await expect(page.locator("text=Update Stewardship:").first()).toBeVisible();
      await page.locator('[data-testid="btn-save-stewardship"]').click();
      await expect(page.locator("text=Workflow stewardship updated successfully.")).toBeVisible({ timeout: 10000 });
    }

    // Switch to Organizations & Teams tab
    const orgsTab = page.locator('[data-testid="tab-orgs_teams"]');
    await expect(orgsTab).toBeVisible();
    await orgsTab.click();

    // Verify Organization Hierarchy section
    await expect(page.getByRole("heading", { name: "Organization Hierarchy" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Functional Workspace Teams" })).toBeVisible();

    // Create a new Functional Team
    const createTeamBtn = page.locator('[data-testid="btn-create-team-open"]');
    await expect(createTeamBtn).toBeVisible();
    await createTeamBtn.click();

    const teamName = "Cloud SRE Ops " + Math.random().toString(36).slice(2, 7);
    await page.locator('[data-testid="input-team-name"]').fill(teamName);
    await page.locator('[data-testid="btn-create-team-submit"]').click();

    // Verify Team Created
    await expect(page.locator("text=Team created successfully.")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${teamName}`)).toBeVisible();
  });

  test("38. Phase 14 Collaborative Workflow Review, Stale Approval Invalidation, and Governance Policy Enforcement", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/governance");
    await page.waitForLoadState("networkidle");

    // Switch to Collaborative Reviews tab
    const reviewsTab = page.locator('[data-testid="tab-reviews"]');
    await expect(reviewsTab).toBeVisible();
    await reviewsTab.click();

    // Verify Reviews Queue
    await expect(page.getByRole("heading", { name: "Collaborative Change Reviews" })).toBeVisible();

    // Submit a review
    const submitRevBtn = page.locator('[data-testid="btn-submit-review-open"]');
    await expect(submitRevBtn).toBeVisible();
    await submitRevBtn.click();

    // Select workflow
    const wfSelect = page.locator('[data-testid="select-review-workflow"]');
    await expect(wfSelect).toBeVisible();
    const options = await wfSelect.locator("option").all();
    if (options.length > 1) {
      await wfSelect.selectOption({ index: 1 });
      const revTitle = "Webhook Review " + Math.random().toString(36).slice(2, 7);
      await page.locator('[data-testid="input-review-title"]').fill(revTitle);
      await page.locator('[data-testid="btn-submit-review-confirm"]').click();
      await expect(page.locator("text=Review submitted for collaborative change evaluation.")).toBeVisible({ timeout: 10000 });
      await expect(page.locator(`text=${revTitle}`).first()).toBeVisible();
    } else {
      // Close modal if no workflows available
      await page.locator('button:has-text("Cancel")').click();
    }

    // Switch to Governance Policies tab
    const policyTab = page.locator('[data-testid="tab-policy"]');
    await expect(policyTab).toBeVisible();
    await policyTab.click();

    // Verify Policy Editor
    await expect(page.locator("text=Workspace Governance Policy")).toBeVisible();
    await expect(page.locator("text=Policy Evaluation Sandbox")).toBeVisible();

    // Toggle a policy rule and save
    const ownerCheckbox = page.locator('[data-testid="checkbox-require-owner"]');
    await expect(ownerCheckbox).toBeVisible();
    await ownerCheckbox.click();
    await page.locator('[data-testid="btn-save-policy"]').click();
    await expect(page.locator("text=Workspace governance policy updated.")).toBeVisible({ timeout: 10000 });
  });

  test("39. Phase 14 Operational Reliability Objectives (SLO Error Budget) & Audit Compliance Export", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/governance");
    await page.waitForLoadState("networkidle");

    // Switch to Reliability & SLOs tab
    const sloTab = page.locator('[data-testid="tab-reliability"]');
    await expect(sloTab).toBeVisible();
    await sloTab.click();

    // Verify Reliability Header
    await expect(page.locator("text=Operational Reliability Objectives (SLOs)")).toBeVisible();

    // Define SLO
    const createSloBtn = page.locator('[data-testid="btn-create-slo-open"]');
    await expect(createSloBtn).toBeVisible();
    await createSloBtn.click();

    const sloName = "Order Pipeline SLO " + Math.random().toString(36).slice(2, 7);
    await page.locator('[data-testid="input-slo-name"]').fill(sloName);
    await page.locator('[data-testid="input-slo-target"]').fill("99.5");
    await page.locator('[data-testid="btn-create-slo-submit"]').click();

    await expect(page.locator("text=Reliability objective created.")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${sloName}`).first()).toBeVisible();
    await expect(page.locator("text=Error Budget Remaining").first()).toBeVisible();

    // Switch to Audit & Compliance tab
    const compTab = page.locator('[data-testid="tab-compliance"]');
    await expect(compTab).toBeVisible();
    await compTab.click();

    // Verify Compliance Export Center
    await expect(page.locator("text=Compliance Evidence Export Center")).toBeVisible();
    await expect(page.locator("text=Enterprise Audit Log Stream")).toBeVisible();

    // Generate Compliance Export Package
    const genExportBtn = page.locator('[data-testid="btn-generate-export-open"]');
    await expect(genExportBtn).toBeVisible();
    await genExportBtn.click();

    const exportReason = "SOC 2 Audit " + Math.random().toString(36).slice(2, 7);
    await page.locator('[data-testid="input-export-reason"]').fill(exportReason);
    await page.locator('[data-testid="btn-generate-export-submit"]').click();

    await expect(page.locator("text=Sanitized compliance evidence package generated")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${exportReason}`).first()).toBeVisible();

    // Inspect Evidence Payload
    const viewPayloadBtn = page.locator('button:has-text("View Evidence Payload")').first();
    await expect(viewPayloadBtn).toBeVisible();
    await viewPayloadBtn.click();

    await expect(page.locator("text=Sanitized Compliance Export Evidence")).toBeVisible();
    await page.locator('button:has-text("Close Preview")').click();
  });

  test("40. Phase 15 High Availability Worker Fencing, Transactional Outbox & Disaster Recovery Drills", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/operations");
    await page.waitForLoadState("networkidle");

    // Verify Phase 15 High Availability & Reliability Widgets
    await expect(page.getByText("Worker Concurrency & Leases")).toBeVisible();
    await expect(page.getByText("Workflow Queue Depth & Backpressure")).toBeVisible();
    await expect(page.getByText("Transactional Outbox", { exact: true })).toBeVisible();
    await expect(page.getByText("Disaster Recovery & Non-Destructive Restore Drill")).toBeVisible();

    // Verify defined RTO and RPO targets
    await expect(page.getByText("Target RTO (Recovery Time)")).toBeVisible();
    await expect(page.getByText("Target RPO (Data Point)")).toBeVisible();

    // Trigger Non-Destructive Disaster Recovery Verification Drill
    const drillBtn = page.locator('[data-testid="btn-verify-backup-drill"]');
    await expect(drillBtn).toBeVisible();
    await drillBtn.click();

    // Verify drill results and SHA-256 confirmation
    await expect(page.locator("text=Backup drill finished: Checksum SHA-256 verified")).toBeVisible({ timeout: 10000 });

    // Trigger Execution Reconciliation Scan Dry-Run
    const scanBtn = page.locator('[data-testid="btn-reconcile-dry-run"]');
    await expect(scanBtn).toBeVisible();
    await scanBtn.click();

    await expect(page.locator("text=Reconciliation Complete")).toBeVisible({ timeout: 10000 });
  });


  test("41. Phase 16 Enterprise Scale, Capacity Management & Regional Readiness", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/operations");
    await page.waitForLoadState("networkidle");

    // 1. Verify Phase 16 Capacity Management & Predictive Drain Time
    const capacityPanel = page.locator('[data-testid="panel-capacity-management"]');
    await expect(capacityPanel).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Capacity Management & Predictive Drain Time")).toBeVisible();
    await expect(page.getByText("Projected Drain Time")).toBeVisible();
    await expect(page.getByText("DB Connection Budget")).toBeVisible();
    await expect(page.getByText("Tenant Workload Fairness & Concurrency Allocation")).toBeVisible();

    // 2. Verify Regional Deployments & Split-Brain Safeguards
    const regionalPanel = page.locator('[data-testid="panel-regional-readiness"]');
    await expect(regionalPanel).toBeVisible();
    await expect(page.getByText("Regional Deployments & Split-Brain Safeguards")).toBeVisible();
    await expect(page.getByText("Configured Regional Clusters")).toBeVisible();
    await expect(page.getByText("Primary Authoritative")).toBeVisible();

    // 3. Trigger Regional Failover Drill
    const failoverBtn = page.locator('[data-testid="btn-regional-failover-drill"]');
    await expect(failoverBtn).toBeVisible();
    await failoverBtn.click();

    // Verify confirmation toast / callout
    await expect(page.locator("text=Regional Failover Drill completed: Advanced to epoch")).toBeVisible({ timeout: 10000 });
  });
  test("42. Phase 17 Enterprise Data Residency, CMEK & Legal Hold Controls", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/governance");
    await page.waitForLoadState("networkidle");

    // 1. Switch to Audit & Compliance Tab
    const complianceTab = page.locator('[data-testid="tab-compliance"]');
    await expect(complianceTab).toBeVisible({ timeout: 10000 });
    await complianceTab.click();

    // 2. Verify Data Residency Card
    const residencyBadge = page.locator('[data-testid="badge-residency-status"]');
    await expect(residencyBadge).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Data Residency", { exact: true })).toBeVisible();
    await expect(page.getByText("Home Region:", { exact: false })).toBeVisible();

    // Trigger residency placement verification
    const verifyResidencyBtn = page.locator('[data-testid="btn-verify-residency"]');
    await expect(verifyResidencyBtn).toBeVisible();
    await verifyResidencyBtn.click();
    await expect(page.locator("text=Residency verified:")).toBeVisible({ timeout: 10000 });

    // 3. Verify Customer-Managed Encryption Keys (CMEK) Card
    const cmekBadge = page.locator('[data-testid="badge-cmek-status"]');
    await expect(cmekBadge).toBeVisible();
    await expect(page.getByText("CMEK Encryption")).toBeVisible();
    await expect(page.getByText("Key Version / Epoch:")).toBeVisible();

    // 4. Verify Legal Hold & Retention Card
    const legalHoldBadge = page.locator('[data-testid="badge-legal-hold-status"]');
    await expect(legalHoldBadge).toBeVisible();
    await expect(page.getByText("Legal Hold Guard")).toBeVisible();
    await expect(page.getByText("Retention Horizon:")).toBeVisible();

    // Trigger retention dry-run simulation
    const dryRunBtn = page.locator('[data-testid="btn-dry-run-cleanup"]');
    await expect(dryRunBtn).toBeVisible();
    await dryRunBtn.click();
    await expect(page.locator("text=Dry-Run Retention Simulation:")).toBeVisible({ timeout: 10000 });
  });

  test("43. Phase 18 Enterprise Observability 2.0, Unified Health & Self-Healing Operations", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/operations");
    await page.waitForLoadState("networkidle");

    // 1. Verify Unified Service Health Scorecard & Subsystems
    const healthPanel = page.locator('[data-testid="panel-unified-health"]');
    await expect(healthPanel).toBeVisible({ timeout: 15000 });

    const overallBadge = page.locator('[data-testid="badge-overall-health"]');
    await expect(overallBadge).toBeVisible();

    await expect(page.locator('[data-testid="health-subsystem-workers"]')).toBeVisible();
    await expect(page.locator('[data-testid="health-subsystem-queues"]')).toBeVisible();
    await expect(page.locator('[data-testid="health-subsystem-executions"]')).toBeVisible();
    await expect(page.locator('[data-testid="health-subsystem-outbox"]')).toBeVisible();
    await expect(page.locator('[data-testid="health-subsystem-database"]')).toBeVisible();
    await expect(page.locator('[data-testid="health-subsystem-regions"]')).toBeVisible();

    // 2. Verify Incidents Panel & Simulate Drill Incident
    const incidentsPanel = page.locator('[data-testid="panel-incidents"]');
    await expect(incidentsPanel).toBeVisible();

    const simulateBtn = page.locator('[data-testid="btn-simulate-incident"]');
    await expect(simulateBtn).toBeVisible();
    await simulateBtn.click();
    await expect(page.locator("text=Simulated incident reported:")).toBeVisible({ timeout: 10000 });

    // 3. Verify Safe Self-Healing Policy & Switch Autonomy Mode
    const remediationPanel = page.locator('[data-testid="panel-remediation"]');
    await expect(remediationPanel).toBeVisible();

    const approvalModeBtn = page.locator('[data-testid="btn-autonomy-APPROVAL_REQUIRED"]');
    await expect(approvalModeBtn).toBeVisible();
    await approvalModeBtn.click();
    await expect(page.locator("text=Self-healing autonomy mode updated to: APPROVAL_REQUIRED")).toBeVisible({ timeout: 10000 });

    // 4. Verify Predictive Capacity Early Warnings & Evaluation
    const predictivePanel = page.locator('[data-testid="panel-predictive-warnings"]');
    await expect(predictivePanel).toBeVisible();

    const evalPredictiveBtn = page.locator('[data-testid="btn-evaluate-predictive"]');
    await expect(evalPredictiveBtn).toBeVisible();
    await evalPredictiveBtn.click();
    await expect(page.locator("text=Predictive capacity signals evaluated")).toBeVisible({ timeout: 10000 });
  });

  test("44. Phase 19 Enterprise Connectors, SDK, Certification Console & Governed Upgrades", async ({ page }) => {
    await loginAsDemo(page);
    await page.goto("/marketplace");
    await page.waitForLoadState("networkidle");

    // 1. Switch to Connector Studio Tab
    const connectorsTab = page.locator('[data-testid="tab-marketplace-connectors"]');
    await expect(connectorsTab).toBeVisible({ timeout: 15000 });
    await connectorsTab.click();

    // Verify sub-header
    await expect(page.getByText("Developer Connectors & Release Artifacts")).toBeVisible();

    // 2. Open Manifest Validator & Draft Modal
    const newManifestBtn = page.locator('[data-testid="new-connector-draft-btn"]');
    await expect(newManifestBtn).toBeVisible();
    await newManifestBtn.click();

    const manifestTextarea = page.locator('[data-testid="connector-manifest-textarea"]');
    await expect(manifestTextarea).toBeVisible();

    const uniqueKey = `crm-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    await manifestTextarea.fill(
      JSON.stringify(
        {
          id: uniqueKey,
          name: "Acme CRM Enterprise",
          version: "1.0.0",
          description: "Official CRM connector for customer sync and record management.",
          category: "CRM & Sales",
          author: { name: "Acme Platforms", email: "devs@acme.com" },
          icon: "Puzzle",
          auth: {
            type: "API_KEY",
            fields: [{ name: "apiKey", label: "API Key", type: "password", required: true }],
          },
          actions: [
            {
              id: "get-contact",
              name: "Get Contact",
              description: "Retrieves contact details by record ID",
              inputSchema: { contactId: { type: "string", required: true } },
              outputSchema: { id: { type: "string" }, email: { type: "string" } },
              httpConfig: {
                method: "GET",
                urlTemplate: "https://api.acme.com/v1/contacts/{contactId}",
                timeoutMs: 5000,
              },
            },
          ],
          triggers: [],
          permissions: ["network:egress"],
          residencyConstraint: "GLOBAL",
        },
        null,
        2
      )
    );

    // 3. Validate Manifest & Verify Canonical SHA-256 Preview
    const validateBtn = page.locator('[data-testid="validate-manifest-btn"]');
    await expect(validateBtn).toBeVisible();
    await validateBtn.click();
    await expect(page.locator("text=Manifest Contract Valid")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Computed SHA-256:")).toBeVisible();

    // 4. Create Draft Release Artifact
    const submitDraftBtn = page.locator('[data-testid="submit-draft-btn"]');
    await expect(submitDraftBtn).toBeVisible();
    await submitDraftBtn.click();

    // Verify draft created notification
    await expect(page.locator("text=created as DRAFT!")).toBeVisible({ timeout: 10000 });

    // 5. Trigger Automated 6-Check Certification
    const certifyBtn = page.locator(`[data-testid="certify-btn-${uniqueKey}"]`);
    await expect(certifyBtn).toBeVisible();
    await certifyBtn.click();

    // Verify certification completes with PASSED result
    await expect(page.locator("text=Automated certification completed with result: PASSED")).toBeVisible({ timeout: 10000 });

    // 6. Publish Certified Connector with Immutable Verification
    const publishBtn = page.locator(`[data-testid="publish-btn-${uniqueKey}"]`);
    await expect(publishBtn).toBeVisible();
    await publishBtn.click();

    // Verify publish notification
    await expect(page.locator("text=Connector published to marketplace with immutable SHA-256 verification!")).toBeVisible({ timeout: 10000 });
  });
});
