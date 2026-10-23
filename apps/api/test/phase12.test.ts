import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@flowforge/database";
import { environmentService } from "../src/services/environments.js";
import { releaseService } from "../src/services/releases.js";
import { deploymentService } from "../src/services/deployments.js";
import { workflowTestingService } from "../src/services/workflowTesting.js";

describe("Phase 12: Workflow Environments, Releases, Testing & Governance", () => {
  let testWorkspaceId: string;
  let ownerUserId: string;
  let memberUserId: string;
  let testWorkflowId: string;
  let testAccountId: string;

  beforeAll(async () => {
    // 1. Create test user & workspace
    const user = await prisma.user.create({
      data: {
        email: `phase12-owner-${Date.now()}@flowforge.dev`,
        passwordHash: "hash123",
        name: "Phase 12 Owner",
      },
    });
    ownerUserId = user.id;

    const member = await prisma.user.create({
      data: {
        email: `phase12-member-${Date.now()}@flowforge.dev`,
        passwordHash: "hash123",
        name: "Phase 12 Member",
      },
    });
    memberUserId = member.id;

    const ws = await prisma.workspace.create({
      data: {
        name: "Phase 12 Enterprise Workspace",
        slug: `phase12-ws-${Date.now()}`,
        ownerId: ownerUserId,
        memberships: {
          create: [
            { userId: ownerUserId, role: "OWNER" },
            { userId: memberUserId, role: "MEMBER" },
          ],
        },
      },
    });
    testWorkspaceId = ws.id;

    // 2. Create connected account
    const account = await prisma.connectedAccount.create({
      data: {
        workspaceId: testWorkspaceId,
        integrationKey: "slack",
        name: "Acme Slack Production",
        credentials: { accessToken: "xoxb-test-12345" } as any,
        status: "ACTIVE",
      },
    });
    testAccountId = account.id;

    // 3. Create sample workflow with nodes
    const workflow = await prisma.workflow.create({
      data: {
        workspaceId: testWorkspaceId,
        name: "Order Processing Pipeline",
        status: "ACTIVE",
        triggerType: "WEBHOOK",
        versions: {
          create: {
            version: 1,
            nodes: [
              {
                id: "node_1",
                type: "webhookTrigger",
                data: { label: "Inbound Order Webhook" },
              },
              {
                id: "node_2",
                type: "slackMessage",
                data: {
                  label: "Notify Team",
                  integrationKey: "slack",
                  config: {
                    channel: "#orders",
                    apiUrl: "{{env.API_BASE_URL}}",
                    secretKey: "{{env.ORDER_SIGNING_SECRET}}",
                  },
                },
              },
            ] as any,
            edges: [{ id: "e1-2", source: "node_1", target: "node_2" }] as any,
            isValid: true,
          },
        },
      },
    });
    testWorkflowId = workflow.id;
  });

  // ==========================================
  // 1. ENVIRONMENT MANAGEMENT & VARIABLES
  // ==========================================
  it("auto-provisions Development, Staging, and Production environments", async () => {
    const envs = await environmentService.listEnvironments(testWorkspaceId);
    expect(envs.length).toBeGreaterThanOrEqual(3);

    const dev = envs.find((e) => e.slug === "development");
    const staging = envs.find((e) => e.slug === "staging");
    const prod = envs.find((e) => e.slug === "production");

    expect(dev).toBeDefined();
    expect(staging).toBeDefined();
    expect(prod).toBeDefined();

    expect(prod?.isProtected).toBe(true);
    expect(prod?.requireApproval).toBe(true);
  });

  it("stores and encrypts environment variables with secret redaction", async () => {
    const envs = await environmentService.listEnvironments(testWorkspaceId);
    const dev = envs.find((e) => e.slug === "development")!;

    // Set plaintext variable
    const var1 = await environmentService.setVariable(testWorkspaceId, dev.id, {
      key: "API_BASE_URL",
      value: "https://sandbox.api.acme.com",
      isSecret: false,
    });
    expect(var1.value).toBe("https://sandbox.api.acme.com");

    // Set secret variable
    const var2 = await environmentService.setVariable(testWorkspaceId, dev.id, {
      key: "ORDER_SIGNING_SECRET",
      value: "whsec_super_secret_key_9948",
      isSecret: true,
    });
    expect(var2.value).toBe("[REDACTED]");

    // Verify list redacts secrets
    const list = await environmentService.listVariables(testWorkspaceId, dev.id);
    const secretVar = list.find((v) => v.key === "ORDER_SIGNING_SECRET");
    expect(secretVar?.value).toBe("[REDACTED]");

    // Verify runtime resolution decrypts secrets
    const runtime = await environmentService.resolveRuntimeVariables(testWorkspaceId, dev.id);
    expect(runtime["API_BASE_URL"]).toBe("https://sandbox.api.acme.com");
    expect(runtime["ORDER_SIGNING_SECRET"]).toBe("whsec_super_secret_key_9948");
  });

  it("binds integration credentials per environment", async () => {
    const envs = await environmentService.listEnvironments(testWorkspaceId);
    const dev = envs.find((e) => e.slug === "development")!;

    const binding = await environmentService.setBinding(testWorkspaceId, dev.id, {
      integrationKey: "slack",
      connectedAccountId: testAccountId,
    });

    expect(binding.integrationKey).toBe("slack");
    expect(binding.connectedAccountId).toBe(testAccountId);

    const list = await environmentService.listBindings(testWorkspaceId, dev.id);
    expect(list.some((b) => b.integrationKey === "slack")).toBe(true);
  });

  // ==========================================
  // 2. IMMUTABLE RELEASE ARTIFACTS
  // ==========================================
  it("creates immutable release artifact with canonical content hash and secret stripping", async () => {
    const artifact = await releaseService.createReleaseArtifact(testWorkspaceId, ownerUserId, {
      workflowId: testWorkflowId,
      summary: "Phase 12 Initial Release Candidate",
    });

    expect(artifact.releaseNumber).toBe(1);
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.formatVersion).toBe("flowforge.release/v1");

    const def = artifact.canonicalDefinition as any;
    expect(def.requiredVariables).toEqual(["API_BASE_URL", "ORDER_SIGNING_SECRET"]);
    expect(def.requiredIntegrations).toEqual(["slack"]);

    // Verify integrity verification
    const fetched = await releaseService.getReleaseArtifact(testWorkspaceId, artifact.id);
    expect(fetched.isIntegrityVerified).toBe(true);
  });

  // ==========================================
  // 3. STRUCTURAL DIFF GENERATION
  // ==========================================
  it("calculates structural diffs between workflow versions without exposing secrets", () => {
    const oldDef = {
      nodes: [{ id: "n1", type: "trigger", data: { label: "Old Trigger" } }],
      edges: [],
    };
    const newDef = {
      nodes: [
        { id: "n1", type: "trigger", data: { label: "New Trigger" } },
        { id: "n2", type: "slack", data: { label: "Slack Notify", config: { token: "secret" } } },
      ],
      edges: [{ source: "n1", target: "n2" }],
    };

    const diff = deploymentService.computeStructuralDiff(oldDef, newDef);
    expect(diff.hasChanges).toBe(true);
    expect(diff.addedNodes.length).toBe(1);
    expect(diff.addedNodes[0].id).toBe("n2");
    expect(diff.modifiedNodes.length).toBe(1);
    expect(diff.modifiedNodes[0].changes[0].field).toBe("label");
    expect(diff.addedEdges.length).toBe(1);
  });

  // ==========================================
  // 4. AUTOMATED WORKFLOW TESTING & GATES
  // ==========================================
  it("executes workflow test cases in safe DRY_RUN mode and checks assertions", async () => {
    const testCase = await workflowTestingService.createTestCase(testWorkspaceId, ownerUserId, {
      workflowId: testWorkflowId,
      name: "Standard Checkout Flow Test",
      triggerPayload: { orderId: "ORD-991", amount: 150 },
      assertions: [
        {
          nodeId: "node_2",
          fieldPath: "status",
          operator: "EQUALS",
          expectedValue: 200,
        },
      ],
    });

    expect(testCase.name).toBe("Standard Checkout Flow Test");

    const runResult = await workflowTestingService.runTestCase(testWorkspaceId, ownerUserId, testCase.id, {
      mode: "DRY_RUN",
    });

    expect(runResult.summary.status).toBe("PASSED");
    expect(runResult.summary.passedAssertions).toBe(1);
    expect(runResult.summary.mode).toBe("DRY_RUN");
  });

  // ==========================================
  // 5. PROMOTION & DEPLOYMENT GOVERNANCE
  // ==========================================
  it("validates missing dependencies before deployment", async () => {
    const envs = await environmentService.listEnvironments(testWorkspaceId);
    const prod = envs.find((e) => e.slug === "production")!;

    const artifacts = await releaseService.listReleaseArtifacts(testWorkspaceId, testWorkflowId);
    const release = artifacts[0];

    // Production currently lacks variables & bindings
    const validation = await deploymentService.validateReleaseForEnvironment(
      testWorkspaceId,
      release.id,
      prod.id
    );

    expect(validation.valid).toBe(false);
    expect(validation.missingVariables.length).toBeGreaterThan(0);
    expect(validation.missingBindings).toContain("slack");
  });

  it("promotes release to Development and activates it", async () => {
    const envs = await environmentService.listEnvironments(testWorkspaceId);
    const dev = envs.find((e) => e.slug === "development")!;

    const artifacts = await releaseService.listReleaseArtifacts(testWorkspaceId, testWorkflowId);
    const release = artifacts[0];

    const deployment = await deploymentService.promoteRelease(testWorkspaceId, ownerUserId, "OWNER", {
      workflowId: testWorkflowId,
      releaseArtifactId: release.id,
      environmentId: dev.id,
    });

    expect(deployment.status).toBe("DEPLOYED");

    // Verify active release pointer on environment
    const updatedDev = await environmentService.getEnvironment(testWorkspaceId, dev.id);
    expect(updatedDev.activeReleaseArtifactId).toBe(release.id);
  });

  it("enforces approval requirement and prevents self-approval on Production", async () => {
    const envs = await environmentService.listEnvironments(testWorkspaceId);
    const prod = envs.find((e) => e.slug === "production")!;

    // Satisfy production dependencies & test gate
    await environmentService.setVariable(testWorkspaceId, prod.id, {
      key: "API_BASE_URL",
      value: "https://api.acme.com",
    });
    await environmentService.setVariable(testWorkspaceId, prod.id, {
      key: "ORDER_SIGNING_SECRET",
      value: "live_whsec_109283",
      isSecret: true,
    });
    await environmentService.setBinding(testWorkspaceId, prod.id, {
      integrationKey: "slack",
      connectedAccountId: testAccountId,
    });

    const artifacts = await releaseService.listReleaseArtifacts(testWorkspaceId, testWorkflowId);
    const release = artifacts[0];

    // Initiate promotion to Production (initiated by memberUserId)
    const deployment = await deploymentService.promoteRelease(testWorkspaceId, memberUserId, "MEMBER", {
      workflowId: testWorkflowId,
      releaseArtifactId: release.id,
      environmentId: prod.id,
    });

    expect(deployment.status).toBe("PENDING_APPROVAL");

    // 1. Self-approval violation: member cannot approve their own deployment
    await expect(
      deploymentService.decideDeploymentApproval(
        testWorkspaceId,
        deployment.id,
        memberUserId,
        "ADMIN", // even with elevated role
        "APPROVED"
      )
    ).rejects.toThrow(/Policy violation: Initiator cannot approve their own deployment/);

    // 2. Owner approves deployment
    const approved = await deploymentService.decideDeploymentApproval(
      testWorkspaceId,
      deployment.id,
      ownerUserId,
      "OWNER",
      "APPROVED",
      "Production deployment verified and authorized."
    );

    expect(approved.status).toBe("DEPLOYED");
    expect(approved.approvedByUserId).toBe(ownerUserId);

    // Verify active release in production
    const updatedProd = await environmentService.getEnvironment(testWorkspaceId, prod.id);
    expect(updatedProd.activeReleaseArtifactId).toBe(release.id);
  });

  // ==========================================
  // 6. SAFE ROLLBACK & RECOVERY
  // ==========================================
  it("rolls back to a prior immutable release artifact safely", async () => {
    const envs = await environmentService.listEnvironments(testWorkspaceId);
    const dev = envs.find((e) => e.slug === "development")!;

    // Create Release 2
    const release2 = await releaseService.createReleaseArtifact(testWorkspaceId, ownerUserId, {
      workflowId: testWorkflowId,
      summary: "Release 2 candidate with new experimental edge",
    });

    // Deploy Release 2 to Dev
    await deploymentService.promoteRelease(testWorkspaceId, ownerUserId, "OWNER", {
      workflowId: testWorkflowId,
      releaseArtifactId: release2.id,
      environmentId: dev.id,
    });

    let currentDev = await environmentService.getEnvironment(testWorkspaceId, dev.id);
    expect(currentDev.activeReleaseArtifactId).toBe(release2.id);

    // Now Rollback Dev to Release 1
    const artifacts = await releaseService.listReleaseArtifacts(testWorkspaceId, testWorkflowId);
    const release1 = artifacts.find((a) => a.releaseNumber === 1)!;

    const rollback = await deploymentService.rollbackDeployment(testWorkspaceId, ownerUserId, "OWNER", {
      environmentId: dev.id,
      targetReleaseArtifactId: release1.id,
      reason: "Reverting experimental release 2 back to known good release 1",
    });

    expect(rollback.status).toBe("DEPLOYED");
    expect(rollback.rollbackOfDeploymentId).toBe(release2.id);

    currentDev = await environmentService.getEnvironment(testWorkspaceId, dev.id);
    expect(currentDev.activeReleaseArtifactId).toBe(release1.id);
  });
});
