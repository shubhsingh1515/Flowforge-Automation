import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FlowForgeClient,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  TimeoutError,
  FlowForgeError,
} from "../src/index.js";

describe("FlowForge TypeScript SDK Client Suite", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fails to initialize when apiKey is missing", () => {
    expect(() => new FlowForgeClient({ apiKey: "" })).toThrow(AuthenticationError);
  });

  it("initializes successfully with apiKey and options", () => {
    const client = new FlowForgeClient({
      apiKey: "ff_live_testkey123",
      baseUrl: "https://custom.flowforge.dev/api/v1",
      timeoutMs: 15000,
    });
    expect(client).toBeDefined();
    expect(client.workflows).toBeDefined();
    expect(client.executions).toBeDefined();
  });

  it("sends X-API-Key, Authorization, Idempotency-Key, and traceparent headers", async () => {
    let capturedHeaders: any;

    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          execution: { id: "exec-123", status: "PENDING" },
          queued: true,
        }),
      } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_secret123" });
    const res = await client.executions.trigger("wf-456", { email: "user@example.com" }, {
      idempotencyKey: "idem_abc_789",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    });

    expect(res.execution.id).toBe("exec-123");
    expect(capturedHeaders["X-API-Key"]).toBe("ff_live_secret123");
    expect(capturedHeaders["Authorization"]).toBe("Bearer ff_live_secret123");
    expect(capturedHeaders["Idempotency-Key"]).toBe("idem_abc_789");
    expect(capturedHeaders["traceparent"]).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  });

  it("maps HTTP 401 to AuthenticationError", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "API key revoked" }),
    } as any);

    const client = new FlowForgeClient({ apiKey: "invalid_key" });
    await expect(client.workflows.list()).rejects.toThrow(AuthenticationError);
  });

  it("maps HTTP 404 to NotFoundError", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "Workflow not found" }),
    } as any);

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });
    await expect(client.workflows.get("non-existent-id")).rejects.toThrow(NotFoundError);
  });

  it("maps HTTP 429 with Retry-After header to RateLimitError", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "45" }),
      json: async () => ({ message: "Rate limit exceeded" }),
    } as any);

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });
    try {
      await client.workflows.list();
      expect.fail("Should have thrown RateLimitError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect(err.statusCode).toBe(429);
      expect(err.retryAfterSeconds).toBe(45);
    }
  });

  it("maps HTTP 400 with details to ValidationError", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Invalid payload", details: [{ field: "name", message: "Required" }] }),
    } as any);

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });
    try {
      await client.workflows.create({ name: "" });
      expect.fail("Should have thrown ValidationError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.statusCode).toBe(400);
      expect(err.details).toBeDefined();
    }
  });

  it("lists, activates, and deletes workflows", async () => {
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      if (init?.method === "DELETE") {
        return { ok: true, status: 200, json: async () => ({ success: true }) } as any;
      }
      if (init?.method === "POST" && String(url).includes("/activate")) {
        return { ok: true, status: 200, json: async () => ({ success: true, status: "ACTIVE" }) } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "wf-1", name: "Sync CRM" }], meta: { total: 1 } }),
      } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });
    const list = await client.workflows.list({ status: "ACTIVE" });
    expect(list.data.length).toBe(1);

    const activate = await client.workflows.activate("wf-1");
    expect(activate.status).toBe("ACTIVE");

    const del = await client.workflows.delete("wf-1");
    expect(del.success).toBe(true);
  });

  it("interacts with environments and variables via SDK", async () => {
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      if (init?.method === "POST" && String(url).includes("/variables")) {
        return { ok: true, status: 200, json: async () => ({ data: { key: "API_URL", value: "https://api.dev" } }) } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "env-1", name: "Development", slug: "development" }] }),
      } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });
    const envs = await client.environments.list();
    expect(envs.data.length).toBe(1);
    expect(envs.data[0].slug).toBe("development");

    const variable = await client.environments.setVariable("env-1", {
      key: "API_URL",
      value: "https://api.dev",
    });
    expect(variable.data.key).toBe("API_URL");
  });

  it("manages release artifacts via SDK", async () => {
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        return { ok: true, status: 201, json: async () => ({ data: { id: "rel-1", releaseNumber: 1, contentHash: "hash123" } }) } as any;
      }
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "rel-1", releaseNumber: 1 }] }) } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });
    const release = await client.releases.create("wf-1", { summary: "Release 1" });
    expect(release.data.releaseNumber).toBe(1);

    const list = await client.releases.list("wf-1");
    expect(list.data.length).toBe(1);
  });

  it("promotes releases and rolls back deployments via SDK", async () => {
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      if (String(url).includes("/rollback")) {
        return { ok: true, status: 200, json: async () => ({ data: { id: "dep-2", status: "DEPLOYED", rollbackOfDeploymentId: "dep-1" } }) } as any;
      }
      return { ok: true, status: 201, json: async () => ({ data: { id: "dep-1", status: "DEPLOYED" } }) } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });
    const dep = await client.deployments.promote({
      workflowId: "wf-1",
      releaseArtifactId: "rel-1",
      environmentId: "env-prod",
    });
    expect(dep.data.status).toBe("DEPLOYED");

    const rollback = await client.deployments.rollback({
      targetReleaseArtifactId: "rel-prior",
      environmentId: "env-prod",
      reason: "Emergency rollback",
    });
    expect(rollback.data.rollbackOfDeploymentId).toBe("dep-1");
  });

  it("creates and executes workflow test cases via SDK", async () => {
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      if (String(url).includes("/run")) {
        return { ok: true, status: 200, json: async () => ({ data: { testRun: { id: "run-1", status: "PASSED" }, summary: { passedAssertions: 2 } } }) } as any;
      }
      return { ok: true, status: 201, json: async () => ({ data: { id: "tc-1", name: "Checkout Test" } }) } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });
    const tc = await client.tests.create("wf-1", {
      name: "Checkout Test",
      assertions: [],
    });
    expect(tc.data.id).toBe("tc-1");

    const run = await client.tests.run("tc-1", { mode: "DRY_RUN" });
    expect(run.data.testRun.status).toBe("PASSED");
  });

  it("interacts with Phase 13 AI automation endpoints via SDK", async () => {
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/ai/status")) {
        return { ok: true, status: 200, json: async () => ({ data: { enabled: true, provider: "mock", isConfigured: true } }) } as any;
      }
      if (u.includes("/ai/generate-workflow")) {
        return { ok: true, status: 200, json: async () => ({ data: { name: "Generated Lead Router", nodes: [{ id: "n1" }], edges: [] } }) } as any;
      }
      if (u.includes("/ai/refine-workflow")) {
        return { ok: true, status: 200, json: async () => ({ data: { summary: "Refined with filter", diff: { addedNodes: [{ id: "n2" }] } } }) } as any;
      }
      if (u.includes("/ai/explain-workflow")) {
        return { ok: true, status: 200, json: async () => ({ data: { summary: "Workflow explanation", mainExecutionPath: ["step 1"] } }) } as any;
      }
      if (u.includes("/ai/debug-execution")) {
        return { ok: true, status: 200, json: async () => ({ data: { conciseSummary: "Token expired", probableCause: "Auth error" } }) } as any;
      }
      if (u.includes("/ai/optimize-workflow")) {
        return { ok: true, status: 200, json: async () => ({ data: { recommendations: [{ id: "opt_1", title: "Add retry" }] } }) } as any;
      }
      if (u.includes("/ai/generate-tests")) {
        return { ok: true, status: 200, json: async () => ({ data: [{ name: "Generated Test 1", assertions: [] }] }) } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    const status = await client.ai.status();
    expect(status.data.enabled).toBe(true);

    const proposal = await client.ai.generateWorkflow({ prompt: "Route leads from webhook to Slack" });
    expect(proposal.data.name).toBe("Generated Lead Router");

    const refined = await client.ai.refineWorkflow({ prompt: "Add filter", currentNodes: [], currentEdges: [] });
    expect(refined.data.diff.addedNodes.length).toBe(1);

    const explained = await client.ai.explainWorkflow({ nodes: [], edges: [] });
    expect(explained.data.summary).toBe("Workflow explanation");

    const debugged = await client.ai.debugExecution("exec-failed-1");
    expect(debugged.data.probableCause).toBe("Auth error");

    const optimized = await client.ai.optimizeWorkflow("wf-1", { days: 7 });
    expect(optimized.data.recommendations.length).toBe(1);

    const tests = await client.ai.generateTests("wf-1", { count: 2 });
    expect(tests.data.length).toBe(1);
  });

  it("supports Phase 14 enterprise collaboration, governance, reviews, and SLO operations", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      const u = url.toString();
      if (u.includes("/organizations")) {
        return { ok: true, status: 200, json: async () => ({ organizations: [{ id: "org-1", name: "Acme Corp", slug: "acme" }] }) } as any;
      }
      if (u.includes("/teams")) {
        return { ok: true, status: 200, json: async () => ({ teams: [{ id: "team-1", name: "Platform Ops" }] }) } as any;
      }
      if (u.includes("/permissions")) {
        return { ok: true, status: 200, json: async () => ({ permissions: [{ id: "perm-1", accessLevel: "ADMIN" }] }) } as any;
      }
      if (u.includes("/governance/policy")) {
        return { ok: true, status: 200, json: async () => ({ policy: { requireWorkflowOwner: true } }) } as any;
      }
      if (u.includes("/reviews")) {
        return { ok: true, status: 200, json: async () => ({ reviews: [{ id: "rev-1", status: "SUBMITTED" }] }) } as any;
      }
      if (u.includes("/slo/objectives")) {
        return { ok: true, status: 200, json: async () => ({ objectives: [{ id: "slo-1", targetMetric: "SUCCESS_RATE", targetValue: 99.5 }] }) } as any;
      }
      if (u.includes("/compliance/audit")) {
        return { ok: true, status: 200, json: async () => ({ logs: [{ id: "log-1", action: "ORG_CREATE" }], pagination: { total: 1 } }) } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    const orgs = await client.organizations.list();
    expect(orgs.organizations[0].name).toBe("Acme Corp");

    const teams = await client.teams.list();
    expect(teams.teams[0].name).toBe("Platform Ops");

    const perms = await client.permissions.list();
    expect(perms.permissions[0].accessLevel).toBe("ADMIN");

    const policy = await client.governance.getPolicy();
    expect(policy.policy.requireWorkflowOwner).toBe(true);

    const reviews = await client.reviews.list();
    expect(reviews.reviews[0].status).toBe("SUBMITTED");

    const slos = await client.reliability.listObjectives();
    expect(slos.objectives[0].targetValue).toBe(99.5);

    const audit = await client.compliance.searchAuditLogs({ keyword: "ORG" });
    expect(audit.logs[0].action).toBe("ORG_CREATE");
  });

  it("supports Phase 15 high availability, outbox, backup verification, and disaster recovery operations", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      const u = url.toString();
      if (u.includes("/operations/overview")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            overview: {
              systemStatus: "HEALTHY",
              workerReliability: { fencingEnabled: true, activeLeases: 2 },
              outbox: { pendingCount: 0, deliveredCount: 42, deadLetterCount: 0 },
              disasterRecovery: { lastBackupStatus: "VERIFIED", rtoTargetSeconds: 300, rpoTargetSeconds: 3600 },
            },
          }),
        } as any;
      }
      if (u.includes("/operations/outbox/replay")) {
        return { ok: true, status: 200, json: async () => ({ success: true, replayedCount: 3 }) } as any;
      }
      if (u.includes("/operations/outbox")) {
        return { ok: true, status: 200, json: async () => ({ outbox: { pendingCount: 1, deadLetterCount: 0 } }) } as any;
      }
      if (u.includes("/operations/backup/verify")) {
        return { ok: true, status: 200, json: async () => ({ record: { status: "VERIFIED", checksumSha256: "abc123sha" } }) } as any;
      }
      if (u.includes("/operations/backup/verification")) {
        return { ok: true, status: 200, json: async () => ({ records: [{ id: "rec-1", status: "VERIFIED" }], drStatus: {} }) } as any;
      }
      if (u.includes("/operations/recovery/logs")) {
        return { ok: true, status: 200, json: async () => ({ logs: [{ id: "log-1", operationType: "BACKUP_VERIFICATION" }] }) } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    const overview = await client.operations.getOverview();
    expect(overview.overview.systemStatus).toBe("HEALTHY");
    expect(overview.overview.workerReliability.fencingEnabled).toBe(true);

    const outbox = await client.operations.getOutboxOverview();
    expect(outbox.outbox.pendingCount).toBe(1);

    const replay = await client.operations.replayOutbox({ limit: 10 });
    expect(replay.replayedCount).toBe(3);

    const drill = await client.operations.runBackupVerification({ dryRun: true });
    expect(drill.record.status).toBe("VERIFIED");

    const verifications = await client.operations.listBackupVerifications(5);
    expect(verifications.records[0].status).toBe("VERIFIED");

    const logs = await client.operations.getRecoveryLogs();
    expect(logs.logs[0].operationType).toBe("BACKUP_VERIFICATION");
  });
  it("Phase 16: Interacts with capacity analytics and regional placement via SDK", async () => {
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/operations/capacity")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            capacity: {
              deploymentTier: "Tier A (Horizontally Scalable Single-Region) / Tier B (Region-Aware Readiness)",
              authoritativeRegion: "us-east-1",
              workerCapacity: { totalCapacity: 10, allocatedConcurrency: 2, workerSaturationPercent: 20 },
              queueMetrics: { waitingJobs: 0, projectedDrainTimeSec: 0 },
              backpressure: { active: false, status: "NORMAL" },
              noisyNeighbors: [],
              regions: [{ regionKey: "us-east-1", isAuthoritative: true }],
            },
          }),
        } as any;
      }
      if (u.includes("/operations/regions/placement") && init?.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            workspace: { homeRegion: "eu-central-1", dataResidency: "EU", maxConcurrentExecutions: 20 },
          }),
        } as any;
      }
      if (u.includes("/operations/regions/failover-drill") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            drill: { drillId: "drill-123", sourceRegion: "us-east-1", targetRegion: "eu-central-1", failoverEpoch: 2, status: "COMPLETED" },
          }),
        } as any;
      }
      if (u.includes("/operations/regions")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            regions: [
              { regionKey: "us-east-1", isAuthoritative: true, status: "HEALTHY" },
              { regionKey: "eu-central-1", isAuthoritative: false, status: "STANDBY" },
            ],
          }),
        } as any;
      }
      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    // Test operations capacity
    const cap = await client.operations.getCapacity();
    expect(cap.capacity.deploymentTier).toContain("Tier A");
    expect(cap.capacity.authoritativeRegion).toBe("us-east-1");

    // Test scale namespace
    const regions = await client.scale.listRegions();
    expect(regions.regions.length).toBe(2);
    expect(regions.regions[0].regionKey).toBe("us-east-1");

    const placement = await client.scale.updatePlacement({ homeRegion: "eu-central-1", dataResidency: "EU", maxConcurrentExecutions: 20 });
    expect(placement.workspace.homeRegion).toBe("eu-central-1");
    expect(placement.workspace.maxConcurrentExecutions).toBe(20);

    const drill = await client.scale.runFailoverDrill({ sourceRegion: "us-east-1", targetRegion: "eu-central-1" });
    expect(drill.drill.failoverEpoch).toBe(2);
    expect(drill.drill.status).toBe("COMPLETED");
  });
  it("supports Phase 17 residency, CMEK, and legal hold operations", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody: any;

    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedUrl = url;
      capturedMethod = init.method || "GET";
      capturedBody = init.body ? JSON.parse(init.body) : undefined;

      if (url.includes("/residency/verify")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "VERIFIED",
            workspaceId: "ws-p17",
            homeRegion: "eu-central-1",
            workerRegion: "eu-central-1",
            verificationEvidence: { checkedAt: new Date().toISOString() },
          }),
        } as any;
      }

      if (url.includes("/residency") && init.method === "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            policy: {
              homeRegion: capturedBody.homeRegion,
              permittedProcessingRegions: capturedBody.permittedProcessingRegions,
            },
          }),
        } as any;
      }

      if (url.includes("/residency")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            policy: {
              homeRegion: "us-east-1",
              status: "ACTIVE",
            },
          }),
        } as any;
      }

      if (url.includes("/cmek/register")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            config: {
              keyProvider: capturedBody.keyProvider,
              keyReference: capturedBody.keyReference,
              keyStatus: "ACTIVE",
            },
          }),
        } as any;
      }

      if (url.includes("/cmek/rotate")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            jobId: "job-rot-1",
            previousKeyVersion: "1",
            newKeyVersion: "2",
            rotationEpoch: 2,
          }),
        } as any;
      }

      if (url.includes("/cmek/revoke")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            keyStatus: "REVOKED",
            revokedAt: new Date().toISOString(),
            reason: capturedBody.reason,
          }),
        } as any;
      }

      if (url.includes("/cmek")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            isConfigured: true,
            config: { keyReference: "kms-ref-1", keyStatus: "ACTIVE" },
            encryptionCoverage: { executionPayloads: true },
          }),
        } as any;
      }

      if (url.includes("/data-retention/legal-hold")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            policy: { legalHold: capturedBody.legalHold, reason: capturedBody.reason },
          }),
        } as any;
      }

      return { ok: true, status: 200, json: async () => ({}) } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    // Test residency namespace
    const pol = await client.residency.getPolicy();
    expect(pol.policy.homeRegion).toBe("us-east-1");

    const updatedPol = await client.residency.updatePolicy({
      homeRegion: "eu-central-1",
      permittedProcessingRegions: ["eu-central-1"],
      changeReason: "Data sovereign compliance requirement",
    });
    expect(updatedPol.policy.homeRegion).toBe("eu-central-1");

    const verification = await client.residency.verify();
    expect(verification.status).toBe("VERIFIED");
    expect(verification.workerRegion).toBe("eu-central-1");

    // Test CMEK namespace
    const cmekStatus = await client.cmek.getStatus();
    expect(cmekStatus.isConfigured).toBe(true);

    const reg = await client.cmek.register({
      keyProvider: "LOCAL",
      keyReference: "tenant-key-abc",
    });
    expect(reg.config.keyStatus).toBe("ACTIVE");

    const rot = await client.cmek.rotate({ reason: "Annual key refresh" });
    expect(rot.newKeyVersion).toBe("2");

    const rev = await client.cmek.revoke({ confirmRevocation: true, reason: "Security compromise drill" });
    expect(rev.keyStatus).toBe("REVOKED");

    // Test legal hold compliance
    const hold = await client.compliance.setLegalHold({ legalHold: true, reason: "Litigation investigation" });
    expect(hold.policy.legalHold).toBe(true);
  });

  it("supports Phase 18 Operational Incidents, Remediations, and Unified Health Observability", async () => {
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      const urlStr = url.toString();
      const method = init?.method || "GET";

      if (urlStr.includes("/incidents") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: "inc-1",
                title: "SLO BREACH: P95 Latency",
                severity: "CRITICAL",
                status: "OPEN",
                category: "SLO_BREACH",
              },
            ],
          }),
        } as any;
      }

      if (urlStr.includes("/incidents/simulate") && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: "inc-sim-1", title: "Test Incident", severity: "HIGH", status: "OPEN" },
          }),
        } as any;
      }

      if (urlStr.includes("/remediation/policy") && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              autonomyMode: "OBSERVE_ONLY",
              allowedActions: ["RETRY_RETRYABLE_EXECUTION"],
            },
          }),
        } as any;
      }

      if (urlStr.includes("/remediation/operations") && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: "op-1",
              actionKey: "RETRY_RETRYABLE_EXECUTION",
              status: "PENDING_APPROVAL",
            },
          }),
        } as any;
      }

      if (urlStr.includes("/observability/unified-health")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              overallStatus: "HEALTHY",
              sloAttainmentPct: 100,
              services: {
                workers: { status: "HEALTHY", activeWorkers: 1 },
                queues: { status: "HEALTHY", depth: 0 },
                executionEngine: { status: "HEALTHY", successRate24h: 99.8 },
                outbox: { status: "HEALTHY", pendingCount: 0, deadLetterCount: 0 },
                database: { status: "HEALTHY" },
                regions: { authoritativeRegion: "us-east-1" },
              },
            },
          }),
        } as any;
      }

      return { ok: true, status: 200, json: async () => ({ data: {} }) } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    // 1. Incidents
    const incidents = await client.incidents.list({ status: "OPEN" });
    expect(incidents.data.length).toBe(1);
    expect(incidents.data[0].severity).toBe("CRITICAL");

    const sim = await client.incidents.simulate({ title: "Test Incident", severity: "HIGH" });
    expect(sim.data.id).toBe("inc-sim-1");

    // 2. Remediations
    const policy = await client.remediations.getPolicy();
    expect(policy.data.autonomyMode).toBe("OBSERVE_ONLY");

    const op = await client.remediations.requestAction({
      actionKey: "RETRY_RETRYABLE_EXECUTION",
      targetType: "EXECUTION",
      targetId: "exec-123",
    });
    expect(op.data.status).toBe("PENDING_APPROVAL");

    // 3. Unified Health Observability
    const health = await client.observability.getUnifiedHealth();
    expect(health.data.overallStatus).toBe("HEALTHY");
    expect(health.data.services.workers.status).toBe("HEALTHY");
  });

  it("Phase 19: supports connectors namespace and SDK developer tools", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody: any;

    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method || "GET";
      capturedBody = init?.body ? JSON.parse(init.body) : undefined;

      if (capturedUrl.includes("/connectors/validate-manifest")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            valid: true,
            hash: "canonical-hash-1234567890abcdef",
          }),
        } as any;
      }

      if (capturedUrl.includes("/connectors/drafts")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "artifact-123",
            connectorKey: "acme-crm",
            version: "1.0.0",
            status: "DRAFT",
          }),
        } as any;
      }

      if (capturedUrl.includes("/connectors/artifact-123/certify")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            overallResult: "PASSED",
            checks: [
              { checkName: "MANIFEST_SCHEMA_VALIDITY", status: "PASSED" },
              { checkName: "ARTIFACT_PROVENANCE_INTEGRITY", status: "PASSED" },
            ],
          }),
        } as any;
      }

      if (capturedUrl.includes("/connectors/artifact-123/publish")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "artifact-123",
            status: "PUBLISHED",
          }),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    // Validate manifest
    const valRes = await client.connectors.validateManifest({ id: "acme-crm", name: "Acme CRM" });
    expect(valRes.valid).toBe(true);
    expect(valRes.hash).toBe("canonical-hash-1234567890abcdef");

    // Create draft
    const draft = await client.connectors.createDraft({ id: "acme-crm", version: "1.0.0" });
    expect(draft.id).toBe("artifact-123");
    expect(draft.status).toBe("DRAFT");

    // Certify
    const cert = await client.connectors.certify("artifact-123");
    expect(cert.overallResult).toBe("PASSED");

    // Publish
    const pub = await client.connectors.publish("artifact-123", {
      expectedArtifactHashSha256: "canonical-hash-1234567890abcdef",
    });
    expect(pub.status).toBe("PUBLISHED");
  });

  it("should support Phase 20 digital twin simulations, chaos experiments, and optimizations", async () => {
    (global as any).fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
      const u = String(url);
      if (u.includes("/workflows/wf-1/simulations/run")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              simulationRun: { id: "sim-123", status: "SIMULATED_SUCCESS", workflowArtifactHash: "hash-abc" },
              summary: { status: "SIMULATED_SUCCESS", virtualDurationMs: 80, allAssertionsPassed: true },
            },
          }),
        } as any;
      }

      if (u.includes("/releases/rel-1/simulation-gates/env-1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { valid: true, artifactHash: "hash-abc", simulationPassed: true, reasons: [] },
          }),
        } as any;
      }

      if (u.includes("/chaos/experiments")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: "chaos-123", status: "PENDING_APPROVAL", faultType: "WORKER_LOSS" },
          }),
        } as any;
      }

      if (u.includes("/workflows/wf-1/optimizations/candidates")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: "opt-123", title: "Merge Transforms", status: "DRAFT" },
          }),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { success: true } }),
      } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    // Run digital twin simulation
    const simRes = await client.simulations.run("wf-1", { syntheticTrigger: { user: "alice" } });
    expect(simRes.data.simulationRun.id).toBe("sim-123");
    expect(simRes.data.simulationRun.status).toBe("SIMULATED_SUCCESS");

    // Evaluate release gates
    const gateRes = await client.simulations.evaluateReleaseGates("rel-1", "env-1");
    expect(gateRes.data.valid).toBe(true);
    expect(gateRes.data.simulationPassed).toBe(true);

    // Create chaos experiment
    const chaosRes = await client.chaos.createExperiment({
      name: "Worker resilience drill",
      targetEnvironmentId: "env-staging-123",
      faultType: "WORKER_LOSS",
    });
    expect(chaosRes.data.id).toBe("chaos-123");

    // Create optimization candidate
    const optRes = await client.optimizations.compareAndCreateCandidate("wf-1", {
      title: "Consolidate linear transformations",
      summary: "Merge transform steps into single mapping",
      candidateNodes: [],
      candidateEdges: [],
    });
    expect(optRes.data.id).toBe("opt-123");
    expect(optRes.data.status).toBe("DRAFT");
  });

  it("supports Phase 21 Business Process Intelligence and Process Mining namespaces", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      const u = url.toString();

      if (u.includes("/processes/events/ingest")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              event: { id: "evt-123", eventType: "MILESTONE_COMPLETED" },
              instance: { id: "inst-123", status: "IN_PROGRESS" },
              deduplicated: false,
            },
          }),
        } as any;
      }

      if (u.includes("/processes/proc-1/mining")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              processDefinitionId: "proc-1",
              dataSufficiency: "SUFFICIENT",
              observedPaths: [{ path: ["Order", "Fulfill"], frequency: 10, percentage: 100 }],
              bottlenecks: [],
              recommendations: [],
            },
          }),
        } as any;
      }

      if (u.includes("/processes/proc-1/metrics")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              processDefinitionId: "proc-1",
              totalInstances: 15,
              completionRate: 93.3,
              medianDurationMs: 4200,
            },
          }),
        } as any;
      }

      if (u.includes("/processes/proc-1/sla-policies")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: "sla-1", targetDurationMs: 60000, warningThresholdMs: 45000 },
          }),
        } as any;
      }

      if (u.includes("/processes")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: "proc-1", name: "Order To Cash", slug: "order-to-cash" },
          }),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { success: true } }),
      } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    // Ingest process event
    const evtRes = await client.processes.ingestEvent({
      processDefinitionId: "proc-1",
      correlationKey: "ord-999",
      milestoneId: "ms-order",
      eventType: "MILESTONE_COMPLETED",
    });
    expect(evtRes.data.event.id).toBe("evt-123");
    expect(evtRes.data.deduplicated).toBe(false);

    // Mine process
    const miningRes = await client.processes.mine("proc-1", 30);
    expect(miningRes.data.dataSufficiency).toBe("SUFFICIENT");
    expect(miningRes.data.observedPaths).toHaveLength(1);

    // Process metrics
    const metricsRes = await client.processes.getMetrics("proc-1", 30);
    expect(metricsRes.data.totalInstances).toBe(15);
    expect(metricsRes.data.completionRate).toBe(93.3);

    // SLA Policy
    const slaRes = await client.processes.getSlaPolicy("proc-1");
    expect(slaRes.data.targetDurationMs).toBe(60000);
  });

  it("supports Phase 22 Enterprise Event-Driven Integration Fabric namespaces", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      const u = url.toString();

      if (u.includes("/events/ingest/batch")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { total: 2, accepted: 2, duplicates: 0, rejected: 0, results: [] },
          }),
        } as any;
      }

      if (u.includes("/events/ingest")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: { eventId: "evt-999", eventType: "order.placed", status: "ACCEPTED", dispatchedDeliveriesCount: 1 },
          }),
        } as any;
      }

      if (u.includes("/events/schemas")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { eventType: "order.placed", compatibilityMode: "BACKWARD", activeVersionNumber: 1 },
          }),
        } as any;
      }

      if (u.includes("/events/subscriptions")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: "sub-123", name: "Order Fulfillment Listener", status: "ACTIVE" },
          }),
        } as any;
      }

      if (u.includes("/events/metrics")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { ingestedCount: 50, deliveredCount: 48, deadLetterCount: 2, medianLatencyMs: 140 },
          }),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { success: true } }),
      } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    // Single Ingest
    const singleRes = await client.events.ingest({
      eventType: "order.placed",
      data: { orderId: "ord-101", amount: 99 },
    });
    expect(singleRes.data.eventId).toBe("evt-999");
    expect(singleRes.data.status).toBe("ACCEPTED");

    // Batch Ingest
    const batchRes = await client.events.ingestBatch([
      { eventType: "order.placed", data: { id: "1" } },
      { eventType: "order.placed", data: { id: "2" } },
    ]);
    expect(batchRes.data.total).toBe(2);
    expect(batchRes.data.accepted).toBe(2);

    // Schema
    const schemaRes = await client.events.getSchema("order.placed");
    expect(schemaRes.data.eventType).toBe("order.placed");
    expect(schemaRes.data.compatibilityMode).toBe("BACKWARD");

    // Subscription
    const subRes = await client.events.getSubscription("sub-123");
    expect(subRes.data.name).toBe("Order Fulfillment Listener");

    // Metrics
    const metricsRes = await client.events.getMetrics(24);
    expect(metricsRes.data.deliveredCount).toBe(48);
    expect(metricsRes.data.deadLetterCount).toBe(2);
  });

  it("interacts with Phase 23 Enterprise Data Intelligence endpoints via SDK", async () => {
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      const u = String(url);
      const method = init?.method || "GET";

      if (u.includes("/data-products") && method === "POST" && !u.includes("/query")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: { id: "dp-1", slug: "order-summary", name: "Order Summary", currentVersion: 1, lifecycleStatus: "DRAFT" },
          }),
        } as any;
      }

      if (u.includes("/data-products/dp-1/query")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { records: [{ orderId: "ord-1", amount: 150 }], total: 1, limit: 50, cursor: 0 },
          }),
        } as any;
      }

      if (u.includes("/data-sources") && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: { id: "ds-1", slug: "workflow-source", sourceType: "WORKFLOW_EXECUTION" },
          }),
        } as any;
      }

      if (u.includes("/data-pipelines/pipe-1/run")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { runId: "run-100", status: "SUCCESS", recordsWritten: 25 },
          }),
        } as any;
      }

      if (u.includes("/data-lineage")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { nodes: [{ nodeKey: "product:order-summary", nodeType: "DATA_PRODUCT" }], edges: [] },
          }),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: {} }),
      } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    // Create Data Product
    const dp = await client.dataProducts.create({
      slug: "order-summary",
      name: "Order Summary",
    });
    expect(dp.data.slug).toBe("order-summary");

    // Query Data Product
    const queryRes = await client.dataProducts.query("dp-1", { limit: 10 });
    expect(queryRes.data.records.length).toBe(1);

    // Register Source
    const src = await client.dataSources.register({
      slug: "workflow-source",
      name: "Workflow Source",
      sourceType: "WORKFLOW_EXECUTION",
      resourceReference: "wf-1",
    });
    expect(src.data.slug).toBe("workflow-source");

    // Run Pipeline
    const runRes = await client.dataPipelines.run("pipe-1", { runType: "MANUAL" });
    expect(runRes.data.status).toBe("SUCCESS");

    // Get Lineage
    const lineage = await client.dataLineage.getGraph();
    expect(lineage.data.nodes.length).toBe(1);
  });

  it("supports Phase 24 Enterprise AI Intelligence and Decision Support methods via SDK", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: any, init: any) => {
      const u = String(url);
      const method = init?.method || "GET";

      if (u.includes("/intelligence/overview")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              workspacesCount: 1,
              activeInsightsCount: 3,
              pendingProposalsCount: 2,
              evaluationsCount: 5,
            },
          }),
        } as any;
      }

      if (u.includes("/intelligence/workspaces") && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: {
              id: "iw-1",
              name: "Operations Intelligence",
              domain: "OPERATIONS",
            },
          }),
        } as any;
      }

      if (u.includes("/intelligence/insights/analyze") && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              generatedCount: 2,
              deduplicatedCount: 1,
              insights: [{ id: "ins-1", category: "WORKFLOW_RELIABILITY_REGRESSION" }],
            },
          }),
        } as any;
      }

      if (u.includes("/intelligence/forecasts/run") && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: "fc-1",
              targetMetric: "EXECUTION_DURATION",
              forecastStatus: "COMPLETED",
              predictedMean: 450.5,
            },
          }),
        } as any;
      }

      if (u.includes("/intelligence/investigations") && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: {
              id: "inv-1",
              symptomDescription: "High retry rate on invoice webhook",
              timeline: [{ service: "Event Fabric", severity: "CRITICAL" }],
            },
          }),
        } as any;
      }

      if (u.includes("/approve")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: "prop-1",
              status: "APPROVED",
              approvalNotes: "Approved by lead SRE",
            },
          }),
        } as any;
      }

      if (u.includes("/execute")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: "prop-1",
              status: "SUCCEEDED",
              executionResult: { success: true },
            },
          }),
        } as any;
      }

      if (u.includes("/outcomes/evaluate")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: "eval-1",
              proposalId: "prop-1",
              outcomeVerdict: "IMPROVED",
            },
          }),
        } as any;
      }

      if (u.includes("/intelligence/proposals") && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: {
              id: "prop-1",
              title: "Replay dead-letter deliveries",
              status: "DRAFT",
              actionType: "REPLAY_EVENT_DELIVERY",
            },
          }),
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: {} }),
      } as any;
    });

    const client = new FlowForgeClient({ apiKey: "ff_live_valid" });

    // Overview
    const overview = await client.intelligence.getOverview();
    expect(overview.data.activeInsightsCount).toBe(3);

    // Workspace
    const ws = await client.intelligence.workspaces.create({
      name: "Operations Intelligence",
      domain: "OPERATIONS",
    });
    expect(ws.data.id).toBe("iw-1");

    // Insight Analysis
    const analysis = await client.intelligence.insights.analyze({
      intelligenceWorkspaceId: "iw-1",
    });
    expect(analysis.data.generatedCount).toBe(2);

    // Forecast
    const forecast = await client.intelligence.forecasts.run({
      targetMetric: "EXECUTION_DURATION",
      targetResourceId: "wf-1",
    });
    expect(forecast.data.forecastStatus).toBe("COMPLETED");

    // Investigation
    const inv = await client.intelligence.investigations.start({
      symptomDescription: "High retry rate on invoice webhook",
    });
    expect(inv.data.id).toBe("inv-1");

    // Decision Proposal lifecycle
    const prop = await client.intelligence.proposals.create({
      title: "Replay dead-letter deliveries",
      description: "Auto-replay dead letters",
      actionType: "REPLAY_EVENT_DELIVERY",
      targetResourceId: "sub-1",
    });
    expect(prop.data.status).toBe("DRAFT");

    const approved = await client.intelligence.proposals.approve("prop-1", { notes: "Approved by lead SRE" });
    expect(approved.data.status).toBe("APPROVED");

    const executed = await client.intelligence.proposals.execute("prop-1");
    expect(executed.data.status).toBe("SUCCEEDED");

    const evaluated = await client.intelligence.outcomes.evaluate("prop-1");
    expect(evaluated.data.outcomeVerdict).toBe("IMPROVED");
  });


  it("Phase 25: verifies Customer Operations and Customer 360 client namespace methods", async () => {
    const client = new FlowForgeClient({ apiKey: "ff_live_testkey123" });

    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      const u = url.toString();
      const method = init?.method || "GET";

      if (u.includes("/customers/accounts") && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ success: true, data: { id: "cust-1", name: "Acme Corp", slug: "acme-corp" } }),
        };
      }
      if (u.includes("/customers/accounts/cust-1/360")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { account: { id: "cust-1", name: "Acme Corp" }, healthScore: 92 } }),
        };
      }
      if (u.includes("/customers/journeys/definitions")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [{ id: "jd-1", name: "Enterprise Onboarding" }] }),
        };
      }
      if (u.includes("/customers/health/model")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { name: "Standard Health Model", version: 1 } }),
        };
      }
      if (u.includes("/customers/playbooks/runs")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [{ id: "run-1", status: "RUNNING" }] }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      };
    });

    const account = await client.customers.accounts.create({ name: "Acme Corp", slug: "acme-corp" });
    expect(account.data.slug).toBe("acme-corp");

    const profile360 = await client.customers.accounts.get360("cust-1");
    expect(profile360.data.account.name).toBe("Acme Corp");

    const definitions = await client.customers.journeys.listDefinitions();
    expect(definitions.data.length).toBe(1);

    const healthModel = await client.customers.health.getModel();
    expect(healthModel.data.version).toBe(1);

    const playbookRuns = await client.customers.playbooks.listRuns();
    expect(playbookRuns.data.length).toBe(1);
  });

  it("should support Phase 26 Revenue Intelligence, Renewals, Risk, and Expansion methods", async () => {
    const client = new FlowForgeClient({ apiKey: "ff_live_testkey123" });
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      const u = url.toString();
      if (u.includes("/evaluate-risk")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { riskLevel: "LOW", riskScore: 10, isLatest: true } }),
        };
      }
      if (u.includes("/customer-contracts") && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ success: true, data: { id: "cnt-1", contractNumber: "CNT-2026-001", contractValue: 120000, currency: "USD" } }),
        };
      }
      if (u.includes("/customer-renewals") && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ success: true, data: { id: "ren-1", opportunityNumber: "REN-2026-001", renewalAmount: 120000, stage: "UPCOMING" } }),
        };
      }
      if (u.includes("/customer-expansion") && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ success: true, data: { id: "exp-1", opportunityNumber: "EXP-2026-001", stage: "DETECTED", estimatedValue: 35000 } }),
        };
      }
      if (u.includes("/customer-revenue/policy") && (!init || init?.method === "GET")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { policyVersion: "1.0", renewalPreparationDays: 90, autoTaskGeneration: true } }),
        };
      }
      if (u.includes("/revenue/overview")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              currency: "USD",
              totalActiveContracts: 12,
              totalContractValue: 480000,
              totalAnnualRecurringRevenue: 480000,
              upcomingRenewalsCount: 3,
              revenueAtRiskValue: 50000,
              expansionPipeline: { totalDetected: 2, totalQualified: 4, pipelineValue: 125000, opportunitiesCount: 6 },
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      };
    });

    // 1. Contract creation
    const contract = await client.revenue.contracts.create({
      customerAccountId: "acc-1",
      contractNumber: "CNT-2026-001",
      name: "Acme Master Subscription",
      contractValue: 120000,
      currency: "USD",
    });
    expect(contract.data.contractNumber).toBe("CNT-2026-001");

    // 2. Renewal opportunity creation
    const renewal = await client.revenue.renewals.create({
      contractId: "cnt-1",
      opportunityNumber: "REN-2026-001",
      renewalAmount: 120000,
      targetDate: "2027-01-01T00:00:00Z",
    });
    expect(renewal.data.stage).toBe("UPCOMING");

    // 3. Risk evaluation
    const risk = await client.revenue.renewals.evaluateRisk("ren-1");
    expect(risk.data.riskLevel).toBe("LOW");

    // 4. Expansion opportunity
    const expansion = await client.revenue.expansion.create({
      customerAccountId: "acc-1",
      opportunityNumber: "EXP-2026-001",
      opportunityType: "ADDITIONAL_CAPACITY",
      title: "Scale 100k API calls",
      estimatedValue: 35000,
    });
    expect(expansion.data.stage).toBe("DETECTED");

    // 5. Policy & Overview
    const policy = await client.revenue.policy.get();
    expect(policy.data.renewalPreparationDays).toBe(90);

    const overview = await client.revenue.getOverview("USD");
    expect(overview.data.totalActiveContracts).toBe(12);
    expect(overview.data.expansionPipeline.pipelineValue).toBe(125000);
  });

});
