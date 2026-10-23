import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma } from "@flowforge/database";
import { computeArtifactHashSha256 } from "../src/services/connectorPlatformService.js";
import { createCustomIntegrationNodeHandler } from "../src/engine/nodes/customIntegration.js";
import { ConnectorManifestSchema } from "@flowforge/shared";

describe("Phase 19 Enterprise Connectors, SDK & Certification Suite", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let workspaceId: string;
  let ownerUserId: string;
  const unique = Date.now();
  const crmKey = `crm-nexus-${unique}`;

  beforeAll(async () => {
    app = await buildServer({ enableWorker: false });
    await app.ready();

    // 1. Create Workspace Owner
    const owner = await prisma.user.create({
      data: {
        email: `p19_dev_${unique}@flowforge.dev`,
        name: "Principal Connector Architect",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    // 2. Create Workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: "Connector Developer Platform Workspace",
        slug: `connector-p19-${unique}`,
        ownerId: owner.id,
        homeRegion: "us-east-1",
        dataResidency: "GLOBAL",
        failoverEpoch: 1,
      },
    });
    workspaceId = workspace.id;

    await prisma.workspaceMembership.create({
      data: {
        workspaceId,
        userId: owner.id,
        role: "OWNER",
      },
    });

    // 3. Issue Token
    ownerToken = app.jwt.sign(
      { userId: owner.id, email: owner.email, workspaceId, workspaceRole: "OWNER" },
      { expiresIn: "7d" }
    );
  });

  afterAll(async () => {
    await app.close();
  });

  const validManifestV1 = {
    id: crmKey,
    name: "CRM Nexus Platform",
    version: "1.0.0",
    description: "Enterprise CRM connector for contacts and deal sync.",
    category: "CRM & Sales",
    author: {
      name: "Nexus Engineering",
      email: "eng@nexus.com",
    },
    icon: "Puzzle",
    auth: {
      type: "API_KEY",
      fields: [
        {
          name: "apiKey",
          label: "API Key",
          type: "password",
          required: true,
        },
      ],
    },
    actions: [
      {
        id: "get-contact",
        name: "Get Contact",
        description: "Retrieves contact by email address",
        inputSchema: {
          email: { type: "string", required: true },
        },
        outputSchema: {
          id: { type: "string" },
          name: { type: "string" },
        },
        httpConfig: {
          method: "GET",
          urlTemplate: "https://api.nexus-crm.com/v1/contacts?email={email}",
          timeoutMs: 5000,
        },
      },
      {
        id: "create-contact",
        name: "Create Contact",
        description: "Creates a new contact record",
        inputSchema: {
          email: { type: "string", required: true },
          name: { type: "string", required: false },
        },
        outputSchema: {
          id: { type: "string" },
        },
        httpConfig: {
          method: "POST",
          urlTemplate: "https://api.nexus-crm.com/v1/contacts",
          timeoutMs: 8000,
        },
      },
    ],
    triggers: [],
    permissions: ["network:egress"],
    residencyConstraint: "GLOBAL",
    metadata: {},
  };

  let artifactV1Id: string;
  let artifactV1Hash: string;

  it("validates connector manifests and rejects schema violations", async () => {
    // 1. Valid Manifest
    const validRes = await app.inject({
      method: "POST",
      url: "/api/v1/connectors/validate-manifest",
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { manifest: validManifestV1 },
    });
    expect(validRes.statusCode).toBe(200);
    const validBody = validRes.json();
    expect(validBody.valid).toBe(true);
    expect(validBody.hash).toBeDefined();
    expect(validBody.hash).toHaveLength(64);

    // 2. Invalid Manifest (missing version and negative timeout)
    const invalidRes = await app.inject({
      method: "POST",
      url: "/api/v1/connectors/validate-manifest",
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        manifest: {
          id: "invalid_key",
          name: "Invalid Connector",
          version: "not-a-semver",
          description: "Too short",
        },
      },
    });
    expect(invalidRes.statusCode).toBe(200);
    const invalidBody = invalidRes.json();
    expect(invalidBody.valid).toBe(false);
    expect(invalidBody.errors.length).toBeGreaterThan(0);
  });

  it("registers a draft connector release artifact with SHA-256 provenance", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/connectors/drafts",
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { manifest: validManifestV1 },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    artifactV1Id = body.id;
    artifactV1Hash = body.artifactHashSha256;

    expect(body.id).toBeDefined();
    expect(body.connectorKey).toBe(crmKey);
    expect(body.version).toBe("1.0.0");
    expect(body.status).toBe("DRAFT");
    expect(body.certificationStatus).toBe("PENDING");
    expect(body.artifactHashSha256).toBe(
      computeArtifactHashSha256(ConnectorManifestSchema.parse(validManifestV1))
    );
  });

  it("executes the 6-check automated certification pipeline successfully", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${artifactV1Id}/certify`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.overallResult).toBe("PASSED");
    expect(body.checks).toHaveLength(6);

    const checkNames = body.checks.map((c: any) => c.checkName);
    expect(checkNames).toContain("MANIFEST_SCHEMA_VALIDITY");
    expect(checkNames).toContain("ACTION_TRIGGER_CONTRACTS");
    expect(checkNames).toContain("CREDENTIAL_SAFETY_AND_REDACTION");
    expect(checkNames).toContain("SSRF_AND_EGRESS_COMPLIANCE");
    expect(checkNames).toContain("TENANT_ISOLATION_AND_RESIDENCY");
    expect(checkNames).toContain("ARTIFACT_PROVENANCE_INTEGRITY");

    for (const chk of body.checks) {
      expect(chk.status).toBe("PASSED");
    }

    // Verify artifact status changed to CERTIFIED
    const getRes = await app.inject({
      method: "GET",
      url: `/api/v1/connectors/${artifactV1Id}`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(getRes.json().status).toBe("CERTIFIED");
    expect(getRes.json().certificationStatus).toBe("PASSED");
  });

  it("fails certification when manifest violates SSRF and scope security policies", async () => {
    const insecureManifest = {
      ...validManifestV1,
      id: `insecure-connector-${unique}`,
      actions: [
        {
          id: "exfiltrate-metadata",
          name: "Exfiltrate Cloud Credentials",
          description: "Attempts internal metadata query",
          inputSchema: {},
          outputSchema: {},
          httpConfig: {
            method: "GET",
            urlTemplate: "http://169.254.169.254/latest/meta-data/",
            timeoutMs: 5000,
          },
        },
      ],
      permissions: ["system:root", "network:egress"],
    };

    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/connectors/drafts",
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { manifest: insecureManifest },
    });
    expect(draftRes.statusCode).toBe(201);
    const insecureId = draftRes.json().id;

    const certRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${insecureId}/certify`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(certRes.statusCode).toBe(200);
    const certBody = certRes.json();
    expect(certBody.overallResult).toBe("FAILED");

    const ssrfCheck = certBody.checks.find((c: any) => c.checkName === "SSRF_AND_EGRESS_COMPLIANCE");
    expect(ssrfCheck.status).toBe("FAILED");
    expect(ssrfCheck.message).toContain("restricted local or metadata");

    const permCheck = certBody.checks.find((c: any) => c.checkName === "TENANT_ISOLATION_AND_RESIDENCY");
    expect(permCheck.status).toBe("FAILED");
    expect(permCheck.message).toContain("Disallowed elevated scope");

    // Artifact remains in DRAFT with rejection reason
    const checkArtifact = await app.inject({
      method: "GET",
      url: `/api/v1/connectors/${insecureId}`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(checkArtifact.json().status).toBe("DRAFT");
    expect(checkArtifact.json().certificationStatus).toBe("FAILED");
  });

  it("enforces human review decisions", async () => {
    const reviewRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${artifactV1Id}/reviews`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        decision: "APPROVE",
        reviewNotes: "Security architecture reviewed and approved for publication.",
      },
    });

    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().status).toBe("CERTIFIED");
  });

  it("blocks publication on hash mismatch and succeeds with verified immutable SHA-256", async () => {
    // 1. Mismatch hash must be rejected with ARTIFACT_HASH_MISMATCH
    const tamperedHashRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${artifactV1Id}/publish`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { expectedArtifactHashSha256: "0000000000000000000000000000000000000000000000000000000000000000" },
    });
    expect(tamperedHashRes.statusCode).toBe(422);
    expect(tamperedHashRes.json().message).toContain("ARTIFACT_HASH_MISMATCH");

    // 2. Valid hash publishes artifact
    const publishRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${artifactV1Id}/publish`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { expectedArtifactHashSha256: artifactV1Hash },
    });
    expect(publishRes.statusCode).toBe(200);
    expect(publishRes.json().status).toBe("PUBLISHED");
    expect(publishRes.json().publishedAt).toBeDefined();

    // 3. Immutability check: cannot register duplicate release version
    const duplicateDraft = await app.inject({
      method: "POST",
      url: "/api/v1/connectors/drafts",
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { manifest: validManifestV1 },
    });
    expect(duplicateDraft.statusCode).toBe(409);
  });

  it("installs published connector into workspace", async () => {
    const installRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${artifactV1Id}/install`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(installRes.statusCode).toBe(200);
    const body = installRes.json();
    expect(body.installation).toBeDefined();
    expect(body.installation.status).toBe("ACTIVE");
    expect(body.installation.installedArtifactId).toBe(artifactV1Id);
  });

  let artifactV2Id: string;
  let installationId: string;

  it("calculates preflight upgrade compatibility diff detecting breaking changes", async () => {
    // Define V2 with breaking changes: removed 'create-contact', added required field 'tenantId' to 'get-contact', added new permission
    const manifestV2 = {
      ...validManifestV1,
      version: "2.0.0",
      actions: [
        {
          id: "get-contact",
          name: "Get Contact",
          description: "Retrieves contact by email address",
          inputSchema: {
            email: { type: "string", required: true },
            tenantId: { type: "string", required: true }, // BREAKING: new required param
          },
          outputSchema: {
            id: { type: "string" },
          },
          httpConfig: {
            method: "GET",
            urlTemplate: "https://api.nexus-crm.com/v2/contacts?email={email}",
            timeoutMs: 5000,
          },
        },
        // create-contact was REMOVED (BREAKING)
      ],
      permissions: ["network:egress", "storage:temp"], // NEW PERMISSION WARNING
    };

    // Create and publish V2
    const draftV2Res = await app.inject({
      method: "POST",
      url: "/api/v1/connectors/drafts",
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { manifest: manifestV2 },
    });
    artifactV2Id = draftV2Res.json().id;

    await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${artifactV2Id}/certify`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    const pubV2Res = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${artifactV2Id}/publish`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { expectedArtifactHashSha256: draftV2Res.json().artifactHashSha256 },
    });
    expect(pubV2Res.statusCode).toBe(200);

    // Run Preflight Diff
    const diffRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${artifactV1Id}/upgrade-preflight`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { targetArtifactId: artifactV2Id },
    });

    expect(diffRes.statusCode).toBe(200);
    const diff = diffRes.json();
    expect(diff.isBreaking).toBe(true);
    expect(diff.actionsDiff.removed).toContain("create-contact");
    expect(diff.breakingChanges.some((b: string) => b.includes("create-contact"))).toBe(true);
    expect(diff.breakingChanges.some((b: string) => b.includes("tenantId"))).toBe(true);
    expect(diff.warnings.some((w: string) => w.includes("storage:temp"))).toBe(true);
  });

  it("guards upgrades requiring explicit breaking-change acknowledgment and supports rollback", async () => {
    // Find active installation
    const inst = await prisma.marketplaceInstallation.findFirst({
      where: { workspaceId },
    });
    expect(inst).toBeDefined();
    installationId = inst!.id;

    // 1. Upgrade without ack -> fails with UNACKNOWLEDGED_BREAKING_CHANGES
    const unackRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/installations/${installationId}/upgrade`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        targetArtifactId: artifactV2Id,
        acknowledgeBreakingChanges: false,
      },
    });
    expect(unackRes.statusCode).toBe(400);
    expect(unackRes.json().message).toContain("UNACKNOWLEDGED_BREAKING_CHANGES");

    // 2. Upgrade with ack -> succeeds
    const ackRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/installations/${installationId}/upgrade`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        targetArtifactId: artifactV2Id,
        acknowledgeBreakingChanges: true,
      },
    });
    expect(ackRes.statusCode).toBe(200);
    expect(ackRes.json().installation.installedArtifactId).toBe(artifactV2Id);

    // 3. Rollback to V1
    const rollbackRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/installations/${installationId}/rollback`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        reason: "V2 breaking changes impacted production workflows",
      },
    });
    expect(rollbackRes.statusCode).toBe(200);
    expect(rollbackRes.json().installation.installedArtifactId).toBe(artifactV1Id);
    expect(rollbackRes.json().rolledBackTo.version).toBe("1.0.0");
  });

  it("blocks runtime node execution when connector is SUSPENDED or REVOKED", async () => {
    // 1. Suspend the active connector artifact V2
    const suspendRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${artifactV2Id}/suspend`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        reason: "Security advisory regarding upstream TLS renegotiation",
        isPermanentRevocation: false,
      },
    });
    expect(suspendRes.statusCode).toBe(200);
    expect(suspendRes.json().status).toBe("SUSPENDED");

    // 2. Test Node execution -> must return CONNECTOR_SUSPENDED
    const nodeHandler = createCustomIntegrationNodeHandler(crmKey);
    const suspendedExecResult = await nodeHandler.execute({
      nodeId: "node-1",
      nodeName: "CRM Call",
      nodeType: "ACTION" as any,
      config: { actionId: "get-contact" },
      context: { trigger: {}, steps: {}, variables: {}, env: {} } as any,
      executionId: "exec-suspended-1",
      workflowId: "wf-1",
      correlationId: "corr-1",
      attempt: 1,
      workspaceId,
    });

    expect(suspendedExecResult.status).toBe("FAILED");
    expect(suspendedExecResult.errorCategory).toBe("CONNECTOR_SUSPENDED");
    expect(suspendedExecResult.errorMessage).toContain("SUSPENDED");

    // 3. Permanently revoke connector V2
    const revokeRes = await app.inject({
      method: "POST",
      url: `/api/v1/connectors/${artifactV2Id}/suspend`,
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: {
        reason: "Compromised third-party OAuth signing keys",
        isPermanentRevocation: true,
      },
    });
    expect(revokeRes.statusCode).toBe(200);
    expect(revokeRes.json().status).toBe("REVOKED");

    // 4. Test Node execution -> must return CONNECTOR_REVOKED
    const revokedExecResult = await nodeHandler.execute({
      nodeId: "node-1",
      nodeName: "CRM Call",
      nodeType: "ACTION" as any,
      config: { actionId: "get-contact" },
      context: { trigger: {}, steps: {}, variables: {}, env: {} } as any,
      executionId: "exec-revoked-1",
      workflowId: "wf-1",
      correlationId: "corr-2",
      attempt: 1,
      workspaceId,
    });

    expect(revokedExecResult.status).toBe("FAILED");
    expect(revokedExecResult.errorCategory).toBe("CONNECTOR_REVOKED");
    expect(revokedExecResult.errorMessage).toContain("REVOKED");
  });

  it("queries execution telemetry metrics and developer health analytics", async () => {
    const analyticsRes = await app.inject({
      method: "GET",
      url: `/api/v1/connectors/${crmKey}/analytics`,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(analyticsRes.statusCode).toBe(200);
    const data = analyticsRes.json();
    expect(data.connectorKey).toBe(crmKey);
    expect(data.totalExecutions).toBeGreaterThanOrEqual(2);
    expect(data.failedExecutions).toBeGreaterThanOrEqual(2);
    expect(data.recentMetrics.length).toBeGreaterThanOrEqual(2);
  });
});
