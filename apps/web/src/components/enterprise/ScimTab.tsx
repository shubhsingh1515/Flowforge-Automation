"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Users,
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Info,
} from "lucide-react";

export function ScimTab() {
  const queryClient = useQueryClient();

  const [tokenName, setTokenName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // List SCIM tokens
  const { data: tokensData, isLoading } = useQuery({
    queryKey: ["scim-tokens"],
    queryFn: () => api.scim.listTokens(),
  });

  // Create token mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; expiresInDays: number }) =>
      api.scim.createToken(data),
    onSuccess: (res) => {
      setCreatedToken(res.token);
      setTokenName("");
      queryClient.invalidateQueries({ queryKey: ["scim-tokens"] });
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to create SCIM provisioning token");
    },
  });

  // Revoke token mutation
  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.scim.revokeToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scim-tokens"] });
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to revoke SCIM token");
    },
  });

  const scimBaseUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/scim/v2`
    : "/api/v1/scim/v2";

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(scimBaseUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyToken = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="scim-settings-tab">
      {/* Header */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">
                SCIM 2.0 Automated User Provisioning
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Automatically synchronize user accounts, team members, and deactivations from your Identity Provider (Okta, Microsoft Entra ID, PingFederate, or OneLogin) using RFC 7644 SCIM 2.0 standard protocol.
            </p>
          </div>

          <button
            onClick={() => {
              setShowCreateModal(true);
              setCreatedToken(null);
              setActionError(null);
            }}
            data-testid="btn-create-scim-token"
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Generate Provisioning Token</span>
          </button>
        </div>

        {/* SCIM Base URL */}
        <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">SCIM 2.0 Base URL:</span>
            <button
              onClick={handleCopyUrl}
              className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium"
            >
              {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedUrl ? "Copied" : "Copy URL"}</span>
            </button>
          </div>
          <code className="block bg-white p-2 rounded border border-slate-200 font-mono text-[11px] text-slate-800 break-all select-all">
            {scimBaseUrl}
          </code>
          <p className="text-[11px] text-slate-500">
            Paste this URL into your IdP’s SCIM configuration settings as the SCIM connector base address.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Tokens List */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Active SCIM Provisioning Bearer Tokens
          </h4>
          <span className="text-xs text-slate-500">
            {tokensData?.tokens?.length || 0} tokens active
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-400" />
            Loading SCIM tokens...
          </div>
        ) : tokensData?.tokens && tokensData.tokens.length > 0 ? (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                <th className="py-2.5 px-5">Token Name</th>
                <th className="py-2.5 px-4">Prefix</th>
                <th className="py-2.5 px-4">Created</th>
                <th className="py-2.5 px-4">Expires</th>
                <th className="py-2.5 px-4">Last Used</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tokensData.tokens.map((tok: any) => (
                <tr key={tok.id} className="hover:bg-slate-50/50 transition">
                  <td className="py-3 px-5 font-semibold text-slate-800">{tok.name}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{tok.tokenPrefix}••••</td>
                  <td className="py-3 px-4 text-slate-500 text-[11px]">
                    {new Date(tok.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-[11px]">
                    {tok.expiresAt ? new Date(tok.expiresAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-[11px]">
                    {tok.lastUsedAt ? new Date(tok.lastUsedAt).toLocaleString() : "Never"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Revoke SCIM token "${tok.name}"? Provisioning requests with this token will fail immediately.`)) {
                          revokeMutation.mutate(tok.id);
                        }
                      }}
                      disabled={revokeMutation.isPending}
                      className="text-rose-600 hover:text-rose-800 text-xs font-semibold"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">
            No SCIM provisioning tokens generated yet. Click "Generate Provisioning Token" above to connect your IdP.
          </div>
        )}
      </div>

      {/* SCIM 2.0 Supported Endpoints Reference */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-3 text-xs">
        <h4 className="font-bold text-slate-800 text-sm">Supported SCIM 2.0 Protocols & Endpoints</h4>
        <p className="text-slate-500">
          FlowForge implements standard RFC 7643 / RFC 7644 SCIM 2.0 endpoints scoped directly to your workspace:
        </p>

        <div className="border border-slate-100 rounded-lg overflow-hidden divide-y divide-slate-100 font-mono text-[11px]">
          <div className="p-2.5 bg-slate-50/50 flex items-center justify-between">
            <span className="font-bold text-indigo-700">GET /api/v1/scim/v2/Users</span>
            <span className="text-slate-500 font-sans">Query and filter workspace users (filter, startIndex, count)</span>
          </div>
          <div className="p-2.5 flex items-center justify-between">
            <span className="font-bold text-emerald-700">POST /api/v1/scim/v2/Users</span>
            <span className="text-slate-500 font-sans">Provision a new user and add to workspace as MEMBER</span>
          </div>
          <div className="p-2.5 bg-slate-50/50 flex items-center justify-between">
            <span className="font-bold text-indigo-700">GET /api/v1/scim/v2/Users/:id</span>
            <span className="text-slate-500 font-sans">Retrieve SCIM 2.0 User representation by user ID</span>
          </div>
          <div className="p-2.5 flex items-center justify-between">
            <span className="font-bold text-amber-700">PUT /api/v1/scim/v2/Users/:id</span>
            <span className="text-slate-500 font-sans">Replace and update user profile attributes</span>
          </div>
          <div className="p-2.5 bg-slate-50/50 flex items-center justify-between">
            <span className="font-bold text-purple-700">PATCH /api/v1/scim/v2/Users/:id</span>
            <span className="text-slate-500 font-sans">Modify user (e.g. deactivate: <code>active = false</code>)</span>
          </div>
          <div className="p-2.5 flex items-center justify-between">
            <span className="font-bold text-rose-700">DELETE /api/v1/scim/v2/Users/:id</span>
            <span className="text-slate-500 font-sans">Deprovision member and immediately revoke all active sessions</span>
          </div>
        </div>
      </div>

      {/* Create Token Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Generate SCIM 2.0 Provisioning Token
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Create a dedicated high-entropy bearer token for your Okta or Azure AD SCIM integration.
            </p>

            {createdToken ? (
              <div className="space-y-4">
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Copy Your Bearer Token Immediately</span>
                  </div>
                  <p className="text-amber-800 text-[11px]">
                    This token is only shown once and cannot be recovered. Store it securely in your IdP SCIM credential settings.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdToken}
                      data-testid="input-new-scim-token"
                      className="w-full bg-white border border-amber-300 font-mono text-[11px] p-2 rounded select-all"
                    />
                    <button
                      onClick={handleCopyToken}
                      data-testid="btn-copy-scim-token"
                      className="px-3 py-2 bg-amber-600 text-white rounded text-xs font-semibold hover:bg-amber-700 shrink-0 flex items-center gap-1"
                    >
                      {copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedToken ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreatedToken(null);
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate({ name: tokenName, expiresInDays });
                }}
                className="space-y-4 text-xs"
              >
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Token Description / IdP Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Okta Production SCIM Connector"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    data-testid="input-scim-token-name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Token Expiration</label>
                  <select
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
                  >
                    <option value={30}>30 Days</option>
                    <option value={90}>90 Days (Recommended)</option>
                    <option value={180}>180 Days</option>
                    <option value={365}>365 Days (1 Year)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || !tokenName}
                    data-testid="btn-confirm-create-scim-token"
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {createMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <span>Generate Token</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
