"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Link as LinkIcon,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Lock,
  ExternalLink,
  Shield,
  Info,
  X,
  RotateCw,
  MessageSquare,
  FileSpreadsheet,
  Inbox,
  HardDrive,
  Globe,
  Key,
} from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";

const PROVIDER_ICONS: Record<string, any> = {
  slack: MessageSquare,
  "google-sheets": FileSpreadsheet,
  gmail: Inbox,
  "google-drive": HardDrive,
  "http-request": Globe,
};

const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  slack: { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200" },
  "google-sheets": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  gmail: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  "google-drive": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "http-request": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
};

function ConnectionsContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectionName, setConnectionName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("slack");
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Check URL query params for OAuth redirect result
  useEffect(() => {
    const connected = searchParams.get("connected");
    const provider = searchParams.get("provider");
    const err = searchParams.get("error");

    if (connected && provider) {
      setStatusNotice(`Successfully connected ${provider.toUpperCase()} account via OAuth 2.0!`);
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    } else if (err) {
      setError(`OAuth Authorization Error: ${decodeURIComponent(err)}`);
    }
  }, [searchParams, queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.connections.list(),
  });

  const connections = data?.data || [];

  // Manual API Key / dev connect mutation
  const connectMutation = useMutation({
    mutationFn: (newConn: any) => {
      if (newConn.isDevConnect) {
        return api.oauth.devConnect(newConn.integrationKey, newConn.name);
      }
      return api.connections.connect(newConn);
    },
    onSuccess: () => {
      setConnectModalOpen(false);
      setConnectionName("");
      setApiKey("");
      setStatusNotice("New connection established successfully!");
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to establish connection.");
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.connections.disconnect(id),
    onSuccess: () => {
      setStatusNotice("Connection disconnected and credentials removed.");
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  // Refresh / verify mutation
  const refreshMutation = useMutation({
    mutationFn: (id: string) => api.connections.refresh(id),
    onSuccess: () => {
      setStatusNotice("Connection token successfully verified and refreshed.");
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to refresh token.");
    },
  });

  const handleStartOAuth = async (provider: string) => {
    setError(null);
    try {
      // In development or when external credentials are not set, use dev-connect
      const authRes = await api.oauth.getAuthorizationUrl(provider).catch(() => null);
      if (authRes?.authorizationUrl && !authRes.authorizationUrl.includes("mock_")) {
        window.location.href = authRes.authorizationUrl;
      } else {
        // Fallback to simulated connect
        connectMutation.mutate({
          integrationKey: provider,
          name: `${provider.toUpperCase()} Workspace Account`,
          isDevConnect: true,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to initiate OAuth flow.");
    }
  };

  const handleConnectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedProvider === "slack" || selectedProvider.startsWith("google") || selectedProvider === "gmail") {
      connectMutation.mutate({
        integrationKey: selectedProvider,
        name: connectionName || `${selectedProvider.toUpperCase()} Connection`,
        isDevConnect: true,
      });
    } else {
      connectMutation.mutate({
        integrationKey: selectedProvider,
        name: connectionName || `${selectedProvider.toUpperCase()} API Key`,
        credentials: {
          apiKey: apiKey || "secret_token",
        },
      });
    }
  };

  return (
    <AppShell
      title="Connected Accounts"
      description="Manage OAuth 2.0 service authorizations, tokens, and API credentials for your workspace."
      action={
        <button
          onClick={() => setConnectModalOpen(true)}
          data-testid="add-connection-btn"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>New Connection</span>
        </button>
      }
    >
      {/* Informational Banner */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-slate-900">AES-256-GCM Encrypted Credential Vault</h4>
            <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
              Tokens and secrets are encrypted at rest with authenticated AES-256-GCM. Real credentials are never sent back to the browser, and automatic background refresh is performed prior to expiration.
            </p>
          </div>
        </div>
      </div>

      {statusNotice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{statusNotice}</span>
          </div>
          <button onClick={() => setStatusNotice(null)} className="text-emerald-600 hover:text-emerald-800">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800">
            ✕
          </button>
        </div>
      )}

      {/* Quick OAuth Connect Cards */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: "slack", label: "Slack", desc: "Channels & Bot messages", icon: MessageSquare, color: "text-pink-600", bg: "bg-pink-50" },
          { key: "google-sheets", label: "Google Sheets", desc: "Spreadsheet rows & data", icon: FileSpreadsheet, color: "text-emerald-600", bg: "bg-emerald-50" },
          { key: "gmail", label: "Gmail", desc: "Send automated emails", icon: Inbox, color: "text-rose-600", bg: "bg-rose-50" },
          { key: "google-drive", label: "Google Drive", desc: "Files and metadata", icon: HardDrive, color: "text-blue-600", bg: "bg-blue-50" },
        ].map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.key}
              className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${p.bg} ${p.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-900 truncate">{p.label}</h4>
                  <p className="text-[10px] text-slate-500 truncate">{p.desc}</p>
                </div>
              </div>
              <button
                onClick={() => handleStartOAuth(p.key)}
                data-testid={`connect-${p.key}-btn`}
                className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
              >
                Connect
              </button>
            </div>
          );
        })}
      </div>

      {/* Connections List / Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading connections...</div>
        ) : connections.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <LinkIcon className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">No external accounts connected</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Connect your Slack workspace or Google account using OAuth 2.0 to empower your automation workflows with real actions.
            </p>
            <div className="mt-5">
              <button
                onClick={() => setConnectModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                <span>Add First Connection</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-6">Provider</th>
                  <th className="py-3 px-6">Account Name</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Granted Scopes</th>
                  <th className="py-3 px-6">Last Verified</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {connections.map((conn: any) => {
                  const colors = PROVIDER_COLORS[conn.integrationKey] || {
                    bg: "bg-slate-100",
                    text: "text-slate-700",
                    border: "border-slate-200",
                  };
                  const Icon = PROVIDER_ICONS[conn.integrationKey] || LinkIcon;

                  return (
                    <tr key={conn.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-6">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold border",
                            colors.bg,
                            colors.text,
                            colors.border
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          <span>{conn.integrationKey.toUpperCase()}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-6 font-bold text-slate-900">{conn.name}</td>
                      <td className="py-3.5 px-6">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                            conn.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                              : conn.status === "EXPIRED"
                              ? "bg-amber-50 text-amber-700 border-amber-200/60"
                              : "bg-rose-50 text-rose-700 border-rose-200/60"
                          )}
                        >
                          {conn.status === "ACTIVE" ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-amber-600" />
                          )}
                          <span>{conn.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-6">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(conn.scopes || []).slice(0, 3).map((s: string) => (
                            <span
                              key={s}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-mono text-slate-600 truncate max-w-[120px]"
                            >
                              {s.replace("https://www.googleapis.com/auth/", "")}
                            </span>
                          ))}
                          {(conn.scopes?.length || 0) > 3 && (
                            <span className="text-[9px] text-slate-400">+{conn.scopes.length - 3} more</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-slate-500">
                        {conn.lastVerifiedAt ? formatRelativeTime(conn.lastVerifiedAt) : "Just now"}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => refreshMutation.mutate(conn.id)}
                            disabled={refreshMutation.isPending}
                            className="rounded p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                            title="Verify and refresh token"
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => disconnectMutation.mutate(conn.id)}
                            disabled={disconnectMutation.isPending}
                            className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Disconnect Account"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Connection Modal */}
      {connectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Connect External Service</h3>
              </div>
              <button
                onClick={() => setConnectModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConnectSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">Integration Provider</label>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium"
                >
                  <option value="slack">Slack (OAuth 2.0)</option>
                  <option value="google-sheets">Google Sheets (OAuth 2.0)</option>
                  <option value="gmail">Gmail (OAuth 2.0)</option>
                  <option value="google-drive">Google Drive (OAuth 2.0)</option>
                  <option value="http-request">Custom API Key / Bearer Token</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Account Display Name</label>
                <input
                  type="text"
                  required
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  placeholder="e.g. Acme Corp Slack / Marketing Google"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              {selectedProvider === "http-request" && (
                <div>
                  <label className="block font-semibold text-slate-700">API Key or Bearer Token</label>
                  <input
                    type="password"
                    required
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk_live_..."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              )}

              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-[11px] text-indigo-900">
                <p className="font-semibold">OAuth Security:</p>
                <p className="mt-0.5 text-indigo-700">
                  Authorizations are encrypted using AES-256-GCM. In development or test environments, click Connect to complete an authenticated mock authorization.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConnectModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connectMutation.isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-70"
                >
                  {connectMutation.isPending ? "Connecting..." : "Authorize & Connect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="flex h-64 items-center justify-center">
            <div className="text-sm text-slate-500">Loading connected accounts...</div>
          </div>
        </AppShell>
      }
    >
      <ConnectionsContent />
    </Suspense>
  );
}
