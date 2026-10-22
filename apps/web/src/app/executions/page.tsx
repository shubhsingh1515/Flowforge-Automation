"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Zap,
  Terminal,
  Activity,
  Layers,
  Check,
} from "lucide-react";
import { cn, formatDate } from "../../lib/utils";

export default function ExecutionsPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Executions list with dynamic polling if any job is pending/running
  const { data, isLoading } = useQuery({
    queryKey: ["executions", statusFilter],
    queryFn: () => api.executions.list({ status: statusFilter }),
    refetchInterval: (query) => {
      const execs = query.state.data?.data || [];
      const hasActive = execs.some(
        (e: any) => e.status === "PENDING" || e.status === "RUNNING"
      );
      return hasActive ? 2000 : 8000;
    },
  });

  const { data: detailData, isLoading: loadingDetails } = useQuery({
    queryKey: ["execution-detail", selectedExecutionId],
    queryFn: () => (selectedExecutionId ? api.executions.get(selectedExecutionId) : null),
    enabled: !!selectedExecutionId,
    refetchInterval: (query) => {
      const st = query.state.data?.execution?.status;
      return st === "PENDING" || st === "RUNNING" ? 1500 : false;
    },
  });

  // Retry execution mutation
  const retryMutation = useMutation({
    mutationFn: (id: string) => api.executions.retry(id),
    onSuccess: (res) => {
      setRetryNotice(
        `Retry job successfully dispatched! New execution: ${res.execution?.id?.slice(0, 8)}...`
      );
      queryClient.invalidateQueries({ queryKey: ["executions"] });
      setTimeout(() => setRetryNotice(null), 4000);
    },
  });

  const executions = data?.data || [];

  return (
    <AppShell
      title="Execution History"
      description="Inspect workflow execution logs, step diagnostics, retry operations, and error traces."
    >
      {/* Live Engine Status Header */}
      <div className="mb-6 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/60 via-slate-50 to-white p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700">
              <Activity className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-xs">
                  BullMQ Asynchronous Runtime Engine Active
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  Workers Ready
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
                Workflows triggered via HTTP webhooks, cron schedules, or canvas manual runs are automatically queued in Redis and executed with step-level persistence.
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["executions"] })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {retryNotice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center justify-between">
          <span>{retryNotice}</span>
          <button
            onClick={() => setRetryNotice(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            ✕
          </button>
        </div>
      )}

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
            <h4 className="text-sm font-bold text-slate-900">No execution runs found</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Automated executions will appear here once workflows begin receiving trigger events or when you run a test from the canvas editor.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-6">Workflow</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Trigger</th>
                  <th className="py-3 px-6">Execution ID</th>
                  <th className="py-3 px-6">Started At</th>
                  <th className="py-3 px-6">Duration</th>
                  <th className="py-3 px-6">Steps</th>
                  <th className="py-3 px-6 text-right">Actions</th>
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
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : ex.status === "FAILED"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : ex.status === "RUNNING"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        )}
                      >
                        {ex.status === "SUCCESS" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : ex.status === "FAILED" ? (
                          <XCircle className="h-3 w-3" />
                        ) : (
                          <RotateCw className="h-3 w-3 animate-spin" />
                        )}
                        <span>{ex.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-slate-500 text-[11px] font-medium">
                      {ex.triggerType || "WEBHOOK"}
                    </td>
                    <td className="py-3.5 px-6 font-mono text-[11px] text-slate-500 truncate max-w-xs">
                      {ex.id}
                    </td>
                    <td className="py-3.5 px-6 text-slate-500">{formatDate(ex.startedAt)}</td>
                    <td className="py-3.5 px-6 text-slate-500">
                      {ex.durationMs !== undefined && ex.durationMs !== null ? `${ex.durationMs}ms` : "—"}
                    </td>
                    <td className="py-3.5 px-6 text-slate-600">{ex.totalSteps} steps</td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {ex.status === "FAILED" && (
                          <button
                            onClick={() => retryMutation.mutate(ex.id)}
                            disabled={retryMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-2xs"
                            title="Retry workflow execution"
                          >
                            <RotateCw className="h-3 w-3" />
                            <span>Retry</span>
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedExecutionId(ex.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          <span>Logs</span>
                          <ChevronRight className="h-3.5 w-3.5" />
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

      {/* Execution Diagnostics Drawer / Modal */}
      {selectedExecutionId && detailData?.execution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Execution Run Diagnostics
                  </h3>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      detailData.execution.status === "SUCCESS"
                        ? "bg-emerald-100 text-emerald-800"
                        : detailData.execution.status === "FAILED"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-800"
                    )}
                  >
                    {detailData.execution.status}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
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

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-2.5">
                <span className="text-slate-400 text-[10px]">Workflow</span>
                <p className="font-bold text-slate-800 truncate">{detailData.execution.workflow?.name}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <span className="text-slate-400 text-[10px]">Trigger</span>
                <p className="font-bold text-slate-800">{detailData.execution.triggerType || "WEBHOOK"}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <span className="text-slate-400 text-[10px]">Duration</span>
                <p className="font-bold text-slate-800">{detailData.execution.durationMs ? `${detailData.execution.durationMs}ms` : "—"}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <span className="text-slate-400 text-[10px]">Attempts</span>
                <p className="font-bold text-slate-800">{detailData.execution.attempt || 1} / {detailData.execution.maxAttempts || 3}</p>
              </div>
            </div>

            {/* Error Category summary if failed */}
            {detailData.execution.errorSummary && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                  <span>Error: {detailData.execution.errorCategory || "Execution Error"}</span>
                </div>
                <p className="font-mono text-[11px] leading-relaxed">
                  {detailData.execution.errorSummary}
                </p>
              </div>
            )}

            {/* Step Executions Logs */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Step Logs ({detailData.execution.steps?.length || 0})
                </h4>
                {detailData.execution.status === "FAILED" && (
                  <button
                    onClick={() => retryMutation.mutate(detailData.execution.id)}
                    disabled={retryMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 shadow-2xs disabled:opacity-50"
                  >
                    <RotateCw className="h-3 w-3" />
                    <span>Retry Run</span>
                  </button>
                )}
              </div>

              {detailData.execution.steps?.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                  No individual step records generated yet for this run.
                </div>
              ) : (
                <div className="space-y-2">
                  {detailData.execution.steps.map((st: any, idx: number) => (
                    <div
                      key={st.id || idx}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{st.nodeName || st.nodeId}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                            {st.nodeType}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "text-[10px] font-semibold",
                            st.status === "SUCCESS"
                              ? "text-emerald-600"
                              : st.status === "FAILED"
                              ? "text-rose-600"
                              : "text-amber-600"
                          )}
                        >
                          {st.status} ({st.durationMs !== undefined ? `${st.durationMs}ms` : "—"})
                        </span>
                      </div>

                      {st.errorMessage && (
                        <p className="mt-1 text-[11px] text-rose-600 font-mono">
                          {st.errorMessage}
                        </p>
                      )}

                      {st.output && (
                        <details className="mt-2 text-[10px]">
                          <summary className="cursor-pointer text-slate-500 hover:text-slate-800 font-medium">
                            Step Output JSON
                          </summary>
                          <pre className="mt-1 rounded bg-slate-900 p-2 font-mono text-[10px] text-slate-200 overflow-x-auto">
                            {JSON.stringify(st.output, null, 2)}
                          </pre>
                        </details>
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
