"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Key,
  Plus,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { API_KEY_SCOPES } from "@flowforge/shared";

export function ApiKeysTab() {
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "workflows:read",
    "workflows:write",
    "executions:read",
    "executions:run",
  ]);
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(30);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.apiKeys.list(),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; scopes: string[]; expiresInDays?: number }) =>
      api.apiKeys.create(body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setCreatedSecret(data.secret);
      setKeyName("");
      setShowCreateModal(false);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to create API key");
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) => api.apiKeys.rotate(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setCreatedSecret(data.secret);
      setSuccessMessage("API key rotated. Save the new secret token.");
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to rotate API key");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.apiKeys.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setSuccessMessage("API key revoked immediately.");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to revoke API key");
    },
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const toggleScope = (scope: string) => {
    if (selectedScopes.includes(scope)) {
      setSelectedScopes(selectedScopes.filter((s) => s !== scope));
    } else {
      setSelectedScopes([...selectedScopes, scope]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Key className="h-5 w-5 text-indigo-600" />
              <span>Workspace API Keys</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Create and manage programmatic API keys to trigger workflows, inspect executions, and integrate FlowForge with your internal developer systems.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="http://localhost:4000/api/v1/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition"
            >
              <span>OpenAPI Docs</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </a>

            <button
              onClick={() => {
                setActionError(null);
                setShowCreateModal(true);
              }}
              data-testid="create-api-key-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>Create API Key</span>
            </button>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Secret One-Time Display Modal */}
      {createdSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-emerald-700 mb-3">
              <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">API Key Created Successfully</h3>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Please copy your API secret now. <strong>For your security, it will never be displayed again.</strong>
            </p>

            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 mb-5 font-mono text-xs text-slate-800 break-all select-all">
              <span className="flex-1 font-semibold" data-testid="new-api-key-secret">{createdSecret}</span>
              <button
                onClick={() => handleCopy(createdSecret)}
                data-testid="copy-api-key-secret-btn"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-sans font-semibold transition"
              >
                {copiedSecret ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
                <span>{copiedSecret ? "Copied" : "Copy"}</span>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setCreatedSecret(null)}
                data-testid="close-secret-modal-btn"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
              >
                I Have Stored It Safely
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Active & Revoked Keys</h4>
          <span className="text-xs text-slate-400 font-medium">{keys.length} keys total</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading API keys...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center">
            <Key className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">No API keys created yet</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Generate an API key to access FlowForge programmatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Name & Token Prefix</th>
                  <th className="py-3 px-4">Scopes</th>
                  <th className="py-3 px-4">Last Used</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.map((k: any) => {
                  const isRevoked = Boolean(k.revokedAt);
                  const isExpired = k.expiresAt && new Date(k.expiresAt) < new Date();

                  return (
                    <tr key={k.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{k.name}</div>
                        <div className="font-mono text-[11px] text-slate-400 mt-0.5">{k.keyPrefix}••••••••••••</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {k.scopes.map((sc: string) => (
                            <span key={sc} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                              {sc}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                      </td>
                      <td className="py-3.5 px-4">
                        {isRevoked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                            Revoked
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {!isRevoked && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                if (confirm(`Rotate API key '${k.name}'? Old key will be revoked immediately.`)) {
                                  rotateMutation.mutate(k.id);
                                }
                              }}
                              disabled={rotateMutation.isPending}
                              title="Rotate Key"
                              className="p-1.5 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                if (confirm(`Revoke API key '${k.name}'? Applications using it will lose access.`)) {
                                  revokeMutation.mutate(k.id);
                                }
                              }}
                              disabled={revokeMutation.isPending}
                              title="Revoke Key"
                              className="p-1.5 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900 mb-2">Create Workspace API Key</h3>
            <p className="text-xs text-slate-500 mb-4">
              Select permissions and an expiration timeline for this API key.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  name: keyName,
                  scopes: selectedScopes,
                  expiresInDays,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Key Name</label>
                <input
                  type="text"
                  required
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. CI/CD Deployment Runner"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Expiration</label>
                <select
                  value={expiresInDays || ""}
                  onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                  <option value="">Never (No Expiry)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Permitted Scopes</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-lg border border-slate-200 bg-slate-50/50 text-xs">
                  {API_KEY_SCOPES.map((sc) => (
                    <label key={sc} className="flex items-center gap-2 text-slate-700 hover:text-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(sc)}
                        onChange={() => toggleScope(sc)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-mono text-[11px]">{sc}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !keyName.trim() || selectedScopes.length === 0}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs"
                >
                  {createMutation.isPending ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
