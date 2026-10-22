"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
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
  Clock,
  Download,
  RotateCcw,
  GitBranch,
  FileCode,
  History,
  ShieldCheck,
  Info,
} from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";
import { api } from "../../lib/api";

interface WorkflowEditorProps {
  initialWorkflow?: {
    id?: string;
    name: string;
    description?: string;
    status: WorkflowStatus;
    webhookSlug?: string;
    webhookSecret?: string;
    version?: number;
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
    expectedVersion?: number;
    changeSummary?: string;
    createVersion?: boolean;
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
  const [currentVersion, setCurrentVersion] = useState<number>(
    initialWorkflow?.version || 1
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

  // Phase 7: Version History & Diagnostics State
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [versionsList, setVersionsList] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [diagnosticsModalOpen, setDiagnosticsModalOpen] = useState(false);
  const [checkpointModalOpen, setCheckpointModalOpen] = useState(false);
  const [checkpointNote, setCheckpointNote] = useState("");
  const [isRollingBack, setIsRollingBack] = useState(false);

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
  const handleAddNode = (
    type: NodeType,
    label: string,
    desc: string,
    integrationKey?: string,
    initialConfig?: any
  ) => {
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
        integrationKey: integrationKey || undefined,
        config: initialConfig || {},
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

  // Load versions history from backend
  const loadVersionHistory = async () => {
    if (!initialWorkflow?.id) return;
    setLoadingVersions(true);
    try {
      const res = await api.workflows.listVersions(initialWorkflow.id);
      setVersionsList(res.versions || []);
      setCurrentVersion(res.currentVersion || 1);
    } catch (err: any) {
      console.error("Failed to load versions:", err);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Safe Rollback to a historical version snapshot
  const handleRollback = async (targetVerNum: number) => {
    if (!initialWorkflow?.id) return;
    setIsRollingBack(true);
    setSaveError(null);

    try {
      const res = await api.workflows.rollback(initialWorkflow.id, targetVerNum);
      const restored = res.restoredVersion;
      // Fetch full restored version snapshot to update canvas
      const snapshot = await api.workflows.getVersion(initialWorkflow.id, restored.version);
      if (snapshot?.version) {
        setNodes((snapshot.version.nodes as Node[]) || []);
        setEdges((snapshot.version.edges as Edge[]) || []);
      }
      setStatus("DRAFT");
      setCurrentVersion(restored.version);
      setActionNotice(`Successfully restored Version ${targetVerNum}! Created as new Version ${restored.version} (Draft).`);
      setHistoryDrawerOpen(false);
      setTimeout(() => setActionNotice(null), 5000);
    } catch (err: any) {
      setSaveError(err.message || "Rollback failed.");
    } finally {
      setIsRollingBack(false);
    }
  };

  // Export Workflow as JSON file
  const handleExport = async () => {
    if (!initialWorkflow?.id) return;
    try {
      const exportData = await api.workflows.export(initialWorkflow.id);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setSaveError(err.message || "Failed to export workflow.");
    }
  };

  // Save handler with optional checkpoint
  const handleSave = async (asCheckpoint = false, note = "") => {
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
        expectedVersion: currentVersion,
        createVersion: asCheckpoint,
        changeSummary: note || undefined,
      });
      if (saved?.workflow?.webhookSlug) {
        setWebhookSlug(saved.workflow.webhookSlug);
      }
      if (saved?.workflow?.version) {
        setCurrentVersion(saved.workflow.version);
      }
      setSaveSuccess(true);
      setCheckpointModalOpen(false);
      setCheckpointNote("");
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
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Workflow Name"
                className="text-sm font-bold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-indigo-600 focus:outline-none px-1"
              />
              <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                v{currentVersion}
              </span>
            </div>
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
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Webhook endpoint pill if available */}
          {webhookSlug && (
            <button
              onClick={handleCopyWebhookUrl}
              className="hidden xl:flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/60 px-3 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100/60 transition-colors"
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
          <button
            onClick={() => setDiagnosticsModalOpen(true)}
            className={cn(
              "hidden sm:flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border hover:opacity-90 transition-opacity",
              validationResult.isValid
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-800 border-amber-200"
            )}
            title="Click to inspect validation diagnostics"
          >
            {validationResult.isValid ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Graph Valid ({nodes.length})</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span>{validationResult.errors[0]?.message || "Issues Found"}</span>
              </>
            )}
          </button>

          {/* Version History Drawer Trigger */}
          {initialWorkflow?.id && (
            <button
              onClick={() => {
                loadVersionHistory();
                setHistoryDrawerOpen(true);
              }}
              data-testid="version-history-btn"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              title="View immutable version history and rollbacks"
            >
              <History className="h-3.5 w-3.5 text-indigo-600" />
              <span className="hidden md:inline">History</span>
            </button>
          )}

          {/* Export Workflow JSON Button */}
          {initialWorkflow?.id && (
            <button
              onClick={handleExport}
              data-testid="export-json-canvas-btn"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              title="Export sanitized workflow JSON"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden md:inline">Export</span>
            </button>
          )}

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

          {/* Save Button & Checkpoint Dropdown */}
          <div className="flex items-center">
            <button
              onClick={() => handleSave(false)}
              disabled={isSaving}
              data-testid="save-graph-btn"
              className="inline-flex items-center gap-2 rounded-l-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? "Saving..." : saveSuccess ? "Saved to Cloud" : "Save Graph"}</span>
            </button>
            <button
              onClick={() => setCheckpointModalOpen(true)}
              className="rounded-r-lg bg-indigo-700 px-2 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 border-l border-indigo-500"
              title="Save a new version snapshot checkpoint"
            >
              +v
            </button>
          </div>
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
          <button
            onClick={() => setDiagnosticsModalOpen(true)}
            className="text-[11px] text-amber-700 underline font-semibold"
          >
            View Diagnostics
          </button>
        </div>
      )}

      {saveError && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-2 text-xs text-rose-700 z-20 flex items-center justify-between">
          <span>Error: {saveError}</span>
          {saveError.includes("Conflict") && (
            <button
              onClick={() => window.location.reload()}
              className="underline font-bold text-rose-800"
            >
              Reload Latest Version
            </button>
          )}
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

      {/* Version History Drawer */}
      {historyDrawerOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Version History</h3>
                <p className="text-[11px] text-slate-500">Immutable checkpoints and safe rollbacks</p>
              </div>
            </div>
            <button
              onClick={() => setHistoryDrawerOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            {loadingVersions ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading version history...</div>
            ) : versionsList.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">No versions recorded yet.</div>
            ) : (
              versionsList.map((ver: any) => {
                const isCurrent = ver.version === currentVersion;

                return (
                  <div
                    key={ver.id}
                    className={cn(
                      "rounded-xl border p-4 text-xs transition-all",
                      isCurrent
                        ? "border-indigo-300 bg-indigo-50/40 shadow-2xs"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 font-mono text-sm">
                          Version {ver.version}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                            Current Active
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {formatRelativeTime(ver.createdAt)}
                      </span>
                    </div>

                    <p className="mt-2 text-slate-600 text-[11px] leading-relaxed">
                      {ver.changeSummary || "No change notes provided."}
                    </p>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                      <span>{ver.nodeCount || 0} nodes</span>

                      {!isCurrent && (
                        <button
                          onClick={() => handleRollback(ver.version)}
                          disabled={isRollingBack}
                          data-testid={`rollback-btn-v${ver.version}`}
                          className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Rollback to v{ver.version}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Diagnostics Modal Dialog */}
      {diagnosticsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Workflow Diagnostics & Health</h3>
                  <p className="text-[11px] text-slate-500">Structural integrity and execution readiness</p>
                </div>
              </div>
              <button
                onClick={() => setDiagnosticsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div
                className={cn(
                  "rounded-xl border p-4 text-xs",
                  validationResult.isValid
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                )}
              >
                <div className="font-bold flex items-center gap-1.5">
                  {validationResult.isValid ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                  <span>{validationResult.isValid ? "Graph is structurally sound" : "Action Required"}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  {validationResult.isValid
                    ? "All DAG rules are satisfied. No cycles, valid trigger connectivity, and active endpoints are present."
                    : "Please resolve the following issues before activating this pipeline."}
                </p>
              </div>

              {validationResult.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Detected Issues</h4>
                  {validationResult.errors.map((err, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-900 flex items-start gap-2"
                    >
                      <span className="font-bold text-amber-700 shrink-0">#{i + 1}</span>
                      <div>
                        <span>{err.message}</span>
                        {err.nodeId && (
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            Node ID: {err.nodeId}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px]">Total Nodes</span>
                  <span className="font-bold text-slate-800 text-sm">{nodes.length}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Total Connections (Edges)</span>
                  <span className="font-bold text-slate-800 text-sm">{edges.length}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50 px-6 py-3.5">
              <button
                onClick={() => setDiagnosticsModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200/60"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkpoint Modal */}
      {checkpointModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Create Version Checkpoint</h3>
              </div>
              <button
                onClick={() => setCheckpointModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Save an immutable version snapshot (v{currentVersion + 1}) to preserve this checkpoint for auditing and safe rollback.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Change Description (Optional)</label>
                <input
                  type="text"
                  value={checkpointNote}
                  onChange={(e) => setCheckpointNote(e.target.value)}
                  placeholder="e.g. Added Slack notifications and filtered leads"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3.5">
              <button
                onClick={() => setCheckpointModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200/60"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSave(true, checkpointNote)}
                disabled={isSaving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
              >
                {isSaving ? "Creating Checkpoint..." : "Save Checkpoint (v" + (currentVersion + 1) + ")"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                        {testResult.executionId?.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-1 text-slate-600">
                    {testResult.message || (testResult.error ? testResult.message : "The execution has been enqueued to the BullMQ background worker.")}
                  </p>

                  {!testResult.error && testResult.executionId && (
                    <div className="mt-3 flex items-center justify-between border-t border-emerald-200/60 pt-2.5">
                      <span className="text-[10px] text-emerald-700">
                        Correlation: <strong>{testResult.correlationId}</strong>
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
