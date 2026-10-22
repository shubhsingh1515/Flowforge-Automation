"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Code2,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  FileCode,
} from "lucide-react";

export function CustomIntegrationsTab() {
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Configure & Test modal state
  const [editingIntegration, setEditingIntegration] = useState<any | null>(null);
  const [actionMethod, setActionMethod] = useState("POST");
  const [actionUrl, setActionUrl] = useState("https://httpbin.org/post");
  const [actionBody, setActionBody] = useState('{\n  "leadEmail": "{{input.email}}",\n  "leadName": "{{input.name}}"\n}');
  const [testInput, setTestInput] = useState('{\n  "email": "alex@flowforge.dev",\n  "name": "Alex Rivera"\n}');
  const [testResult, setTestResult] = useState<any | null>(null);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["custom-integrations"],
    queryFn: () => api.customIntegrations.list(),
  });

  const createMutation = useMutation({
    mutationFn: (body: { key: string; name: string; description?: string }) =>
      api.customIntegrations.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-integrations"] });
      setShowCreateModal(false);
      setKey("");
      setName("");
      setDescription("");
      setSuccessMessage("Custom integration created in DRAFT state.");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to create custom integration");
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: ({ id, definition }: { id: string; definition: any }) =>
      api.customIntegrations.updateDraft(id, definition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-integrations"] });
      setSuccessMessage("Draft action configuration saved.");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to save draft");
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.customIntegrations.publish(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-integrations"] });
      setSuccessMessage("Integration version published! Workflows can now bind to this immutable version.");
      setTimeout(() => setSuccessMessage(null), 4000);
      setEditingIntegration(null);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to publish version");
    },
  });

  const testActionMutation = useMutation({
    mutationFn: ({ id, actionId, sampleInput }: { id: string; actionId: string; sampleInput: any }) =>
      api.customIntegrations.testAction(id, { actionId, sampleInput }),
    onSuccess: (data) => {
      setTestResult(data);
    },
    onError: (err: any) => {
      setTestResult({ success: false, errorMessage: err.message });
    },
  });

  const openConfigModal = (integ: any) => {
    setEditingIntegration(integ);
    setTestResult(null);
    const def = integ.versions[0]?.definition;
    const action = def?.actions?.[0];
    if (action) {
      setActionMethod(action.method || "POST");
      setActionUrl(action.url || "https://httpbin.org/post");
      setActionBody(action.bodyTemplate || '{"email": "{{input.email}}"}');
    }
  };

  const handleSaveDraft = () => {
    if (!editingIntegration) return;
    const definition = {
      actions: [
        {
          id: "custom_action_1",
          name: "Execute Request",
          method: actionMethod,
          url: actionUrl,
          headers: { "Content-Type": "application/json" },
          bodyTemplate: actionBody,
          inputSchema: { type: "object" },
        },
      ],
    };
    updateDraftMutation.mutate({ id: editingIntegration.id, definition });
  };

  const handleRunTest = () => {
    if (!editingIntegration) return;
    let parsedInput = {};
    try {
      parsedInput = JSON.parse(testInput);
    } catch {
      setActionError("Test input is not valid JSON.");
      return;
    }

    testActionMutation.mutate({
      id: editingIntegration.id,
      actionId: "custom_action_1",
      sampleInput: parsedInput,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Code2 className="h-5 w-5 text-indigo-600" />
              <span>Custom Declarative Integrations</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Build custom REST API connectors with typed parameters, URL template interpolation, and sandbox test execution.
            </p>
          </div>

          <button
            onClick={() => {
              setActionError(null);
              setShowCreateModal(true);
            }}
            data-testid="create-custom-integration-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>New Custom Integration</span>
          </button>
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

      {/* Integrations Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Custom Workspace Connectors</h4>
          <span className="text-xs text-slate-400 font-medium">{integrations.length} total</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading custom integrations...</div>
        ) : integrations.length === 0 ? (
          <div className="p-8 text-center">
            <Code2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">No custom integrations created yet</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Build a custom connector to integrate private internal APIs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Name & Key</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {integrations.map((integ: any) => (
                  <tr key={integ.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{integ.name}</div>
                      <div className="font-mono text-[11px] text-slate-400 mt-0.5">custom:{integ.key}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-700">
                        v{integ.currentVersion}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {integ.status === "PUBLISHED" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => openConfigModal(integ)}
                        data-testid={`configure-integration-${integ.id}`}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition"
                      >
                        Configure & Test
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Configure & Test Modal */}
      {editingIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Configure Action: {editingIntegration.name} (v{editingIntegration.currentVersion})
                </h3>
                <p className="text-xs text-slate-500 font-mono">custom:{editingIntegration.key}</p>
              </div>
              <button
                onClick={() => setEditingIntegration(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">HTTP Method</label>
                  <select
                    value={actionMethod}
                    onChange={(e) => setActionMethod(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>

                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Endpoint URL</label>
                  <input
                    type="url"
                    value={actionUrl}
                    onChange={(e) => setActionUrl(e.target.value)}
                    placeholder="https://api.acme.com/v1/contacts"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Request Body Template (JSON with <code>{"{{input.field}}"}</code>)
                </label>
                <textarea
                  rows={4}
                  value={actionBody}
                  onChange={(e) => setActionBody(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-xs font-mono text-slate-900 focus:outline-none"
                />
              </div>

              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Play className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Sample Test Input (JSON)</span>
                  </label>
                  <button
                    onClick={handleRunTest}
                    disabled={testActionMutation.isPending}
                    data-testid="run-test-action-btn"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition"
                  >
                    {testActionMutation.isPending ? "Executing..." : "Run Test"}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-xs font-mono text-slate-900 focus:outline-none"
                />
              </div>

              {testResult && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-mono">
                  <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-200">
                    <span className="font-bold text-slate-700">Sandbox Test Result</span>
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                        testResult.success ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {testResult.success ? `${testResult.statusCode || 200} OK` : "FAILED"}
                    </span>
                  </div>
                  <pre className="text-[11px] text-slate-800 whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {JSON.stringify(testResult.responseData || testResult.errorMessage, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={handleSaveDraft}
                disabled={updateDraftMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
              >
                <FileCode className="h-4 w-4 text-slate-500" />
                <span>Save Draft</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingIntegration(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    if (confirm("Publish this integration version? It will become immutable.")) {
                      publishMutation.mutate(editingIntegration.id);
                    }
                  }}
                  disabled={publishMutation.isPending}
                  data-testid="publish-integration-btn"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs"
                >
                  <UploadCloud className="h-4 w-4" />
                  <span>Publish Version</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Integration Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900 mb-2">Create Custom Integration</h3>
            <p className="text-xs text-slate-500 mb-4">
              Define a declarative connector for your private APIs or internal microservices.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  key,
                  name,
                  description,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Integration Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Internal Billing"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Unique Slug Key (lowercase, alphanumeric)
                </label>
                <input
                  type="text"
                  required
                  pattern="[a-z0-9_-]+"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  placeholder="e.g. acme-billing"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Connects customer payment profiles with our internal ledger"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
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
                  disabled={createMutation.isPending || !name.trim() || !key.trim()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs"
                >
                  {createMutation.isPending ? "Creating..." : "Create Connector"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
