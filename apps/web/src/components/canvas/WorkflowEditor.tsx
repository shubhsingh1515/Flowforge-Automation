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
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface WorkflowEditorProps {
  initialWorkflow?: {
    id?: string;
    name: string;
    description?: string;
    status: WorkflowStatus;
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

  // Register custom node type
  const nodeTypes = useMemo(() => ({ custom: CustomWorkflowNode }), []);

  // Handle edge connection
  const onConnect = useCallback(
    (params: Connection) => {
      // Connect and animate edge
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
    setMobilePaletteOpen(false); // Close palette on mobile once node is selected
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
      await onSave({
        name,
        description,
        status,
        nodes,
        edges,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save workflow graph.");
    } finally {
      setIsSaving(false);
    }
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

        {/* Validation indicator & Save actions */}
        <div className="flex items-center gap-3">
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

          {/* Status selector */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-600 focus:outline-none"
          >
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
          </select>

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
          <span>Error saving: {saveError}</span>
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

        {/* Left Node Library Palette (Collapsible on Mobile, Fixed on Desktop) */}
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
              onUpdateNode={handleUpdateNode}
              onDeleteNode={handleDeleteNode}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
