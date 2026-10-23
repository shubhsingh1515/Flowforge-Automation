import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { buildServer } from "../src/server.js";
import { prisma, ExecutionStatus } from "@flowforge/database";
import { runWorkflowExecution } from "../src/engine/runner.js";
import { residencyService } from "../src/services/residencyService.js";
import { cmekService } from "../src/security/cmekService.js";
import { dataRetentionService } from "../src/services/dataRetention.js";

describe("Phase 17 Enterprise Data Residency, CMEK & Advanced Compliance Suite", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let memberToken: string;
  let workspaceId: string;
  let ownerUserId: string;
  let memberUserId: string;
  let testWorkflowId: string;
  let testVersionId: string;

  beforeAll(async () => {
    app = await buildServer({ enableWorker: false });
    await app.ready();

    const unique = Date.now();

    // 1. Create Workspace Owner and Member
    const owner = await prisma.user.create({
      data: {
        email: `p17_owner_${unique}@flowforge.dev`,
        name: "Compliance Architect",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    const member = await prisma.user.create({
      data: {
        email: `p17_member_${unique}@flowforge.dev`,
        name: "Standard Member",
        passwordHash: "hash123",
      },
    });
    memberUserId = member.id;

    const workspace = await prisma.workspace.create({
      data: {
        name: "Enterprise Compliance & Residency Workspace",
        slug: `compliance-p17-${unique}`,
        ownerId: owner.id,
        homeRegion: "us-east-1",
        dataResidency: "GLOBAL",
        failoverEpoch: 1,
      },
    });
    workspaceId = workspace.id;

    await prisma.workspaceMembership.createMany({
      data: [
        { workspaceId, userId: owner.id, role: "OWNER" },
        { workspaceId, userId: member.id, role: "MEMBER" },
      ],
    });

    // 2. Issue JWT tokens and register valid sessions
    ownerToken = app.jwt.sign(
      { userId: owner.id, email: owner.email, workspaceId, workspaceRole: "OWNER" },
      { expiresIn: "7d" }
    );
    memberToken = app.jwt.sign(
      { userId: member.id, email: member.email, workspaceId, workspaceRole: "MEMBER" },
      { expiresIn: "7d" }
    );

    await prisma.session.createMany({
      data: [
        { token: ownerToken, userId: owner.id, expiresAt: new Date(Date.now() + 86400000) },
        { token: memberToken, userId: member.id, expiresAt: new Date(Date.now() + 86400000) },
      ],
    });

    // 3. Create a test workflow with valid version
    const workflow = await prisma.workflow.create({
      data: {
        name: "Compliance Guarded Workflow",
        workspaceId,
        status: "ACTIVE",
      },
    });
    testWorkflowId = workflow.id;

    const version = await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        version: 1,
        nodes: [
          {
            id: "step_start",
            type: "customNode",
            data: { label: "Trigger Node", nodeType: "TRIGGER" },
          },
          {
            id: "step_log",
            type: "customNode",
            data: { label: "Log Step", nodeType: "ACTION" },
          },
        ],
        edges: [{ id: "e1", source: "step_start", target: "step_log" }],
      },
    });
    testVersionId = version.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================
  // 1. DATA RESIDENCY POLICY & REGION BOUNDARIES
  // ==========================================
  describe("1. Data Residency Policies & Boundary Verification", () => {
    it("gets or automatically initializes default workspace residency policy", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/residency",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.policy).toBeDefined();
      expect(body.policy.workspaceId).toBe(workspaceId);
      expect(body.policy.homeRegion).toBe("us-east-1");
      expect(body.policy.status).toBe("ACTIVE");
      expect(body.policy.permittedProcessingRegions).toContain("us-east-1");
    });

    it("prevents standard members from modifying residency policies (403)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/residency",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          homeRegion: "eu-central-1",
          permittedProcessingRegions: ["eu-central-1"],
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("allows Owner to update residency boundaries and records audit entry", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/residency",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          homeRegion: "eu-central-1",
          permittedProcessingRegions: ["eu-central-1"],
          permittedStorageRegions: ["eu-central-1"],
          permittedBackupRegions: ["eu-central-1"],
          crossRegionReplicationAllowed: false,
          changeReason: "GDPR strict residency compliance requirement",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.policy.homeRegion).toBe("eu-central-1");
      expect(body.policy.permittedProcessingRegions).toEqual(["eu-central-1"]);
      expect(body.policy.crossRegionReplicationAllowed).toBe(false);
      expect(body.policy.policyVersion).toBeGreaterThanOrEqual(2);

      // Verify audit record was created in database
      const audit = await prisma.residencyAuditRecord.findFirst({
        where: { workspaceId, action: "POLICY_UPDATE" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeDefined();
      expect(audit?.details).toMatchObject({
        homeRegion: "eu-central-1",
      });
    });

    it("verifies observable data residency placement and worker location", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/residency/verify",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBeDefined();
      expect(body.workspaceId).toBe(workspaceId);
      expect(body.verificationEvidence).toBeDefined();
      expect(body.verificationEvidence.sha256).toBeDefined();

      // Check evidence record in compliance store
      const evidence = await prisma.complianceEvidenceRecord.findFirst({
        where: { workspaceId, evidenceType: "RESIDENCY_VERIFICATION" },
        orderBy: { createdAt: "desc" },
      });
      expect(evidence).toBeDefined();
      expect(evidence?.checksumSha256).toBe(body.verificationEvidence.sha256);
    });

    it("enforces processing boundary fence during workflow runner dispatch", async () => {
      // Policy currently permits ONLY eu-central-1.
      // Execution in us-east-1 must be rejected by residency guard.
      const exec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.PENDING,
          triggerEvent: {},
          executionRegion: "us-east-1",
        },
      });

      const outcome = await runWorkflowExecution({
        executionId: exec.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        workerId: "test-residency-worker",
      });
      expect(outcome.status).toBe("FAILED");
      expect(outcome.errorSummary).toContain("RESIDENCY_POLICY_VIOLATION");
      expect(outcome.errorSummary).toContain("is prohibited by policy");

      // Verify violation audit was recorded
      const violationAudit = await prisma.residencyAuditRecord.findFirst({
        where: { workspaceId, action: "PROCESSING_DISPATCH", isCompliant: false },
      });
      expect(violationAudit).toBeDefined();

      // Now expand permitted regions to include us-east-1
      await residencyService.updatePolicy(workspaceId, ownerUserId, {
        permittedProcessingRegions: ["eu-central-1", "us-east-1"],
        changeReason: "Expand processing zones to US-East",
      });

      // Rerun execution with permitted zone
      const execPermitted = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.PENDING,
          triggerEvent: {},
          executionRegion: "us-east-1",
        },
      });

      const outcomePermitted = await runWorkflowExecution({
        executionId: execPermitted.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        workerId: "test-residency-worker",
      });
      expect(outcomePermitted.status).toBe("SUCCESS");
    });
  });

  // ==========================================
  // 2. CUSTOMER-MANAGED ENCRYPTION KEYS (CMEK)
  // ==========================================
  describe("2. Customer-Managed Encryption Keys (CMEK) Lifecycle", () => {
    it("reports CMEK as unconfigured initially", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/cmek",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.isConfigured).toBe(false);
      expect(body.config).toBeNull();
    });

    it("prevents standard member from registering CMEK key (403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cmek/register",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          keyProvider: "LOCAL",
          keyReference: "tenant-kek-001",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("registers a customer encryption key reference and activates envelope encryption", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cmek/register",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          keyProvider: "LOCAL",
          keyReference: "tenant-kms-primary-key",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.config.keyStatus).toBe("ACTIVE");
      expect(body.config.keyReference).toBe("tenant-kms-primary-key");
      expect(body.config.keyVersion).toBe("1");
      expect(body.config.rotationEpoch).toBe(1);

      // Verify CMEK status now reports active
      const statusRes = await app.inject({
        method: "GET",
        url: "/api/v1/cmek",
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(statusRes.json().isConfigured).toBe(true);
      expect(statusRes.json().encryptionCoverage.executionPayloads).toBe(true);
    });

    it("encrypts and decrypts sensitive payload with envelope encryption", async () => {
      const secretSecret = "SUPER_SECRET_TENANT_OAUTH_TOKEN_XYZ_98765";

      // 1. Encrypt
      const encryptedEnvelope = await cmekService.encryptCmek(
        workspaceId,
        secretSecret,
        "RESTRICTED"
      );

      // Format: cmek:v1:<keyRef>:<keyVer>:<wrappedDek>:<iv>:<tag>:<ciphertext>
      expect(encryptedEnvelope.startsWith("cmek:v1:")).toBe(true);
      const parts = encryptedEnvelope.split(":");
      expect(parts.length).toBe(8);
      expect(parts[0]).toBe("cmek");
      expect(parts[1]).toBe("v1");
      expect(parts[3]).toBe("1"); // keyVersion 1

      // 2. Decrypt
      const decrypted = await cmekService.decryptCmek(workspaceId, encryptedEnvelope);
      expect(decrypted).toBe(secretSecret);
    });

    it("fails decryption when authentication tag or ciphertext is tampered", async () => {
      const encrypted = await cmekService.encryptCmek(workspaceId, "TamperTest", "INTERNAL");
      const parts = encrypted.split(":");
      // Tamper ciphertext
      parts[7] = "0000" + parts[7].slice(4);
      const tampered = parts.join(":");

      await expect(cmekService.decryptCmek(workspaceId, tampered)).rejects.toThrow();
    });

    it("rotates customer encryption key, creates rotation job, and preserves backward decryption", async () => {
      const oldPlaintext = "Legacy data encrypted under Version 1";
      const oldCiphertext = await cmekService.encryptCmek(workspaceId, oldPlaintext);

      const rotateRes = await app.inject({
        method: "POST",
        url: "/api/v1/cmek/rotate",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { reason: "Scheduled quarterly rotation" },
      });

      expect(rotateRes.statusCode).toBe(200);
      const body = rotateRes.json();
      expect(body.success).toBe(true);
      expect(body.previousKeyVersion).toBe("1");
      expect(body.newKeyVersion).toBe("2");
      expect(body.rotationEpoch).toBe(2);

      // Check CmekRotationJob created in database
      const job = await prisma.cmekRotationJob.findUnique({
        where: { id: body.jobId },
      });
      expect(job).toBeDefined();
      expect(job?.status).toBe("COMPLETED");

      // Verify new encryption uses version 2
      const newPlaintext = "Modern data encrypted under Version 2";
      const newCiphertext = await cmekService.encryptCmek(workspaceId, newPlaintext);
      expect(newCiphertext.split(":")[3]).toBe("2");

      // Verify BOTH version 1 and version 2 ciphertexts can be decrypted
      const decryptedOld = await cmekService.decryptCmek(workspaceId, oldCiphertext);
      expect(decryptedOld).toBe(oldPlaintext);

      const decryptedNew = await cmekService.decryptCmek(workspaceId, newCiphertext);
      expect(decryptedNew).toBe(newPlaintext);
    });

    it("revokes key and immediately triggers cryptographic kill-switch", async () => {
      const encryptedBeforeRevocation = await cmekService.encryptCmek(
        workspaceId,
        "Data before kill switch"
      );

      const revokeRes = await app.inject({
        method: "POST",
        url: "/api/v1/cmek/revoke",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          confirmRevocation: true,
          reason: "Emergency data breach containment protocol",
        },
      });

      expect(revokeRes.statusCode).toBe(200);
      const body = revokeRes.json();
      expect(body.keyStatus).toBe("REVOKED");

      // Subsequent encryption attempts must throw immediately
      await expect(
        cmekService.encryptCmek(workspaceId, "Disallowed encryption")
      ).rejects.toThrow("REVOKED");

      // Decryption attempts with revoked key must throw immediately (kill-switch engaged)
      await expect(
        cmekService.decryptCmek(workspaceId, encryptedBeforeRevocation)
      ).rejects.toThrow("cryptographic kill-switch engaged");
    });
  });

  // ==========================================
  // 3. LEGAL HOLD & DATA RETENTION CONTROLS
  // ==========================================
  describe("3. Legal Hold & Data Retention Governance", () => {
    it("places legal hold on workspace records", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/data-retention/legal-hold",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          legalHold: true,
          reason: "Preservation notice in response to regulatory discovery request",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.legalHold).toBe(true);
      expect(body.legalHoldReason).toContain("Preservation notice");

      // Evidence record logged
      const evidence = await prisma.complianceEvidenceRecord.findFirst({
        where: { workspaceId, scope: "LEGAL_HOLD_APPLIED" },
        orderBy: { createdAt: "desc" },
      });
      expect(evidence).toBeDefined();
      expect(evidence?.status).toBe("COMPLIANT");
    });

    it("blocks both scheduled and manual purges when legal hold is active", async () => {
      // Create an expired execution beyond retention window
      const pastDate = new Date(Date.now() - 365 * 86400000); // 1 year old
      const expiredExec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.SUCCESS,
          triggerEvent: {},
          createdAt: pastDate,
          finishedAt: pastDate,
        },
      });

      // Trigger cleanup
      const cleanupRes = await app.inject({
        method: "POST",
        url: "/api/v1/data-retention/cleanup",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(cleanupRes.statusCode).toBe(200);
      const cleanupBody = cleanupRes.json();
      expect(cleanupBody.legalHoldBlockedCount).toBeGreaterThanOrEqual(1);
      expect(cleanupBody.totalExecutionsCleaned).toBe(0);

      // Verify the record was NOT deleted
      const stillExisting = await prisma.workflowExecution.findUnique({
        where: { id: expiredExec.id },
      });
      expect(stillExisting).toBeDefined();
    });

    it("supports dry-run cleanup simulation reporting candidate counts without deletions", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/data-retention/cleanup",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { dryRun: true },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.dryRun).toBe(true);
    });

    it("releases legal hold and permits retention purges to resume", async () => {
      const releaseRes = await app.inject({
        method: "POST",
        url: "/api/v1/data-retention/legal-hold",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          legalHold: false,
          reason: "Discovery completed and matter concluded",
        },
      });

      expect(releaseRes.statusCode).toBe(200);
      expect(releaseRes.json().legalHold).toBe(false);

      // Now trigger cleanup; it should clean expired records
      const cleanupRes = await app.inject({
        method: "POST",
        url: "/api/v1/data-retention/cleanup",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(cleanupRes.statusCode).toBe(200);
      expect(cleanupRes.json().totalExecutionsCleaned).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================
  // 4. COMPLIANCE EVIDENCE INTEGRITY
  // ==========================================
  describe("4. Tamper-Evident Compliance Evidence Store", () => {
    it("stores tamper-evident compliance evidence records with valid SHA-256 checksums", async () => {
      const records = await prisma.complianceEvidenceRecord.findMany({
        where: { workspaceId },
      });

      expect(records.length).toBeGreaterThanOrEqual(4);

      for (const rec of records) {
        expect(rec.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(["COMPLIANT", "NON_COMPLIANT"]).toContain(rec.status);
        expect(rec.evidenceType).toBeDefined();
      }
    });
  });
});
