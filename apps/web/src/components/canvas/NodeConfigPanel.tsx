"use client";

import React, { useState, useEffect } from "react";
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
  Code2,
} from "lucide-react";
import { Node } from "@xyflow/react";

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

  const { data } = selectedNode;
  const nodeType = (data.nodeType as string) || "ACTION";

  const [label, setLabel] = useState((data.label as string) || "");
  const [description, setDescription] = useState((data.description as string) || "");
  const [config, setConfig] = useState<Record<string, any>>((data.config as any) || {});
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  useEffect(() => {
    setLabel((data.label as string) || "");
    setDescription((data.description as string) || "");
    setConfig((data.config as any) || {});
  }, [selectedNode.id, data]);

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

  const isScheduleTrigger =
    label.toLowerCase().includes("schedule") || Boolean(config.cronExpression);
  const isWebhookTrigger =
    nodeType === "TRIGGER" && !isScheduleTrigger;

  // Construct Webhook URL
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
    <div className="w-88 border-l border-slate-200 bg-white flex flex-col h-full shadow-lg z-20">
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
        {/* Node Type Badge */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Type
          </span>
          <p className="font-semibold text-slate-800">{nodeType}</p>
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

        {/* Dynamic Fields by Node Type */}
        <div className="border-t border-slate-100 pt-3 space-y-3">
          <h4 className="font-bold text-slate-900">Step Parameters</h4>

          {/* Webhook Trigger Configuration */}
          {isWebhookTrigger && (
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
          {isScheduleTrigger && (
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
                  Supports template tokens, e.g. <code>https://api.example.com/users/&#123;&#123;trigger.body.id&#125;&#125;</code>
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
                <label className="block text-slate-600">Payload Key / Variable</label>
                <input
                  type="text"
                  value={config.field || "trigger.body.status"}
                  onChange={(e) => handleConfigChange("field", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="trigger.body.status"
                />
              </div>
              <div>
                <label className="block text-slate-600">Evaluation Operator</label>
                <select
                  value={config.operator || "equals"}
                  onChange={(e) => handleConfigChange("operator", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="equals">Equals (==)</option>
                  <option value="not_equals">Does Not Equal (!=)</option>
                  <option value="contains">Contains String</option>
                  <option value="not_contains">Does Not Contain</option>
                  <option value="greater_than">Greater Than (&gt;)</option>
                  <option value="less_than">Less Than (&lt;)</option>
                  <option value="is_null">Is Null / Undefined</option>
                  <option value="is_not_null">Is Not Null</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600">Comparison Value</label>
                <input
                  type="text"
                  value={config.value ?? ""}
                  onChange={(e) => handleConfigChange("value", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                  placeholder="e.g. success, 200, active"
                />
              </div>
              <p className="text-[10px] text-slate-500">
                Connect the <span className="font-semibold text-emerald-600">true</span> branch handle for matching values, or the <span className="font-semibold text-rose-600">false</span> branch handle for non-matching.
              </p>
            </div>
          )}

          {/* Transform Action Node */}
          {nodeType === "ACTION" && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600">Action Type</label>
                <select
                  value={config.actionType || "transform"}
                  onChange={(e) => handleConfigChange("actionType", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="transform">Data Transformation</option>
                  <option value="log">Log Payload</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600">Transformation Template (JSON)</label>
                <textarea
                  rows={4}
                  value={
                    typeof config.template === "object"
                      ? JSON.stringify(config.template, null, 2)
                      : config.template || ""
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
                  placeholder='{"recipient": "{{trigger.body.email}}", "summary": "Alert"}'
                />
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
