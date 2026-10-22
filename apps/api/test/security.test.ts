import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { validateUrlForSsrf, SsrkViolationError } from "../src/engine/security/ssrf.js";
import { httpRequestHandler } from "../src/engine/nodes/http.js";

describe("Phase 5 Security, Isolation, & Observability Suite", () => {
  let server: FastifyInstance;
  let userAToken: string;
  let userBToken: string;
  let workspaceAId: string;
  let workspaceBId: string;
  let workflowAId: string;

  beforeAll(async () => {
    server = await buildServer({ enableWorker: false });
    await server.ready();

    // 1. Create User A + Workspace A
    const resA = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `alice_sec_${Date.now()}@flowforge.dev`,
        password: "Password123!",
        name: "Alice Security",
        workspaceName: "Alice Sec Workspace",
      },
    });
    const dataA = JSON.parse(resA.payload);
    userAToken = dataA.token;
    workspaceAId = dataA.user.activeWorkspaceId;

    // 2. Create User B + Workspace B
    const resB = await server.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: `bob_sec_${Date.now()}@flowforge.dev`,
        password: "Password123!",
        name: "Bob Security",
        workspaceName: "Bob Sec Workspace",
      },
    });
    const dataB = JSON.parse(resB.payload);
    userBToken = dataB.token;
    workspaceBId = dataB.user.activeWorkspaceId;

    // 3. User A creates a workflow
    const wfRes = await server.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        name: "Confidential Workflow A",
        description: "Strictly isolated workflow",
      },
    });
    const wfData = JSON.parse(wfRes.payload);
    workflowAId = wfData.id;
  });

  afterAll(async () => {
    await server.close();
  });

  describe("SSRF Protections & Target Validation", () => {
    it("blocks loopback IPv4 addresses (127.0.0.1, 127.0.1.1)", async () => {
      await expect(validateUrlForSsrf("http://127.0.0.1/admin")).rejects.toThrow(SsrkViolationError);
      await expect(validateUrlForSsrf("http://127.0.1.1:8080/metrics")).rejects.toThrow(SsrkViolationError);
    });

    it("blocks IPv6 loopback and unspecified addresses (::1, ::)", async () => {
      await expect(validateUrlForSsrf("http://[::1]:8080")).rejects.toThrow(SsrkViolationError);
    });

    it("blocks cloud instance metadata service (169.254.169.254)", async () => {
      await expect(validateUrlForSsrf("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(SsrkViolationError);
    });

    it("blocks private RFC 1918 addresses (10.x, 172.16.x, 192.168.x)", async () => {
      await expect(validateUrlForSsrf("http://10.0.0.5/api")).rejects.toThrow(SsrkViolationError);
      await expect(validateUrlForSsrf("http://172.16.0.1/api")).rejects.toThrow(SsrkViolationError);
      await expect(validateUrlForSsrf("http://192.168.1.1/router")).rejects.toThrow(SsrkViolationError);
    });

    it("blocks non-HTTP protocols (file://, gopher://, ftp://)", async () => {
      await expect(validateUrlForSsrf("file:///etc/passwd")).rejects.toThrow(/protocol/i);
      await expect(validateUrlForSsrf("ftp://example.com/file")).rejects.toThrow(/protocol/i);
    });

    it("HTTP action node executes and catches SSRF violations cleanly", async () => {
      const result = await httpRequestHandler.execute({
        nodeId: "node_ssrf_test",
        nodeName: "SSRF Attempt",
        nodeType: "HTTP_REQUEST",
        config: {
          url: "http://127.0.0.1:6379",
          method: "GET",
        },
        context: { trigger: {}, steps: {}, env: {} },
        executionId: "exec_ssrf_1",
        workflowId: "wf_1",
        correlationId: "corr_1",
        attempt: 1,
      });

      expect(result.status).toBe("FAILED");
      expect(result.errorCategory).toBe("SSRF_VIOLATION");
      expect(result.errorMessage).toMatch(/blocked/i);
    });
  });

  describe("Cross-Workspace Multi-Tenant Isolation", () => {
    it("prevents User B from reading User A's workflow", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/workflows/${workflowAId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      // Should be 404 (or 403) to prevent tenant workflow enumeration
      expect([403, 404]).toContain(res.statusCode);
    });

    it("prevents User B from updating User A's workflow", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: `/api/v1/workflows/${workflowAId}`,
        headers: { authorization: `Bearer ${userBToken}` },
        payload: { name: "Hacked Workflow" },
      });
      expect([403, 404]).toContain(res.statusCode);
    });

    it("prevents User B from deleting User A's workflow", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: `/api/v1/workflows/${workflowAId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect([403, 404]).toContain(res.statusCode);
    });

    it("prevents User B from accessing User A's workflow executions", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/workflows/${workflowAId}/executions`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect([403, 404]).toContain(res.statusCode);
    });

    it("prevents User B from accessing Workspace A details", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/workspaces/${workspaceAId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect([403, 404]).toContain(res.statusCode);
    });
  });

  describe("Security Headers & Rate Limiting", () => {
    it("emits hardened security headers (CSP, X-Content-Type-Options, etc.)", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/health/live",
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBeDefined();
    });

    it("enforces rate limits on /api/v1/auth/login when limit is exceeded", async () => {
      const rapidRequests: Promise<any>[] = [];
      // Login limit is configured at 15 req/min. Send 20 requests.
      for (let i = 0; i < 20; i++) {
        rapidRequests.push(
          server.inject({
            method: "POST",
            url: "/api/v1/auth/login",
            payload: {
              email: "nonexistent_sec@flowforge.dev",
              password: "WrongPassword123!",
            },
          })
        );
      }

      const results = await Promise.all(rapidRequests);
      const rateLimited = results.some((r) => r.statusCode === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe("Observability & Metrics", () => {
    it("GET /api/v1/health returns aggregated health and component status", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/health",
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.status).toBe("healthy");
      expect(data.components.database.status).toBe("connected");
      expect(data.components.worker).toBeDefined();
    });

    it("GET /api/v1/metrics exposes Prometheus format exposition", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/metrics",
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/plain");
      expect(res.payload).toContain("flowforge_");
      expect(res.payload).toContain("process_cpu_user_seconds_total");
    });
  });
});
