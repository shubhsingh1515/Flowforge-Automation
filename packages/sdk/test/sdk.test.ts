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
});
