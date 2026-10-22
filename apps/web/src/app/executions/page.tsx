"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Info,
  Terminal,
} from "lucide-react";
import { cn, formatDate, formatRelativeTime } from "../../lib/utils";

export default function ExecutionsPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["executions", statusFilter],
    queryFn: () => api.executions.list({ status: statusFilter }),
  });

  const { data: detailData, isLoading: loadingDetails } = useQuery({
    queryKey: ["execution-detail", selectedExecutionId],
    queryFn: () => (selectedExecutionId ? api.executions.get(selectedExecutionId) : null),
    enabled: !!selectedExecutionId,
  });

  const executions = data?.data || [];

  return (
    <AppShell
      title="Execution History"
      description="Inspect workflow execution logs, step diagnostics, and error traces."
    >
      {/* Informational Status Card */}
      <div className="mb-6 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/50 via-slate-50 to-white p-4 shadow-2xs">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-slate-900">Execution Engine Roadmap (Phase 2)</span>
            <p className="mt-0.5 text-slate-600 leading-relaxed">
              Database schema models for workflow runs and granular step executions (<code className="bg-slate-200/60 px-1 py-0.5 rounded text-[11px]">WorkflowExecution</code> and <code className="bg-slate-200/60 px-1 py-0.5 rounded text-[11px]">WorkflowStepExecution</code>) are active. Automated webhook listeners, cron runners, and BullMQ worker queues will be activated in Phase 2.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1">
          {["ALL", "SUCCESS", "FAILED", "RUNNING", "PENDING"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === st
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              {st === "ALL" ? "All Runs" : st.charAt(0) + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Executions Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading executions...</div>
        ) : executions.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <History className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">No execution runs recorded</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Automated executions will appear here once workflows begin receiving trigger events when the Phase 2 engine is deployed.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-6">Workflow</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Execution ID</th>
                  <th className="py-3 px-6">Started At</th>
                  <th className="py-3 px-6">Duration</th>
                  <th className="py-3 px-6">Steps</th>
                  <th className="py-3 px-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {executions.map((ex: any) => (
                  <tr key={ex.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-6 font-bold text-slate-900">{ex.workflowName}</td>
                    <td className="py-3.5 px-6">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          ex.status === "SUCCESS"
                            ? "bg-emerald-50 text-emerald-700"
                            : ex.status === "FAILED"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-amber-50 text-amber-700"
                        )}
                      >
                        {ex.status === "SUCCESS" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        <span>{ex.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-6 font-mono text-[11px] text-slate-500 truncate max-w-xs">
                      {ex.id}
                    </td>
                    <td className="py-3.5 px-6 text-slate-500">{formatDate(ex.startedAt)}</td>
                    <td className="py-3.5 px-6 text-slate-500">
                      {ex.durationMs ? `${ex.durationMs}ms` : "—"}
                    </td>
                    <td className="py-3.5 px-6 text-slate-600">{ex.totalSteps} steps</td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        onClick={() => setSelectedExecutionId(ex.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        <span>Logs</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution Diagnostics Drawer / Modal */}
      {selectedExecutionId && detailData?.execution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Execution Run Diagnostics
                </h3>
                <p className="text-[11px] font-mono text-slate-500">
                  ID: {detailData.execution.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedExecutionId(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-lg bg-slate-50 p-3">
                <span className="text-slate-400">Workflow</span>
                <p className="font-bold text-slate-800">{detailData.execution.workflow.name}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <span className="text-slate-400">Started</span>
                <p className="font-bold text-slate-800">{formatDate(detailData.execution.startedAt)}</p>
              </div>
            </div>

            {/* Step Executions */}
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Step Logs ({detailData.execution.steps?.length || 0})
              </h4>
              {detailData.execution.steps?.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                  No individual step records generated for this run.
                </div>
              ) : (
                <div className="space-y-2">
                  {detailData.execution.steps.map((st: any) => (
                    <div
                      key={st.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{st.nodeName}</span>
                        <span className="text-[10px] font-semibold text-emerald-600">
                          {st.status} ({st.durationMs}ms)
                        </span>
                      </div>
                      {st.errorMessage && (
                        <p className="mt-1 text-[11px] text-rose-600 font-mono">
                          {st.errorMessage}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedExecutionId(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
