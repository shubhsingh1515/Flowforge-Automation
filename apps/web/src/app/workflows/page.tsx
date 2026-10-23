"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Workflow,
  PlusCircle,
  Search,
  Filter,
  MoreVertical,
  Play,
  Pause,
  Copy,
  Trash2,
  Edit3,
  ExternalLink,
  AlertTriangle,
  Clock,
  Layers,
  Upload,
  Download,
  BookmarkPlus,
  X,
  FileJson,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [deleteModalWorkflow, setDeleteModalWorkflow] = useState<{ id: string; name: string } | null>(null);

  // Import Modal State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  // Save as Template Modal State
  const [saveTemplateModalWorkflow, setSaveTemplateModalWorkflow] = useState<{ id: string; name: string } | null>(null);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateCategory, setTemplateCategory] = useState("Productivity");
  const [templateDifficulty, setTemplateDifficulty] = useState<"BEGINNER" | "INTERMEDIATE" | "ADVANCED">("BEGINNER");

  const { data, isLoading } = useQuery({
    queryKey: ["workflows", search, statusFilter, page],
    queryFn: () => api.workflows.list({ search: search || undefined, status: statusFilter, page, limit: 15 }),
  });

  const workflows = data?.data || [];
  const meta = data?.meta || { total: 0, totalPages: 1 };

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const nextStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
      return api.workflows.update(id, { status: nextStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.workflows.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.workflows.delete(id),
    onSuccess: () => {
      setDeleteModalWorkflow(null);
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (payload: any) => api.workflows.import(payload),
    onSuccess: () => {
      setImportModalOpen(false);
      setImportJsonText("");
      setImportError(null);
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
    onError: (err: any) => {
      setImportError(err.message || "Failed to import workflow.");
    },
  });

  // Save as template mutation
  const saveAsTemplateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => api.workflows.saveAsTemplate(id, payload),
    onSuccess: () => {
      setSaveTemplateModalWorkflow(null);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  // Handle Export workflow JSON
  const handleExportWorkflow = async (workflowId: string, workflowName: string) => {
    try {
      const exportData = await api.workflows.export(workflowId);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workflowName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setImportJsonText(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = () => {
    setImportError(null);
    try {
      const parsed = JSON.parse(importJsonText);
      importMutation.mutate(parsed);
    } catch {
      setImportError("Invalid JSON syntax. Please check file format.");
    }
  };

  return (
    <AppShell
      title="Workflows"
      description="Create, monitor, and configure visual automation graphs for your workspace."
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setImportError(null);
              setImportJsonText("");
              setImportModalOpen(true);
            }}
            data-testid="import-workflow-btn"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <Upload className="h-3.5 w-3.5 text-slate-500" />
            <span>Import JSON</span>
          </button>
          <Link
            href="/workflows/ai-builder"
            data-testid="link-ai-builder"
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-2xs hover:bg-indigo-100 transition-colors mr-2"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            <span>AI Builder</span>
          </Link>
          <Link
            href="/workflows/new"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>New Workflow</span>
          </Link>
        </div>
      }
    >
      {/* Search and Status Filters Toolbar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows by title or description..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 shadow-2xs"
          />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1">
          {["ALL", "ACTIVE", "PAUSED", "DRAFT"].map((status) => (
            <button
              key={status}
              data-testid={`filter-${status.toLowerCase()}`}
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === status
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              {status === "ALL" ? "All Statuses" : status.charAt(0) + status.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Workflows List / Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading workflows...</div>
        ) : workflows.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <Workflow className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">No workflows found</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              {search || statusFilter !== "ALL"
                ? "Try adjusting your search criteria or filter to see more workflows."
                : "Get started by building your first visual automation workflow or exploring pre-built templates."}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/workflows/ai-builder"
            data-testid="link-ai-builder"
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-2xs hover:bg-indigo-100 transition-colors mr-2"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            <span>AI Builder</span>
          </Link>
          <Link
            href="/workflows/new"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Create Workflow</span>
              </Link>
              <Link
                href="/templates"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <span>Browse Templates</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-6">Name</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Trigger</th>
                  <th className="py-3 px-6">Version</th>
                  <th className="py-3 px-6">Last Modified</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {workflows.map((wf: any) => (
                  <tr key={wf.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <Link
                        href={`/workflows/${wf.id}`}
                        className="font-bold text-slate-900 hover:text-indigo-600 transition-colors"
                      >
                        {wf.name}
                      </Link>
                      {wf.description && (
                        <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-1 max-w-md">
                          {wf.description}
                        </p>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <button
                        onClick={() =>
                          toggleStatusMutation.mutate({ id: wf.id, currentStatus: wf.status })
                        }
                        title="Click to toggle status"
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer transition-opacity hover:opacity-80",
                          wf.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                            : wf.status === "PAUSED"
                            ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        )}
                      >
                        {wf.status === "ACTIVE" ? (
                          <Play className="h-3 w-3 fill-emerald-600 text-emerald-600" />
                        ) : (
                          <Pause className="h-3 w-3 text-amber-600" />
                        )}
                        <span>{wf.status}</span>
                      </button>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
                        <Layers className="h-3 w-3 text-indigo-500" />
                        <span>{wf.triggerType}</span>
                      </span>
                    </td>
                    <td className="py-4 px-6 text-slate-500">v{wf.latestVersion}</td>
                    <td className="py-4 px-6 text-slate-500">{formatRelativeTime(wf.updatedAt)}</td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/workflows/${wf.id}`}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                          title="Edit Canvas"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => duplicateMutation.mutate(wf.id)}
                          data-testid={`duplicate-wf-${wf.id}`}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="Duplicate Workflow"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleExportWorkflow(wf.id, wf.name)}
                          data-testid={`export-wf-${wf.id}`}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="Export Workflow JSON"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSaveTemplateModalWorkflow({ id: wf.id, name: wf.name });
                            setTemplateTitle(`${wf.name} Recipe`);
                          }}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                          title="Save as Workspace Recipe"
                        >
                          <BookmarkPlus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteModalWorkflow({ id: wf.id, name: wf.name })}
                          className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          title="Delete Workflow"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import Workflow Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Upload className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Import Workflow JSON</h3>
                  <p className="text-[11px] text-slate-500">Supports FlowForge portable export format (v1)</p>
                </div>
              </div>
              <button
                onClick={() => setImportModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* File upload input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">Select JSON File</label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="mt-1.5 block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>

              {/* Textarea for JSON paste */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">Or Paste Workflow JSON Definition</label>
                <textarea
                  rows={6}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder='{"schemaVersion": "flowforge/v1", "workflow": { ... }}'
                  className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-mono text-[11px] text-slate-800 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              {importError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <div className="font-semibold">Import Error</div>
                  <p className="mt-0.5 text-[11px] text-rose-700">{importError}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3.5">
              <button
                onClick={() => setImportModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200/60"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={!importJsonText.trim() || importMutation.isPending}
                data-testid="submit-import-btn"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
              >
                {importMutation.isPending ? "Validating & Importing..." : "Import Workflow"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {saveTemplateModalWorkflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Save as Workspace Recipe</h3>
              </div>
              <button
                onClick={() => setSaveTemplateModalWorkflow(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Recipe Title</label>
                <input
                  type="text"
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Category</label>
                <select
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="Productivity">Productivity</option>
                  <option value="Notifications">Notifications</option>
                  <option value="Data Sync">Data Sync</option>
                  <option value="Operations">Operations</option>
                  <option value="Developer">Developer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Complexity</label>
                <select
                  value={templateDifficulty}
                  onChange={(e) => setTemplateDifficulty(e.target.value as any)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="BEGINNER">Beginner</option>
                  <option value="INTERMEDIATE">Intermediate</option>
                  <option value="ADVANCED">Advanced</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3.5">
              <button
                onClick={() => setSaveTemplateModalWorkflow(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200/60"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  saveAsTemplateMutation.mutate({
                    id: saveTemplateModalWorkflow.id,
                    payload: {
                      title: templateTitle,
                      category: templateCategory,
                      difficulty: templateDifficulty,
                    },
                  });
                }}
                disabled={saveAsTemplateMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
              >
                {saveAsTemplateMutation.isPending ? "Saving..." : "Save Recipe"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalWorkflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete Workflow</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <strong className="text-slate-900 font-semibold">"{deleteModalWorkflow.name}"</strong>?
              All associated versions and step definitions will be removed from your workspace.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteModalWorkflow(null)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteModalWorkflow.id)}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-70"
              >
                {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
