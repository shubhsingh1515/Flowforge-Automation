import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { prisma, ExecutionStatus } from "@flowforge/database";
import { runWorkflowExecution } from "../src/engine/runner.js";
import { capacityService } from "../src/services/capacityService.js";
import { regionService } from "../src/services/regionService.js";

describe("Phase 16 Enterprise Scale, Multi-Region Readiness & Advanced Capacity Management Suite", () => {
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
        email: `scale_owner_${unique}@flowforge.dev`,
        name: "Scale Architect",
        passwordHash: "hash123",
      },
    });
    ownerUserId = owner.id;

    const member = await prisma.user.create({
      data: {
        email: `scale_member_${unique}@flowforge.dev`,
        name: "Standard Member",
        passwordHash: "hash123",
      },
    });
    memberUserId = member.id;

    const workspace = await prisma.workspace.create({
      data: {
        name: "Enterprise Multi-Region Scale Workspace",
        slug: `scale-enterprise-${unique}`,
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
        name: "Scalable Pipeline",
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
            id: "step_start",
            type: "customNode",
            data: { label: "Start Node", nodeType: "TRIGGER" },
          },
          {
            id: "step_process",
            type: "customNode",
            data: {
              label: "Process Node",
              nodeType: "ACTION",
              config: { expression: "true" },
            },
          },
        ],
        edges: [
          { id: "e1", source: "step_start", target: "step_process" },
        ],
      },
    });
    testVersionId = version.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================
  // 1. TIER A MULTI-WORKER HORIZONTAL SCALING & LEASE COORDINATION
  // ==========================================
  describe("1. Tier A Multi-Worker Horizontal Scaling & Lease Coordination", () => {
    it("atomically acquires worker lease with initial fencing token 1", async () => {
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.PENDING,
          failoverEpoch: 1,
        },
      });

      const workerA = "worker_replica_node_1";
      const result = await runWorkflowExecution({
        executionId: execution.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        workerId: workerA,
      });

      expect(result.status).toBe("SUCCESS");

      const dbExec = await prisma.workflowExecution.findUnique({
        where: { id: execution.id },
      });
      expect(dbExec?.leaseOwner).toBe(workerA);
      expect(dbExec?.leaseToken).toBe(1);
    });

    it("rejects concurrent lease acquisition by worker B when worker A has active lease", async () => {
      // Simulate an execution currently leased by Worker A
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.RUNNING,
          leaseOwner: "worker_replica_node_1",
          leaseToken: 1,
          leaseExpiresAt: new Date(Date.now() + 60000), // unexpired
          failoverEpoch: 1,
        },
      });

      const workerB = "worker_replica_node_2";
      const result = await runWorkflowExecution({
        executionId: execution.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        workerId: workerB,
      });

      expect(result.status).toBe("FAILED");
      expect(result.errorSummary).toContain("Concurrent worker lease conflict");
    });

    it("allows worker B to take over an expired lease with incremented fencing token 2", async () => {
      // Create execution with an expired lease
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.RUNNING,
          leaseOwner: "worker_dead_node",
          leaseToken: 1,
          leaseExpiresAt: new Date(Date.now() - 5000), // expired 5s ago
          failoverEpoch: 1,
        },
      });

      const workerB = "worker_healthy_node_2";
      const result = await runWorkflowExecution({
        executionId: execution.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        workerId: workerB,
      });

      expect(result.status).toBe("SUCCESS");

      const dbExec = await prisma.workflowExecution.findUnique({
        where: { id: execution.id },
      });
      expect(dbExec?.leaseOwner).toBe(workerB);
      expect(dbExec?.leaseToken).toBe(2); // token monotonically incremented
    });
  });

  // ==========================================
  // 2. TENANT FAIRNESS & GLOBAL CONCURRENCY ENFORCEMENT
  // ==========================================
  describe("2. Tenant Fairness & Global Concurrency Limit Enforcement", () => {
    it("enforces custom workspace concurrency cap across multi-worker pools", async () => {
      // Set workspace custom concurrency limit override to 2
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { maxConcurrentExecutions: 2 },
      });

      // Simulate 2 running executions under this workspace
      const exec1 = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          status: ExecutionStatus.RUNNING,
          leaseOwner: "worker_1",
          leaseExpiresAt: new Date(Date.now() + 30000),
          failoverEpoch: 1,
        },
      });
      const exec2 = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          status: ExecutionStatus.RUNNING,
          leaseOwner: "worker_2",
          leaseExpiresAt: new Date(Date.now() + 30000),
          failoverEpoch: 1,
        },
      });

      // Attempt to run a 3rd execution
      const exec3 = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.PENDING,
          failoverEpoch: 1,
        },
      });

      const result = await runWorkflowExecution({
        executionId: exec3.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        workerId: "worker_3",
      });

      expect(result.status).toBe("FAILED");
      expect(result.errorCategory).toBe("RESOURCE_LIMIT_EXCEEDED");
      expect(result.errorSummary).toContain("Workspace active execution concurrency limit of 2 reached");

      // Cleanup running executions
      await prisma.workflowExecution.deleteMany({
        where: { id: { in: [exec1.id, exec2.id, exec3.id] } },
      });

      // Restore custom concurrency cap to null (reverts to default plan tier limit)
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { maxConcurrentExecutions: null },
      });
    });

    it("allows checkpoint resumption without consuming new burst concurrency quota", async () => {
      // Set limit to 1
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { maxConcurrentExecutions: 1 },
      });

      // One running execution
      const runningExec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          status: ExecutionStatus.RUNNING,
          leaseOwner: "worker_1",
          leaseExpiresAt: new Date(Date.now() + 30000),
          failoverEpoch: 1,
        },
      });

      // Resuming execution with lastCheckpointNodeId
      const resumingExec = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.PENDING,
          lastCheckpointNodeId: "step_start",
          failoverEpoch: 1,
        },
      });

      const result = await runWorkflowExecution({
        executionId: resumingExec.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        workerId: "worker_2",
      });

      // Resumption must succeed despite active concurrency = 1
      expect(result.status).toBe("SUCCESS");

      // Cleanup
      await prisma.workflowExecution.deleteMany({
        where: { id: { in: [runningExec.id, resumingExec.id] } },
      });
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { maxConcurrentExecutions: null },
      });
    });
  });

  // ==========================================
  // 3. ADVANCED CAPACITY MANAGEMENT & PREDICTIVE DRAIN TIME
  // ==========================================
  describe("3. Advanced Capacity Management & Predictive Drain Time", () => {
    it("GET /api/v1/operations/capacity returns complete capacity summary and drain-time projections", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/operations/capacity",
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.capacity).toBeDefined();
      expect(body.capacity.deploymentTier).toContain("Tier A");
      expect(body.capacity.authoritativeRegion).toBe("us-east-1");
      expect(body.capacity.workerCapacity).toBeDefined();
      expect(body.capacity.dbConnectionBudget).toBeDefined();
      expect(body.capacity.queueMetrics).toBeDefined();
      expect(body.capacity.queueMetrics.projectedDrainTimeSec).toBeDefined();
      expect(body.capacity.backpressure).toBeDefined();
      expect(Array.isArray(body.capacity.noisyNeighbors)).toBe(true);
      expect(Array.isArray(body.capacity.regions)).toBe(true);
    });

    it("RBAC: rejects unauthorized non-admin access to /operations/capacity with 403", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/operations/capacity",
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ==========================================
  // 4. REGION-AWARE FOUNDATION & AUTHORITATIVE PLACEMENT
  // ==========================================
  describe("4. Region-Aware Foundation & Authoritative Placement", () => {
    it("GET /api/v1/operations/regions lists regional deployments with us-east-1 authoritative", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/operations/regions",
        headers: { Authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.regions)).toBe(true);
      expect(body.regions.length).toBeGreaterThanOrEqual(1);

      const usEast = body.regions.find((r: any) => r.regionKey === "us-east-1");
      expect(usEast).toBeDefined();
      expect(usEast.isAuthoritative).toBe(true);
      expect(usEast.status).toBe("HEALTHY");
    });

    it("PATCH /api/v1/operations/regions/placement updates workspace home region and residency", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/operations/regions/placement",
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          homeRegion: "eu-central-1",
          dataResidency: "EU",
          workloadPriority: "HIGH_PRIORITY",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.workspace.homeRegion).toBe("eu-central-1");
      expect(body.workspace.dataResidency).toBe("EU");
      expect(body.workspace.workloadPriority).toBe("HIGH_PRIORITY");
    });

    it("fences execution when worker runs in wrong region (Misdirected Execution)", async () => {
      // Workspace homeRegion is now 'eu-central-1'
      // Default runner region is 'us-east-1' (process.env.FLOWFORGE_REGION || 'us-east-1')
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.PENDING,
          failoverEpoch: 1,
        },
      });

      const result = await runWorkflowExecution({
        executionId: execution.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
      });

      expect(result.status).toBe("FAILED");
      expect(result.errorCategory).toBe("RESOURCE_LIMIT_EXCEEDED");
      expect(result.errorSummary).toContain("Misdirected Execution");
      expect(result.errorSummary).toContain("eu-central-1");

      // Restore workspace homeRegion to us-east-1
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { homeRegion: "us-east-1", dataResidency: "GLOBAL" },
      });
    });
  });

  // ==========================================
  // 5. SPLIT-BRAIN PREVENTION & REGIONAL FAILOVER DRILL
  // ==========================================
  describe("5. Split-Brain Prevention & Regional Failover Drill", () => {
    it("POST /api/v1/operations/regions/failover-drill advances failoverEpoch and logs audit record", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/operations/regions/failover-drill",
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          sourceRegion: "us-east-1",
          targetRegion: "eu-central-1",
          notes: "Phase 16 verification non-destructive drill",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.drill).toBeDefined();
      expect(body.drill.sourceRegion).toBe("us-east-1");
      expect(body.drill.targetRegion).toBe("eu-central-1");
      expect(body.drill.failoverEpoch).toBeGreaterThanOrEqual(2);

      // Verify workspace failoverEpoch was incremented
      const updatedWs = await prisma.workspace.findUnique({
        where: { id: workspaceId },
      });
      expect(updatedWs?.failoverEpoch).toBe(body.drill.failoverEpoch);

      // Verify recovery audit record
      const auditLog = await prisma.recoveryAuditRecord.findFirst({
        where: { operationType: "REGIONAL_FAILOVER_DRILL" },
        orderBy: { createdAt: "desc" },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.status).toBe("SUCCESS");
    });

    it("fences stale regional workers attempting to process executions with superseded epoch", async () => {
      const currentWs = await prisma.workspace.findUnique({
        where: { id: workspaceId },
      });
      const activeEpoch = currentWs?.failoverEpoch || 2;

      // Create an execution carrying an outdated epoch (e.g. from an evacuated region before failover)
      const staleExecution = await prisma.workflowExecution.create({
        data: {
          workflowId: testWorkflowId,
          versionId: testVersionId,
          status: ExecutionStatus.PENDING,
          failoverEpoch: activeEpoch - 1, // Stale epoch
        },
      });

      const result = await runWorkflowExecution({
        executionId: staleExecution.id,
        workflowId: testWorkflowId,
        versionId: testVersionId,
        workerId: "stale_regional_worker_us_east",
      });

      expect(result.status).toBe("FAILED");
      expect(result.errorSummary).toContain("Regional Failover Fence");
      expect(result.errorSummary).toContain("superseded by current workspace failover epoch");

      const dbExec = await prisma.workflowExecution.findUnique({
        where: { id: staleExecution.id },
      });
      expect(dbExec?.status).toBe(ExecutionStatus.FAILED);
      expect(dbExec?.errorSummary).toContain("Regional Failover Fence");
    });
  });
});
