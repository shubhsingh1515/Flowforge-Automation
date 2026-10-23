/**
 * Official TypeScript SDK for FlowForge Automation SaaS
 */

export interface FlowForgeClientOptions {
  /**
   * FlowForge Workspace API Key (starts with ff_live_ or ff_test_)
   */
  apiKey: string;
  /**
   * Base API URL (e.g. "https://api.flowforge.dev/api/v1" or "http://localhost:4000/api/v1")
   */
  baseUrl?: string;
  /**
   * Default timeout in milliseconds (default: 30000ms)
   */
  timeoutMs?: number;
}

export interface RequestOptions {
  idempotencyKey?: string;
  traceparent?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

// ==========================================
// ERROR HIERARCHY
// ==========================================

export class FlowForgeError extends Error {
  public readonly statusCode?: number;
  public readonly details?: any;

  constructor(message: string, statusCode?: number, details?: any) {
    super(message);
    this.name = "FlowForgeError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class AuthenticationError extends FlowForgeError {
  constructor(message = "Invalid or expired API Key", details?: any) {
    super(message, 401, details);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends FlowForgeError {
  constructor(message = "Access forbidden for this workspace or resource", details?: any) {
    super(message, 403, details);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends FlowForgeError {
  constructor(message = "Requested resource was not found", details?: any) {
    super(message, 404, details);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends FlowForgeError {
  constructor(message = "Validation failed for request parameters", details?: any) {
    super(message, 400, details);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends FlowForgeError {
  public readonly retryAfterSeconds?: number;

  constructor(message = "API rate limit exceeded. Please back off.", retryAfterSeconds?: number, details?: any) {
    super(message, 429, details);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class TimeoutError extends FlowForgeError {
  constructor(message = "Request timed out") {
    super(message, 408);
    this.name = "TimeoutError";
  }
}

// ==========================================
// CLIENT IMPLEMENTATION
// ==========================================

export class FlowForgeClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: FlowForgeClientOptions) {
    if (!options.apiKey) {
      throw new AuthenticationError("API Key is required to initialize FlowForgeClient");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "http://localhost:4000/api/v1").replace(/\/$/, "");
    this.defaultTimeoutMs = options.timeoutMs || 30000;
  }

  /**
   * Internal HTTP request dispatcher
   */
  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
    body?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
      "Authorization": `Bearer ${this.apiKey}`,
      "User-Agent": "flowforge-typescript-sdk/1.0.0",
      ...(options.headers || {}),
    };

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    if (options.traceparent) {
      headers["traceparent"] = options.traceparent;
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          throw new AuthenticationError(data.message || "Invalid or revoked API Key", data);
        }
        if (res.status === 403) {
          throw new ForbiddenError(data.message || "Forbidden action", data);
        }
        if (res.status === 404) {
          throw new NotFoundError(data.message || "Resource not found", data);
        }
        if (res.status === 400) {
          throw new ValidationError(data.message || "Validation error", data.details);
        }
        if (res.status === 429) {
          const retryHeader = res.headers.get("Retry-After");
          const retryAfter = retryHeader ? parseInt(retryHeader, 10) : undefined;
          throw new RateLimitError(data.message || "Too many requests", retryAfter, data);
        }
        throw new FlowForgeError(data.message || `Request failed with status ${res.status}`, res.status, data);
      }

      return data as T;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new TimeoutError(`Request to ${cleanEndpoint} timed out after ${timeoutMs}ms`);
      }
      if (err instanceof FlowForgeError) {
        throw err;
      }
      throw new FlowForgeError(err.message || "Network error communicating with FlowForge API");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ==========================================
  // WORKFLOWS RESOURCE
  // ==========================================
  public readonly workflows = {
    list: async (params?: { search?: string; status?: string; page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set("search", params.search);
      if (params?.status) q.set("status", params.status);
      if (params?.page) q.set("page", params.page.toString());
      if (params?.limit) q.set("limit", params.limit.toString());
      const qs = q.toString();
      return this.request<{ data: any[]; meta: any }>(`/workflows${qs ? `?${qs}` : ""}`);
    },

    get: async (workflowId: string) => {
      return this.request<{ workflow: any }>(`/workflows/${workflowId}`);
    },

    create: async (data: {
      name: string;
      description?: string;
      triggerType?: string;
      nodes?: any[];
      edges?: any[];
    }) => {
      return this.request<{ workflow: any }>("/workflows", "POST", data);
    },

    update: async (workflowId: string, data: any) => {
      return this.request<{ workflow: any }>(`/workflows/${workflowId}`, "PUT", data);
    },

    delete: async (workflowId: string) => {
      return this.request<{ success: boolean }>(`/workflows/${workflowId}`, "DELETE");
    },

    activate: async (workflowId: string) => {
      return this.request<{ success: boolean; status: string }>(`/workflows/${workflowId}/activate`, "POST");
    },

    pause: async (workflowId: string) => {
      return this.request<{ success: boolean; status: string }>(`/workflows/${workflowId}/pause`, "POST");
    },
  };

  // ==========================================
  // EXECUTIONS RESOURCE
  // ==========================================
  public readonly executions = {
    list: async (params?: { workflowId?: string; status?: string; page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.workflowId) q.set("workflowId", params.workflowId);
      if (params?.status) q.set("status", params.status);
      if (params?.page) q.set("page", params.page.toString());
      if (params?.limit) q.set("limit", params.limit.toString());
      const qs = q.toString();
      return this.request<{ data: any[]; meta: any }>(`/executions${qs ? `?${qs}` : ""}`);
    },

    get: async (executionId: string) => {
      return this.request<{ execution: any }>(`/executions/${executionId}`);
    },

    trigger: async (
      workflowId: string,
      payload: any = {},
      options?: RequestOptions
    ) => {
      return this.request<{ execution: any; queued: boolean }>(
        `/workflows/${workflowId}/test`,
        "POST",
        { triggerPayload: payload },
        options
      );
    },

    cancel: async (executionId: string, reason?: string) => {
      return this.request<{ success: boolean; message: string }>(
        `/executions/${executionId}/cancel`,
        "POST",
        { reason: reason || "Cancelled via TypeScript SDK" }
      );
    },
  };

  // ==========================================
  // TEMPLATES RESOURCE
  // ==========================================
  public readonly templates = {
    list: async (params?: { category?: string; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.category) q.set("category", params.category);
      if (params?.search) q.set("search", params.search);
      const qs = q.toString();
      return this.request<{ templates: any[] }>(`/templates${qs ? `?${qs}` : ""}`);
    },

    get: async (templateId: string) => {
      return this.request<{ template: any }>(`/templates/${templateId}`);
    },

    use: async (templateId: string, options?: { name?: string }) => {
      return this.request<{ workflow: any }>(`/templates/${templateId}/use`, "POST", options || {});
    },
  };

  // ==========================================
  // SYSTEM HEALTH
  // ==========================================
  // ==========================================
  // ENVIRONMENTS RESOURCE
  // ==========================================
  public readonly environments = {
    list: async () => {
      return this.request<{ data: any[] }>("/environments");
    },
    get: async (idOrSlug: string) => {
      return this.request<{ data: any }>(`/environments/${idOrSlug}`);
    },
    create: async (data: { name: string; slug: string; type?: string; description?: string; isProtected?: boolean; requireApproval?: boolean; requirePassingTests?: boolean }) => {
      return this.request<{ data: any }>("/environments", "POST", data);
    },
    update: async (id: string, data: any) => {
      return this.request<{ data: any }>(`/environments/${id}`, "PATCH", data);
    },
    listVariables: async (environmentId: string) => {
      return this.request<{ data: any[] }>(`/environments/${environmentId}/variables`);
    },
    setVariable: async (environmentId: string, data: { key: string; value: string; isSecret?: boolean; description?: string }) => {
      return this.request<{ data: any }>(`/environments/${environmentId}/variables`, "POST", data);
    },
    deleteVariable: async (environmentId: string, key: string) => {
      return this.request<{ data: any }>(`/environments/${environmentId}/variables/${key}`, "DELETE");
    },
    listBindings: async (environmentId: string) => {
      return this.request<{ data: any[] }>(`/environments/${environmentId}/bindings`);
    },
    setBinding: async (environmentId: string, data: { integrationKey: string; connectedAccountId: string }) => {
      return this.request<{ data: any }>(`/environments/${environmentId}/bindings`, "POST", data);
    },
    deleteBinding: async (environmentId: string, integrationKey: string) => {
      return this.request<{ data: any }>(`/environments/${environmentId}/bindings/${integrationKey}`, "DELETE");
    },
  };

  // ==========================================
  // RELEASES RESOURCE
  // ==========================================
  public readonly releases = {
    list: async (workflowId: string) => {
      return this.request<{ data: any[] }>(`/workflows/${workflowId}/releases`);
    },
    get: async (releaseId: string) => {
      return this.request<{ data: any }>(`/releases/${releaseId}`);
    },
    create: async (workflowId: string, options?: { summary?: string; workflowVersionId?: string }) => {
      return this.request<{ data: any }>(`/workflows/${workflowId}/releases`, "POST", options || {});
    },
  };

  // ==========================================
  // DEPLOYMENTS RESOURCE
  // ==========================================
  public readonly deployments = {
    list: async (params?: { environmentId?: string; workflowId?: string }) => {
      const q = new URLSearchParams();
      if (params?.environmentId) q.set("environmentId", params.environmentId);
      if (params?.workflowId) q.set("workflowId", params.workflowId);
      const qs = q.toString();
      return this.request<{ data: any[] }>(`/deployments${qs ? `?${qs}` : ""}`);
    },
    get: async (deploymentId: string) => {
      return this.request<{ data: any }>(`/deployments/${deploymentId}`);
    },
    validate: async (data: { releaseArtifactId: string; environmentId: string }) => {
      return this.request<{ data: any }>("/deployments/validate", "POST", data);
    },
    promote: async (data: { workflowId: string; releaseArtifactId: string; environmentId: string; expectedCurrentReleaseId?: string }, options?: RequestOptions) => {
      return this.request<{ data: any }>("/deployments/promote", "POST", data, options);
    },
    decide: async (deploymentId: string, decision: "APPROVED" | "REJECTED", comment?: string) => {
      return this.request<{ data: any }>(`/deployments/${deploymentId}/decision`, "POST", { decision, comment });
    },
    rollback: async (data: { targetReleaseArtifactId: string; environmentId: string; reason?: string }, options?: RequestOptions) => {
      return this.request<{ data: any }>("/deployments/rollback", "POST", data, options);
    },
  };

  // ==========================================
  // WORKFLOW TESTING RESOURCE
  // ==========================================
  public readonly tests = {
    list: async (workflowId: string) => {
      return this.request<{ data: any[] }>(`/workflows/${workflowId}/tests`);
    },
    get: async (testCaseId: string) => {
      return this.request<{ data: any }>(`/tests/${testCaseId}`);
    },
    create: async (workflowId: string, data: any) => {
      return this.request<{ data: any }>(`/workflows/${workflowId}/tests`, "POST", data);
    },
    update: async (testCaseId: string, data: any) => {
      return this.request<{ data: any }>(`/tests/${testCaseId}`, "PATCH", data);
    },
    delete: async (testCaseId: string) => {
      return this.request<{ data: any }>(`/tests/${testCaseId}`, "DELETE");
    },
    run: async (testCaseId: string, options?: { mode?: string; releaseArtifactId?: string; environmentId?: string }) => {
      return this.request<{ data: any }>(`/tests/${testCaseId}/run`, "POST", options || {});
    },
    listRuns: async (workflowId: string) => {
      return this.request<{ data: any[] }>(`/workflows/${workflowId}/test-runs`);
    },
  };

  // ==========================================
  // AI AUTOMATION RESOURCE
  // ==========================================
  public readonly ai = {
    status: async () => {
      return this.request<{ data: any }>("/ai/status");
    },
    generateWorkflow: async (data: { prompt: string; workflowName?: string }, options?: RequestOptions) => {
      return this.request<{ data: any }>("/ai/generate-workflow", "POST", data, options);
    },
    refineWorkflow: async (data: { prompt: string; currentNodes: any[]; currentEdges: any[]; workflowId?: string }, options?: RequestOptions) => {
      return this.request<{ data: any }>("/ai/refine-workflow", "POST", data, options);
    },
    explainWorkflow: async (data: { nodes: any[]; edges: any[]; name?: string; workflowId?: string }, options?: RequestOptions) => {
      return this.request<{ data: any }>("/ai/explain-workflow", "POST", data, options);
    },
    debugExecution: async (executionId: string, options?: RequestOptions) => {
      return this.request<{ data: any }>(`/ai/debug-execution/${executionId}`, "POST", {}, options);
    },
    optimizeWorkflow: async (workflowId: string, params?: { days?: number }, options?: RequestOptions) => {
      const q = new URLSearchParams();
      if (params?.days) q.set("days", params.days.toString());
      const qs = q.toString();
      return this.request<{ data: any }>(`/ai/optimize-workflow/${workflowId}${qs ? `?${qs}` : ""}`, "POST", {}, options);
    },
    generateTests: async (workflowId: string, params?: { count?: number }, options?: RequestOptions) => {
      const q = new URLSearchParams();
      if (params?.count) q.set("count", params.count.toString());
      const qs = q.toString();
      return this.request<{ data: any }>(`/ai/generate-tests/${workflowId}${qs ? `?${qs}` : ""}`, "POST", {}, options);
    },
  };

  public readonly health = {
    check: async () => {
      return this.request<{ status: string; uptime: number; version?: string }>("/health");
    },
  };
}
