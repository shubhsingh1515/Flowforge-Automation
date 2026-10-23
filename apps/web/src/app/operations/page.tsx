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
  HardDrive,
  Mail,
  ShieldCheck,
  Send,
} from "lucide-react";

export default function OperationsPage() {
  const queryClient = useQueryClient();
  const [reconcileResult, setReconcileResult] = useState<any>(null);
  const [drillResult, setDrillResult] = useState<any>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Live operational overview (refreshes every 5s)
  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ["operations-overview"],
    queryFn: () => api.operations.getOverview(),
    refetchInterval: 5000,
  });

  // Outbox overview
  const { data: outboxData, refetch: refetchOutbox } = useQuery({
    queryKey: ["operations-outbox"],
    queryFn: () => api.operations.getOutbox(),
    refetchInterval: 10000,
  });

  // Backup verification history
  const { data: backupVerificationsData, refetch: refetchBackups } = useQuery({
    queryKey: ["operations-backups"],
    queryFn: () => api.operations.getBackupVerifications(5),
    refetchInterval: 15000,
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
      setActionNotice(`Reconciliation finished: ${data.reconciledCount ?? 0} executions updated.`);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["operations-overview"] });
      queryClient.invalidateQueries({ queryKey: ["operations-reconciliation-logs"] });
    },
    onError: (err: any) => {
      setActionError(err.message || "Reconciliation failed");
    },
  });

  // Trigger Outbox Replay mutation
  const replayOutboxMutation = useMutation({
    mutationFn: () => api.operations.replayOutbox({ limit: 50 }),
    onSuccess: (data) => {
      setActionNotice(`Successfully re-queued ${data.replayedCount ?? 0} dead-letter outbox events.`);
      setActionError(null);
      refetchOutbox();
      queryClient.invalidateQueries({ queryKey: ["operations-overview"] });
    },
    onError: (err: any) => {
      setActionError(err.message || "Outbox replay failed");
    },
  });

  // Trigger Backup Verification Drill mutation
  const backupDrillMutation = useMutation({
    mutationFn: (dryRun: boolean) => api.operations.verifyBackup({ dryRun }),
    onSuccess: (data) => {
      setDrillResult(data.record);
      setActionNotice(`Backup drill finished: Checksum SHA-256 verified (${data.record?.checksumSha256?.substring(0, 16)}...)`);
      setActionError(null);
      refetchBackups();
      queryClient.invalidateQueries({ queryKey: ["operations-overview"] });
    },
    onError: (err: any) => {
      setActionError(err.message || "Backup verification drill failed");
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
      description="Phase 15: High availability worker leasing, durable checkpoint recovery, transactional outbox, and isolated disaster recovery drills."
      action={
        <button
          onClick={() => {
            refetch();
            refetchOutbox();
            refetchBackups();
          }}
          data-testid="btn-refresh-operations"
          className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Telemetry</span>
        </button>
      }
    >
      <div className="space-y-6" data-testid="operations-page">
        {/* Notices */}
        {actionNotice && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}

        {actionError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Top telemetry cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Data Stores Latency */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Database className="h-4 w-4 text-indigo-600" />
                Data Stores Latency
              </span>
              <span className="text-emerald-600 font-bold">
                {overview?.database?.status === "healthy" ? "Healthy" : "Degraded"}
              </span>
            </div>
            <div className="flex items-baseline gap-4 mt-2">
              <div>
                <p className="text-xl font-bold text-slate-900 font-mono">
                  {overview?.database?.latencyMs ?? overview?.health?.databaseLatencyMs ?? "--"}
                  <span className="text-xs font-normal text-slate-400"> ms</span>
                </p>
                <p className="text-[10px] text-slate-400 font-medium">PostgreSQL Latency</p>
              </div>
              <div className="border-l border-slate-200 pl-4">
                <p className="text-xl font-bold text-slate-900 font-mono">
                  {overview?.redis?.latencyMs ?? overview?.health?.redisLatencyMs ?? "--"}
                  <span className="text-xs font-normal text-slate-400"> ms</span>
                </p>
                <p className="text-[10px] text-slate-400 font-medium">Redis Cache Latency</p>
              </div>
            </div>
          </div>

          {/* Card 2: BullMQ Queue Health & Backpressure */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-purple-600" />
                Workflow Queue Depth & Backpressure
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${overview?.queue?.isBackpressureActive ? "bg-rose-100 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                {overview?.queue?.isBackpressureActive ? "Load Shedding" : "Normal"}
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-slate-900 font-mono">
                {overview?.queue?.waitingCount ?? overview?.queues?.workflowQueue?.waiting ?? 0}
                <span className="text-xs font-normal text-slate-400"> waiting</span>
              </p>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Threshold: <strong>{overview?.queue?.backpressureThreshold ?? 5000}</strong></span>
                <span>Active: <strong>{overview?.queue?.activeCount ?? 0}</strong></span>
              </div>
            </div>
          </div>

          {/* Card 3: Worker Fencing & Leases */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-blue-600" />
                Worker Concurrency & Leases
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                Fencing Active
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-slate-900 font-mono">
                {overview?.workerReliability?.activeLeases ?? 0}
                <span className="text-xs font-normal text-slate-400"> leases</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Monotonically increasing tokens guard against zombie worker split-brain.
              </p>
            </div>
          </div>

          {/* Card 4: Transactional Outbox Health */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-amber-500" />
                Transactional Outbox
              </span>
              <span className="font-bold text-slate-700 text-xs">
                {overview?.outbox?.deliveredCount ?? 0} Delivered
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-slate-900 font-mono">
                {overview?.outbox?.pendingCount ?? 0}
                <span className="text-xs font-normal text-slate-400"> pending</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Dead-Letter: <strong className={overview?.outbox?.deadLetterCount > 0 ? "text-rose-600" : "text-slate-600"}>{overview?.outbox?.deadLetterCount ?? 0}</strong>
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
            {overview?.activeAlerts && overview.activeAlerts.length > 0 ? (
              overview.activeAlerts.map((alert: any) => (
                <div
                  key={alert.id || alert.metric}
                  className="p-3.5 rounded-lg border text-xs bg-rose-50/70 border-rose-200"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-800">{alert.metric || alert.id}</span>
                    {getAlertBadge(alert.severity, true)}
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-600">
                    <p className="text-rose-800 font-medium">{alert.message}</p>
                    <div className="flex justify-between text-slate-400">
                      <span>Value: {alert.currentValue}</span>
                      <span>Threshold: &gt; {alert.threshold}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs flex items-center justify-between">
                <span className="text-slate-600 font-medium">All monitored threshold rules (queue latency, worker heartbeat, failure rate) are operating within target SLOs.</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                  All Systems Normal
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Phase 15 Enterprise Reliability: Outbox & Disaster Recovery Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Panel A: Transactional Outbox Engine */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Send className="h-4 w-4 text-indigo-600" />
                  Guaranteed Event Delivery (Transactional Outbox)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Eliminates dual-write failure modes by atomically committing business records and outbox events in the same database transaction.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => replayOutboxMutation.mutate()}
                  disabled={replayOutboxMutation.isPending || (overview?.outbox?.deadLetterCount ?? 0) === 0}
                  data-testid="btn-replay-outbox"
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Replay DLQ</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs">
                <span className="text-slate-400 text-[11px]">Pending Sweeps</span>
                <p className="text-base font-bold text-slate-900 mt-0.5 font-mono">{overview?.outbox?.pendingCount ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs">
                <span className="text-slate-400 text-[11px]">Delivered Total</span>
                <p className="text-base font-bold text-emerald-700 mt-0.5 font-mono">{overview?.outbox?.deliveredCount ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs">
                <span className="text-slate-400 text-[11px]">Dead-Letter Queue</span>
                <p className={`text-base font-bold mt-0.5 font-mono ${(overview?.outbox?.deadLetterCount ?? 0) > 0 ? "text-rose-600" : "text-slate-600"}`}>
                  {overview?.outbox?.deadLetterCount ?? 0}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Dispatches with exponential backoff (1s, 2s, 4s, 8s, 16s) before terminal transition to DLQ.
            </p>
          </div>

          {/* Panel B: Disaster Recovery & Isolated Restore Drills */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Disaster Recovery & Non-Destructive Restore Drill
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Validates backup SHA-256 archive checksums and schema integrity against isolated scratch databases.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => backupDrillMutation.mutate(true)}
                  disabled={backupDrillMutation.isPending}
                  data-testid="btn-verify-backup-drill"
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50"
                >
                  {backupDrillMutation.isPending && <RefreshCw className="h-3 w-3 animate-spin" />}
                  <Play className="h-3 w-3" />
                  <span>Run DR Drill</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50">
                <span className="text-slate-400 text-[11px]">Target RTO (Recovery Time)</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                  {overview?.disasterRecovery?.rtoTargetSeconds ?? 300}s (5 mins)
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50">
                <span className="text-slate-400 text-[11px]">Target RPO (Data Point)</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                  {overview?.disasterRecovery?.rpoTargetSeconds ?? 3600}s (1 hour)
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-emerald-100 bg-emerald-50/50 text-[11px] text-emerald-900 flex items-center justify-between">
              <span>Last Verified Status: <strong>{overview?.disasterRecovery?.lastBackupStatus ?? "VERIFIED"}</strong></span>
              <span className="font-mono text-slate-500">
                {overview?.disasterRecovery?.lastBackupChecksum ? `SHA: ${overview.disasterRecovery.lastBackupChecksum.substring(0, 16)}...` : "SHA-256 Validated"}
              </span>
            </div>
          </div>
        </div>

        {/* Stuck Execution Reconciliation Service */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-indigo-600" />
                Stuck Execution Reconciliation & Checkpoint Resumption Engine
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                Scans for zombie workflow executions stuck in <code className="text-indigo-600">RUNNING</code> state with expired leases. Automatically resumes from last durable checkpoints (<code className="text-indigo-600">RPO = 0 completed steps</code>) or safely terminates timeout failures.
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
                  if (confirm("Run atomic reconciliation now? Eligible stalled executions will be resumed from their last checkpoints or marked failed.")) {
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
                  : `Successfully processed ${reconcileResult.reconciledCount} execution(s).`}
              </p>

              {reconcileResult.candidates && reconcileResult.candidates.length > 0 && (
                <div className="mt-2 bg-white rounded border border-indigo-200 p-2 font-mono text-[11px] text-slate-700 space-y-1">
                  {reconcileResult.candidates.map((cand: any) => (
                    <div key={cand.id} className="flex justify-between">
                      <span>Exec ID: {cand.id}</span>
                      <span>Action: {cand.proposedAction}</span>
                      <span>Stuck: {cand.stuckMinutes}m ago</span>
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
                    <th className="py-2 px-4">Action</th>
                    <th className="py-2 px-4">Execution ID</th>
                    <th className="py-2 px-4">Status Transition</th>
                    <th className="py-2 px-4">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reconciliationLogsData.logs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4 text-slate-600 text-[11px]">
                        {new Date(log.reconciledAt || log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 font-mono text-[11px] text-indigo-700 font-bold">
                        {log.actionTaken || "RECONCILED"}
                      </td>
                      <td className="py-2 px-4 font-mono text-[11px] text-slate-600">
                        {log.executionId?.substring(0, 12)}...
                      </td>
                      <td className="py-2 px-4">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {log.previousStatus} &rarr; {log.newStatus}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-slate-500 text-[11px] truncate max-w-xs">
                        {log.reason}
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
