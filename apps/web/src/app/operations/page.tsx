"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Activity,
  Database,
  Layers,
  Cpu,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Play,
  RotateCcw,
  ShieldAlert,
  Server,
  Zap,
} from "lucide-react";

export default function OperationsPage() {
  const queryClient = useQueryClient();
  const [reconcileResult, setReconcileResult] = useState<any>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Live operational overview (refreshes every 5s)
  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ["operations-overview"],
    queryFn: () => api.operations.getOverview(),
    refetchInterval: 5000,
  });

  // Recent reconciliation logs
  const { data: reconciliationLogsData } = useQuery({
    queryKey: ["operations-reconciliation-logs"],
    queryFn: () => api.operations.getLogs({ limit: 10 }),
    refetchInterval: 10000,
  });

  // Trigger reconciliation mutation
  const reconcileMutation = useMutation({
    mutationFn: (dryRun: boolean) => api.operations.reconcile(dryRun),
    onSuccess: (data) => {
      setReconcileResult(data);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["operations-overview"] });
      queryClient.invalidateQueries({ queryKey: ["operations-reconciliation-logs"] });
    },
    onError: (err: any) => {
      setActionError(err.message || "Reconciliation failed");
    },
  });

  const getAlertBadge = (severity: string, triggered: boolean) => {
    if (!triggered) {
      return (
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
          Healthy
        </span>
      );
    }
    if (severity === "CRITICAL") {
      return (
        <span className="px-2 py-0.5 rounded-full bg-rose-100 border border-rose-200 text-rose-800 text-[10px] font-bold animate-pulse">
          Critical Alert
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold">
        Warning
      </span>
    );
  };

  return (
    <AppShell
      title="System Operations & Reliability"
      description="Live engine telemetry, queue depth, health metrics, and automated stuck execution reconciliation."
      action={
        <button
          onClick={() => refetch()}
          data-testid="btn-refresh-operations"
          className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Telemetry</span>
        </button>
      }
    >
      <div className="space-y-6" data-testid="operations-page">
        {/* Error notice */}
        {actionError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Top telemetry cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Engine Latency */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Database className="h-4 w-4 text-indigo-600" />
                Data Stores Latency
              </span>
              <span className="text-emerald-600 font-bold">Healthy</span>
            </div>
            <div className="flex items-baseline gap-4 mt-2">
              <div>
                <p className="text-xl font-bold text-slate-900 font-mono">
                  {overview?.health?.databaseLatencyMs ?? "--"}
                  <span className="text-xs font-normal text-slate-400"> ms</span>
                </p>
                <p className="text-[10px] text-slate-400 font-medium">PostgreSQL Latency</p>
              </div>
              <div className="border-l border-slate-200 pl-4">
                <p className="text-xl font-bold text-slate-900 font-mono">
                  {overview?.health?.redisLatencyMs ?? "--"}
                  <span className="text-xs font-normal text-slate-400"> ms</span>
                </p>
                <p className="text-[10px] text-slate-400 font-medium">Redis Cache Latency</p>
              </div>
            </div>
          </div>

          {/* Card 2: BullMQ Queue Health */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-purple-600" />
                Workflow Queue Depth
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                {overview?.queues?.workflowQueue?.active ?? 0} active
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-slate-900 font-mono">
                {overview?.queues?.workflowQueue?.waiting ?? 0}
                <span className="text-xs font-normal text-slate-400"> waiting</span>
              </p>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3 text-slate-400" />
                <span>Oldest job age: <strong>{overview?.queues?.workflowQueue?.oldestJobAgeSeconds ?? 0}s</strong></span>
              </div>
            </div>
          </div>

          {/* Card 3: Worker Concurrency & Isolation */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-blue-600" />
                Worker Concurrency
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Limit: {overview?.concurrency?.configuredWorkerConcurrency ?? 5} / instance
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-slate-900 font-mono">
                {overview?.concurrency?.activeExecutions ?? 0}
                <span className="text-xs font-normal text-slate-400"> / {overview?.concurrency?.configuredWorkerConcurrency ?? 5}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Workspace limit: {overview?.concurrency?.workspaceConcurrencyLimit ?? 5} slots max
              </p>
            </div>
          </div>

          {/* Card 4: Throughput & Success Rate */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-500" />
                Last 1h Executions
              </span>
              <span className="font-bold text-slate-700">
                {overview?.metrics?.successRatePercent ?? 100}% Success
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-slate-900 font-mono">
                {overview?.metrics?.totalExecutionsLastHour ?? 0}
                <span className="text-xs font-normal text-slate-400"> runs</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {overview?.metrics?.completedLastHour ?? 0} ok • {overview?.metrics?.failedLastHour ?? 0} failed
              </p>
            </div>
          </div>
        </div>

        {/* Live Operational Alerts */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-indigo-600" />
                Threshold Alert Monitors
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Dynamic anomaly detection evaluating queue latency, failure ratios, and engine health.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Evaluated every 30s
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {overview?.alerts && overview.alerts.map((alert: any) => (
              <div
                key={alert.ruleId}
                className={`p-3.5 rounded-lg border text-xs transition ${
                  alert.triggered
                    ? alert.severity === "CRITICAL"
                      ? "bg-rose-50/70 border-rose-200"
                      : "bg-amber-50/70 border-amber-200"
                    : "bg-slate-50/50 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-800">{alert.name}</span>
                  {getAlertBadge(alert.severity, alert.triggered)}
                </div>
                <div className="space-y-1 text-[11px] text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current Value:</span>
                    <span className="font-mono font-bold text-slate-800">{alert.currentValue}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Threshold:</span>
                    <span className="font-mono text-slate-500">&gt; {alert.threshold}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stuck Execution Reconciliation Service */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-indigo-600" />
                Stuck Execution Reconciliation Engine
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                Scans for zombie workflow executions stuck in <code className="text-indigo-600">RUNNING</code> state (exceeding 15-minute threshold due to worker node termination, network partitioning, or unhandled process crashes). Safely marks them as <code className="text-rose-600">FAILED</code> with reason <code className="text-rose-600">WORKER_TIMEOUT</code> and releases concurrency slots.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => reconcileMutation.mutate(true)}
                disabled={reconcileMutation.isPending}
                data-testid="btn-reconcile-dry-run"
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {reconcileMutation.isPending && <RefreshCw className="h-3 w-3 animate-spin" />}
                <span>Scan Dry-Run</span>
              </button>

              <button
                onClick={() => {
                  if (confirm("Run atomic reconciliation now? Any orphaned executions stuck for >15 minutes will be transitioned to FAILED and concurrency slots released.")) {
                    reconcileMutation.mutate(false);
                  }
                }}
                disabled={reconcileMutation.isPending}
                data-testid="btn-reconcile-execute"
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50"
              >
                {reconcileMutation.isPending && <RefreshCw className="h-3 w-3 animate-spin" />}
                <Play className="h-3 w-3" />
                <span>Reconcile Now</span>
              </button>
            </div>
          </div>

          {/* Reconciliation Result Box */}
          {reconcileResult && (
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-indigo-900">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                  <span>
                    Reconciliation Complete: {reconcileResult.dryRun ? "(Dry Run - No Changes Applied)" : "(Executed Successfully)"}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-indigo-700">
                  Duration: {reconcileResult.durationMs}ms
                </span>
              </div>
              <p className="text-indigo-800 text-[11px]">
                Found <strong>{reconcileResult.stuckCount}</strong> stuck execution(s).{" "}
                {reconcileResult.dryRun
                  ? "Identified for reconciliation without state mutations."
                  : `Successfully updated ${reconcileResult.reconciledCount} execution(s) to FAILED.`}
              </p>

              {reconcileResult.candidates && reconcileResult.candidates.length > 0 && (
                <div className="mt-2 bg-white rounded border border-indigo-200 p-2 font-mono text-[11px] text-slate-700 space-y-1">
                  {reconcileResult.candidates.map((cand: any) => (
                    <div key={cand.id} className="flex justify-between">
                      <span>Exec ID: {cand.id}</span>
                      <span>Stuck since: {new Date(cand.startedAt).toLocaleTimeString()} ({cand.stuckMinutes}m ago)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recent Reconciliation Audit Table */}
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 text-xs font-bold text-slate-700 uppercase tracking-wider">
              Recent Reconciliation Runs
            </div>
            {reconciliationLogsData?.logs && reconciliationLogsData.logs.length > 0 ? (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                    <th className="py-2 px-4">Timestamp</th>
                    <th className="py-2 px-4">Trigger</th>
                    <th className="py-2 px-4">Mode</th>
                    <th className="py-2 px-4">Stuck Found</th>
                    <th className="py-2 px-4">Reconciled</th>
                    <th className="py-2 px-4 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reconciliationLogsData.logs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4 text-slate-600 text-[11px]">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 font-mono text-[11px] text-slate-700">
                        {log.triggerSource}
                      </td>
                      <td className="py-2 px-4">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.dryRun
                              ? "bg-slate-100 text-slate-600"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {log.dryRun ? "DRY-RUN" : "LIVE"}
                        </span>
                      </td>
                      <td className="py-2 px-4 font-bold text-slate-800">{log.stuckFound}</td>
                      <td className="py-2 px-4 font-bold text-slate-800">{log.reconciledCount}</td>
                      <td className="py-2 px-4 text-right text-slate-500 font-mono text-[11px]">
                        {log.durationMs}ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-4 text-center text-xs text-slate-400">
                No reconciliation cycles recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
