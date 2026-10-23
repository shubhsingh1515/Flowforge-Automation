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

  // ==========================================
  // ENTERPRISE COLLABORATION & GOVERNANCE RESOURCES
  // ==========================================
  public readonly organizations = {
    list: async () => {
      return this.request<{ organizations: any[] }>("/organizations");
    },
    get: async (orgId: string) => {
      return this.request<{ organization: any }>(`/organizations/${orgId}`);
    },
    create: async (data: { name: string; slug: string; tier?: string }) => {
      return this.request<{ organization: any }>("/organizations", "POST", data);
    },
    update: async (orgId: string, data: { name?: string; tier?: string }) => {
      return this.request<{ organization: any }>(`/organizations/${orgId}`, "PATCH", data);
    },
    listMembers: async (orgId: string) => {
      return this.request<{ members: any[] }>(`/organizations/${orgId}/members`);
    },
    addMember: async (orgId: string, data: { userId: string; role: string }) => {
      return this.request<{ membership: any }>(`/organizations/${orgId}/members`, "POST", data);
    },
    removeMember: async (orgId: string, membershipId: string) => {
      return this.request<{ success: boolean }>(`/organizations/${orgId}/members/${membershipId}`, "DELETE");
    },
    listWorkspaces: async (orgId: string) => {
      return this.request<{ workspaces: any[] }>(`/organizations/${orgId}/workspaces`);
    },
  };

  public readonly teams = {
    list: async () => {
      return this.request<{ teams: any[] }>("/teams");
    },
    get: async (teamId: string) => {
      return this.request<{ team: any }>(`/teams/${teamId}`);
    },
    create: async (data: { name: string; description?: string }) => {
      return this.request<{ team: any }>("/teams", "POST", data);
    },
    update: async (teamId: string, data: { name?: string; description?: string; isArchived?: boolean }) => {
      return this.request<{ team: any }>(`/teams/${teamId}`, "PATCH", data);
    },
    addMember: async (teamId: string, data: { userId: string; teamRole?: string }) => {
      return this.request<{ member: any }>(`/teams/${teamId}/members`, "POST", data);
    },
    removeMember: async (teamId: string, memberId: string) => {
      return this.request<{ success: boolean }>(`/teams/${teamId}/members/${memberId}`, "DELETE");
    },
  };

  public readonly permissions = {
    list: async (params?: { resourceType?: string; resourceId?: string }) => {
      const q = new URLSearchParams();
      if (params?.resourceType) q.set("resourceType", params.resourceType);
      if (params?.resourceId) q.set("resourceId", params.resourceId);
      const qs = q.toString();
      return this.request<{ permissions: any[] }>(`/permissions${qs ? `?${qs}` : ""}`);
    },
    grant: async (data: {
      subjectType: "USER" | "TEAM";
      subjectId: string;
      resourceType: "WORKFLOW" | "CREDENTIAL" | "ENVIRONMENT";
      resourceId: string;
      accessLevel: "VIEW" | "EDIT" | "ADMIN";
    }) => {
      return this.request<{ permission: any }>("/permissions", "POST", data);
    },
    revoke: async (permissionId: string) => {
      return this.request<{ success: boolean }>(`/permissions/${permissionId}`, "DELETE");
    },
  };

  public readonly governance = {
    getPolicy: async () => {
      return this.request<{ policy: any }>("/governance/policy");
    },
    updatePolicy: async (data: any) => {
      return this.request<{ policy: any }>("/governance/policy", "PUT", data);
    },
    evaluate: async (data?: { workflowId?: string; action?: string; targetEnvironmentId?: string }) => {
      return this.request<{ result: any }>("/governance/policy/evaluate", "POST", data || {});
    },
    getOwnershipIntelligence: async () => {
      return this.request<{ intelligence: any }>("/governance/ownership");
    },
    updateStewardship: async (
      workflowId: string,
      data: {
        ownerUserId?: string | null;
        owningTeamId?: string | null;
        stewardUserId?: string | null;
        criticality?: string;
        businessDomain?: string;
        escalationContact?: string;
        lifecycleStatus?: string;
        nextReviewDate?: string;
      }
    ) => {
      return this.request<{ workflow: any }>(`/workflows/${workflowId}/stewardship`, "PATCH", data);
    },
  };

  public readonly reviews = {
    list: async (params?: { workflowId?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.workflowId) q.set("workflowId", params.workflowId);
      if (params?.status) q.set("status", params.status);
      const qs = q.toString();
      return this.request<{ reviews: any[] }>(`/reviews${qs ? `?${qs}` : ""}`);
    },
    get: async (reviewId: string) => {
      return this.request<{ review: any }>(`/reviews/${reviewId}`);
    },
    create: async (data: { workflowId: string; workflowVersionNumber: number; title: string; changeSummary?: string }) => {
      return this.request<{ review: any }>("/reviews", "POST", data);
    },
    decide: async (reviewId: string, data: { decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; reason?: string }) => {
      return this.request<{ review: any }>(`/reviews/${reviewId}/decision`, "POST", data);
    },
    addComment: async (reviewId: string, data: { comment: string; nodeId?: string }) => {
      return this.request<{ comment: any }>(`/reviews/${reviewId}/comments`, "POST", data);
    },
  };

  public readonly reliability = {
    listObjectives: async () => {
      return this.request<{ objectives: any[] }>("/slo/objectives");
    },
    createObjective: async (data: {
      name: string;
      targetMetric: "SUCCESS_RATE" | "LATENCY_P95" | "EXECUTION_DURATION";
      targetValue: number;
      timeWindowHours: number;
      workflowId?: string | null;
      alertCooldownHours?: number;
    }) => {
      return this.request<{ objective: any }>("/slo/objectives", "POST", data);
    },
    updateObjective: async (id: string, data: any) => {
      return this.request<{ objective: any }>(`/slo/objectives/${id}`, "PATCH", data);
    },
    deleteObjective: async (id: string) => {
      return this.request<{ success: boolean }>(`/slo/objectives/${id}`, "DELETE");
    },
    evaluate: async (id: string) => {
      return this.request<{ objective: any }>(`/slo/objectives/${id}/evaluate`, "POST", {});
    },
  };

  public readonly compliance = {
    searchAuditLogs: async (params?: {
      startDate?: string;
      endDate?: string;
      actorId?: string;
      targetType?: string;
      action?: string;
      keyword?: string;
      page?: number;
      limit?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.startDate) q.set("startDate", params.startDate);
      if (params?.endDate) q.set("endDate", params.endDate);
      if (params?.actorId) q.set("actorId", params.actorId);
      if (params?.targetType) q.set("targetType", params.targetType);
      if (params?.action) q.set("action", params.action);
      if (params?.keyword) q.set("keyword", params.keyword);
      if (params?.page) q.set("page", params.page.toString());
      if (params?.limit) q.set("limit", params.limit.toString());
      const qs = q.toString();
      return this.request<{ logs: any[]; pagination: any }>(`/compliance/audit${qs ? `?${qs}` : ""}`);
    },
    createExport: async (data: { startDate: string; endDate: string; reason: string; includePayloads?: boolean }) => {
      return this.request<{ export: any }>("/compliance/exports", "POST", data);
    },
    listExports: async () => {
      return this.request<{ exports: any[] }>("/compliance/exports");
    },
    downloadExport: async (token: string) => {
      return this.request<{ exportPayload: any }>(`/compliance/exports/download/${token}`);
    },
    getRetentionPolicy: async () => {
      return this.request<any>("/data-retention/policy");
    },
    updateRetentionPolicy: async (data: any) => {
      return this.request<any>("/data-retention/policy", "PATCH", data);
    },
    setLegalHold: async (data: { legalHold: boolean; reason?: string }) => {
      return this.request<any>("/data-retention/legal-hold", "POST", data);
    },
    runRetentionCleanup: async (data?: { dryRun?: boolean }) => {
      return this.request<any>("/data-retention/cleanup", "POST", data || {});
    },
  };

  public readonly health = {
    check: async () => {
      return this.request<{ status: string; uptime: number; version?: string }>("/health");
    },
  };

  public readonly operations = {
    getOverview: async () => {
      return this.request<{ overview: any }>("/operations/overview");
    },
    reconcile: async (data?: { mode?: 'dry-run' | 'execute'; maxAgeMinutes?: number; limit?: number; allowCrashRecovery?: boolean }) => {
      return this.request<any>("/operations/reconcile", "POST", data || {});
    },
    getReconciliationLogs: async (limit?: number) => {
      return this.request<{ logs: any[] }>("/operations/reconciliation-logs" + (limit ? "?limit=" + limit : ""));
    },
    getOutboxOverview: async () => {
      return this.request<{ outbox: any }>("/operations/outbox");
    },
    replayOutbox: async (data?: { eventIds?: string[]; limit?: number }) => {
      return this.request<{ success: boolean; replayedCount: number }>("/operations/outbox/replay", "POST", data || {});
    },
    processOutbox: async (limit?: number) => {
      return this.request<{ success: boolean; processed: number; delivered: number; failed: number; deadLettered: number }>("/operations/outbox/process", "POST", { limit });
    },
    listBackupVerifications: async (limit?: number) => {
      return this.request<{ records: any[]; drStatus: any }>("/operations/backup/verification" + (limit ? "?limit=" + limit : ""));
    },
    runBackupVerification: async (data?: { backupFileName?: string; isolatedDbName?: string; dryRun?: boolean }) => {
      return this.request<{ record: any }>("/operations/backup/verify", "POST", data || {});
    },
    getRecoveryLogs: async (limit?: number) => {
      return this.request<{ logs: any[] }>("/operations/recovery/logs" + (limit ? "?limit=" + limit : ""));
    },
    // Phase 16: Enterprise Scale & Capacity Management
    getCapacity: async () => {
      return this.request<any>("/operations/capacity");
    },
    listRegions: async () => {
      return this.request<{ regions: any[] }>("/operations/regions");
    },
    updatePlacement: async (data: {
      homeRegion?: string;
      dataResidency?: string;
      maxConcurrentExecutions?: number | null;
      workloadPriority?: string;
    }) => {
      return this.request<{ success: boolean; workspace: any }>("/operations/regions/placement", "PATCH", data);
    },
    runFailoverDrill: async (data?: {
      sourceRegion?: string;
      targetRegion?: string;
      notes?: string;
    }) => {
      return this.request<any>("/operations/regions/failover-drill", "POST", data || {});
    },
  };

  /**
   * Phase 16: Scale, Capacity and Regional Placement Client Namespace
   */
  public readonly scale = {
    getCapacity: async () => {
      return this.request<any>("/operations/capacity");
    },
    listRegions: async () => {
      return this.request<{ regions: any[] }>("/operations/regions");
    },
    updatePlacement: async (data: {
      homeRegion?: string;
      dataResidency?: string;
      maxConcurrentExecutions?: number | null;
      workloadPriority?: string;
    }) => {
      return this.request<{ success: boolean; workspace: any }>("/operations/regions/placement", "PATCH", data);
    },
    runFailoverDrill: async (data?: {
      sourceRegion?: string;
      targetRegion?: string;
      notes?: string;
    }) => {
      return this.request<any>("/operations/regions/failover-drill", "POST", data || {});
    },
  };

  /**
   * Phase 17: Enterprise Data Residency Namespace
   */
  public readonly residency = {
    getPolicy: async () => {
      return this.request<{ policy: any; [key: string]: any }>("/residency");
    },
    updatePolicy: async (data: {
      homeRegion?: string;
      permittedProcessingRegions?: string[];
      permittedStorageRegions?: string[];
      permittedBackupRegions?: string[];
      crossRegionReplicationAllowed?: boolean;
      thirdPartyProcessingAllowed?: boolean;
      changeReason?: string;
    }) => {
      return this.request<{ success: boolean; policy: any }>("/residency", "PATCH", data);
    },
    verify: async () => {
      return this.request<{
        status: string;
        workspaceId: string;
        homeRegion: string;
        workerRegion: string;
        verificationEvidence: any;
      }>("/residency/verify", "POST");
    },
  };

  /**
   * Phase 17: Customer-Managed Encryption Keys (CMEK) Namespace
   */
  public readonly cmek = {
    getStatus: async () => {
      return this.request<{
        isConfigured: boolean;
        config: any;
        encryptionCoverage: any;
        recentRotations: any[];
      }>("/cmek");
    },
    register: async (data: {
      keyProvider?: "LOCAL" | "AWS_KMS" | "VAULT";
      keyReference: string;
    }) => {
      return this.request<{ success: boolean; config: any }>("/cmek/register", "POST", data);
    },
    rotate: async (data?: { reason?: string }) => {
      return this.request<{
        success: boolean;
        jobId: string;
        previousKeyVersion: string;
        newKeyVersion: string;
        rotationEpoch: number;
      }>("/cmek/rotate", "POST", data || {});
    },
    revoke: async (data: { confirmRevocation: true; reason: string }) => {
      return this.request<{
        success: boolean;
        keyStatus: string;
        revokedAt: string;
        reason: string;
      }>("/cmek/revoke", "POST", data);
    },
  };

  /**
   * Phase 18: Operational Incidents Namespace
   */
  public readonly incidents = {
    list: async (filters?: { status?: string; severity?: string; category?: string }) => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.severity) params.append("severity", filters.severity);
      if (filters?.category) params.append("category", filters.category);
      const query = params.toString() ? `?${params.toString()}` : "";
      return this.request<{ data: any[] }>(`/incidents${query}`);
    },
    get: async (id: string) => {
      return this.request<{ data: any }>(`/incidents/${id}`);
    },
    updateStatus: async (id: string, data: { status: string; note?: string }) => {
      return this.request<{ data: any }>(`/incidents/${id}/status`, "POST", data);
    },
    assign: async (id: string, data: { assignedToUserId: string | null; note?: string }) => {
      return this.request<{ data: any }>(`/incidents/${id}/assign`, "POST", data);
    },
    addNote: async (id: string, data: { note: string }) => {
      return this.request<{ data: any }>(`/incidents/${id}/notes`, "POST", data);
    },
    analyzeRootCause: async (id: string) => {
      return this.request<{ data: any }>(`/incidents/${id}/root-cause`, "POST");
    },
    simulate: async (data: {
      title: string;
      severity?: string;
      category?: string;
      sourceService?: string;
      affectedWorkflows?: string[];
      affectedRegions?: string[];
    }) => {
      return this.request<{ data: any }>("/incidents/simulate", "POST", data);
    },
  };

  /**
   * Phase 18: Self-Healing & Remediation Engine Namespace
   */
  public readonly remediations = {
    getPolicy: async () => {
      return this.request<{ data: any }>("/remediation/policy");
    },
    updatePolicy: async (data: {
      name?: string;
      autonomyMode?: "OBSERVE_ONLY" | "APPROVAL_REQUIRED" | "POLICY_AUTOMATED";
      allowedActions?: string[];
      maxAutomatedActionsPerIncident?: number;
      cooldownMinutes?: number;
    }) => {
      return this.request<{ data: any }>("/remediation/policy", "PUT", data);
    },
    listOperations: async (filters?: { status?: string; incidentId?: string }) => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.incidentId) params.append("incidentId", filters.incidentId);
      const query = params.toString() ? `?${params.toString()}` : "";
      return this.request<{ data: any[] }>(`/remediation/operations${query}`);
    },
    getOperation: async (id: string) => {
      return this.request<{ data: any }>(`/remediation/operations/${id}`);
    },
    requestAction: async (data: {
      actionKey: string;
      targetType: string;
      targetId: string;
      parameters?: Record<string, any>;
      incidentId?: string;
    }) => {
      return this.request<{ data: any }>("/remediation/operations", "POST", data);
    },
    approve: async (id: string, data: { approved: boolean; reason?: string }) => {
      return this.request<{ data: any }>(`/remediation/operations/${id}/approve`, "POST", data);
    },
    verify: async (id: string) => {
      return this.request<{ data: any }>(`/remediation/operations/${id}/verify`, "POST");
    },
  };

  /**
   * Phase 18: Unified Health & Observability 2.0 Namespace
   */
  public readonly observability = {
    getUnifiedHealth: async () => {
      return this.request<{ data: any }>("/observability/unified-health");
    },
    getWarnings: async (filters?: { isResolved?: boolean }) => {
      const query = filters?.isResolved !== undefined ? `?isResolved=${filters.isResolved}` : "";
      return this.request<{ data: any[] }>(`/observability/warnings${query}`);
    },
    evaluateWarnings: async (data?: { regionKey?: string }) => {
      return this.request<{ data: any[] }>("/observability/warnings/evaluate", "POST", data || {});
    },
    getSlos: async () => {
      return this.request<{ data: any[] }>("/observability/slos");
    },
    evaluateSlos: async () => {
      return this.request<{ data: any[] }>("/observability/slos/evaluate", "POST");
    },
  };

  /**
   * Phase 19: Enterprise Connectors & Developer Platform Namespace
   */
  public readonly connectors = {
    validateManifest: async (manifest: any) => {
      return this.request<{ valid: boolean; manifest?: any; hash?: string; errors?: string[] }>(
        "/connectors/validate-manifest",
        "POST",
        { manifest }
      );
    },
    list: async (filters?: { connectorKey?: string; status?: string; scope?: "all" | "workspace" | "published" }) => {
      const params = new URLSearchParams();
      if (filters?.connectorKey) params.append("connectorKey", filters.connectorKey);
      if (filters?.status) params.append("status", filters.status);
      if (filters?.scope) params.append("scope", filters.scope);
      const query = params.toString() ? `?${params.toString()}` : "";
      return this.request<any[]>(`/connectors${query}`);
    },
    createDraft: async (manifest: any) => {
      return this.request<any>("/connectors/drafts", "POST", { manifest });
    },
    get: async (id: string) => {
      return this.request<any>(`/connectors/${id}`);
    },
    certify: async (id: string) => {
      return this.request<any>(`/connectors/${id}/certify`, "POST");
    },
    review: async (id: string, data: { decision: "APPROVE" | "REJECT"; reviewNotes?: string }) => {
      return this.request<any>(`/connectors/${id}/reviews`, "POST", data);
    },
    publish: async (id: string, data?: { expectedArtifactHashSha256?: string }) => {
      return this.request<any>(`/connectors/${id}/publish`, "POST", data || {});
    },
    suspend: async (id: string, data: { reason: string; isPermanentRevocation?: boolean }) => {
      return this.request<any>(`/connectors/${id}/suspend`, "POST", data);
    },
    install: async (id: string) => {
      return this.request<any>(`/connectors/${id}/install`, "POST");
    },
    upgradePreflight: async (id: string, targetArtifactId: string) => {
      return this.request<any>(`/connectors/${id}/upgrade-preflight`, "POST", { targetArtifactId });
    },
    upgradeInstallation: async (installationId: string, data: { targetArtifactId: string; acknowledgeBreakingChanges?: boolean }) => {
      return this.request<any>(`/connectors/installations/${installationId}/upgrade`, "POST", data);
    },
    rollbackInstallation: async (installationId: string, data?: { targetArtifactId?: string; reason?: string }) => {
      return this.request<any>(`/connectors/installations/${installationId}/rollback`, "POST", data || {});
    },
    getAnalytics: async (connectorKey: string) => {
      return this.request<any>(`/connectors/${connectorKey}/analytics`);
    },
  };

  // ==========================================
  // PHASE 20: DIGITAL TWIN SIMULATION, CHAOS & OPTIMIZATION
  // ==========================================

  public readonly simulations = {
    createScenario: async (workflowId: string, data: any) => {
      return this.request<any>(`/workflows/${workflowId}/simulations/scenarios`, "POST", data);
    },
    listScenarios: async (workflowId: string) => {
      return this.request<any[]>(`/workflows/${workflowId}/simulations/scenarios`);
    },
    getScenario: async (scenarioId: string) => {
      return this.request<any>(`/simulations/scenarios/${scenarioId}`);
    },
    deleteScenario: async (scenarioId: string) => {
      return this.request<any>(`/simulations/scenarios/${scenarioId}`, "DELETE");
    },
    run: async (workflowId: string, data?: any) => {
      return this.request<any>(`/workflows/${workflowId}/simulations/run`, "POST", data || {});
    },
    listRuns: async (workflowId: string) => {
      return this.request<any[]>(`/workflows/${workflowId}/simulations/runs`);
    },
    getRun: async (runId: string) => {
      return this.request<any>(`/simulations/runs/${runId}`);
    },
    checkStale: async (runId: string, contentHash: string) => {
      return this.request<{ isStale: boolean }>(`/simulations/runs/${runId}/stale-check?contentHash=${encodeURIComponent(contentHash)}`);
    },
    evaluateReleaseGates: async (releaseArtifactId: string, environmentId: string) => {
      return this.request<any>(`/releases/${releaseArtifactId}/simulation-gates/${environmentId}`);
    },
  };

  public readonly chaos = {
    createExperiment: async (data: any) => {
      return this.request<any>("/chaos/experiments", "POST", data);
    },
    listExperiments: async () => {
      return this.request<any[]>("/chaos/experiments");
    },
    getExperiment: async (experimentId: string) => {
      return this.request<any>(`/chaos/experiments/${experimentId}`);
    },
    approveExperiment: async (experimentId: string) => {
      return this.request<any>(`/chaos/experiments/${experimentId}/approve`, "POST");
    },
    startExperiment: async (experimentId: string) => {
      return this.request<any>(`/chaos/experiments/${experimentId}/start`, "POST");
    },
    stopExperiment: async (experimentId: string) => {
      return this.request<any>(`/chaos/experiments/${experimentId}/stop`, "POST");
    },
  };

  public readonly optimizations = {
    compareAndCreateCandidate: async (workflowId: string, data: any) => {
      return this.request<any>(`/workflows/${workflowId}/optimizations/candidates`, "POST", data);
    },
    listCandidates: async (workflowId: string) => {
      return this.request<any[]>(`/workflows/${workflowId}/optimizations/candidates`);
    },
    getCandidate: async (candidateId: string) => {
      return this.request<any>(`/optimizations/candidates/${candidateId}`);
    },
    promoteCandidate: async (candidateId: string) => {
      return this.request<any>(`/optimizations/candidates/${candidateId}/promote`, "POST");
    },
  };

  // ==========================================
  // PHASE 21: BUSINESS PROCESS INTELLIGENCE & PROCESS MINING
  // ==========================================

  public readonly processes = {
    createDefinition: async (data: any) => {
      return this.request<any>("/processes", "POST", data);
    },
    listDefinitions: async (query?: { businessDomain?: string; criticality?: string; lifecycleStatus?: string }) => {
      const q = new URLSearchParams(query as any).toString();
      return this.request<any[]>(`/processes${q ? "?" + q : ""}`);
    },
    getDefinition: async (id: string) => {
      return this.request<any>(`/processes/${id}`);
    },
    updateDefinition: async (id: string, data: any) => {
      return this.request<any>(`/processes/${id}`, "PATCH", data);
    },
    createVersion: async (id: string, data: any) => {
      return this.request<any>(`/processes/${id}/versions`, "POST", data);
    },
    diffVersions: async (id: string, v1: number, v2: number) => {
      return this.request<any>(`/processes/${id}/versions/diff?v1=${v1}&v2=${v2}`);
    },
    ingestEvent: async (data: any) => {
      return this.request<any>("/processes/events/ingest", "POST", data);
    },
    listInstances: async (id: string, query?: { status?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams(query as any).toString();
      return this.request<any>(`/processes/${id}/instances${q ? "?" + q : ""}`);
    },
    getInstance: async (instanceId: string) => {
      return this.request<any>(`/processes/instances/${instanceId}`);
    },
    cancelInstance: async (instanceId: string, reason?: string) => {
      return this.request<any>(`/processes/instances/${instanceId}/cancel`, "POST", { reason });
    },
    mine: async (id: string, timeRangeDays = 30) => {
      return this.request<any>(`/processes/${id}/mining?timeRangeDays=${timeRangeDays}`);
    },
    getMetrics: async (id: string, timeRangeDays = 30) => {
      return this.request<any>(`/processes/${id}/metrics?timeRangeDays=${timeRangeDays}`);
    },
    createSlaPolicy: async (id: string, data: any) => {
      return this.request<any>(`/processes/${id}/sla-policies`, "POST", data);
    },
    getSlaPolicy: async (id: string) => {
      return this.request<any>(`/processes/${id}/sla-policies`);
    },
  };

}

export * from "@flowforge/connector-sdk";
