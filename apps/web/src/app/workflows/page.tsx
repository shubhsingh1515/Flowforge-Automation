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
} from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deleteModalWorkflow, setDeleteModalWorkflow] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["workflows", search, statusFilter],
    queryFn: () => api.workflows.list({ search: search || undefined, status: statusFilter }),
  });

  const workflows = data?.data || [];

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const nextStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
      return api.workflows.update(id, { status: nextStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.workflows.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
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

  return (
    <AppShell
      title="Workflows"
      description="Create, monitor, and configure visual automation graphs for your workspace."
      action={
        <Link
          href="/workflows/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          <span>New Workflow</span>
        </Link>
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
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1">
          {["ALL", "ACTIVE", "PAUSED", "DRAFT"].map((status) => (
            <button
              key={status}
              data-testid={`filter-${status.toLowerCase()}`}
              onClick={() => setStatusFilter(status)}
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
                : "Get started by building your first visual automation workflow."}
            </p>
            <div className="mt-5">
              <Link
                href="/workflows/new"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Create Workflow</span>
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
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="Duplicate Workflow"
                        >
                          <Copy className="h-4 w-4" />
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
