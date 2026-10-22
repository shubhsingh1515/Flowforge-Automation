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
    list: () => request<{ data: any[] }>("/connections"),
    connect: (body: any) => request<any>("/connections", { method: "POST", body: JSON.stringify(body) }),
    disconnect: (id: string) => request<any>(`/connections/${id}`, { method: "DELETE" }),
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
};
