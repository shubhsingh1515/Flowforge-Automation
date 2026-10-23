import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma, ExecutionStatus } from "@flowforge/database";
import { runWorkflowExecution } from "../src/engine/runner.js";
import { outboxService } from "../src/services/outboxService.js";
import { reconciliationService } from "../src/services/reconciliation.js";
import { disasterRecoveryService } from "../src/services/disasterRecoveryService.js";
import { checkQueueBackpressure } from "../src/worker/queue.js";
import crypto from "crypto";

describe("Phase 15 High Availability, Disaster Recovery & Resilient Execution Suite", () => {
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
        email: `reliability_owner_${unique}@flowforge.dev`,
        name: "Reliability Lead",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    const member = await prisma.user.create({
      data: {
        email: `reliability_member_${unique}@flowforge.dev`,
        name: "Team Operator",
        passwordHash: "hash123",
      },
    });
    memberUserId = member.id;

    const workspace = await prisma.workspace.create({
      data: {
        name: "Enterprise High Availability Workspace",
        slug: `ha-reliability-${unique}`,
        ownerId: owner.id,
      },
    });
    workspaceId = workspace.id;

    await prisma.workspaceMembership.createMany({
      data: [
        { workspaceId, userId: owner.id, role: "OWNER" },
        { workspaceId, userId: member.id, role: "MEMBER" },
      ],
    });

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

    // 2. Create test multi-step workflow
    const wf = await prisma.workflow.create({
      data: {
        workspaceId,
        name: "Reliable Multi-Step Pipeline",
        status: "ACTIVE",
      },
    });
    testWorkflowId = wf.id;

    const version = await prisma.workflowVersion.create({
      data: {
        workflowId: wf.id,
        version: 1,
        nodes: [
          {
            id: "n_trigger",
            type: "customNode",
            data: { label: "Trigger", nodeType: "TRIGGER" },
          },
          {
            id: "n_step1",
            type: "customNode",
            data: {
              label: "Transform Data",
              nodeType: "ACTION",
              config: { expression: "{{trigger.val * 2}}" },
            },
          },
          {
            id: "n_step2",
            type: "customNode",
            data: {
              label: "Enrich Data",
              nodeType: "ACTION",
              config: { enriched: true },
            },
          },
        ],
        edges: [
          { id: "e1", source: "n_trigger", target: "n_step1" },
          { id: "e2", source: "n_step1", target: "n_step2" },
        ],
      },
    });
    testVersionId = version.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================
  // SECTION 1: WORKER LEASING & FENCING TOKENS
  // ==========================================
  describe("1. Worker Leasing & Fencing Tokens", () => {
    it("acquires lease with incremented fencing token and active expiry", async () => {
      const exec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.PENDING,
          triggerEvent: { val: 21 },
        },
      });

      const result = await runWorkflowExecution({
        executionId: exec.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        triggerPayload: { val: 21 },
        workerId: "worker-inst-alpha",
      });

      expect(result.status).toBe("SUCCESS");

      const inDb = await prisma.workflowExecution.findUnique({
        where: { id: exec.id },
      });
      expect(inDb?.status).toBe(ExecutionStatus.SUCCESS);
      expect(inDb?.leaseToken).toBe(1);
      expect(inDb?.leaseOwner).toBe("worker-inst-alpha");
      expect(inDb?.leaseExpiresAt).toBeNull(); // Cleared upon success
    });

    it("rejects concurrent lease acquisition when active worker holds an unexpired lease", async () => {
      const activeExpires = new Date(Date.now() + 60000); // 1 minute in the future
      const exec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.RUNNING,
          leaseOwner: "worker-active-primary",
          leaseToken: 1,
          leaseExpiresAt: activeExpires,
          triggerEvent: { val: 10 },
        },
      });

      // Second worker attempts to execute the same job
      const conflictResult = await runWorkflowExecution({
        executionId: exec.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        triggerPayload: { val: 10 },
        workerId: "worker-zombie-secondary",
      });

      expect(conflictResult.status).toBe("FAILED");
      expect(conflictResult.errorSummary).toContain("Concurrent worker lease conflict");

      // Verify DB execution was protected and still owned by primary worker
      const inDb = await prisma.workflowExecution.findUnique({
        where: { id: exec.id },
      });
      expect(inDb?.leaseOwner).toBe("worker-active-primary");
      expect(inDb?.leaseToken).toBe(1);

      // Clean up mock execution so it does not linger in RUNNING
      await prisma.workflowExecution.update({
        where: { id: exec.id },
        data: { status: ExecutionStatus.FAILED, finishedAt: new Date() },
      });
    });

    it("fencing guard rejects stale worker commit when lease was stolen or bumped", async () => {
      // 1. Create execution
      const exec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.PENDING,
          triggerEvent: { val: 5 },
        },
      });

      // 2. Simulate worker 1 lease acquisition
      await prisma.workflowExecution.update({
        where: { id: exec.id },
        data: {
          status: ExecutionStatus.RUNNING,
          leaseOwner: "worker-stale-1",
          leaseToken: 1,
          leaseExpiresAt: new Date(Date.now() - 5000), // Stale / expired
        },
      });

      // 3. Worker 2 takes over and bumps fencing token
      await prisma.workflowExecution.update({
        where: { id: exec.id },
        data: {
          leaseOwner: "worker-healthy-2",
          leaseToken: 2,
          leaseExpiresAt: new Date(Date.now() + 30000),
        },
      });

      // 4. Stale worker 1 attempts to resume and commit with old token
      const staleRun = await runWorkflowExecution({
        executionId: exec.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        triggerPayload: { val: 5 },
        workerId: "worker-stale-1",
      });

      // Because worker-healthy-2 holds an unexpired lease, stale worker fails lease acquisition
      expect(staleRun.status).toBe("FAILED");
      expect(staleRun.errorSummary).toContain("Concurrent worker lease conflict");

      // Clean up mock execution
      await prisma.workflowExecution.update({
        where: { id: exec.id },
        data: { status: ExecutionStatus.FAILED, finishedAt: new Date() },
      });
    });
  });

  // ==========================================
  // SECTION 2: CHECKPOINT RESUMPTION
  // ==========================================
  describe("2. Durable Checkpoint Resumption (Crash Recovery)", () => {
    it("resumes from last completed step without re-executing checkpointed node", async () => {
      const exec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.PENDING,
          triggerEvent: { val: 50 },
        },
      });

      // 1. Simulate step 1 already finished durably before a crash
      await prisma.workflowStepExecution.create({
        data: {
          executionId: exec.id,
          nodeId: "n_step1",
          nodeName: "Transform Data",
          nodeType: "ACTION",
          status: ExecutionStatus.SUCCESS,
          outputData: { val: 100, transformedByPriorWorker: true },
          finishedAt: new Date(),
        },
      });

      await prisma.workflowExecution.update({
        where: { id: exec.id },
        data: {
          lastCheckpointNodeId: "n_step1",
        },
      });

      // 2. New worker resumes execution
      const resumeResult = await runWorkflowExecution({
        executionId: exec.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        triggerPayload: { val: 50 },
        workerId: "worker-recovery-hero",
      });

      expect(resumeResult.status).toBe("SUCCESS");

      // Verify that n_step1 was NOT duplicated in workflow_step_executions
      const step1Count = await prisma.workflowStepExecution.count({
        where: { executionId: exec.id, nodeId: "n_step1" },
      });
      expect(step1Count).toBe(1);

      // Verify n_step2 executed and succeeded
      const step2 = await prisma.workflowStepExecution.findFirst({
        where: { executionId: exec.id, nodeId: "n_step2" },
      });
      expect(step2?.status).toBe(ExecutionStatus.SUCCESS);
    });
  });

  // ==========================================
  // SECTION 3: RECONCILIATION CRASH RECOVERY
  // ==========================================
  describe("3. Bounded Stuck Execution Crash Recovery", () => {
    it("reconciles stuck execution with checkpoint by re-enqueuing for resumption", async () => {
      const exec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.RUNNING,
          startedAt: new Date(Date.now() - 30 * 60 * 1000), // 30m ago
          lastCheckpointNodeId: "n_step1",
          recoveryAttempts: 0,
        },
      });

      const result = await reconciliationService.reconcile({
        workspaceId,
        mode: "execute",
        maxAgeMinutes: 15,
        allowCrashRecovery: true,
      });

      expect(result.anomaliesFound).toBeGreaterThanOrEqual(1);
      const match = result.anomalies.find((a) => a.executionId === exec.id);
      expect(match).toBeDefined();
      expect(match?.proposedAction).toBe("CRASH_RECOVERY_RESUME");

      // Verify execution transitioned to PENDING with recoveryAttempts = 1
      const inDb = await prisma.workflowExecution.findUnique({
        where: { id: exec.id },
      });
      expect(inDb?.status).toBe(ExecutionStatus.PENDING);
      expect(inDb?.recoveryAttempts).toBe(1);
      expect(inDb?.leaseOwner).toBeNull();
    });

    it("marks execution FAILED when maximum recovery attempts are exceeded", async () => {
      const exec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.RUNNING,
          startedAt: new Date(Date.now() - 30 * 60 * 1000),
          lastCheckpointNodeId: "n_step1",
          recoveryAttempts: 2, // Already reached max attempts (2)
        },
      });

      const result = await reconciliationService.reconcile({
        workspaceId,
        mode: "execute",
        maxAgeMinutes: 15,
      });

      const match = result.anomalies.find((a) => a.executionId === exec.id);
      expect(match?.proposedAction).toBe("MARK_FAILED_TIMEOUT");

      const inDb = await prisma.workflowExecution.findUnique({
        where: { id: exec.id },
      });
      expect(inDb?.status).toBe(ExecutionStatus.FAILED);
      expect(inDb?.errorCategory).toBe("WORKER_TIMEOUT");
    });
  });

  // ==========================================
  // SECTION 4: TRANSACTIONAL OUTBOX ENGINE
  // ==========================================
  describe("4. Transactional Outbox Engine", () => {
    it("enqueues outbox events atomically and deduplicates idempotency keys", async () => {
      const idKey = `test_outbox_key_${Date.now()}`;

      const evt1 = await outboxService.enqueueEvent({
        workspaceId,
        eventType: "workflow.activated",
        payload: { workflowId: testWorkflowId },
        idempotencyKey: idKey,
      });

      expect(evt1.id).toBeDefined();
      expect(evt1.status).toBe("PENDING");

      // Duplicate submission returns same record without throwing P2002
      const evt2 = await outboxService.enqueueEvent({
        workspaceId,
        eventType: "workflow.activated",
        payload: { workflowId: testWorkflowId },
        idempotencyKey: idKey,
      });

      expect(evt2.id).toBe(evt1.id);

      const totalRows = await prisma.transactionalOutboxEvent.count({
        where: { idempotencyKey: idKey },
      });
      expect(totalRows).toBe(1);
    });

    it("sweeps pending outbox events and marks them delivered", async () => {
      const idKey = `test_outbox_sweep_${Date.now()}`;
      await outboxService.enqueueEvent({
        workspaceId,
        eventType: "execution.succeeded",
        payload: { executionId: "mock_exec_123" },
        idempotencyKey: idKey,
      });

      const sweep = await outboxService.processPendingEvents(50);
      expect(sweep.processed).toBeGreaterThanOrEqual(1);

      const inDb = await prisma.transactionalOutboxEvent.findUnique({
        where: { idempotencyKey: idKey },
      });
      expect(inDb?.status).toBe("DELIVERED");
      expect(inDb?.deliveredAt).not.toBeNull();
    });

    it("transitions failed event to DEAD_LETTER when max attempts reached and allows replay", async () => {
      const idKey = `test_outbox_dlq_${Date.now()}`;
      const deadEvent = await prisma.transactionalOutboxEvent.create({
        data: {
          workspaceId,
          eventType: "custom.event",
          payload: {},
          idempotencyKey: idKey,
          status: "DEAD_LETTER",
          attempts: 5,
          maxAttempts: 5,
          lastError: "Simulated network timeout",
        },
      });

      // Replay dead-letter event
      const replay = await outboxService.replayDeadLetterEvents(workspaceId, {
        eventIds: [deadEvent.id],
      });
      expect(replay.replayedCount).toBe(1);

      const updated = await prisma.transactionalOutboxEvent.findUnique({
        where: { id: deadEvent.id },
      });
      expect(updated?.status).toBe("PENDING");
      expect(updated?.attempts).toBe(0);
      expect(updated?.lastError).toBeNull();
    });
  });

  // ==========================================
  // SECTION 5: DISASTER RECOVERY & BACKUP DRILLS
  // ==========================================
  describe("5. Disaster Recovery & Backup Integrity Verification", () => {
    it("runs isolated backup verification drill and computes SHA-256 checksum", async () => {
      const drill = await disasterRecoveryService.runVerificationDrill(
        { backupFileName: "flowforge_automated_test_backup.sql.gz", dryRun: true },
        ownerUserId
      );

      expect(drill.status).toBe("VERIFIED");
      expect(drill.checksumSha256).toHaveLength(64);
      expect(drill.restoredTableCount).toBeGreaterThan(10);
      expect(drill.durationMs).toBeGreaterThanOrEqual(0);

      // Verify audit record was logged
      const audit = await prisma.recoveryAuditRecord.findFirst({
        where: { operationType: "BACKUP_VERIFICATION" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeDefined();
      expect(audit?.status).toBe("SUCCESS");
    });

    it("returns disaster recovery status with defined RTO and RPO objectives", async () => {
      const status = await disasterRecoveryService.getDisasterRecoveryStatus();
      expect(status.rtoTargetSeconds).toBe(300); // 5 min RTO
      expect(status.rpoTargetSeconds).toBe(3600); // 1 hr RPO
      expect(status.lastBackupStatus).toBe("VERIFIED");
      expect(status.lastBackupChecksum).not.toBeNull();
    });
  });

  // ==========================================
  // SECTION 6: QUEUE BACKPRESSURE & HEALTH
  // ==========================================
  describe("6. Queue Backpressure & Deep Health Telemetry", () => {
    it("evaluates queue backpressure metrics against threshold", async () => {
      const bp = await checkQueueBackpressure();
      expect(bp.threshold).toBeGreaterThan(0);
      expect(typeof bp.isBackpressureActive).toBe("boolean");
    });

    it("GET /api/v1/health returns deep component health including reliability indicators", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/health",
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.status).toBe("healthy");
      expect(json.components.database.status).toBe("connected");
      expect(json.components.reliability.fencingEnabled).toBe(true);
      expect(typeof json.components.reliability.activeLeases).toBe("number");
    });
  });

  // ==========================================
  // SECTION 7: OPERATIONS DASHBOARD REST APIS
  // ==========================================
  describe("7. Operations Dashboard Endpoints", () => {
    it("GET /api/v1/operations/overview returns enriched HA and DR telemetry for Admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/operations/overview",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.systemStatus).toBeDefined();
      expect(json.outbox).toBeDefined();
      expect(json.disasterRecovery).toBeDefined();
      expect(json.workerReliability).toBeDefined();
      expect(json.workerReliability.fencingEnabled).toBe(true);
    });

    it("denies operations access to non-admin MEMBER role", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/operations/overview",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("POST /api/v1/operations/backup/verify triggers verification drill via API", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/operations/backup/verify",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { dryRun: true },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.record.status).toBe("VERIFIED");
      expect(json.record.checksumSha256).toHaveLength(64);
    });

    it("GET /api/v1/operations/outbox returns outbox status", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/operations/outbox",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.outbox).toBeDefined();
      expect(typeof json.outbox.pendingCount).toBe("number");
    });
  });
});
