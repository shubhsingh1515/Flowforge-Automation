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
    test: (id: string, payload?: any) => request<any>(`/workflows/${id}/test`, { method: "POST", body: JSON.stringify({ payload: payload || {} }) }),
    previewTransform: (sampleInput: any, config: any) =>
      request<any>("/workflows/preview-transform", {
        method: "POST",
        body: JSON.stringify({ sampleInput, config }),
      }),
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
    list: () => request<{ templates: any[] }>("/templates"),
    instantiate: (id: string) => request<{ workflow: any }>(`/templates/${id}/instantiate`, { method: "POST" }),
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
};
