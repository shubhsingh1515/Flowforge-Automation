"use client";

import React, { useState, useEffect } from "react";
import { X, Trash2, Sliders, CheckCircle2 } from "lucide-react";
import { Node } from "@xyflow/react";

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, updatedData: any) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeConfigPanel({
  selectedNode,
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

  return (
    <div className="w-80 border-l border-slate-200 bg-white flex flex-col h-full shadow-lg z-20">
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

          {nodeType === "TRIGGER" && (
            <>
              <div>
                <label className="block text-slate-600">HTTP Method</label>
                <select
                  value={config.method || "POST"}
                  onChange={(e) => handleConfigChange("method", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="POST">POST (Recommended)</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600">Path Slug</label>
                <input
                  type="text"
                  value={config.path || "/webhook"}
                  onChange={(e) => handleConfigChange("path", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="/webhook-path"
                />
              </div>
            </>
          )}

          {nodeType === "HTTP_REQUEST" && (
            <>
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
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600">Endpoint URL</label>
                <input
                  type="text"
                  value={config.url || ""}
                  onChange={(e) => handleConfigChange("url", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="https://api.example.com/v1/resource"
                />
              </div>
            </>
          )}

          {nodeType === "CONDITION" && (
            <>
              <div>
                <label className="block text-slate-600">Payload Key / Variable</label>
                <input
                  type="text"
                  value={config.field || "status"}
                  onChange={(e) => handleConfigChange("field", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  placeholder="body.email"
                />
              </div>
              <div>
                <label className="block text-slate-600">Evaluation Operator</label>
                <select
                  value={config.operator || "equals"}
                  onChange={(e) => handleConfigChange("operator", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="equals">Equals</option>
                  <option value="not_equals">Does Not Equal</option>
                  <option value="contains">Contains String</option>
                  <option value="not_contains">Does Not Contain</option>
                  <option value="greater_than">Greater Than (&gt;)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600">Comparison Value</label>
                <input
                  type="text"
                  value={config.value || ""}
                  onChange={(e) => handleConfigChange("value", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                  placeholder="e.g. success, 200, @acme.com"
                />
              </div>
            </>
          )}

          {nodeType === "WORKFLOW_END" && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200/60 p-3 text-[11px] text-emerald-800">
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Terminal Node</span>
              </div>
              Signals the successful completion of an automation run.
            </div>
          )}
        </div>
      </div>

      {/* Delete Node Footer */}
      <div className="p-4 border-t border-slate-100 bg-slate-50">
        <button
          onClick={() => onDeleteNode(selectedNode.id)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white py-2 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Delete Node</span>
        </button>
      </div>
    </div>
  );
}
