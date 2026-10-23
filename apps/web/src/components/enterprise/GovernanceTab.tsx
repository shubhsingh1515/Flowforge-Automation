"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Save,
  Lock,
  Globe,
  KeyRound,
  FileCheck2,
} from "lucide-react";

export function GovernanceTab() {
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: policy, isLoading } = useQuery({
    queryKey: ["governance-policy"],
    queryFn: () => api.governance.getPolicy(),
  });

  const [allowMarketplacePublishing, setAllowMarketplacePublishing] = useState(false);
  const [allowCommunityTemplates, setAllowCommunityTemplates] = useState(true);
  const [requireHttpsWebhooks, setRequireHttpsWebhooks] = useState(true);
  const [restrictIntegrationsToAdmin, setRestrictIntegrationsToAdmin] = useState(false);
  const [maxApiKeyLifetimeDays, setMaxApiKeyLifetimeDays] = useState<number | null>(365);
  const [hasInitialized, setHasInitialized] = useState(false);

  React.useEffect(() => {
    if (policy && !hasInitialized) {
      setAllowMarketplacePublishing(Boolean(policy.allowMarketplacePublishing));
      setAllowCommunityTemplates(Boolean(policy.allowCommunityTemplates));
      setRequireHttpsWebhooks(Boolean(policy.requireHttpsWebhooks));
      setRestrictIntegrationsToAdmin(Boolean(policy.restrictIntegrationsToAdmin));
      setMaxApiKeyLifetimeDays(policy.maxApiKeyLifetimeDays);
      setHasInitialized(true);
    }
  }, [policy, hasInitialized]);

  const updateMutation = useMutation({
    mutationFn: (body: any) => api.governance.updatePolicy(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governance-policy"] });
      setSuccessMessage("Governance policies updated and recorded in audit log.");
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to update governance policy");
      setSuccessMessage(null);
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      allowMarketplacePublishing,
      allowCommunityTemplates,
      requireHttpsWebhooks,
      restrictIntegrationsToAdmin,
      maxApiKeyLifetimeDays,
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-slate-400 font-medium">Loading governance policies...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-indigo-600" />
              <span>Enterprise Governance & Security Guardrails</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Configure tenant-wide administrative policies governing marketplace publishing, webhook security, and credential lifetimes.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            data-testid="save-governance-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs self-start sm:self-auto"
          >
            <Save className="h-4 w-4" />
            <span>{updateMutation.isPending ? "Saving..." : "Save Policies"}</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Policies Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Marketplace Publishing Policy */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900">Marketplace Publishing</h4>
            </div>
            <input
              type="checkbox"
              checked={allowMarketplacePublishing}
              onChange={(e) => setAllowMarketplacePublishing(e.target.checked)}
              data-testid="policy-allow-publishing"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            When enabled, workspace administrators can submit custom integrations to the FlowForge public marketplace.
          </p>
        </div>

        {/* Require HTTPS Webhooks */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900">Enforce HTTPS on Outbound Webhooks</h4>
            </div>
            <input
              type="checkbox"
              checked={requireHttpsWebhooks}
              onChange={(e) => setRequireHttpsWebhooks(e.target.checked)}
              data-testid="policy-require-https"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Rejects outbound webhook destination URLs using unencrypted HTTP protocols to prevent credential interception.
          </p>
        </div>

        {/* Restrict Custom Integrations to Admin */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900">Restrict Custom Integrations to Admins</h4>
            </div>
            <input
              type="checkbox"
              checked={restrictIntegrationsToAdmin}
              onChange={(e) => setRestrictIntegrationsToAdmin(e.target.checked)}
              data-testid="policy-restrict-integrations"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Only workspace Administrators or Owners can define, test, or publish declarative custom REST connectors.
          </p>
        </div>

        {/* Maximum API Key Lifetime */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-600" />
            <h4 className="text-xs font-bold text-slate-900">Maximum API Key Expiration Lifetime</h4>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Limits the maximum duration an API key can remain active before requiring rotation.
          </p>
          <select
            value={maxApiKeyLifetimeDays || ""}
            onChange={(e) => setMaxApiKeyLifetimeDays(e.target.value ? parseInt(e.target.value, 10) : null)}
            data-testid="policy-max-key-lifetime"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none"
          >
            <option value={30}>30 days (High Security)</option>
            <option value={90}>90 days (Recommended)</option>
            <option value={180}>180 days</option>
            <option value={365}>365 days (1 year max)</option>
            <option value="">No Maximum Lifetime Limit</option>
          </select>
        </div>
      </div>
    </div>
  );
}
