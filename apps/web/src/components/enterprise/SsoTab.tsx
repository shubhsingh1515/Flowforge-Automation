"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Lock,
  Globe,
  Info,
} from "lucide-react";

export function SsoTab() {
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [userinfoUrl, setUserinfoUrl] = useState("");
  const [enforceSso, setEnforceSso] = useState(false);

  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    endpoints?: any;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Fetch current SSO config
  const { data: configData, isLoading } = useQuery({
    queryKey: ["sso-config"],
    queryFn: () => api.sso.getConfig(),
  });

  useEffect(() => {
    if (configData?.provider) {
      const p = configData.provider;
      setEnabled(p.enabled || false);
      setIssuerUrl(p.issuerUrl || "");
      setClientId(p.clientId || "");
      setAuthorizationUrl(p.authorizationUrl || "");
      setTokenUrl(p.tokenUrl || "");
      setUserinfoUrl(p.userinfoUrl || "");
      setEnforceSso(p.enforceSso || false);
    }
  }, [configData]);

  // Test mutation
  const testMutation = useMutation({
    mutationFn: (data: any) => api.sso.test(data),
    onSuccess: (res) => {
      setTestResult(res);
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setTestResult({
        success: false,
        message: err.message || "Failed to reach OIDC IdP endpoints",
      });
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: any) => api.sso.saveConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-config"] });
      setSaveSuccess("Single Sign-On configuration saved successfully!");
      setErrorMsg(null);
      setTimeout(() => setSaveSuccess(null), 3500);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to save SSO configuration");
    },
  });

  const handleTest = () => {
    setErrorMsg(null);
    testMutation.mutate({
      issuerUrl,
      clientId,
      clientSecret: clientSecret || undefined,
      authorizationUrl: authorizationUrl || undefined,
      tokenUrl: tokenUrl || undefined,
      userinfoUrl: userinfoUrl || undefined,
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    saveMutation.mutate({
      enabled,
      issuerUrl,
      clientId,
      clientSecret: clientSecret || undefined,
      authorizationUrl: authorizationUrl || undefined,
      tokenUrl: tokenUrl || undefined,
      userinfoUrl: userinfoUrl || undefined,
      enforceSso,
    });
  };

  const ssoInitiateUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/sso/initiate`
    : "/api/v1/sso/initiate";

  const copyInitiateUrl = () => {
    navigator.clipboard.writeText(ssoInitiateUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-slate-400">
        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-400" />
        Loading Enterprise SSO settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl" data-testid="sso-settings-tab">
      {/* Header */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">
                Single Sign-On (OIDC / OAuth 2.0)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Authenticate workspace members through your enterprise identity provider (Okta, Microsoft Entra ID / Azure AD, Google Workspace, Keycloak, or Auth0).
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
              enabled
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {enabled ? "Active" : "Disabled"}
          </span>
        </div>

        {/* SSO Initiate Callback Info Box */}
        <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">OIDC Redirect / Callback URI:</span>
            <button
              onClick={copyInitiateUrl}
              className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium"
            >
              {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedUrl ? "Copied" : "Copy URI"}</span>
            </button>
          </div>
          <code className="block bg-white p-2 rounded border border-slate-200 font-mono text-[11px] text-slate-800 break-all select-all">
            {typeof window !== "undefined" ? `${window.location.origin}/api/v1/sso/callback` : "/api/v1/sso/callback"}
          </code>
          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            Add this callback URI to your Identity Provider’s client app configuration.
          </p>
        </div>
      </div>

      {saveSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Configuration Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-5 text-xs">
          <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-slate-500" />
            IdP OpenID Connect Configuration
          </h4>

          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <div>
              <p className="font-semibold text-slate-800">Enable Single Sign-On for Workspace</p>
              <p className="text-[11px] text-slate-500">
                Allow members to sign in using your enterprise identity provider.
              </p>
            </div>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              data-testid="toggle-sso-enabled"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          {/* Issuer URL */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              IdP Issuer URL (OpenID Connect Discovery) *
            </label>
            <input
              type="url"
              required
              placeholder="https://identity.example.com or https://dev-1234.okta.com"
              value={issuerUrl}
              onChange={(e) => setIssuerUrl(e.target.value)}
              data-testid="input-sso-issuer"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-indigo-600 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              FlowForge discovers authorization, token, and userinfo endpoints via <code>/.well-known/openid-configuration</code>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client ID */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Client ID *</label>
              <input
                type="text"
                required
                placeholder="0oa8abcdef1234567"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                data-testid="input-sso-client-id"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-indigo-600 focus:outline-none"
              />
            </div>

            {/* Client Secret */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Client Secret {configData?.provider?.hasClientSecret && "(Stored & Encrypted)"}
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder={configData?.provider?.hasClientSecret ? "•••••••••••••••• (Leave blank to keep existing)" : "Enter IdP client secret"}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  data-testid="input-sso-client-secret"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-indigo-600 focus:outline-none"
                />
                <Lock className="h-3.5 w-3.5 text-slate-400 absolute right-3 top-2.5" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                AES-256-GCM encrypted in database. Never returned in plaintext.
              </p>
            </div>
          </div>

          {/* Optional Explicit Endpoints */}
          <details className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <summary className="font-semibold text-slate-600 cursor-pointer text-xs select-none">
              Manual Endpoint Overrides (Optional / Non-standard OIDC)
            </summary>
            <div className="space-y-3 pt-3">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Authorization Endpoint</label>
                <input
                  type="url"
                  placeholder="https://identity.example.com/oauth2/v1/authorize"
                  value={authorizationUrl}
                  onChange={(e) => setAuthorizationUrl(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2.5 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Token Endpoint</label>
                <input
                  type="url"
                  placeholder="https://identity.example.com/oauth2/v1/token"
                  value={tokenUrl}
                  onChange={(e) => setTokenUrl(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2.5 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">UserInfo Endpoint</label>
                <input
                  type="url"
                  placeholder="https://identity.example.com/oauth2/v1/userinfo"
                  value={userinfoUrl}
                  onChange={(e) => setUserinfoUrl(e.target.value)}
                  className="w-full rounded border border-slate-200 px-2.5 py-1.5 font-mono text-xs"
                />
              </div>
            </div>
          </details>

          {/* Enforce SSO Toggle & Warning */}
          <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/50 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-amber-900">Enforce SSO For All Members</span>
                <p className="text-[11px] text-amber-700">
                  Non-owner members will be blocked from password login and forced to authenticate via OIDC SSO.
                </p>
              </div>
              <input
                type="checkbox"
                checked={enforceSso}
                onChange={(e) => setEnforceSso(e.target.checked)}
                data-testid="toggle-enforce-sso"
                className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
            </div>
            <p className="text-[10px] text-amber-800/80 border-t border-amber-200/60 pt-2">
              <strong>Emergency Break-Glass Notice:</strong> The workspace owner always retains password authentication fallback to prevent accidental lockout in the event of an IdP outage.
            </p>
          </div>
        </div>

        {/* Test Connection Results */}
        {testResult && (
          <div
            className={`p-4 rounded-xl border text-xs ${
              testResult.success
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                : "bg-rose-50/70 border-rose-200 text-rose-900"
            }`}
          >
            <div className="flex items-center gap-2 font-bold mb-1">
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-600" />
              )}
              <span>{testResult.message}</span>
            </div>
            {testResult.endpoints && (
              <div className="mt-2 text-[11px] font-mono space-y-1 bg-white/60 p-2 rounded">
                <div>Auth: {testResult.endpoints.authorizationEndpoint || "discovering..."}</div>
                <div>Token: {testResult.endpoints.tokenEndpoint || "discovering..."}</div>
                <div>UserInfo: {testResult.endpoints.userinfoEndpoint || "discovering..."}</div>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testMutation.isPending || !issuerUrl || !clientId}
            data-testid="btn-test-sso-connection"
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {testMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            <span>Test IdP Connection</span>
          </button>

          <button
            type="submit"
            disabled={saveMutation.isPending}
            data-testid="btn-save-sso-config"
            className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            {saveMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            <span>Save SSO Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
}
