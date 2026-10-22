"use client";

import React, { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { CustomWorkflowNode } from "./CustomWorkflowNode";
import { NodeLibrary } from "./NodeLibrary";
import { NodeConfigPanel } from "./NodeConfigPanel";
import {
  NodeType,
  validateWorkflowGraph,
  WorkflowStatus,
} from "@flowforge/shared";
import {
  Save,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Play,
  Pause,
  Zap,
  Copy,
  Check,
  ExternalLink,
  X,
  RefreshCw,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { api } from "../../lib/api";

interface WorkflowEditorProps {
  initialWorkflow?: {
    id?: string;
    name: string;
    description?: string;
    status: WorkflowStatus;
    webhookSlug?: string;
    webhookSecret?: string;
    nodes: any[];
    edges: any[];
    viewport?: any;
  };
  onSave: (data: {
    name: string;
    description: string;
    status: WorkflowStatus;
    nodes: any[];
    edges: any[];
  }) => Promise<any>;
}

export function WorkflowEditor({ initialWorkflow, onSave }: WorkflowEditorProps) {
  const router = useRouter();

  const [name, setName] = useState(initialWorkflow?.name || "Untitled Workflow");
  const [description, setDescription] = useState(initialWorkflow?.description || "");
  const [status, setStatus] = useState<WorkflowStatus>(
    initialWorkflow?.status || "DRAFT"
  );
  const [webhookSlug, setWebhookSlug] = useState<string | undefined>(
    initialWorkflow?.webhookSlug
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(
    (initialWorkflow?.nodes as Node[]) || []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (initialWorkflow?.edges as Edge[]) || []
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

  // Activation & Test Run State
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPayload, setTestPayload] = useState(
    JSON.stringify({ event: "test_trigger", data: { message: "Hello FlowForge", amount: 150 } }, null, 2)
  );
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [copiedSlug, setCopiedSlug] = useState(false);

  // Register custom node type
  const nodeTypes = useMemo(() => ({ custom: CustomWorkflowNode }), []);

  // Handle edge connection
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, animated: true }, eds));
    },
    [setEdges]
  );

  // Add node from library
  const handleAddNode = (type: NodeType, label: string, desc: string) => {
    const id = `node_${Date.now()}`;
    const newNode: Node = {
      id,
      type: "custom",
      position: {
        x: 100 + nodes.length * 40,
        y: 100 + (nodes.length % 5) * 60,
      },
      data: {
        label,
        description: desc,
        nodeType: type,
        config: {},
        isValid: true,
        status: "configured",
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
    setMobilePaletteOpen(false);
  };

  // Node selection
  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  };

  const onPaneClick = () => {
    setSelectedNodeId(null);
  };

  // Update selected node data
  const handleUpdateNode = (nodeId: string, updatedData: any) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: updatedData } : n))
    );
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  // Real-time client-side graph validation
  const validationResult = useMemo(() => {
    return validateWorkflowGraph(nodes as any, edges as any);
  }, [nodes, edges]);

  // Save handler
  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const saved = await onSave({
        name,
        description,
        status,
        nodes,
        edges,
      });
      if (saved?.workflow?.webhookSlug) {
        setWebhookSlug(saved.workflow.webhookSlug);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save workflow graph.");
    } finally {
      setIsSaving(false);
    }
  };

  // Activate / Pause Toggle
  const handleToggleActivate = async () => {
    if (!initialWorkflow?.id) {
      setSaveError("Please save the workflow first before activating.");
      return;
    }

    setIsTogglingStatus(true);
    setActionNotice(null);
    setSaveError(null);

    try {
      if (status === "ACTIVE") {
        await api.workflows.pause(initialWorkflow.id);
        setStatus("PAUSED");
        setActionNotice("Workflow paused successfully.");
      } else {
        const res = await api.workflows.activate(initialWorkflow.id);
        setStatus("ACTIVE");
        if (res?.workflow?.webhookSlug) {
          setWebhookSlug(res.workflow.webhookSlug);
        }
        setActionNotice("Workflow activated! Background execution worker is now listening.");
      }
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to update workflow active status.");
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Execute Test Flow
  const handleRunTest = async () => {
    if (!initialWorkflow?.id) {
      setSaveError("Please save the workflow first before running a test.");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      let parsed = {};
      try {
        parsed = JSON.parse(testPayload);
      } catch {
        parsed = { raw: testPayload };
      }

      const res = await api.workflows.test(initialWorkflow.id, parsed);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        error: true,
        message: err?.message || "Test execution request failed.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    if (!webhookSlug) return;
    const url = `http://localhost:4000/api/v1/webhooks/${webhookSlug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 2000);
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-100 overflow-hidden">
      {/* Top Navigation & Action Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 z-30 shadow-2xs">
        <div className="flex items-center gap-4">
          <Link
            href="/workflows"
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Workflows</span>
          </Link>

          <div className="h-4 w-px bg-slate-200" />

          {/* Workflow Title & Description Inputs */}
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow Name"
              className="text-sm font-bold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-indigo-600 focus:outline-none px-1"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add brief description..."
              className="block text-[11px] text-slate-500 border-b border-transparent hover:border-slate-300 focus:border-indigo-600 focus:outline-none px-1 truncate max-w-sm"
            />
          </div>
        </div>

        {/* Validation indicator, Webhook pill, Status Toggle, Test Button, Save actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Webhook endpoint pill if available */}
          {webhookSlug && (
            <button
              onClick={handleCopyWebhookUrl}
              className="hidden lg:flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/60 px-3 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100/60 transition-colors"
              title="Click to copy Webhook URL"
            >
              {copiedSlug ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">URL Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 text-indigo-500" />
                  <span className="font-mono text-[10px]">{webhookSlug}</span>
                </>
              )}
            </button>
          )}

          {/* Validation Status Indicator */}
          <div
            className={cn(
              "hidden sm:flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border",
              validationResult.isValid
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-800 border-amber-200"
            )}
          >
            {validationResult.isValid ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Graph Valid ({nodes.length} nodes)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span>{validationResult.errors[0]?.message || "Validation issues"}</span>
              </>
            )}
          </div>

          {/* Test Flow Execution Trigger */}
          {initialWorkflow?.id && (
            <button
              onClick={() => {
                setTestResult(null);
                setTestModalOpen(true);
              }}
              data-testid="test-flow-btn"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
              <span>Test Flow</span>
            </button>
          )}

          {/* Activate / Pause Toggle Button */}
          {initialWorkflow?.id && (
            <button
              onClick={handleToggleActivate}
              disabled={isTogglingStatus || !validationResult.isValid}
              data-testid="toggle-activate-btn"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shadow-2xs disabled:opacity-50",
                status === "ACTIVE"
                  ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  : "border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
              )}
            >
              {status === "ACTIVE" ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-white" />
                  <span>Activate</span>
                </>
              )}
            </button>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? "Saving..." : saveSuccess ? "Saved to Cloud" : "Save Graph"}</span>
          </button>
        </div>
      </header>

      {/* Action Banner / Notification */}
      {actionNotice && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs text-emerald-800 flex items-center justify-between z-20 transition-all">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{actionNotice}</span>
          </div>
          <Link
            href="/executions"
            className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1"
          >
            <span>View Executions</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Validation Alert Banner if error exists */}
      {!validationResult.isValid && validationResult.errors.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-800 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="font-semibold">Graph Warning:</span>
            <span>{validationResult.errors[0].message}</span>
          </div>
          <span className="text-[11px] text-amber-600">DAG Cycle Prevention Active</span>
        </div>
      )}

      {saveError && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-2 text-xs text-rose-700 z-20">
          <span>Error: {saveError}</span>
        </div>
      )}

      {/* Editor Body */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Mobile Palette Toggle Floating Button */}
        <button
          onClick={() => setMobilePaletteOpen(!mobilePaletteOpen)}
          className="absolute top-3 left-3 z-30 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md md:hidden"
        >
          <Layers className="h-3.5 w-3.5" />
          <span>{mobilePaletteOpen ? "Close Palette" : "+ Add Nodes"}</span>
        </button>

        {/* Left Node Library Palette */}
        <div
          className={cn(
            "fixed inset-y-16 left-0 z-20 transition-transform duration-200 md:static md:translate-x-0",
            mobilePaletteOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <NodeLibrary onAddNode={handleAddNode} />
        </div>

        {/* Center React Flow Canvas */}
        <div className="flex-1 h-full w-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2}
          >
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              nodeColor={(n) => {
                if (n.data?.nodeType === "TRIGGER") return "#6366f1";
                if (n.data?.nodeType === "CONDITION") return "#f59e0b";
                if (n.data?.nodeType === "WORKFLOW_END") return "#10b981";
                return "#3b82f6";
              }}
              className="!border !border-slate-200 !rounded-xl !overflow-hidden !shadow-md"
            />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#cbd5e1" />
          </ReactFlow>

          {/* Quick empty canvas helper overlay */}
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/90 p-8 text-center backdrop-blur-xs max-w-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 mb-3">
                  <Layers className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Your canvas is empty</h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Click any node in the left palette to start assembling your workflow graph.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Node Configuration Sidebar */}
        {selectedNode && (
          <div className="fixed inset-y-16 right-0 z-30 md:static md:translate-x-0">
            <NodeConfigPanel
              selectedNode={selectedNode}
              webhookSlug={webhookSlug}
              workflowId={initialWorkflow?.id}
              onUpdateNode={handleUpdateNode}
              onDeleteNode={handleDeleteNode}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}
      </div>

      {/* Test Flow Execution Modal Dialog */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Zap className="h-4 w-4 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Execute Test Flow</h3>
                  <p className="text-[11px] text-slate-500">
                    Dispatches an asynchronous execution job with your payload.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTestModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Trigger Mock Payload (JSON)
                </label>
                <textarea
                  rows={5}
                  value={testPayload}
                  onChange={(e) => setTestPayload(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-mono text-xs text-slate-800 focus:border-indigo-600 focus:outline-none"
                  placeholder='{"event": "test", "key": "value"}'
                />
              </div>

              {testResult && (
                <div
                  className={cn(
                    "rounded-xl border p-4 text-xs",
                    testResult.error
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  )}
                >
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span>
                      {testResult.error ? "Test Execution Failed" : "Job Enqueued Successfully!"}
                    </span>
                    {!testResult.error && (
                      <span className="font-mono text-[10px] bg-emerald-100 px-2 py-0.5 rounded-md text-emerald-800">
                        {testResult.execution?.id?.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-1 text-slate-600">
                    {testResult.message || (testResult.error ? testResult.message : "The execution has been enqueued to the BullMQ background worker.")}
                  </p>

                  {!testResult.error && testResult.execution?.id && (
                    <div className="mt-3 flex items-center justify-between border-t border-emerald-200/60 pt-2.5">
                      <span className="text-[10px] text-emerald-700">
                        Status: <strong>{testResult.execution?.status || "PENDING"}</strong>
                      </span>
                      <Link
                        href={`/executions`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:underline"
                      >
                        <span>View Live Executions</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3.5">
              <button
                onClick={() => setTestModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleRunTest}
                disabled={isTesting}
                data-testid="submit-test-flow-btn"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Enqueuing...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 fill-white" />
                    <span>Run Test Execution</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
