"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Trash2,
  Sliders,
  CheckCircle2,
  Copy,
  Check,
  Terminal,
  Globe,
  Clock,
  MessageSquare,
  FileSpreadsheet,
  Inbox,
  HardDrive,
  Link as LinkIcon,
  Plus,
  Lock,
  ExternalLink,
  AlertCircle,
  Play,
  Filter,
  Sparkles,
  RotateCw,
  Split,
  GitMerge,
  GitBranch,
  ShieldCheck,
  Code,
  Layers,
  ArrowRight,
  Info,
} from "lucide-react";
import { Node } from "@xyflow/react";
import { api } from "../../lib/api";

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  webhookSlug?: string | null;
  workflowId?: string | null;
  onUpdateNode: (nodeId: string, updatedData: any) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeConfigPanel({
  selectedNode,
  webhookSlug,
  workflowId,
  onUpdateNode,
  onDeleteNode,
  onClose,
}: NodeConfigPanelProps) {
  if (!selectedNode) return null;

  const queryClient = useQueryClient();
  const { data } = selectedNode;
  const nodeType = (data.nodeType as string) || "ACTION";
  const integrationKey = data.integrationKey as string | undefined;

  const [label, setLabel] = useState((data.label as string) || "");
  const [description, setDescription] = useState((data.description as string) || "");
  const [config, setConfig] = useState<Record<string, any>>((data.config as any) || {});
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Phase 4 Live Transform Preview State
  const [previewSample, setPreviewSample] = useState(
    JSON.stringify({ trigger: { body: { amount: 150, discount: 20, lead: { name: "Alice Smith", active: true } } } }, null, 2)
  );
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const handleTestTransform = async () => {
    setIsPreviewing(true);
    setPreviewError(null);
    try {
      let sampleData = {};
      try {
        sampleData = JSON.parse(previewSample);
      } catch (e: any) {
        setPreviewError("Sample input must be valid JSON: " + e.message);
        setIsPreviewing(false);
        return;
      }
      const res = await api.workflows.previewTransform(sampleData, config);
      setPreviewResult(res.preview);
    } catch (err: any) {
      setPreviewError(err?.message || "Failed to preview transformation");
    } finally {
      setIsPreviewing(false);
    }
  };

  useEffect(() => {
    setLabel((data.label as string) || "");
    setDescription((data.description as string) || "");
    setConfig((data.config as any) || {});
  }, [selectedNode.id, data]);

  // Query connected accounts for this integration if applicable
  const { data: connectionsData, refetch: refetchConnections } = useQuery({
    queryKey: ["connections", integrationKey],
    queryFn: () => (integrationKey ? api.connections.list({ integrationKey }) : null),
    enabled: Boolean(integrationKey),
  });

  const connections = connectionsData?.data || [];

  const handleSave = (newConfig?: Record<string, any>) => {
    onUpdateNode(selectedNode.id, {
      ...data,
      label,
      description,
      config: newConfig || config,
      isValid: true,
      status: "configured",
    });
  };

  const handleConfigChange = (key: string, value: any) => {
    const updated = { ...config, [key]: value };
    setConfig(updated);
    handleSave(updated);
  };

  // Quick connect simulation / initiation
  const handleQuickConnect = async () => {
    if (!integrationKey) return;
    setIsConnecting(true);
    try {
      // Use dev connect in local environment or request authorization URL
      const res = await api.oauth.devConnect(integrationKey);
      if (res.connection?.id) {
        handleConfigChange("connectedAccountId", res.connection.id);
        await refetchConnections();
      }
    } catch {
      // Try standard oauth authorize endpoint
      try {
        const authRes = await api.oauth.getAuthorizationUrl(integrationKey);
        if (authRes.authorizationUrl) {
          window.open(authRes.authorizationUrl, "_blank");
        }
      } catch (err: any) {
        alert(err?.message || "Failed to initiate OAuth authorization.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const isScheduleTrigger =
    label.toLowerCase().includes("schedule") || Boolean(config.cronExpression);
  const isWebhookTrigger =
    nodeType === "TRIGGER" && !isScheduleTrigger;

  // Webhook URL generator
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:4000/api/v1/webhooks/${webhookSlug || "your_webhook_slug"}`
      : `http://localhost:4000/api/v1/webhooks/${webhookSlug || "your_webhook_slug"}`;

  const curlSnippet = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"event": "lead.created", "email": "alex@example.com", "amount": 250}'`;

  const copyToClipboard = async (text: string, type: "url" | "curl") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "url") {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedCurl(true);
        setTimeout(() => setCopiedCurl(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div className="w-92 border-l border-slate-200 bg-white flex flex-col h-full shadow-lg z-20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-indigo-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Node Configuration
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:text-slate-600"
          title="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Node Type & Integration Badge */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Type
            </span>
            <p className="font-semibold text-slate-800">{nodeType}</p>
          </div>
          {integrationKey && (
            <span className="rounded-full bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">
              {integrationKey}
            </span>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="block font-semibold text-slate-700">Node Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => handleSave()}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block font-semibold text-slate-700">Description</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => handleSave()}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
            placeholder="Explain what this step accomplishes..."
          />
        </div>

        {/* Third-Party Account Connection Selector */}
        {integrationKey && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-indigo-600" />
                <span>Connected Account</span>
              </label>
              <button
                type="button"
                onClick={handleQuickConnect}
                disabled={isConnecting}
                className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                <span>{isConnecting ? "Connecting..." : "+ Add New"}</span>
              </button>
            </div>

            {connections.length === 0 ? (
              <div className="rounded-lg border border-dashed border-indigo-200 bg-white p-3 text-center">
                <p className="text-[11px] text-slate-600 mb-2">
                  No {integrationKey} accounts connected in this workspace yet.
                </p>
                <button
                  type="button"
                  onClick={handleQuickConnect}
                  disabled={isConnecting}
                  data-testid="connect-account-btn"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 transition-colors"
                >
                  <LinkIcon className="h-3 w-3" />
                  <span>Connect {integrationKey.toUpperCase()} (OAuth 2.0)</span>
                </button>
              </div>
            ) : (
              <div>
                <select
                  value={config.connectedAccountId || ""}
                  onChange={(e) => handleConfigChange("connectedAccountId", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                >
                  <option value="">-- Select Authorized Account --</option>
                  {connections.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </select>
                {!config.connectedAccountId && (
                  <p className="mt-1 text-[10px] text-amber-600">
                    Please select an account to authorize this step.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Dynamic Fields by Integration / Node Type */}
        <div className="border-t border-slate-100 pt-3 space-y-3">
          <h4 className="font-bold text-slate-900">Step Parameters</h4>

          {/* SLACK CONFIGURATION */}
          {integrationKey === "slack" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Channel ID or Name</label>
                <input
                  type="text"
                  value={config.channel || "general"}
                  onChange={(e) => handleConfigChange("channel", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                  placeholder="e.g. C01234567 or general"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Target public channel, private group, or conversation ID.
                </p>
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Message Text</label>
                <textarea
                  rows={4}
                  value={config.text || ""}
                  onChange={(e) => handleConfigChange("text", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="🎉 New Customer Lead!\nName: {{trigger.body.name}}\nEmail: {{trigger.body.email}}"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Supports Slack markdown and safe variables: <code>&#123;&#123;trigger.body.field&#125;&#125;</code>
                </p>
              </div>
            </div>
          )}

          {/* GOOGLE SHEETS CONFIGURATION */}
          {integrationKey === "google-sheets" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Spreadsheet ID</label>
                <input
                  type="text"
                  value={config.spreadsheetId || ""}
                  onChange={(e) => handleConfigChange("spreadsheetId", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Found in your Google Spreadsheet URL between <code>/d/</code> and <code>/edit</code>.
                </p>
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Worksheet & Range</label>
                <input
                  type="text"
                  value={config.range || "Sheet1!A:Z"}
                  onChange={(e) => handleConfigChange("range", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="Sheet1!A:Z"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Row Values (JSON Array)</label>
                <textarea
                  rows={3}
                  value={
                    typeof config.values === "object"
                      ? JSON.stringify(config.values)
                      : config.values || ""
                  }
                  onChange={(e) => {
                    try {
                      handleConfigChange("values", JSON.parse(e.target.value));
                    } catch {
                      handleConfigChange("values", e.target.value);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder='["{{trigger.body.name}}", "{{trigger.body.email}}", 250]'
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Values will be appended as cells in the next available sheet row.
                </p>
              </div>
            </div>
          )}

          {/* GMAIL CONFIGURATION */}
          {integrationKey === "gmail" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Recipient Email</label>
                <input
                  type="text"
                  value={config.to || ""}
                  onChange={(e) => handleConfigChange("to", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="alex@example.com or {{trigger.body.email}}"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Subject Line</label>
                <input
                  type="text"
                  value={config.subject || ""}
                  onChange={(e) => handleConfigChange("subject", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                  placeholder="FlowForge Automation Alert"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Message Body</label>
                <textarea
                  rows={4}
                  value={config.body || ""}
                  onChange={(e) => handleConfigChange("body", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="Hi {{trigger.body.name}},\n\nYour execution completed successfully."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="gmail-isHtml"
                  checked={Boolean(config.isHtml)}
                  onChange={(e) => handleConfigChange("isHtml", e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <label htmlFor="gmail-isHtml" className="text-slate-700">
                  Format body as HTML
                </label>
              </div>
            </div>
          )}

          {/* GOOGLE DRIVE CONFIGURATION */}
          {integrationKey === "google-drive" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Operation</label>
                <select
                  value={config.operationId || "list_files"}
                  onChange={(e) => handleConfigChange("operationId", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="list_files">List / Search Files</option>
                  <option value="get_file_metadata">Get File Metadata</option>
                </select>
              </div>

              {config.operationId === "get_file_metadata" ? (
                <div>
                  <label className="block text-slate-600 font-medium">Drive File ID</label>
                  <input
                    type="text"
                    value={config.fileId || ""}
                    onChange={(e) => handleConfigChange("fileId", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                    placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-slate-600 font-medium">Search Query Filter</label>
                    <input
                      type="text"
                      value={config.query || "trashed = false"}
                      onChange={(e) => handleConfigChange("query", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                      placeholder="name contains 'Invoice' and trashed = false"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium">Max Results (1-100)</label>
                    <input
                      type="number"
                      value={config.pageSize || 10}
                      onChange={(e) => handleConfigChange("pageSize", Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                      min={1}
                      max={100}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Webhook Trigger Configuration */}
          {isWebhookTrigger && !integrationKey && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Public Webhook URL</label>
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-mono text-slate-700 select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(webhookUrl, "url")}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                    title="Copy URL"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span className="text-emerald-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                {!webhookSlug && (
                  <p className="mt-1 text-[10px] text-amber-600">
                    Endpoint URL will be finalized once the workflow is saved and activated.
                  </p>
                )}
              </div>

              {/* Curl sample */}
              <div className="rounded-lg border border-slate-200 bg-slate-900 p-3 text-[11px] text-slate-200">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[10px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="h-3 w-3 text-indigo-400" />
                    <span>cURL Request Example</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(curlSnippet, "curl")}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    {copiedCurl ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>{copiedCurl ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="mt-2 overflow-x-auto font-mono text-[10px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {curlSnippet}
                </pre>
              </div>
            </div>
          )}

          {/* Schedule Trigger Configuration */}
          {isScheduleTrigger && !integrationKey && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-indigo-600 font-semibold">
                <Clock className="h-4 w-4" />
                <span>Cron Schedule Settings</span>
              </div>
              <div>
                <label className="block text-slate-600">Cron Expression</label>
                <input
                  type="text"
                  value={config.cronExpression || "*/15 * * * *"}
                  onChange={(e) => handleConfigChange("cronExpression", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="*/15 * * * *"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Format: minute hour day-of-month month day-of-week (e.g. <code>0 * * * *</code> for hourly)
                </p>
              </div>
              <div>
                <label className="block text-slate-600">Timezone</label>
                <select
                  value={config.timezone || "UTC"}
                  onChange={(e) => handleConfigChange("timezone", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="UTC">UTC (Universal)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                </select>
              </div>
            </div>
          )}

          {/* HTTP Request Configuration */}
          {nodeType === "HTTP_REQUEST" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600">Request Method</label>
                <select
                  value={config.method || "POST"}
                  onChange={(e) => handleConfigChange("method", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600">Target Endpoint URL</label>
                <input
                  type="text"
                  value={config.url || ""}
                  onChange={(e) => handleConfigChange("url", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="https://api.example.com/v1/resource"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Supports template tokens: <code>https://api.example.com/users/&#123;&#123;trigger.body.id&#125;&#125;</code>
                </p>
              </div>
              <div>
                <label className="block text-slate-600">Request Body (JSON)</label>
                <textarea
                  rows={3}
                  value={
                    typeof config.body === "object"
                      ? JSON.stringify(config.body, null, 2)
                      : config.body || ""
                  }
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      handleConfigChange("body", parsed);
                    } catch {
                      handleConfigChange("body", e.target.value);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder='{"key": "{{trigger.body.value}}"}'
                />
              </div>
              <div className="rounded-md bg-slate-50 border border-slate-200 p-2 text-[10px] text-slate-600">
                <span className="font-semibold text-slate-800">SSRF Protection:</span> Private LAN addresses (10.x, 192.168.x, 127.x) and cloud metadata services are blocked.
              </div>
            </div>
          )}

          {/* Condition Node Configuration */}
          {nodeType === "CONDITION" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Payload Key / Expression</label>
                <input
                  type="text"
                  value={config.field || "trigger.body.status"}
                  onChange={(e) => handleConfigChange("field", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="trigger.body.status or {{trigger.body.amount}}"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Operator</label>
                <select
                  value={config.operator || "equals"}
                  onChange={(e) => handleConfigChange("operator", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                >
                  <optgroup label="Equality & Numeric">
                    <option value="equals">Equals (==)</option>
                    <option value="not_equals">Does Not Equal (!=)</option>
                    <option value="greater_than">Greater Than (&gt;)</option>
                    <option value="greater_than_or_equal">Greater Than or Equal (&gt;=)</option>
                    <option value="less_than">Less Than (&lt;)</option>
                    <option value="less_than_or_equal">Less Than or Equal (&lt;=)</option>
                  </optgroup>
                  <optgroup label="String & Pattern">
                    <option value="contains">Contains String</option>
                    <option value="not_contains">Does Not Contain</option>
                    <option value="starts_with">Starts With</option>
                    <option value="ends_with">Ends With</option>
                    <option value="matches_regex">Matches Regex (Safe Pattern)</option>
                    <option value="in_list">In Comma-separated List / Array</option>
                    <option value="not_in_list">Not In List</option>
                  </optgroup>
                  <optgroup label="Existence & State">
                    <option value="is_empty">Is Empty (string/array/obj)</option>
                    <option value="is_not_empty">Is Not Empty</option>
                    <option value="exists">Field Exists</option>
                    <option value="not_exists">Field Missing / Undefined</option>
                    <option value="is_true">Is Boolean True</option>
                    <option value="is_false">Is Boolean False</option>
                    <option value="is_null">Is Null / Undefined</option>
                    <option value="is_not_null">Is Not Null</option>
                  </optgroup>
                </select>
              </div>
              {!["is_empty", "is_not_empty", "exists", "not_exists", "is_true", "is_false", "is_null", "is_not_null"].includes(config.operator) && (
                <div>
                  <label className="block text-slate-600 font-medium">Comparison Value</label>
                  <input
                    type="text"
                    value={config.value ?? ""}
                    onChange={(e) => handleConfigChange("value", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                    placeholder="e.g. success, 200, active, or /^[a-z]+$/i"
                  />
                </div>
              )}
              <div className="rounded-lg bg-amber-50/70 border border-amber-200/60 p-2.5 text-[11px] text-amber-800 space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <GitBranch className="h-3.5 w-3.5 text-amber-600" />
                  <span>Dual Output Branching</span>
                </p>
                <p className="text-[10px] text-amber-700">
                  Connect the <span className="font-bold text-emerald-700">True</span> handle for matching conditions, or the <span className="font-bold text-rose-700">False</span> handle for alternative execution paths.
                </p>
              </div>
            </div>
          )}

          {/* Array Filter Node */}
          {nodeType === "FILTER" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Input Array Expression</label>
                <input
                  type="text"
                  value={config.inputArray || "trigger.body.items"}
                  onChange={(e) => handleConfigChange("inputArray", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="{{trigger.body.items}} or trigger.body.items"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Item Field to Test</label>
                <input
                  type="text"
                  value={config.field || "price"}
                  onChange={(e) => handleConfigChange("field", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="price or status or user.active"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Filter Operator</label>
                <select
                  value={config.operator || "greater_than"}
                  onChange={(e) => handleConfigChange("operator", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="equals">Equals (==)</option>
                  <option value="not_equals">Does Not Equal (!=)</option>
                  <option value="greater_than">Greater Than (&gt;)</option>
                  <option value="greater_than_or_equal">Greater Than or Equal (&gt;=)</option>
                  <option value="less_than">Less Than (&lt;)</option>
                  <option value="less_than_or_equal">Less Than or Equal (&lt;=)</option>
                  <option value="contains">Contains String</option>
                  <option value="not_contains">Does Not Contain</option>
                  <option value="is_not_empty">Is Not Empty</option>
                  <option value="is_true">Is True</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Filter Value</label>
                <input
                  type="text"
                  value={config.value ?? "100"}
                  onChange={(e) => handleConfigChange("value", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="e.g. 100, active, true"
                />
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200/60 p-2.5 text-[10px] text-emerald-800">
                <span className="font-semibold block mb-0.5">Filter Output Structure:</span>
                Generates <code className="font-mono bg-emerald-100/60 px-1 py-0.5 rounded">matches</code> and <code className="font-mono bg-emerald-100/60 px-1 py-0.5 rounded">rejected</code> lists along with <code className="font-mono bg-emerald-100/60 px-1 py-0.5 rounded">totalMatched</code>.
              </div>
            </div>
          )}

          {/* Data Transformation Node */}
          {(nodeType === "TRANSFORM" || (nodeType === "ACTION" && !integrationKey)) && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Transformation Template (JSON)</label>
                <textarea
                  rows={4}
                  value={
                    typeof config.template === "object"
                      ? JSON.stringify(config.template, null, 2)
                      : config.template || '{\n  "fullName": "{{trigger.body.lead.name}}",\n  "total": {{trigger.body.amount}},\n  "processedAt": "{{trigger.timestamp}}"\n}'
                  }
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      handleConfigChange("template", parsed);
                    } catch {
                      handleConfigChange("template", e.target.value);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder='{"key": "{{trigger.body.field}}"}'
                />
              </div>

              {/* Live Preview Panel */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-purple-900 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                    <span>Live Transform Preview</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleTestTransform}
                    disabled={isPreviewing}
                    className="inline-flex items-center gap-1 rounded bg-purple-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-2xs"
                  >
                    <Play className="h-2.5 w-2.5" />
                    <span>{isPreviewing ? "Running..." : "Test Transform"}</span>
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600">Sample Input JSON</label>
                  <textarea
                    rows={3}
                    value={previewSample}
                    onChange={(e) => setPreviewSample(e.target.value)}
                    className="mt-0.5 w-full rounded border border-purple-200 bg-white px-2 py-1 text-[10px] font-mono text-slate-800"
                  />
                </div>
                {previewError && (
                  <div className="rounded bg-rose-50 border border-rose-200 p-2 text-[10px] text-rose-700">
                    {previewError}
                  </div>
                )}
                {previewResult !== null && (
                  <div>
                    <label className="block text-[10px] font-semibold text-emerald-800">Preview Output</label>
                    <pre className="mt-0.5 max-h-28 overflow-y-auto rounded border border-emerald-200 bg-emerald-50/50 p-2 text-[10px] font-mono text-emerald-950">
                      {JSON.stringify(previewResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* For Each Loop Node */}
          {nodeType === "LOOP" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Array Expression to Iterate</label>
                <input
                  type="text"
                  value={config.arrayExpression || config.inputArray || "trigger.body.items"}
                  onChange={(e) => {
                    handleConfigChange("arrayExpression", e.target.value);
                    handleConfigChange("inputArray", e.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="{{trigger.body.items}} or trigger.body.items"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Max Iterations (Safety Limit 1-200)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={config.maxIterations || 50}
                  onChange={(e) => handleConfigChange("maxIterations", Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Bounded loop processing prevents infinite execution cycles.
                </p>
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Error Policy</label>
                <select
                  value={config.errorPolicy || "STOP_ON_ERROR"}
                  onChange={(e) => handleConfigChange("errorPolicy", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="STOP_ON_ERROR">Stop on First Error (Fail execution)</option>
                  <option value="CONTINUE_AND_COLLECT">Continue &amp; Collect Errors (Fault-tolerant)</option>
                </select>
              </div>
              <div className="rounded-lg bg-orange-50 border border-orange-200/60 p-2.5 text-[10px] text-orange-800 space-y-1">
                <span className="font-semibold block">Loop Iteration Context:</span>
                Downstream nodes can reference <code className="font-mono bg-orange-100 px-1 py-0.5 rounded">{"{{loop.item}}"}</code>, <code className="font-mono bg-orange-100 px-1 py-0.5 rounded">{"{{loop.index}}"}</code>, and <code className="font-mono bg-orange-100 px-1 py-0.5 rounded">{"{{loop.length}}"}</code>.
              </div>
            </div>
          )}

          {/* Fork Node */}
          {nodeType === "FORK" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-sky-50 border border-sky-200/60 p-3 text-[11px] text-sky-900 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <Split className="h-4 w-4 text-sky-600" />
                  <span>Parallel Execution Fork</span>
                </div>
                <p className="text-[10px] text-sky-700 leading-relaxed">
                  Connect multiple outgoing edges from this node to execute parallel branches concurrently.
                  Combine downstream branches later using a <strong>Join</strong> node.
                </p>
              </div>
            </div>
          )}

          {/* Join Node */}
          {nodeType === "JOIN" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Synchronization Policy</label>
                <select
                  value={config.joinPolicy || "WAIT_ALL"}
                  onChange={(e) => handleConfigChange("joinPolicy", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                >
                  <option value="WAIT_ALL">Wait for All Active Branches (WAIT_ALL)</option>
                  <option value="WAIT_ANY">Proceed on First Completed Branch (WAIT_ANY)</option>
                </select>
              </div>
              <div className="rounded-lg bg-teal-50 border border-teal-200/60 p-2.5 text-[10px] text-teal-800 space-y-1">
                <span className="font-semibold block flex items-center gap-1">
                  <GitMerge className="h-3.5 w-3.5 text-teal-600" />
                  <span>Deadlock-Free Convergence:</span>
                </span>
                <p className="text-[10px] text-teal-700 leading-relaxed">
                  Gathers results from upstream branches into <code className="font-mono bg-teal-100 px-1 py-0.5 rounded">{"{{steps.<id>.output.branches}}"}</code>.
                  Branches conditionally skipped upstream are automatically marked resolved so execution never deadlocks.
                </p>
              </div>
            </div>
          )}

          {/* Approval Node */}
          {nodeType === "APPROVAL" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium">Approval Title</label>
                <input
                  type="text"
                  value={config.title || "Approve Step: {{trigger.body.id}}"}
                  onChange={(e) => handleConfigChange("title", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="Approve Invoice: {{trigger.body.invoiceNumber}}"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium">Description / Context</label>
                <textarea
                  rows={2}
                  value={config.description || "Review and approve workflow progression."}
                  onChange={(e) => handleConfigChange("description", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                  placeholder="e.g. Please verify amount ${{trigger.body.amount}} for {{trigger.body.vendor}}"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-medium">Required Role</label>
                  <select
                    value={config.requiredRole || "MEMBER"}
                    onChange={(e) => handleConfigChange("requiredRole", e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  >
                    <option value="MEMBER">Any Member</option>
                    <option value="ADMIN">Admin Only</option>
                    <option value="OWNER">Owner Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-medium">Timeout (Hours)</label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={config.timeoutHours || 24}
                    onChange={(e) => handleConfigChange("timeoutHours", Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="rounded-lg bg-rose-50 border border-rose-200/60 p-2.5 text-[10px] text-rose-800 space-y-1">
                <span className="font-semibold block flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-rose-600" />
                  <span>Human-in-the-Loop Pause</span>
                </span>
                <p className="text-[10px] text-rose-700 leading-relaxed">
                  Execution pauses in <strong className="font-bold">WAITING_APPROVAL</strong> state, releasing background workers.
                  Connect the <strong className="text-emerald-700">Approved</strong> and <strong className="text-rose-700">Rejected</strong> handles to define post-approval paths.
                </p>
              </div>
            </div>
          )}

          {/* End Terminal Node */}
          {nodeType === "WORKFLOW_END" && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200/60 p-3 text-[11px] text-emerald-800">
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Terminal Node</span>
              </div>
              Signals successful completion and generates execution summary metadata.
            </div>
          )}
        </div>
      </div>

      {/* Delete Node Footer */}
      <div className="p-4 border-t border-slate-100 bg-slate-50">
        <button
          onClick={() => onDeleteNode(selectedNode.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white py-2 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-2xs"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Delete Node</span>
        </button>
      </div>
    </div>
  );
}
