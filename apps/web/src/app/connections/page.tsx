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
  Shield,
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
      setStatusNotice("Connection revoked successfully.");
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to disconnect account.");
    },
  });

  // Test / refresh connection mutation
  const testMutation = useMutation({
    mutationFn: (id: string) => api.connections.refresh(id),
    onSuccess: (res: any) => {
      setStatusNotice(`Connection verified healthy! Response: ${res.message || "OK"}`);
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err: any) => {
      setError(err?.message || "Health test failed.");
    },
  });

  const handleStartOAuth = async (providerKey: string) => {
    setError(null);
    try {
      // In development or when external credentials are not set, use dev-connect
      const authRes = await api.oauth.getAuthorizationUrl(providerKey).catch(() => null);
      if (authRes?.authorizationUrl && !authRes.authorizationUrl.includes("mock_")) {
        window.location.href = authRes.authorizationUrl;
      } else {
        // Fallback to simulated connect
        connectMutation.mutate({
          integrationKey: providerKey,
          name: `${providerKey.toUpperCase()} Workspace Account`,
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
          className="inline-flex items-center gap-2 rounded-xl bg-[#6558E8] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#5345D8] transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Connection</span>
        </button>
      }
    >
      {/* Informational Banner */}
      <div className="mb-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-[#6558E8] shrink-0 mt-0.5 shadow-2xs">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">AES-256-GCM Encrypted Credential Vault</h4>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Tokens and secrets are encrypted at rest with authenticated AES-256-GCM. Real credentials are never sent back to the browser, and automatic background refresh is performed prior to expiration.
            </p>
          </div>
        </div>
      </div>

      {statusNotice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{statusNotice}</span>
          </div>
          <button onClick={() => setStatusNotice(null)} className="text-emerald-600 hover:text-emerald-800 font-bold">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800 font-bold">
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
              className="flex items-center justify-between rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-card hover:border-[#6558E8]/40 hover:shadow-card-hover transition-all duration-150"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${p.bg} ${p.color} shadow-2xs`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-900 truncate">{p.label}</h4>
                  <p className="text-[10px] text-slate-400 truncate">{p.desc}</p>
                </div>
              </div>
              <button
                onClick={() => handleStartOAuth(p.key)}
                data-testid={`connect-${p.key}-btn`}
                className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-indigo-50 hover:text-[#6558E8] hover:border-indigo-200 transition-colors cursor-pointer"
              >
                Connect
              </button>
            </div>
          );
        })}
      </div>

      {/* Connections List / Table */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading connections...</div>
        ) : connections.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 text-[#6558E8] mb-3 shadow-2xs">
              <LinkIcon className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">No external accounts connected</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Connect your Slack workspace or Google account using OAuth 2.0 to empower your automation workflows with real actions.
            </p>
            <div className="mt-5">
              <button
                onClick={() => setConnectModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#6558E8] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#5345D8] transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Add First Connection</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100 text-[11px]">
                <tr>
                  <th className="py-3 px-6">Connection Name</th>
                  <th className="py-3 px-6">Provider</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Scopes / Type</th>
                  <th className="py-3 px-6">Updated</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {connections.map((c: any) => {
                  const Icon = PROVIDER_ICONS[c.integrationKey] || LinkIcon;
                  const colors = PROVIDER_COLORS[c.integrationKey] || {
                    bg: "bg-slate-100",
                    text: "text-slate-700",
                    border: "border-slate-200",
                  };

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-xl border shadow-2xs",
                              colors.bg,
                              colors.text,
                              colors.border
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900">{c.name}</span>
                            {c.metadata?.teamName && (
                              <p className="text-[10px] text-slate-400">Team: {c.metadata.teamName}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-6">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-700">
                          {c.integrationKey.toUpperCase()}
                        </span>
                      </td>

                      <td className="py-3.5 px-6">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border",
                            c.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                              : "bg-rose-50 text-rose-700 border-rose-200/60"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              c.status === "ACTIVE" ? "bg-emerald-500" : "bg-rose-500"
                            )}
                          />
                          {c.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-6">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {c.metadata?.scopes?.length > 0 ? (
                            c.metadata.scopes.slice(0, 3).map((s: string) => (
                              <span
                                key={s}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-mono text-slate-600"
                              >
                                {s}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[11px]">OAuth 2.0 Token</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-6 text-slate-400">{formatRelativeTime(c.updatedAt)}</td>

                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => testMutation.mutate(c.id)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#6558E8] transition-colors"
                            title="Test Connection"
                          >
                            <RotateCw className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => disconnectMutation.mutate(c.id)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            title="Disconnect Account"
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Manual Connection Modal */}
      {connectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Add Connected Account</h3>
              <button
                onClick={() => setConnectModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConnectSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Provider Service</label>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs focus:bg-white focus:border-[#6558E8] focus:outline-none"
                >
                  <option value="slack">Slack (OAuth 2.0)</option>
                  <option value="google-sheets">Google Sheets (OAuth 2.0)</option>
                  <option value="gmail">Gmail (OAuth 2.0)</option>
                  <option value="google-drive">Google Drive (OAuth 2.0)</option>
                  <option value="http-request">Custom API Key</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Connection Label</label>
                <input
                  type="text"
                  required
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  placeholder="e.g. Production Slack Bot"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs focus:bg-white focus:border-[#6558E8] focus:outline-none"
                />
              </div>

              {selectedProvider === "http-request" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">API Secret Key</label>
                  <input
                    type="password"
                    required
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs focus:bg-white focus:border-[#6558E8] focus:outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConnectModalOpen(false)}
                  className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connectMutation.isPending}
                  className="rounded-xl bg-[#6558E8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5345D8] transition-colors shadow-2xs"
                >
                  {connectMutation.isPending ? "Connecting..." : "Authorize & Save"}
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
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-400">Loading connections...</div>}>
      <ConnectionsContent />
    </Suspense>
  );
}
