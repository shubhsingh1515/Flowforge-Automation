const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export class ApiError extends Error {
  statusCode: number;
  details?: any;

  constructor(message: string, statusCode: number, details?: any) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("flowforge_token") : null;

  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Ensure endpoint starts with slash
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${API_BASE}${cleanEndpoint}`;

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data.message || "An error occurred while communicating with the server.",
      res.status,
      data.details
    );
  }

  return data as T;
}

export const api = {
  // Auth
  auth: {
    login: (body: any) => request<any>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    register: (body: any) => request<any>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
    logout: () => request<any>("/auth/logout", { method: "POST" }),
    me: () => request<any>("/auth/me"),
  },

  // Dashboard
  dashboard: {
    getMetrics: () => request<any>("/dashboard/metrics"),
    getActivity: () => request<any>("/dashboard/activity"),
  },

  // Workflows
  workflows: {
    list: (params?: { search?: string; status?: string; page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set("search", params.search);
      if (params?.status) q.set("status", params.status);
      if (params?.page) q.set("page", params.page.toString());
      if (params?.limit) q.set("limit", params.limit.toString());
      return request<{ data: any[]; meta: any }>(`/workflows?${q.toString()}`);
    },
    get: (id: string) => request<{ workflow: any }>(`/workflows/${id}`),
    create: (body: any) => request<{ workflow: any }>("/workflows", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: any) => request<{ workflow: any }>(`/workflows/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) => request<any>(`/workflows/${id}`, { method: "DELETE" }),
    duplicate: (id: string) => request<any>(`/workflows/${id}/duplicate`, { method: "POST" }),
    validate: (body: { nodes: any[]; edges: any[] }) => request<any>("/workflows/validate", { method: "POST", body: JSON.stringify(body) }),
    activate: (id: string) => request<any>(`/workflows/${id}/activate`, { method: "POST" }),
    pause: (id: string) => request<any>(`/workflows/${id}/pause`, { method: "POST" }),
    test: (id: string, payload?: any) => request<any>(`/workflows/${id}/test`, { method: "POST", body: JSON.stringify({ triggerPayload: payload || {} }) }),
    previewTransform: (sampleInput: any, config: any) =>
      request<any>("/workflows/preview-transform", {
        method: "POST",
        body: JSON.stringify({ sampleInput, config }),
      }),
    listVersions: (id: string) => request<{ workflowId: string; currentVersion: number; versions: any[] }>(`/workflows/${id}/versions`),
    getVersion: (id: string, version: number) => request<{ version: any }>(`/workflows/${id}/versions/${version}`),
    compareVersions: (id: string, from: number, to: number) => request<any>(`/workflows/${id}/versions/compare?from=${from}&to=${to}`),
    rollback: (id: string, version: number) => request<any>(`/workflows/${id}/versions/${version}/rollback`, { method: "POST" }),
    export: (id: string) => request<any>(`/workflows/${id}/export`),
    import: (body: any) => request<any>("/workflows/import", { method: "POST", body: JSON.stringify(body) }),
    saveAsTemplate: (id: string, body: any) => request<any>(`/workflows/${id}/save-as-template`, { method: "POST", body: JSON.stringify(body) }),
  },

  // Integrations
  integrations: {
    list: (params?: { search?: string; category?: string }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set("search", params.search);
      if (params?.category) q.set("category", params.category);
      return request<{ data: any[] }>(`/integrations?${q.toString()}`);
    },
    get: (key: string) => request<{ integration: any }>(`/integrations/${key}`),
    getCategories: () => request<{ categories: any[] }>("/integrations/categories"),
  },

  // Connections
  connections: {
    list: (params?: { integrationKey?: string }) => {
      const q = new URLSearchParams();
      if (params?.integrationKey) q.set("integrationKey", params.integrationKey);
      return request<{ data: any[] }>(`/connections?${q.toString()}`);
    },
    connect: (body: any) => request<any>("/connections", { method: "POST", body: JSON.stringify(body) }),
    refresh: (id: string) => request<any>(`/connections/${id}/refresh`, { method: "POST" }),
    disconnect: (id: string) => request<any>(`/connections/${id}`, { method: "DELETE" }),
  },

  // OAuth
  oauth: {
    getAuthorizationUrl: (provider: string) => request<{ authorizationUrl: string; state: string }>(`/oauth/${provider}/authorize`),
    devConnect: (provider: string, name?: string) =>
      request<{ connection: any }>("/oauth/dev-connect", {
        method: "POST",
        body: JSON.stringify({ provider, name }),
      }),
  },

  // Executions
  executions: {
    list: (params?: { status?: string; workflowId?: string; page?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.workflowId) q.set("workflowId", params.workflowId);
      if (params?.page) q.set("page", params.page.toString());
      return request<{ data: any[]; meta: any }>(`/executions?${q.toString()}`);
    },
    get: (id: string) => request<{ execution: any }>(`/executions/${id}`),
    retry: (id: string) => request<any>(`/executions/${id}/retry`, { method: "POST" }),
    cancel: (id: string, body?: { reason?: string }) =>
      request<any>(`/executions/${id}/cancel`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      }),
  },

  // Human Approvals
  approvals: {
    list: (params?: { status?: string; workflowId?: string; page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.workflowId) q.set("workflowId", params.workflowId);
      if (params?.page) q.set("page", params.page.toString());
      if (params?.limit) q.set("limit", params.limit.toString());
      return request<{ data: any[]; meta: any }>(`/approvals?${q.toString()}`);
    },
    get: (id: string) => request<{ approval: any }>(`/approvals/${id}`),
    decide: (id: string, body: { decision: "APPROVED" | "REJECTED"; comment?: string }) =>
      request<any>(`/approvals/${id}/decide`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  // Templates
  templates: {
    list: (params?: { search?: string; category?: string; difficulty?: string; tag?: string; type?: string; page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set("search", params.search);
      if (params?.category) q.set("category", params.category);
      if (params?.difficulty) q.set("difficulty", params.difficulty);
      if (params?.tag) q.set("tag", params.tag);
      if (params?.type) q.set("type", params.type);
      if (params?.page) q.set("page", params.page.toString());
      if (params?.limit) q.set("limit", params.limit.toString());
      return request<{ templates: any[]; meta?: any }>(`/templates?${q.toString()}`);
    },
    getCategories: () => request<{ categories: string[] }>("/templates/categories"),
    get: (id: string) => request<{ template: any }>(`/templates/${id}`),
    instantiate: (id: string, name?: string) =>
      request<{ workflow: any }>(`/templates/${id}/instantiate`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
  },

  // Onboarding
  onboarding: {
    get: () => request<any>("/workspaces/onboarding"),
    update: (body: { dismissed?: boolean; hasUsedTemplate?: boolean; hasTestedWorkflow?: boolean }) =>
      request<any>("/workspaces/onboarding", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },

  // Workspace & Settings
  workspace: {
    getCurrent: () => request<{ workspace: any }>("/workspaces/current"),
    updateName: (name: string) => request<any>("/workspaces/current", { method: "PATCH", body: JSON.stringify({ name }) }),
    updateProfile: (data: { name?: string; email?: string }) => request<any>("/workspaces/profile", { method: "PATCH", body: JSON.stringify(data) }),
  },

  // Billing & Monetization
  billing: {
    getPlans: () => request<{ plans: any[] }>("/plans"),
    getSubscription: () => request<any>("/billing/subscription"),
    createCheckout: (targetPlan: "PRO" | "BUSINESS", successUrl?: string, cancelUrl?: string) =>
      request<{ url: string; sessionId: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ targetPlan, successUrl, cancelUrl }),
      }),
    createPortal: (returnUrl?: string) =>
      request<{ url: string }>("/billing/portal", {
        method: "POST",
        body: JSON.stringify({ returnUrl }),
      }),
    cancelSubscription: () => request<any>("/billing/cancel", { method: "POST" }),
    getUsage: () => request<{ summary: any; history: any[] }>("/billing/usage"),
  },

  // Workspace Invitations & Team
  members: {
    invite: (email: string, role: string) =>
      request<any>("/workspaces/members/invite", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
    listInvitations: () => request<{ invitations: any[] }>("/workspaces/invitations"),
    revokeInvitation: (id: string) => request<any>(`/workspaces/invitations/${id}`, { method: "DELETE" }),
    acceptInvitation: (token: string) =>
      request<any>("/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    removeMember: (userId: string) => request<any>(`/workspaces/members/${userId}`, { method: "DELETE" }),
  },

  // Developer Platform: API Keys
  apiKeys: {
    list: () => request<any[]>("/api-keys"),
    create: (body: { name: string; scopes: string[]; expiresInDays?: number }) =>
      request<{ key: any; secret: string }>("/api-keys", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    rotate: (id: string) =>
      request<{ key: any; secret: string }>(`/api-keys/${id}/rotate`, {
        method: "POST",
      }),
    revoke: (id: string) =>
      request<{ success: boolean }>(`/api-keys/${id}`, {
        method: "DELETE",
      }),
  },

  // Developer Platform: Outbound Webhooks
  webhooks: {
    list: () => request<any[]>("/outbound-webhooks"),
    create: (body: { name: string; url: string; events: string[] }) =>
      request<{ webhook: any; secret: string }>("/outbound-webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    get: (id: string) => request<any>(`/outbound-webhooks/${id}`),
    update: (id: string, body: { name?: string; url?: string; events?: string[]; active?: boolean }) =>
      request<any>(`/outbound-webhooks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/outbound-webhooks/${id}`, {
        method: "DELETE",
      }),
    rotateSecret: (id: string) =>
      request<{ secret: string }>(`/outbound-webhooks/${id}/rotate-secret`, {
        method: "POST",
      }),
    getDeliveries: (id: string, limit = 20) =>
      request<any[]>(`/outbound-webhooks/${id}/deliveries?limit=${limit}`),
    retryDelivery: (deliveryId: string) =>
      request<any>(`/outbound-webhooks/deliveries/${deliveryId}/retry`, {
        method: "POST",
      }),
    sendTestPing: (id: string) =>
      request<any>(`/outbound-webhooks/${id}/test`, {
        method: "POST",
      }),
  },

  // Developer Platform: Custom Integrations
  customIntegrations: {
    list: () => request<any[]>("/custom-integrations"),
    create: (body: { key: string; name: string; description?: string; definition?: any }) =>
      request<any>("/custom-integrations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    get: (id: string) => request<any>(`/custom-integrations/${id}`),
    updateDraft: (id: string, definition: any) =>
      request<any>(`/custom-integrations/${id}`, {
        method: "PUT",
        body: JSON.stringify(definition),
      }),
    publish: (id: string) =>
      request<any>(`/custom-integrations/${id}/publish`, {
        method: "POST",
      }),
    testAction: (id: string, body: { actionId: string; sampleInput?: any }) =>
      request<any>(`/custom-integrations/${id}/test`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  // Phase 9: Integration Marketplace
  marketplace: {
    list: (params?: { category?: string; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.category) q.set("category", params.category);
      if (params?.search) q.set("search", params.search);
      const qs = q.toString();
      return request<any[]>(`/marketplace${qs ? `?${qs}` : ""}`);
    },
    get: (idOrSlug: string) => request<any>(`/marketplace/${idOrSlug}`),
    install: (id: string, version?: number) =>
      request<any>(`/marketplace/${id}/install`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),
    uninstall: (id: string) =>
      request<{ success: boolean; message: string }>(`/marketplace/${id}/install`, {
        method: "DELETE",
      }),
    submit: (body: any) =>
      request<any>("/marketplace", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    review: (id: string, body: { decision: "APPROVE" | "REJECT"; rejectionReason?: string }) =>
      request<any>(`/marketplace/${id}/review`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    deprecate: (id: string) =>
      request<any>(`/marketplace/${id}/deprecate`, {
        method: "POST",
      }),
  },

  // Phase 9 & 14: Enterprise Governance & Collaboration
  governance: {
    getPolicy: () => request<any>("/governance/policy"),
    updatePolicy: (body: any) =>
      request<any>("/governance/policy", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    getAuditLogs: (params?: { page?: number; limit?: number; action?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.action) q.set("action", params.action);
      const qs = q.toString();
      return request<{ data: any[]; pagination: any }>(`/governance/audit-logs${qs ? `?${qs}` : ""}`);
    },
    evaluate: (body: any = {}) => request<{ data: any }>("/governance/evaluate", { method: "POST", body: JSON.stringify(body) }),
    getOwnership: () => request<{ data: any }>("/governance/ownership-intelligence"),
    updateStewardship: (workflowId: string, body: any) =>
      request<{ data: any }>(`/workflows/${workflowId}/stewardship`, { method: "PATCH", body: JSON.stringify(body) }),
  },

  // Phase 9: Customer Data Rights & Retention
  dataRetention: {
    getPolicy: () => request<any>("/data-retention/policy"),
    updatePolicy: (body: any) =>
      request<any>("/data-retention/policy", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    cleanup: () =>
      request<any>("/data-retention/cleanup", {
        method: "POST",
      }),
    requestExport: (body?: any) =>
      request<any>("/data-retention/exports", {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
    requestDeletion: (body: { reason: string; confirmationPhrase: string }) =>
      request<any>("/data-retention/delete-workspace", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  // Phase 9: Launch Readiness Diagnostics
  readiness: {
    check: () => request<any>("/health/readiness-check"),
  },

  // Phase 10: Enterprise Identity (SSO & SCIM)
  sso: {
    getConfig: () => request<any>("/sso/config"),
    saveConfig: (body: any) =>
      request<any>("/sso/config", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    test: (body: any) =>
      request<any>("/sso/test", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    initiate: (workspaceSlug: string) =>
      request<any>("/sso/initiate", {
        method: "POST",
        body: JSON.stringify({ workspaceSlug }),
      }),
  },

  scim: {
    listTokens: () => request<any>("/scim/tokens"),
    createToken: (body: { name: string; expiresInDays?: number }) =>
      request<any>("/scim/tokens", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    revokeToken: (id: string) =>
      request<any>(`/scim/tokens/${id}`, {
        method: "DELETE",
      }),
  },

  // Phase 10: Active Session Management
  sessions: {
    list: () => request<any>("/sessions"),
    revoke: (id: string) =>
      request<any>(`/sessions/${id}`, {
        method: "DELETE",
      }),
    revokeAllOthers: () =>
      request<any>("/sessions/revoke-others", {
        method: "POST",
      }),
  },

  // Phase 10: Advanced Observability & Diagnostics
  diagnostics: {
    get: (executionId: string) => request<any>(`/diagnostics/${executionId}`),
    download: (executionId: string) => request<any>(`/diagnostics/${executionId}/download`),
  },

  // Phase 10: Reliability Engineering & Operations
  operations: {
    getOverview: () => request<any>("/operations/overview"),
    reconcile: (dryRun: boolean = true) =>
      request<any>("/operations/reconciliation", {
        method: "POST",
        body: JSON.stringify({ dryRun }),
      }),
    getLogs: (params?: { limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return request<any>(`/operations/reconciliation/logs${qs ? `?${qs}` : ""}`);
    },
    getOutbox: () => request<any>("/operations/outbox"),
    replayOutbox: (body?: any) =>
      request<any>("/operations/outbox/replay", {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
    processOutbox: (limit?: number) =>
      request<any>("/operations/outbox/process", {
        method: "POST",
        body: JSON.stringify({ limit: limit || 50 }),
      }),
    getBackupVerifications: (limit?: number) =>
      request<any>(`/operations/backup/verification${limit ? `?limit=${limit}` : ""}`),
    verifyBackup: (body?: any) =>
      request<any>("/operations/backup/verify", {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
    getRecoveryLogs: (limit?: number) =>
      request<any>(`/operations/recovery/logs${limit ? `?limit=${limit}` : ""}`),
    // Phase 16: Enterprise Scale, Capacity Management & Regional Readiness
    getCapacity: () => request<any>("/operations/capacity"),
    getRegions: () => request<any>("/operations/regions"),
    updatePlacement: (body: any) =>
      request<any>("/operations/regions/placement", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    runFailoverDrill: (body?: any) =>
      request<any>("/operations/regions/failover-drill", {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
  },

  // Phase 11: Product Analytics
  analytics: {
    getOverview: (params?: { timeRange?: string; workflowId?: string; status?: string; errorCategory?: string; startDate?: string; endDate?: string }) => {
      const q = new URLSearchParams();
      if (params?.timeRange) q.set("timeRange", params.timeRange);
      if (params?.workflowId) q.set("workflowId", params.workflowId);
      if (params?.status) q.set("status", params.status);
      if (params?.errorCategory) q.set("errorCategory", params.errorCategory);
      if (params?.startDate) q.set("startDate", params.startDate);
      if (params?.endDate) q.set("endDate", params.endDate);
      const qs = q.toString();
      return request<any>(`/analytics/overview${qs ? `?${qs}` : ""}`);
    },
  },

  // Phase 11: Usage Intelligence & Alerts
  usageAlerts: {
    getForecast: () => request<any>("/usage/forecast"),
    getAlertConfig: () => request<any>("/usage/alerts/config"),
    updateAlertConfig: (body: any) =>
      request<any>("/usage/alerts/config", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    evaluateAlerts: () =>
      request<any>("/usage/alerts/evaluate", {
        method: "POST",
      }),
  },

  // Phase 11: In-App Notifications
  notifications: {
    list: (params?: { page?: number; limit?: number; read?: boolean; category?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.read !== undefined) q.set("read", String(params.read));
      if (params?.category) q.set("category", params.category);
      const qs = q.toString();
      return request<any>(`/notifications${qs ? `?${qs}` : ""}`);
    },
    markAsRead: (id: string) =>
      request<any>(`/notifications/${id}/read`, {
        method: "PATCH",
      }),
    markAllAsRead: () =>
      request<any>("/notifications/mark-all-read", {
        method: "POST",
      }),
  },

  // Phase 11: Customer Support & Diagnostics
  support: {
    createBundle: (body?: { includeExecutionIds?: string[]; notes?: string }) =>
      request<any>("/support/bundle", {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
    downloadBundle: (bundleId: string) => request<any>(`/support/bundle/${bundleId}/download`),
    submitFeedback: (body: { category: string; rating?: number; comment: string; contactEmail?: string }) =>
      request<any>("/support/feedback", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  // Phase 11: Public Status
  status: {
    getPublic: () => request<any>("/status/public"),
  },

  // Phase 12: Environments & Release Lifecycle
  environments: {
    list: () => request<{ data: any[] }>("/environments"),
    get: (id: string) => request<{ data: any }>(`/environments/${id}`),
    create: (body: any) => request<{ data: any }>("/environments", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: any) => request<{ data: any }>(`/environments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    listVariables: (id: string) => request<{ data: any[] }>(`/environments/${id}/variables`),
    setVariable: (id: string, body: any) => request<{ data: any }>(`/environments/${id}/variables`, { method: "POST", body: JSON.stringify(body) }),
    deleteVariable: (id: string, key: string) => request<{ data: any }>(`/environments/${id}/variables/${key}`, { method: "DELETE" }),
    listBindings: (id: string) => request<{ data: any[] }>(`/environments/${id}/bindings`),
    setBinding: (id: string, body: any) => request<{ data: any }>(`/environments/${id}/bindings`, { method: "POST", body: JSON.stringify(body) }),
    deleteBinding: (id: string, key: string) => request<{ data: any }>(`/environments/${id}/bindings/${key}`, { method: "DELETE" }),
  },

  // Phase 12: Release Artifacts
  releases: {
    list: (workflowId: string) => request<{ data: any[] }>(`/workflows/${workflowId}/releases`),
    get: (id: string) => request<{ data: any }>(`/releases/${id}`),
    create: (workflowId: string, body: any = {}) =>
      request<{ data: any }>(`/workflows/${workflowId}/releases`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  // Phase 12: Deployments & Promotion
  deployments: {
    list: (params?: { environmentId?: string; workflowId?: string }) => {
      const q = new URLSearchParams();
      if (params?.environmentId) q.set("environmentId", params.environmentId);
      if (params?.workflowId) q.set("workflowId", params.workflowId);
      const qs = q.toString();
      return request<{ data: any[] }>(`/deployments${qs ? `?${qs}` : ""}`);
    },
    validate: (body: { releaseArtifactId: string; environmentId: string }) =>
      request<{ data: any }>("/deployments/validate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    promote: (body: any) =>
      request<{ data: any }>("/deployments/promote", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    get: (id: string) => request<{ data: any }>(`/deployments/${id}`),
    decide: (id: string, body: { decision: "APPROVED" | "REJECTED"; comment?: string }) =>
      request<{ data: any }>(`/deployments/${id}/decision`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    rollback: (body: any) =>
      request<{ data: any }>("/deployments/rollback", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  // Phase 12: Automated Workflow Testing
  tests: {
    list: (workflowId: string) => request<{ data: any[] }>(`/workflows/${workflowId}/tests`),
    get: (id: string) => request<{ data: any }>(`/tests/${id}`),
    create: (workflowId: string, body: any) =>
      request<{ data: any }>(`/workflows/${workflowId}/tests`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: any) =>
      request<{ data: any }>(`/tests/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ data: any }>(`/tests/${id}`, {
        method: "DELETE",
      }),
    run: (id: string, body: any = {}) =>
      request<{ data: any }>(`/tests/${id}/run`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listRuns: (workflowId: string) => request<{ data: any[] }>(`/workflows/${workflowId}/test-runs`),
  },

  // Phase 13: AI Automation, Debugging & Optimization
  ai: {
    status: () => request<{ data: any }>("/ai/status"),
    generateWorkflow: (body: { prompt: string; workflowName?: string }) =>
      request<{ data: any }>("/ai/generate-workflow", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    refineWorkflow: (body: { prompt: string; currentNodes: any[]; currentEdges: any[]; workflowId?: string }) =>
      request<{ data: any }>("/ai/refine-workflow", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    explainWorkflow: (body: { nodes: any[]; edges: any[]; name?: string; workflowId?: string }) =>
      request<{ data: any }>("/ai/explain-workflow", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    debugExecution: (executionId: string) =>
      request<{ data: any }>(`/ai/debug-execution/${executionId}`, {
        method: "POST",
      }),
    optimizeWorkflow: (workflowId: string, days = 14) =>
      request<{ data: any }>(`/ai/optimize-workflow/${workflowId}?days=${days}`, {
        method: "POST",
      }),
    generateTests: (workflowId: string, count = 3) =>
      request<{ data: any }>(`/ai/generate-tests/${workflowId}?count=${count}`, {
        method: "POST",
      }),
  },

  // Phase 14: Enterprise Collaboration, Governance, Reviews & Reliability
  organizations: {
    list: () => request<{ data: any[] }>("/organizations"),
    get: (id: string) => request<{ data: any }>(`/organizations/${id}`),
    create: (body: any) => request<{ data: any }>("/organizations", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: any) => request<{ data: any }>(`/organizations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    listMembers: (id: string) => request<{ data: any[] }>(`/organizations/${id}/members`),
    addMember: (id: string, body: any) => request<{ data: any }>(`/organizations/${id}/members`, { method: "POST", body: JSON.stringify(body) }),
    removeMember: (id: string, membershipId: string) => request<{ success: boolean }>(`/organizations/${id}/members/${membershipId}`, { method: "DELETE" }),
    listWorkspaces: (id: string) => request<{ data: any[] }>(`/organizations/${id}/workspaces`),
  },

  teams: {
    list: () => request<{ data: any[] }>("/teams"),
    get: (id: string) => request<{ data: any }>(`/teams/${id}`),
    create: (body: any) => request<{ data: any }>("/teams", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: any) => request<{ data: any }>(`/teams/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    addMember: (id: string, body: any) => request<{ data: any }>(`/teams/${id}/members`, { method: "POST", body: JSON.stringify(body) }),
    removeMember: (id: string, memberId: string) => request<{ success: boolean }>(`/teams/${id}/members/${memberId}`, { method: "DELETE" }),
  },

  permissions: {
    list: (params?: any) => {
      const q = new URLSearchParams();
      if (params?.resourceType) q.set("resourceType", params.resourceType);
      if (params?.resourceId) q.set("resourceId", params.resourceId);
      const qs = q.toString();
      return request<{ data: any[] }>(`/permissions${qs ? `?${qs}` : ""}`);
    },
    grant: (body: any) => request<{ data: any }>("/permissions", { method: "POST", body: JSON.stringify(body) }),
    revoke: (id: string) => request<{ success: boolean }>(`/permissions/${id}`, { method: "DELETE" }),
  },

  reviews: {
    list: (params?: any) => {
      const q = new URLSearchParams();
      if (params?.workflowId) q.set("workflowId", params.workflowId);
      if (params?.status) q.set("status", params.status);
      const qs = q.toString();
      return request<{ data: any[] }>(`/reviews${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => request<{ data: any }>(`/reviews/${id}`),
    create: (body: any) => request<{ data: any }>("/reviews", { method: "POST", body: JSON.stringify(body) }),
    decide: (id: string, body: any) => request<{ data: any }>(`/reviews/${id}/decision`, { method: "POST", body: JSON.stringify(body) }),
    addComment: (id: string, body: any) => request<{ data: any }>(`/reviews/${id}/comments`, { method: "POST", body: JSON.stringify(body) }),
  },

  reliability: {
    list: () => request<{ data: any[] }>("/reliability/objectives"),
    create: (body: any) => request<{ data: any }>("/reliability/objectives", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: any) => request<{ data: any }>(`/reliability/objectives/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<{ success: boolean }>(`/reliability/objectives/${id}`, { method: "DELETE" }),
    evaluate: (id: string) => request<{ data: any }>(`/reliability/objectives/${id}`, { method: "GET" }),
  },

  compliance: {
    searchAudit: (params?: any) => {
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
      return request<{ logs: any[]; pagination: any }>(`/compliance/audit-logs${qs ? `?${qs}` : ""}`);
    },
    createExport: (body: any) => request<{ data: any }>("/compliance/exports", { method: "POST", body: JSON.stringify(body) }),
    listExports: () => request<{ data: any[] }>("/compliance/exports"),
    downloadExport: (token: string) => request<any>(`/compliance/exports/${token}/download`),
    setLegalHold: (body: { legalHold: boolean; reason?: string }) =>
      request<any>("/data-retention/legal-hold", { method: "POST", body: JSON.stringify(body) }),
    cleanupExpired: (body?: { dryRun?: boolean }) =>
      request<any>("/data-retention/cleanup", { method: "POST", body: JSON.stringify(body || {}) }),
    getRetentionPolicy: () => request<any>("/data-retention/policy"),
  },

  // Phase 17: Enterprise Data Residency Namespace
  residency: {
    get: () => request<any>("/residency"),
    update: (body: any) => request<any>("/residency", { method: "PATCH", body: JSON.stringify(body) }),
    verify: () => request<any>("/residency/verify", { method: "POST" }),
  },

  // Phase 17: Customer-Managed Encryption Keys (CMEK) Namespace
  cmek: {
    getStatus: () => request<any>("/cmek"),
    register: (body: any) => request<any>("/cmek/register", { method: "POST", body: JSON.stringify(body) }),
    rotate: (body?: any) => request<any>("/cmek/rotate", { method: "POST", body: JSON.stringify(body || {}) }),
    revoke: (body: any) => request<any>("/cmek/revoke", { method: "POST", body: JSON.stringify(body) }),
  },

  // Phase 18: Operational Incidents
  incidents: {
    list: (params?: { status?: string; severity?: string; category?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.severity) q.set("severity", params.severity);
      if (params?.category) q.set("category", params.category);
      const qs = q.toString();
      return request<{ data: any[] }>(`/incidents${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => request<{ data: any }>(`/incidents/${id}`),
    updateStatus: (id: string, body: { status: string; note?: string }) =>
      request<{ data: any }>(`/incidents/${id}/status`, { method: "POST", body: JSON.stringify(body) }),
    assign: (id: string, body: { assignedToUserId: string | null; note?: string }) =>
      request<{ data: any }>(`/incidents/${id}/assign`, { method: "POST", body: JSON.stringify(body) }),
    addNote: (id: string, body: { note: string }) =>
      request<{ data: any }>(`/incidents/${id}/notes`, { method: "POST", body: JSON.stringify(body) }),
    analyzeRootCause: (id: string) =>
      request<{ data: any }>(`/incidents/${id}/root-cause`, { method: "POST" }),
    simulate: (body: any) =>
      request<{ data: any }>("/incidents/simulate", { method: "POST", body: JSON.stringify(body) }),
  },

  // Phase 18: Remediation & Self-Healing Engine
  remediations: {
    getPolicy: () => request<{ data: any }>("/remediation/policy"),
    updatePolicy: (body: any) =>
      request<{ data: any }>("/remediation/policy", { method: "PUT", body: JSON.stringify(body) }),
    listOperations: (params?: { status?: string; incidentId?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.incidentId) q.set("incidentId", params.incidentId);
      const qs = q.toString();
      return request<{ data: any[] }>(`/remediation/operations${qs ? `?${qs}` : ""}`);
    },
    getOperation: (id: string) => request<{ data: any }>(`/remediation/operations/${id}`),
    requestAction: (body: any) =>
      request<{ data: any }>("/remediation/operations", { method: "POST", body: JSON.stringify(body) }),
    approve: (id: string, body: { approved: boolean; reason?: string }) =>
      request<{ data: any }>(`/remediation/operations/${id}/approve`, { method: "POST", body: JSON.stringify(body) }),
    verify: (id: string) =>
      request<{ data: any }>(`/remediation/operations/${id}/verify`, { method: "POST" }),
  },

  // Phase 18: Unified Health & Observability 2.0
  observability: {
    getUnifiedHealth: () => request<{ data: any }>("/observability/unified-health"),
    getWarnings: (isResolved?: boolean) => {
      const qs = isResolved !== undefined ? `?isResolved=${isResolved}` : "";
      return request<{ data: any[] }>(`/observability/warnings${qs}`);
    },
    evaluateWarnings: (body?: { regionKey?: string }) =>
      request<{ data: any[] }>("/observability/warnings/evaluate", { method: "POST", body: JSON.stringify(body || {}) }),
    getSlos: () => request<{ data: any[] }>("/observability/slos"),
    evaluateSlos: () => request<{ data: any[] }>("/observability/slos/evaluate", { method: "POST" }),
  },

  // Phase 19: Enterprise Connectors & Developer Platform
  connectors: {
    validateManifest: (manifest: any) =>
      request<{ valid: boolean; manifest?: any; hash?: string; errors?: string[] }>("/connectors/validate-manifest", {
        method: "POST",
        body: JSON.stringify({ manifest }),
      }),
    list: (params?: { connectorKey?: string; status?: string; scope?: string }) => {
      const q = new URLSearchParams();
      if (params?.connectorKey) q.set("connectorKey", params.connectorKey);
      if (params?.status) q.set("status", params.status);
      if (params?.scope) q.set("scope", params.scope);
      const qs = q.toString();
      return request<any[]>(`/connectors${qs ? `?${qs}` : ""}`);
    },
    createDraft: (manifest: any) =>
      request<any>("/connectors/drafts", {
        method: "POST",
        body: JSON.stringify({ manifest }),
      }),
    get: (id: string) => request<any>(`/connectors/${id}`),
    certify: (id: string) =>
      request<any>(`/connectors/${id}/certify`, { method: "POST" }),
    review: (id: string, body: { decision: "APPROVE" | "REJECT"; reviewNotes?: string }) =>
      request<any>(`/connectors/${id}/reviews`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    publish: (id: string, body?: { expectedArtifactHashSha256?: string }) =>
      request<any>(`/connectors/${id}/publish`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
    suspend: (id: string, body: { reason: string; isPermanentRevocation?: boolean }) =>
      request<any>(`/connectors/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    install: (id: string) =>
      request<any>(`/connectors/${id}/install`, { method: "POST" }),
    upgradePreflight: (id: string, targetArtifactId: string) =>
      request<any>(`/connectors/${id}/upgrade-preflight`, {
        method: "POST",
        body: JSON.stringify({ targetArtifactId }),
      }),
    upgradeInstallation: (installationId: string, body: { targetArtifactId: string; acknowledgeBreakingChanges?: boolean }) =>
      request<any>(`/connectors/installations/${installationId}/upgrade`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    rollbackInstallation: (installationId: string, body?: { targetArtifactId?: string; reason?: string }) =>
      request<any>(`/connectors/installations/${installationId}/rollback`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
    getAnalytics: (key: string) => request<any>(`/connectors/${key}/analytics`),
  },

  // ==========================================
  // PHASE 20: DIGITAL TWIN SIMULATION, CHAOS & OPTIMIZATION
  // ==========================================

  simulations: {
    createScenario: (workflowId: string, body: any) =>
      request<any>(`/workflows/${workflowId}/simulations/scenarios`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listScenarios: (workflowId: string) =>
      request<any>(`/workflows/${workflowId}/simulations/scenarios`),
    getScenario: (scenarioId: string) =>
      request<any>(`/simulations/scenarios/${scenarioId}`),
    deleteScenario: (scenarioId: string) =>
      request<any>(`/simulations/scenarios/${scenarioId}`, { method: "DELETE" }),
    run: (workflowId: string, body?: any) =>
      request<any>(`/workflows/${workflowId}/simulations/run`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
    listRuns: (workflowId: string) =>
      request<any>(`/workflows/${workflowId}/simulations/runs`),
    getRun: (runId: string) =>
      request<any>(`/simulations/runs/${runId}`),
    checkStale: (runId: string, contentHash: string) =>
      request<{ isStale: boolean }>(`/simulations/runs/${runId}/stale-check?contentHash=${encodeURIComponent(contentHash)}`),
    evaluateReleaseGates: (releaseArtifactId: string, environmentId: string) =>
      request<any>(`/releases/${releaseArtifactId}/simulation-gates/${environmentId}`),
  },

  chaos: {
    createExperiment: (body: any) =>
      request<any>("/chaos/experiments", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listExperiments: () =>
      request<any>("/chaos/experiments"),
    getExperiment: (id: string) =>
      request<any>(`/chaos/experiments/${id}`),
    approveExperiment: (id: string) =>
      request<any>(`/chaos/experiments/${id}/approve`, { method: "POST" }),
    startExperiment: (id: string) =>
      request<any>(`/chaos/experiments/${id}/start`, { method: "POST" }),
    stopExperiment: (id: string) =>
      request<any>(`/chaos/experiments/${id}/stop`, { method: "POST" }),
  },

  optimizations: {
    compareAndCreateCandidate: (workflowId: string, body: any) =>
      request<any>(`/workflows/${workflowId}/optimizations/candidates`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listCandidates: (workflowId: string) =>
      request<any>(`/workflows/${workflowId}/optimizations/candidates`),
    getCandidate: (candidateId: string) =>
      request<any>(`/optimizations/candidates/${candidateId}`),
    promoteCandidate: (candidateId: string) =>
      request<any>(`/optimizations/candidates/${candidateId}/promote`, { method: "POST" }),
  },

  // ==========================================
  // PHASE 21: BUSINESS PROCESS INTELLIGENCE & PROCESS MINING
  // ==========================================

  processes: {
    createDefinition: (body: any) =>
      request<any>("/processes", { method: "POST", body: JSON.stringify(body) }),
    listDefinitions: (query?: { businessDomain?: string; criticality?: string; lifecycleStatus?: string }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/processes${q ? "?" + q : ""}`);
    },
    getDefinition: (id: string) =>
      request<any>(`/processes/${id}`),
    updateDefinition: (id: string, body: any) =>
      request<any>(`/processes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    createVersion: (id: string, body: any) =>
      request<any>(`/processes/${id}/versions`, { method: "POST", body: JSON.stringify(body) }),
    diffVersions: (id: string, v1: number, v2: number) =>
      request<any>(`/processes/${id}/versions/diff?v1=${v1}&v2=${v2}`),
    ingestEvent: (body: any) =>
      request<any>("/processes/events/ingest", { method: "POST", body: JSON.stringify(body) }),
    listInstances: (id: string, query?: { status?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/processes/${id}/instances${q ? "?" + q : ""}`);
    },
    getInstance: (instanceId: string) =>
      request<any>(`/processes/instances/${instanceId}`),
    cancelInstance: (instanceId: string, reason?: string) =>
      request<any>(`/processes/instances/${instanceId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
    mine: (id: string, timeRangeDays = 30) =>
      request<any>(`/processes/${id}/mining?timeRangeDays=${timeRangeDays}`),
    getMetrics: (id: string, timeRangeDays = 30) =>
      request<any>(`/processes/${id}/metrics?timeRangeDays=${timeRangeDays}`),
    createSlaPolicy: (id: string, body: any) =>
      request<any>(`/processes/${id}/sla-policies`, { method: "POST", body: JSON.stringify(body) }),
    getSlaPolicy: (id: string) =>
      request<any>(`/processes/${id}/sla-policies`),
  },

  // ==========================================
  // PHASE 22: ENTERPRISE EVENT-DRIVEN INTEGRATION FABRIC
  // ==========================================

  events: {
    ingest: (body: any) =>
      request<any>("/events/ingest", { method: "POST", body: JSON.stringify(body) }),
    ingestBatch: (events: any[]) =>
      request<any>("/events/ingest/batch", { method: "POST", body: JSON.stringify({ events }) }),
    list: (query?: { eventType?: string; correlationId?: string; source?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/events${q ? "?" + q : ""}`);
    },
    get: (id: string) =>
      request<any>(`/events/${id}`),
    createSchema: (body: any) =>
      request<any>("/events/schemas", { method: "POST", body: JSON.stringify(body) }),
    listSchemas: (query?: { businessDomain?: string; status?: string; search?: string }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/events/schemas${q ? "?" + q : ""}`);
    },
    getSchema: (eventType: string) =>
      request<any>(`/events/schemas/${eventType}`),
    createSchemaVersion: (eventType: string, body: any) =>
      request<any>(`/events/schemas/${eventType}/versions`, { method: "POST", body: JSON.stringify(body) }),
    publishSchemaVersion: (eventType: string, version: number) =>
      request<any>(`/events/schemas/${eventType}/versions/${version}/publish`, { method: "POST" }),
    createSubscription: (body: any) =>
      request<any>("/events/subscriptions", { method: "POST", body: JSON.stringify(body) }),
    listSubscriptions: (query?: { status?: string; destinationType?: string }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/events/subscriptions${q ? "?" + q : ""}`);
    },
    getSubscription: (id: string) =>
      request<any>(`/events/subscriptions/${id}`),
    updateSubscription: (id: string, body: any) =>
      request<any>(`/events/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    pauseSubscription: (id: string) =>
      request<any>(`/events/subscriptions/${id}/pause`, { method: "POST" }),
    resumeSubscription: (id: string) =>
      request<any>(`/events/subscriptions/${id}/resume`, { method: "POST" }),
    listDeliveries: (query?: { status?: string; subscriptionId?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/events/deliveries${q ? "?" + q : ""}`);
    },
    getDelivery: (id: string) =>
      request<any>(`/events/deliveries/${id}`),
    replayDelivery: (id: string) =>
      request<any>(`/events/deliveries/${id}/replay`, { method: "POST" }),
    createReplayJob: (body: any) =>
      request<any>("/events/replay-jobs", { method: "POST", body: JSON.stringify(body) }),
    getReplayJob: (id: string) =>
      request<any>(`/events/replay-jobs/${id}`),
    getMetrics: (timeRangeHours = 24) =>
      request<any>(`/events/metrics?timeRangeHours=${timeRangeHours}`),
  },

  // ==========================================
  // PHASE 23: DATA INTELLIGENCE & GOVERNED DATA PRODUCTS
  // ==========================================

  dataProducts: {
    create: (body: any) =>
      request<any>("/data-products", { method: "POST", body: JSON.stringify(body) }),
    list: (query?: { businessDomain?: string; lifecycleStatus?: string; criticality?: string; search?: string }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/data-products${q ? "?" + q : ""}`);
    },
    get: (id: string) =>
      request<any>(`/data-products/${id}`),
    update: (id: string, body: any) =>
      request<any>(`/data-products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    createVersion: (id: string, body: any) =>
      request<any>(`/data-products/${id}/versions`, { method: "POST", body: JSON.stringify(body) }),
    publishVersion: (id: string, version: number, body?: { overrideQualityGate?: boolean; overrideReason?: string }) =>
      request<any>(`/data-products/${id}/versions/${version}/publish`, { method: "POST", body: JSON.stringify(body || {}) }),
    deprecate: (id: string, reason?: string) =>
      request<any>(`/data-products/${id}/deprecate`, { method: "POST", body: JSON.stringify({ reason }) }),
    retire: (id: string) =>
      request<any>(`/data-products/${id}/retire`, { method: "POST" }),
    getImpact: (id: string) =>
      request<any>(`/data-products/${id}/impact`),
    query: (id: string, body: any) =>
      request<any>(`/data-products/${id}/query`, { method: "POST", body: JSON.stringify(body) }),
  },

  dataSources: {
    register: (body: any) =>
      request<any>("/data-sources", { method: "POST", body: JSON.stringify(body) }),
    list: (query?: { sourceType?: string }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/data-sources${q ? "?" + q : ""}`);
    },
    get: (id: string) =>
      request<any>(`/data-sources/${id}`),
  },

  dataPipelines: {
    create: (body: any) =>
      request<any>("/data-pipelines", { method: "POST", body: JSON.stringify(body) }),
    list: (query?: { dataProductId?: string }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/data-pipelines${q ? "?" + q : ""}`);
    },
    get: (id: string) =>
      request<any>(`/data-pipelines/${id}`),
    createVersion: (id: string, body: any) =>
      request<any>(`/data-pipelines/${id}/versions`, { method: "POST", body: JSON.stringify(body) }),
    run: (id: string, body?: any) =>
      request<any>(`/data-pipelines/${id}/run`, { method: "POST", body: JSON.stringify(body || {}) }),
    preview: (id: string, sampleSize = 10) =>
      request<any>(`/data-pipelines/${id}/preview`, { method: "POST", body: JSON.stringify({ sampleSize }) }),
  },

  dataQuality: {
    createRule: (productId: string, body: any) =>
      request<any>(`/data-products/${productId}/quality-rules`, { method: "POST", body: JSON.stringify(body) }),
    listRules: (productId: string) =>
      request<any>(`/data-products/${productId}/quality-rules`),
    getRule: (ruleId: string) =>
      request<any>(`/data-quality-rules/${ruleId}`),
    updateRule: (ruleId: string, body: any) =>
      request<any>(`/data-quality-rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteRule: (ruleId: string) =>
      request<any>(`/data-quality-rules/${ruleId}`, { method: "DELETE" }),
  },

  dataLineage: {
    getGraph: (query?: { rootNodeKey?: string; direction?: string; maxDepth?: number }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/data-lineage${q ? "?" + q : ""}`);
    },
    registerNode: (body: any) =>
      request<any>("/data-lineage/nodes", { method: "POST", body: JSON.stringify(body) }),
    registerEdge: (body: any) =>
      request<any>("/data-lineage/edges", { method: "POST", body: JSON.stringify(body) }),
  },

  intelligence: {
    getOverview: (query?: { timeRangeHours?: number }) => {
      const q = new URLSearchParams(query as any).toString();
      return request<any>(`/intelligence/overview${q ? "?" + q : ""}`);
    },
    workspaces: {
      create: (body: any) =>
        request<any>("/intelligence/workspaces", { method: "POST", body: JSON.stringify(body) }),
      list: () => request<any>("/intelligence/workspaces"),
      get: (id: string) => request<any>(`/intelligence/workspaces/${id}`),
    },
    insights: {
      analyze: (body?: { intelligenceWorkspaceId?: string; timeRangeHours?: number }) =>
        request<any>("/intelligence/insights/analyze", { method: "POST", body: JSON.stringify(body || {}) }),
      list: (query?: { category?: string; severity?: string; status?: string }) => {
        const q = new URLSearchParams(query as any).toString();
        return request<any>(`/intelligence/insights${q ? "?" + q : ""}`);
      },
      get: (id: string) => request<any>(`/intelligence/insights/${id}`),
      updateStatus: (id: string, status: string) =>
        request<any>(`/intelligence/insights/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
      acknowledge: (id: string) =>
        request<any>(`/intelligence/insights/${id}/acknowledge`, { method: "POST" }),
      dismiss: (id: string) =>
        request<any>(`/intelligence/insights/${id}/dismiss`, { method: "POST" }),
      resolve: (id: string) =>
        request<any>(`/intelligence/insights/${id}/resolve`, { method: "POST" }),
    },
    forecasts: {
      run: (body: any) =>
        request<any>("/intelligence/forecasts/run", { method: "POST", body: JSON.stringify(body) }),
      list: (query?: { targetMetric?: string }) => {
        const q = new URLSearchParams(query as any).toString();
        return request<any>(`/intelligence/forecasts${q ? "?" + q : ""}`);
      },
    },
    investigations: {
      start: (body: any) =>
        request<any>("/intelligence/investigations", { method: "POST", body: JSON.stringify(body) }),
      list: () => request<any>("/intelligence/investigations"),
      get: (id: string) => request<any>(`/intelligence/investigations/${id}`),
    },
    proposals: {
      create: (body: any) =>
        request<any>("/intelligence/proposals", { method: "POST", body: JSON.stringify(body) }),
      list: (query?: { status?: string; actionType?: string }) => {
        const q = new URLSearchParams(query as any).toString();
        return request<any>(`/intelligence/proposals${q ? "?" + q : ""}`);
      },
      get: (id: string) => request<any>(`/intelligence/proposals/${id}`),
      approve: (id: string, body?: { comment?: string; executeImmediately?: boolean }) =>
        request<any>(`/intelligence/proposals/${id}/approve`, { method: "POST", body: JSON.stringify(body || {}) }),
      reject: (id: string, body: { reason: string }) =>
        request<any>(`/intelligence/proposals/${id}/reject`, { method: "POST", body: JSON.stringify(body) }),
      execute: (id: string) =>
        request<any>(`/intelligence/proposals/${id}/execute`, { method: "POST" }),
    },
    outcomes: {
      evaluate: (proposalId: string, body?: any) =>
        request<any>(`/intelligence/outcomes/evaluate/${proposalId}`, { method: "POST", body: JSON.stringify(body || {}) }),
      list: (query?: { proposalId?: string }) => {
        const q = new URLSearchParams(query as any).toString();
        return request<any>(`/intelligence/outcomes${q ? "?" + q : ""}`);
      },
    },
  },


  // Phase 25: Customer Operations & 360 Intelligence
  customers: {
    listAccounts: (params?: { lifecycleState?: string; healthStatus?: string; tier?: string; search?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customers${q ? `?${q}` : ""}`);
    },
    getAccount: (id: string) => request<{ data: any }>(`/customers/${id}`),
    createAccount: (body: any) =>
      request<{ data: any }>("/customers", { method: "POST", body: JSON.stringify(body) }),
    updateAccount: (id: string, body: any) =>
      request<{ data: any }>(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    get360Profile: (id: string) => request<{ data: any }>(`/customers/${id}/360`),
    listContacts: (id: string) => request<{ data: any[] }>(`/customers/${id}/contacts`),
    addContact: (id: string, body: any) =>
      request<{ data: any }>(`/customers/${id}/contacts`, { method: "POST", body: JSON.stringify(body) }),
    linkIdentity: (id: string, body: any) =>
      request<{ data: any }>(`/customers/${id}/identities`, { method: "POST", body: JSON.stringify(body) }),
    listJourneys: () => request<{ data: any[] }>("/customer-journeys/definitions"),
    createJourney: (body: any) =>
      request<{ data: any }>("/customer-journeys/definitions", { method: "POST", body: JSON.stringify(body) }),
    listJourneyInstances: (params?: { customerAccountId?: string; status?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-journeys/instances${q ? `?${q}` : ""}`);
    },
    startJourneyInstance: (body: any) =>
      request<{ data: any }>("/customer-journeys/instances", { method: "POST", body: JSON.stringify(body) }),
    progressMilestone: (id: string, body: any) =>
      request<{ data: any }>(`/customer-journeys/instances/${id}/milestones`, { method: "POST", body: JSON.stringify(body) }),
    getHealthModel: () => request<{ data: any }>("/customer-health/model"),
    configureHealthModel: (body: any) =>
      request<{ data: any }>("/customer-health/model", { method: "POST", body: JSON.stringify(body) }),
    evaluateHealth: (accountId: string) =>
      request<{ data: any }>(`/customer-health/evaluate/${accountId}`, { method: "POST" }),
    getHealthHistory: (accountId: string) =>
      request<{ data: any[] }>(`/customer-health/history/${accountId}`),
    listRisks: (params?: { customerAccountId?: string; status?: string; severity?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-risks${q ? `?${q}` : ""}`);
    },
    recordRisk: (body: any) =>
      request<{ data: any }>("/customer-risks", { method: "POST", body: JSON.stringify(body) }),
    resolveRisk: (id: string, body: { status: string; notes?: string }) =>
      request<{ data: any }>(`/customer-risks/${id}/resolve`, { method: "POST", body: JSON.stringify(body) }),
    listTasks: (params?: { customerAccountId?: string; status?: string; priority?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-tasks${q ? `?${q}` : ""}`);
    },
    createTask: (body: any) =>
      request<{ data: any }>("/customer-tasks", { method: "POST", body: JSON.stringify(body) }),
    updateTask: (id: string, body: any) =>
      request<{ data: any }>(`/customer-tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    listPlaybooks: () => request<{ data: any[] }>("/customer-playbooks/definitions"),
    createPlaybook: (body: any) =>
      request<{ data: any }>("/customer-playbooks/definitions", { method: "POST", body: JSON.stringify(body) }),
    triggerPlaybook: (definitionId: string, body: { customerAccountId: string }) =>
      request<{ data: any }>(`/customer-playbooks/definitions/${definitionId}/trigger`, { method: "POST", body: JSON.stringify(body) }),
    listPlaybookRuns: (params?: { playbookDefinitionId?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-playbooks/runs${q ? `?${q}` : ""}`);
    },
    listTemplates: () => request<{ data: any[] }>("/customer-communications/templates"),
    createTemplate: (body: any) =>
      request<{ data: any }>("/customer-communications/templates", { method: "POST", body: JSON.stringify(body) }),
    requestApproval: (body: any) =>
      request<{ data: any }>("/customer-communications/approvals", { method: "POST", body: JSON.stringify(body) }),
    approveCommunication: (id: string) =>
      request<{ data: any }>(`/customer-communications/approvals/${id}/approve`, { method: "POST" }),
    rejectCommunication: (id: string) =>
      request<{ data: any }>(`/customer-communications/approvals/${id}/reject`, { method: "POST" }),
  },

  // Phase 26: Enterprise Revenue Intelligence & Retention Governance
  revenue: {
    // Contracts
    listContracts: (params?: { customerAccountId?: string; status?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-contracts${q ? `?${q}` : ""}`);
    },
    getContract: (id: string) => request<{ data: any }>(`/customer-contracts/${id}`),
    createContract: (body: any) =>
      request<{ data: any }>("/customer-contracts", { method: "POST", body: JSON.stringify(body) }),
    updateContract: (id: string, body: any) =>
      request<{ data: any }>(`/customer-contracts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    getContractChanges: (id: string) => request<{ data: any[] }>(`/customer-contracts/${id}/changes`),

    // Renewals
    listRenewals: (params?: { contractId?: string; customerAccountId?: string; stage?: string; riskClassification?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-renewals${q ? `?${q}` : ""}`);
    },
    getRenewal: (id: string) => request<{ data: any }>(`/customer-renewals/${id}`),
    createRenewal: (body: any) =>
      request<{ data: any }>("/customer-renewals", { method: "POST", body: JSON.stringify(body) }),
    updateRenewalStage: (id: string, body: any) =>
      request<{ data: any }>(`/customer-renewals/${id}/stage`, { method: "PATCH", body: JSON.stringify(body) }),
    recordRenewalOutcome: (id: string, body: any) =>
      request<{ data: any }>(`/customer-renewals/${id}/outcome`, { method: "POST", body: JSON.stringify(body) }),
    getRenewalTimeline: (id: string) => request<{ data: any[] }>(`/customer-renewals/${id}/timeline`),
    evaluateRenewalRisk: (id: string, body?: { dryRun?: boolean; triggerReason?: string }) =>
      request<{ data: any }>(`/customer-renewals/${id}/evaluate-risk`, { method: "POST", body: JSON.stringify(body || {}) }),
    getRenewalRiskHistory: (id: string) => request<{ data: any[] }>(`/customer-renewals/${id}/risk-history`),

    // Expansion
    listExpansion: (params?: { customerAccountId?: string; stage?: string; opportunityType?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-expansion${q ? `?${q}` : ""}`);
    },
    getExpansion: (id: string) => request<{ data: any }>(`/customer-expansion/${id}`),
    createExpansion: (body: any) =>
      request<{ data: any }>("/customer-expansion", { method: "POST", body: JSON.stringify(body) }),
    qualifyExpansion: (id: string, body: any) =>
      request<{ data: any }>(`/customer-expansion/${id}/qualify`, { method: "POST", body: JSON.stringify(body) }),
    updateExpansionStage: (id: string, body: any) =>
      request<{ data: any }>(`/customer-expansion/${id}/stage`, { method: "PATCH", body: JSON.stringify(body) }),
    getExpansionHistory: (id: string) => request<{ data: any[] }>(`/customer-expansion/${id}/history`),

    // Policy & Overview
    getPolicy: () => request<{ data: any }>("/customer-revenue/policy"),
    configurePolicy: (body: any) =>
      request<{ data: any }>("/customer-revenue/policy", { method: "PUT", body: JSON.stringify(body) }),
    generateTasks: (body?: { contractId?: string }) =>
      request<{ data: any }>("/customer-revenue/generate-tasks", { method: "POST", body: JSON.stringify(body || {}) }),
    getOverview: (currency = "USD") => request<{ data: any }>(`/revenue/overview?currency=${currency}`),
  },

  // Phase 27: Enterprise Customer Portfolio Intelligence & Strategic Account Planning
  accountPlanning: {
    // Strategic Profiles
    listProfiles: (params?: { tier?: string; segment?: string; search?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-strategic-profiles${q ? `?${q}` : ""}`);
    },
    getProfile: (customerAccountId: string) =>
      request<{ data: any }>(`/customer-strategic-profiles/${customerAccountId}`),
    configureProfile: (customerAccountId: string, body: any) =>
      request<{ data: any }>(`/customer-strategic-profiles/${customerAccountId}`, { method: "POST", body: JSON.stringify(body) }),
    getCoverage: (customerAccountId: string) =>
      request<{ data: any }>(`/customer-strategic-profiles/${customerAccountId}/coverage`),

    // Stakeholders
    listStakeholders: (customerAccountId: string, includeInactive?: boolean) =>
      request<{ data: any[] }>(`/customer-stakeholders?customerAccountId=${customerAccountId}${includeInactive ? "&includeInactive=true" : ""}`),
    assignStakeholderRole: (customerAccountId: string, body: any) =>
      request<{ data: any }>(`/customer-stakeholders/${customerAccountId}`, { method: "POST", body: JSON.stringify(body) }),
    updateStakeholderRole: (id: string, body: any) =>
      request<{ data: any }>(`/customer-stakeholders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    removeStakeholderRole: (id: string) =>
      request<{ data: any }>(`/customer-stakeholders/${id}`, { method: "DELETE" }),
    getStakeholderHistory: (id: string) =>
      request<{ data: any[] }>(`/customer-stakeholders/${id}/history`),

    // Account Plans
    listPlans: (params?: { customerAccountId?: string; status?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-account-plans${q ? `?${q}` : ""}`);
    },
    createPlan: (body: any) =>
      request<{ data: any }>("/customer-account-plans", { method: "POST", body: JSON.stringify(body) }),
    getPlan: (id: string) =>
      request<{ data: any }>(`/customer-account-plans/${id}`),
    updatePlan: (id: string, body: any) =>
      request<{ data: any }>(`/customer-account-plans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    updatePlanStatus: (id: string, status: string) =>
      request<{ data: any }>(`/customer-account-plans/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    approvePlan: (id: string, body?: { changeSummary?: string }) =>
      request<{ data: any }>(`/customer-account-plans/${id}/approve`, { method: "POST", body: JSON.stringify(body || {}) }),
    archivePlan: (id: string) =>
      request<{ data: any }>(`/customer-account-plans/${id}/archive`, { method: "POST" }),

    // Customer Objectives
    listObjectives: (params?: { customerAccountId?: string; accountPlanId?: string; status?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-objectives${q ? `?${q}` : ""}`);
    },
    createObjective: (body: any) =>
      request<{ data: any }>("/customer-objectives", { method: "POST", body: JSON.stringify(body) }),
    getObjective: (id: string) =>
      request<{ data: any }>(`/customer-objectives/${id}`),
    updateObjective: (id: string, body: any) =>
      request<{ data: any }>(`/customer-objectives/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    recordEvidence: (id: string, body: any) =>
      request<{ data: any }>(`/customer-objectives/${id}/evidence`, { method: "POST", body: JSON.stringify(body) }),
    recordBlocker: (id: string, body: any) =>
      request<{ data: any }>(`/customer-objectives/${id}/blockers`, { method: "POST", body: JSON.stringify(body) }),
    resolveBlocker: (id: string, body: { resolutionNotes: string }) =>
      request<{ data: any }>(`/customer-objectives/blockers/${id}/resolve`, { method: "POST", body: JSON.stringify(body) }),

    // Strategic Initiatives
    listInitiatives: (params?: { customerAccountId?: string; accountPlanId?: string; status?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-strategic-initiatives${q ? `?${q}` : ""}`);
    },
    createInitiative: (body: any) =>
      request<{ data: any }>("/customer-strategic-initiatives", { method: "POST", body: JSON.stringify(body) }),
    getInitiative: (id: string) =>
      request<{ data: any }>(`/customer-strategic-initiatives/${id}`),
    updateInitiative: (id: string, body: any) =>
      request<{ data: any }>(`/customer-strategic-initiatives/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    addMilestone: (id: string, body: { title: string; targetDate: string }) =>
      request<{ data: any }>(`/customer-strategic-initiatives/${id}/milestones`, { method: "POST", body: JSON.stringify(body) }),
    updateMilestone: (milestoneId: string, body: any) =>
      request<{ data: any }>(`/customer-strategic-initiatives/milestones/${milestoneId}`, { method: "PATCH", body: JSON.stringify(body) }),

    // Executive Reviews
    getPrepSnapshot: (customerAccountId: string, reviewPeriod?: string) =>
      request<{ data: any }>(`/customer-executive-reviews/prep/${customerAccountId}${reviewPeriod ? `?reviewPeriod=${reviewPeriod}` : ""}`),
    listReviews: (params?: { customerAccountId?: string; status?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<{ data: any[] }>(`/customer-executive-reviews${q ? `?${q}` : ""}`);
    },
    scheduleReview: (body: any) =>
      request<{ data: any }>("/customer-executive-reviews", { method: "POST", body: JSON.stringify(body) }),
    getReview: (id: string) =>
      request<{ data: any }>(`/customer-executive-reviews/${id}`),
    updateReview: (id: string, body: any) =>
      request<{ data: any }>(`/customer-executive-reviews/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    completeReview: (id: string, body: any) =>
      request<{ data: any }>(`/customer-executive-reviews/${id}/complete`, { method: "POST", body: JSON.stringify(body) }),
    recordReviewCommitment: (id: string, body: any) =>
      request<{ data: any }>(`/customer-executive-reviews/${id}/commitments`, { method: "POST", body: JSON.stringify(body) }),
    updateCommitmentStatus: (commitmentId: string, status: string) =>
      request<{ data: any }>(`/customer-executive-reviews/commitments/${commitmentId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

    // Portfolio Prioritization
    getPortfolioOverview: () =>
      request<{ data: any }>("/customer-portfolio/overview"),
    getPortfolioQueue: () =>
      request<{ data: any[] }>("/customer-portfolio/queue"),
    recalculatePriority: (customerAccountId: string) =>
      request<{ data: any }>(`/customer-portfolio/recalculate/${customerAccountId}`, { method: "POST" }),
  },

};
