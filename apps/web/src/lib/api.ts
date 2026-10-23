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
    "Content-Type": "application/json",
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

  // Phase 9: Enterprise Governance
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
};
