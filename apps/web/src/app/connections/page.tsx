"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";

export default function ConnectionsPage() {
  const queryClient = useQueryClient();
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectionName, setConnectionName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("http-request");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.connections.list(),
  });

  const connections = data?.data || [];

  const connectMutation = useMutation({
    mutationFn: (newConn: any) => api.connections.connect(newConn),
    onSuccess: () => {
      setConnectModalOpen(false);
      setConnectionName("");
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to establish connection.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.connections.disconnect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  const handleConnectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    connectMutation.mutate({
      integrationKey: selectedProvider,
      name: connectionName || `${selectedProvider.toUpperCase()} Connection`,
      credentials: {
        apiKey: apiKey || "secret_demo_redacted",
      },
    });
  };

  return (
    <AppShell
      title="Connected Accounts"
      description="Manage API credentials and third-party service authorizations for your workspace."
      action={
        <button
          onClick={() => setConnectModalOpen(true)}
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
            <h4 className="text-xs font-bold text-slate-900">Encrypted Credential Storage</h4>
            <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
              API tokens and authorization secrets are securely persisted with tenant isolation. Real credentials are never sent back to the browser.
            </p>
          </div>
        </div>
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
              Built-in primitives (Webhook, Schedule) execute natively without credentials. Add an API key connection when your HTTP workflows require authentication.
            </p>
            <div className="mt-5">
              <button
                onClick={() => setConnectModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                <span>Add Connection</span>
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
                  <th className="py-3 px-6">Last Verified</th>
                  <th className="py-3 px-6">Created</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {connections.map((conn: any) => (
                  <tr key={conn.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-6 font-bold text-slate-900 uppercase">
                      {conn.integrationKey}
                    </td>
                    <td className="py-3.5 px-6 text-slate-700">{conn.name}</td>
                    <td className="py-3.5 px-6">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50 px-2 py-0.5 text-[10px] font-semibold">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Active</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-slate-500">
                      {conn.lastVerifiedAt ? formatRelativeTime(conn.lastVerifiedAt) : "Just now"}
                    </td>
                    <td className="py-3.5 px-6 text-slate-500">
                      {formatRelativeTime(conn.createdAt)}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        onClick={() => disconnectMutation.mutate(conn.id)}
                        className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Disconnect Account"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
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
                <h3 className="text-sm font-bold text-slate-900">Add Service Connection</h3>
              </div>
              <button
                onClick={() => setConnectModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                {error}
              </div>
            )}

            <form onSubmit={handleConnectSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">Integration Provider</label>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="http-request">HTTP / Custom REST API</option>
                  <option value="webhook">Webhook Endpoint HMAC Key</option>
                  <option value="slack">Slack (OAuth2 - Phase 2 Setup)</option>
                  <option value="email">SMTP / Resend API Token</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Connection Display Name</label>
                <input
                  type="text"
                  required
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  placeholder="e.g. Production Billing API"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">
                  {selectedProvider === "slack"
                    ? "OAuth Client Secret (Phase 2 Requirement)"
                    : "API Key or Bearer Token"}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste authorization token or key..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-[11px] text-indigo-900">
                <p className="font-semibold">Phase 1 Security Notice:</p>
                <p className="mt-0.5 text-indigo-700">
                  External credentials will be stored safely and validated against the backend. OAuth redirect flows are scheduled for Phase 2.
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
                  {connectMutation.isPending ? "Connecting..." : "Save Connection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
