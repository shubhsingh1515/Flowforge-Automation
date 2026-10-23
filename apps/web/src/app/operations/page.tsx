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
  Globe,
  Sparkles,
  TrendingUp,
  CheckCircle,
  XCircle,
  HelpCircle,
  Crosshair,
  Shield,
} from "lucide-react";

export default function OperationsPage() {
  const queryClient = useQueryClient();
  const [reconcileResult, setReconcileResult] = useState<any>(null);
  const [drillResult, setDrillResult] = useState<any>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);

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

  // Phase 16: Live Capacity & Predictive Drain-Time Analytics
  const { data: capacityData, refetch: refetchCapacity } = useQuery({
    queryKey: ["operations-capacity"],
    queryFn: () => api.operations.getCapacity(),
    refetchInterval: 5000,
  });

  // Phase 16: Regional Deployments
  const { data: regionsData, refetch: refetchRegions } = useQuery({
    queryKey: ["operations-regions"],
    queryFn: () => api.operations.getRegions(),
    refetchInterval: 10000,
  });

  // ==========================================
  // PHASE 18: OBSERVABILITY 2.0 & INCIDENTS
  // ==========================================

  // Unified Health Scorecard
  const { data: healthData, refetch: refetchHealth } = useQuery({
    queryKey: ["unified-health"],
    queryFn: () => api.observability.getUnifiedHealth(),
    refetchInterval: 5000,
  });

  // Active Incidents
  const { data: incidentsData, refetch: refetchIncidents } = useQuery({
    queryKey: ["operational-incidents"],
    queryFn: () => api.incidents.list(),
    refetchInterval: 5000,
  });

  // Remediation Policy
  const { data: remediationPolicyData, refetch: refetchRemediationPolicy } = useQuery({
    queryKey: ["remediation-policy"],
    queryFn: () => api.remediations.getPolicy(),
    refetchInterval: 10000,
  });

  // Remediation Operations
  const { data: remediationOpsData, refetch: refetchRemediationOps } = useQuery({
    queryKey: ["remediation-operations"],
    queryFn: () => api.remediations.listOperations(),
    refetchInterval: 5000,
  });

  // Predictive Capacity Warnings
  const { data: warningsData, refetch: refetchWarnings } = useQuery({
    queryKey: ["predictive-warnings"],
    queryFn: () => api.observability.getWarnings(),
    refetchInterval: 10000,
  });

  // Phase 18 Mutations
  const simulateIncidentMutation = useMutation({
    mutationFn: (title?: string) =>
      api.incidents.simulate({
        title: title || "Simulated Integration Spike & Latency Degradation",
        severity: "HIGH",
        category: "INTEGRATION_ERROR",
        sourceService: "MANUAL_SIMULATION",
      }),
    onSuccess: (res: any) => {
      setActionNotice(`Simulated incident reported: '${res.data?.title}' (ID: ${res.data?.id})`);
      setActionError(null);
      refetchIncidents();
      refetchHealth();
    },
    onError: (err: any) => setActionError(err.message || "Failed to simulate incident"),
  });

  const analyzeRcaMutation = useMutation({
    mutationFn: (incidentId: string) => api.incidents.analyzeRootCause(incidentId),
    onSuccess: (res: any) => {
      setSelectedIncident(res.data);
      setActionNotice(`Root Cause Analysis complete for '${res.data?.title}'. Suggested: ${res.data?.suggestedAction}`);
      setActionError(null);
      refetchIncidents();
    },
    onError: (err: any) => setActionError(err.message || "RCA failed"),
  });

  const updateIncidentStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.incidents.updateStatus(id, { status }),
    onSuccess: (res: any) => {
      setActionNotice(`Incident '${res.data?.title}' status transitioned to ${res.data?.status}`);
      setActionError(null);
      refetchIncidents();
      refetchHealth();
    },
    onError: (err: any) => setActionError(err.message || "Status transition failed"),
  });

  const updateAutonomyModeMutation = useMutation({
    mutationFn: (autonomyMode: string) =>
      api.remediations.updatePolicy({ autonomyMode }),
    onSuccess: (res: any) => {
      setActionNotice(`Self-healing autonomy mode updated to: ${res.data?.autonomyMode}`);
      setActionError(null);
      refetchRemediationPolicy();
    },
    onError: (err: any) => setActionError(err.message || "Failed to update autonomy mode"),
  });

  const approveRemediationMutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      api.remediations.approve(id, { approved, reason: approved ? "Approved in Operations UI" : "Rejected in Operations UI" }),
    onSuccess: (res: any) => {
      setActionNotice(`Remediation operation '${res.data?.actionKey}' decided: ${res.data?.status}`);
      setActionError(null);
      refetchRemediationOps();
      refetchIncidents();
      refetchHealth();
    },
    onError: (err: any) => setActionError(err.message || "Failed to decide remediation"),
  });

  const evaluatePredictiveMutation = useMutation({
    mutationFn: () => api.observability.evaluateWarnings({ regionKey: "us-east-1" }),
    onSuccess: (res: any) => {
      setActionNotice(`Predictive capacity signals evaluated. ${res.data?.length ?? 0} warning(s) active.`);
      setActionError(null);
      refetchWarnings();
      refetchHealth();
    },
    onError: (err: any) => setActionError(err.message || "Predictive evaluation failed"),
  });

  // Phase 16: Regional Failover Drill
  const failoverDrillMutation = useMutation({
    mutationFn: () => api.operations.runFailoverDrill({ sourceRegion: "us-east-1", targetRegion: "eu-central-1" }),
    onSuccess: (data: any) => {
      setActionNotice(`Regional Failover Drill completed: Advanced to epoch ${data.drill?.failoverEpoch ?? 2}. Fencing verified.`);
      setActionError(null);
      refetchCapacity();
      refetchRegions();
      queryClient.invalidateQueries({ queryKey: ["operations-overview"] });
    },
    onError: (err: any) => {
      setActionError(err.message || "Regional failover drill failed");
    },
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

  const unifiedHealth = healthData?.data;
  const activeIncidents = incidentsData?.data || [];
  const remediationPolicy = remediationPolicyData?.data;
  const remediationOperations = remediationOpsData?.data || [];
  const predictiveWarnings = warningsData?.data || [];

  return (
    <AppShell
      title="System Operations & Reliability"
      description="Phase 15: High availability worker leasing, durable checkpoint recovery, transactional outbox, and isolated disaster recovery drills."
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              refetch();
              refetchHealth();
              refetchIncidents();
              refetchRemediationOps();
              refetchWarnings();
              refetchOutbox();
              refetchBackups();
              refetchCapacity();
              refetchRegions();
            }}
            data-testid="btn-refresh-operations"
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh Telemetry</span>
          </button>
          <button
            onClick={() => simulateIncidentMutation.mutate("Integration 429 Throttle Spike")}
            disabled={simulateIncidentMutation.isPending}
            data-testid="btn-simulate-incident"
            className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span>Simulate Incident</span>
          </button>
        </div>
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

        {/* ======================================================== */}
        {/* PHASE 18: UNIFIED SERVICE HEALTH SCORECARD & TOPOLOGY    */}
        {/* ======================================================== */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4" data-testid="panel-unified-health">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-600" />
                Unified Service Health Topology
              </h2>
              <span
                data-testid="badge-overall-health"
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  unifiedHealth?.overallStatus === "HEALTHY"
                    ? "bg-emerald-100 text-emerald-800"
                    : unifiedHealth?.overallStatus === "DEGRADED"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {unifiedHealth?.overallStatus || "HEALTHY"}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
              <span>SLO Attainment: <strong className="text-emerald-700">{unifiedHealth?.sloAttainmentPct ?? 100}%</strong></span>
              <span>Active Incidents: <strong className={activeIncidents.length > 0 ? "text-rose-600 font-bold" : "text-slate-700"}>{activeIncidents.length}</strong></span>
              <span>Predictive Warnings: <strong className={predictiveWarnings.filter((w: any) => !w.isResolved).length > 0 ? "text-amber-600 font-bold" : "text-slate-700"}>{predictiveWarnings.filter((w: any) => !w.isResolved).length}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
            {/* 1. Workers */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-1.5" data-testid="health-subsystem-workers">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-blue-600" /> Workers
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${unifiedHealth?.services?.workers?.status === "HEALTHY" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {unifiedHealth?.services?.workers?.status || "HEALTHY"}
                </span>
              </div>
              <p className="text-lg font-bold font-mono text-slate-900">{unifiedHealth?.services?.workers?.activeWorkers ?? 1} <span className="text-xs font-normal text-slate-400">active</span></p>
              <p className="text-[10px] text-slate-500">Freshness: {unifiedHealth?.services?.workers?.heartbeatFreshnessSec ?? 5}s</p>
            </div>

            {/* 2. Queues */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-1.5" data-testid="health-subsystem-queues">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-purple-600" /> Queues
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${unifiedHealth?.services?.queues?.status === "HEALTHY" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {unifiedHealth?.services?.queues?.status || "HEALTHY"}
                </span>
              </div>
              <p className="text-lg font-bold font-mono text-slate-900">{unifiedHealth?.services?.queues?.depth ?? 0} <span className="text-xs font-normal text-slate-400">depth</span></p>
              <p className="text-[10px] text-slate-500">Drain Est: {unifiedHealth?.services?.queues?.projectedDrainTimeSec ?? 0}s</p>
            </div>

            {/* 3. Execution Engine */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-1.5" data-testid="health-subsystem-executions">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> Exec Engine
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${unifiedHealth?.services?.executionEngine?.status === "HEALTHY" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {unifiedHealth?.services?.executionEngine?.status || "HEALTHY"}
                </span>
              </div>
              <p className="text-lg font-bold font-mono text-slate-900">{unifiedHealth?.services?.executionEngine?.successRate24h ?? 100}% <span className="text-xs font-normal text-slate-400">24h</span></p>
              <p className="text-[10px] text-slate-500">P95: {unifiedHealth?.services?.executionEngine?.p95DurationMs ?? 250}ms</p>
            </div>

            {/* 4. Outbox */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-1.5" data-testid="health-subsystem-outbox">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-indigo-500" /> Outbox
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${unifiedHealth?.services?.outbox?.status === "HEALTHY" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {unifiedHealth?.services?.outbox?.status || "HEALTHY"}
                </span>
              </div>
              <p className="text-lg font-bold font-mono text-slate-900">{unifiedHealth?.services?.outbox?.pendingCount ?? 0} <span className="text-xs font-normal text-slate-400">pending</span></p>
              <p className="text-[10px] text-slate-500">Dead-letter: {unifiedHealth?.services?.outbox?.deadLetterCount ?? 0}</p>
            </div>

            {/* 5. Database */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-1.5" data-testid="health-subsystem-database">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-emerald-600" /> Database
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${unifiedHealth?.services?.database?.status === "HEALTHY" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {unifiedHealth?.services?.database?.status || "HEALTHY"}
                </span>
              </div>
              <p className="text-lg font-bold font-mono text-slate-900">PostgreSQL <span className="text-xs font-normal text-slate-400">active</span></p>
              <p className="text-[10px] text-slate-500">Pool Saturation: {unifiedHealth?.services?.database?.connectionSaturationPct ?? 25}%</p>
            </div>

            {/* 6. Regions */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-1.5" data-testid="health-subsystem-regions">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-cyan-600" /> Topology
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800">
                  EPOCH {unifiedHealth?.services?.regions?.activeFailoverEpoch ?? 1}
                </span>
              </div>
              <p className="text-sm font-bold font-mono text-slate-900 truncate">{unifiedHealth?.services?.regions?.authoritativeRegion ?? "us-east-1"}</p>
              <p className="text-[10px] text-slate-500">{unifiedHealth?.services?.regions?.multiRegionReady ? "Multi-Region Ready" : "Single Region"}</p>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* PHASE 18: OPERATIONAL INCIDENTS & ROOT CAUSE ASSISTANT   */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" data-testid="panel-incidents">
          {/* Incidents Table */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-600" />
                  Active Operational Incidents
                </h2>
                <p className="text-xs text-slate-500">Correlated SLO breaches, worker disruptions, and system degradation events.</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                {activeIncidents.length} Total
              </span>
            </div>

            {activeIncidents.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="font-medium text-slate-600">No active operational incidents.</p>
                <p>All SLO error budgets and subsystem health signals are within safe limits.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3">Title & Summary</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Created</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeIncidents.map((inc: any) => (
                      <tr key={inc.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inc.severity === "CRITICAL"
                                ? "bg-rose-100 text-rose-800"
                                : inc.severity === "HIGH"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {inc.severity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900">{inc.title}</p>
                          <p className="text-[11px] text-slate-500 truncate max-w-xs">{inc.rootCauseSummary || "Under observation"}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {inc.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                          {inc.category}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                          {new Date(inc.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => analyzeRcaMutation.mutate(inc.id)}
                            disabled={analyzeRcaMutation.isPending}
                            data-testid={`btn-rca-${inc.id}`}
                            className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold"
                          >
                            RCA
                          </button>
                          {inc.status === "OPEN" && (
                            <button
                              onClick={() => updateIncidentStatusMutation.mutate({ id: inc.id, status: "ACKNOWLEDGED" })}
                              className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold"
                            >
                              Ack
                            </button>
                          )}
                          {inc.status !== "RESOLVED" && inc.status !== "CLOSED" && (
                            <button
                              onClick={() => updateIncidentStatusMutation.mutate({ id: inc.id, status: "RESOLVED" })}
                              className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold"
                            >
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Root Cause Assistant Drawer */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4" data-testid="panel-rca-drawer">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                Evidence-Backed Root Cause
              </h2>
              <p className="text-xs text-slate-500">Autonomous diagnostic correlation across telemetry signals.</p>
            </div>

            {selectedIncident ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100 space-y-1">
                  <p className="font-bold text-indigo-900">{selectedIncident.title}</p>
                  <p className="text-[11px] text-indigo-700">{selectedIncident.rootCauseSummary}</p>
                </div>

                <div>
                  <p className="font-bold text-slate-700 mb-1.5">Candidate Hypotheses:</p>
                  {selectedIncident.candidateCauses && selectedIncident.candidateCauses.length > 0 ? (
                    <div className="space-y-2">
                      {selectedIncident.candidateCauses.map((c: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded border border-slate-200 bg-slate-50 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800">{c.hypothesis}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              {c.evidenceStrength} CONFIDENCE
                            </span>
                          </div>
                          {c.supportingEvidence && (
                            <ul className="list-disc pl-4 text-[10px] text-slate-500">
                              {c.supportingEvidence.map((ev: string, i: number) => (
                                <li key={i}>{ev}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-[11px]">No candidate causes analyzed yet.</p>
                  )}
                </div>

                {selectedIncident.suggestedAction && (
                  <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <CheckCircle className="h-4 w-4 text-emerald-600" /> Suggested Self-Healing Action:
                    </p>
                    <p className="font-mono font-bold text-xs">{selectedIncident.suggestedAction}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <Crosshair className="h-7 w-7 text-slate-300" />
                <p>Select &apos;RCA&apos; on any incident to inspect telemetry evidence and hypotheses.</p>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* PHASE 18: SAFE SELF-HEALING & REMEDIATION ENGINE         */}
        {/* ======================================================== */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4" data-testid="panel-remediation">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600" />
                Safe Self-Healing & Automated Remediation
              </h2>
              <p className="text-xs text-slate-500">Deterministic recovery operations with strict safety gates and approval policies.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">Autonomy Mode:</span>
              <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {(["OBSERVE_ONLY", "APPROVAL_REQUIRED", "POLICY_AUTOMATED"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateAutonomyModeMutation.mutate(mode)}
                    disabled={updateAutonomyModeMutation.isPending}
                    data-testid={`btn-autonomy-${mode}`}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                      remediationPolicy?.autonomyMode === mode
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {mode.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-xs">
              <p className="text-slate-500">Allowed Actions</p>
              <p className="font-bold text-slate-900 mt-1 font-mono text-[11px]">
                {remediationPolicy?.allowedActions?.join(", ") || "RETRY_RETRYABLE_EXECUTION, REPLAY_FAILED_OUTBOX_EVENT"}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-xs">
              <p className="text-slate-500">Max Auto-Actions / Incident</p>
              <p className="font-bold text-slate-900 mt-1 font-mono text-base">
                {remediationPolicy?.maxAutomatedActionsPerIncident ?? 3}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-xs">
              <p className="text-slate-500">Action Cooldown</p>
              <p className="font-bold text-slate-900 mt-1 font-mono text-base">
                {remediationPolicy?.cooldownMinutes ?? 15}m
              </p>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-xs">
              <p className="text-slate-500">Total Operations</p>
              <p className="font-bold text-slate-900 mt-1 font-mono text-base">
                {remediationOperations.length} recorded
              </p>
            </div>
          </div>

          {/* Operations History & Approvals Table */}
          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 text-xs font-bold text-slate-700 uppercase tracking-wider">
              Remediation Operations & Approval Queue
            </div>
            {remediationOperations.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No self-healing operations triggered yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                    <th className="py-2 px-4">Action</th>
                    <th className="py-2 px-4">Target Type & ID</th>
                    <th className="py-2 px-4">Risk</th>
                    <th className="py-2 px-4">Status</th>
                    <th className="py-2 px-4">Summary / Outcome</th>
                    <th className="py-2 px-4 text-right">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {remediationOperations.map((op: any) => (
                    <tr key={op.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4 font-mono font-bold text-indigo-700 text-[11px]">
                        {op.actionKey}
                      </td>
                      <td className="py-2 px-4 font-mono text-[11px] text-slate-600">
                        {op.targetType}: {op.targetId?.substring(0, 12)}...
                      </td>
                      <td className="py-2 px-4">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          op.riskLevel === "HIGH" ? "bg-rose-100 text-rose-800" : op.riskLevel === "MEDIUM" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                        }`}>
                          {op.riskLevel}
                        </span>
                      </td>
                      <td className="py-2 px-4">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          op.status === "VERIFIED" || op.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : op.status === "PENDING_APPROVAL"
                            ? "bg-amber-100 text-amber-800"
                            : op.status === "REJECTED"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-rose-100 text-rose-800"
                        }`}>
                          {op.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-slate-500 text-[11px] truncate max-w-xs">
                        {op.resultSummary || op.error || "--"}
                      </td>
                      <td className="py-2 px-4 text-right space-x-1.5">
                        {op.status === "PENDING_APPROVAL" && (
                          <>
                            <button
                              onClick={() => approveRemediationMutation.mutate({ id: op.id, approved: true })}
                              data-testid={`btn-approve-remediation-${op.id}`}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => approveRemediationMutation.mutate({ id: op.id, approved: false })}
                              data-testid={`btn-reject-remediation-${op.id}`}
                              className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* PHASE 18: PREDICTIVE CAPACITY & EARLY WARNING SIGNALS    */}
        {/* ======================================================== */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4" data-testid="panel-predictive-warnings">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
                Predictive Capacity & Early Warning Signals
              </h2>
              <p className="text-xs text-slate-500">Forecasting queue age spikes, drain-time deterioration, outbox backpressure, and worker saturation.</p>
            </div>
            <button
              onClick={() => evaluatePredictiveMutation.mutate()}
              disabled={evaluatePredictiveMutation.isPending}
              data-testid="btn-evaluate-predictive"
              className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Evaluate Trends Now</span>
            </button>
          </div>

          {predictiveWarnings.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>All queue drain times, worker leases, and outbox throughput trends are within baseline limits.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {predictiveWarnings.map((w: any) => (
                <div key={w.id} className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/40 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 font-mono text-[11px]">{w.signalType}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      {w.confidence} CONFIDENCE
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px] text-slate-600">
                    <span>Current: <strong className="font-mono text-slate-900">{w.currentValue}</strong></span>
                    <span>Threshold: <strong className="font-mono text-rose-700">{w.thresholdValue}</strong></span>
                    <span>Baseline: <strong className="font-mono text-slate-500">{w.baselineValue}</strong></span>
                  </div>
                  <p className="text-[11px] text-amber-800 border-t border-amber-100 pt-1.5">{w.recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* TOP TELEMETRY CARDS (PHASE 15 & 16)                     */}
        {/* ======================================================== */}
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

        {/* PHASE 16: ADVANCED CAPACITY MANAGEMENT & PREDICTIVE DRAIN TIME */}
        {(() => {
          const cap = capacityData?.capacity || capacityData;
          return (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4" data-testid="panel-capacity-management">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Server className="h-4 w-4 text-indigo-600" />
                    Capacity Management & Predictive Drain Time
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Real-time queue throughput, worker saturation, database connection budget, and drain-time projections.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 px-2 py-0.5 rounded bg-slate-50 border border-slate-200">
                  {cap?.deploymentTier || "Tier A (Horizontally Scalable Single-Region)"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs">
                  <span className="text-slate-400 text-[11px]">Worker Saturation</span>
                  <p className="text-base font-bold text-slate-900 mt-0.5 font-mono">
                    {cap?.workerCapacity?.workerSaturationPercent ?? 0}%
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {cap?.workerCapacity?.allocatedConcurrency ?? 0} / {cap?.workerCapacity?.totalCapacity ?? 5} slots
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs">
                  <span className="text-slate-400 text-[11px]">Projected Drain Time</span>
                  <p className="text-base font-bold text-indigo-700 mt-0.5 font-mono">
                    {cap?.queueMetrics?.projectedDrainTimeSec ?? 0}s
                  </p>
                  <span className="text-[10px] text-slate-500">
                    Drain rate: {cap?.queueMetrics?.completionRatePerSec ?? 0} jobs/sec
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs">
                  <span className="text-slate-400 text-[11px]">DB Connection Budget</span>
                  <p className="text-base font-bold text-slate-900 mt-0.5 font-mono">
                    {cap?.dbConnectionBudget?.poolSaturationPercent ?? 5}%
                  </p>
                  <span className="text-[10px] font-bold text-emerald-600">
                    {cap?.dbConnectionBudget?.status ?? "HEALTHY"} ({cap?.dbConnectionBudget?.activeConnections ?? 5}/{cap?.dbConnectionBudget?.maxConnections ?? 100})
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs">
                  <span className="text-slate-400 text-[11px]">Backpressure State</span>
                  <p className="text-base font-bold mt-0.5 font-mono text-emerald-700">
                    {cap?.backpressure?.status ?? "NORMAL"}
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {cap?.backpressure?.active ? `Retry-After: ${cap?.backpressure?.recommendedRetryAfterSec}s` : "No load shedding"}
                  </span>
                </div>
              </div>

              {/* Noisy Neighbor Tenant Diagnostic */}
              <div className="border border-slate-100 rounded-lg overflow-hidden mt-4">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Tenant Workload Fairness & Concurrency Allocation</span>
                  <span className="text-[10px] font-normal text-slate-500">Guarantees noisy tenants cannot starve normal workloads</span>
                </div>
                {cap?.noisyNeighbors && cap.noisyNeighbors.length > 0 ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                        <th className="py-2 px-4">Workspace</th>
                        <th className="py-2 px-4">Plan Tier</th>
                        <th className="py-2 px-4">Active Executions</th>
                        <th className="py-2 px-4">Concurrency Cap</th>
                        <th className="py-2 px-4">Saturation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cap.noisyNeighbors.map((tenant: any) => (
                        <tr key={tenant.workspaceId} className="hover:bg-slate-50/50">
                          <td className="py-2 px-4 font-medium text-slate-900">{tenant.workspaceName}</td>
                          <td className="py-2 px-4 font-mono text-[11px]">{tenant.planTier}</td>
                          <td className="py-2 px-4 font-mono font-bold text-slate-800">{tenant.activeExecutions}</td>
                          <td className="py-2 px-4 font-mono text-slate-600">{tenant.concurrencyLimit}</td>
                          <td className="py-2 px-4">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                              {Math.round(tenant.saturationRatio * 100)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No active execution hotspots detected. Workload fairness across tenants is optimal.
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* PHASE 16: REGIONAL DEPLOYMENTS & FAILOVER DRILL */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4" data-testid="panel-regional-readiness">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-600" />
                Regional Deployments & Split-Brain Safeguards
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative home-region placement, failover epochs, and non-destructive regional failover drills.
              </p>
            </div>

            <button
              onClick={() => failoverDrillMutation.mutate()}
              disabled={failoverDrillMutation.isPending}
              data-testid="btn-regional-failover-drill"
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{failoverDrillMutation.isPending ? "Executing Failover Drill..." : "Run Regional Failover Drill"}</span>
            </button>
          </div>

          <div className="border border-slate-100 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 text-xs font-bold text-slate-700 uppercase tracking-wider">
              Configured Regional Clusters
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                  <th className="py-2 px-4">Region Key</th>
                  <th className="py-2 px-4">Region Name</th>
                  <th className="py-2 px-4">Authoritative</th>
                  <th className="py-2 px-4">Status</th>
                  <th className="py-2 px-4">Current Epoch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(regionsData?.regions || [
                  { regionKey: "us-east-1", regionName: "US East (N. Virginia)", isAuthoritative: true, status: "HEALTHY", currentEpoch: 1 },
                  { regionKey: "eu-central-1", regionName: "Europe Central (Frankfurt)", isAuthoritative: false, status: "STANDBY", currentEpoch: 1 },
                  { regionKey: "ap-southeast-1", regionName: "Asia Pacific (Singapore)", isAuthoritative: false, status: "STANDBY", currentEpoch: 1 },
                ]).map((reg: any) => (
                  <tr key={reg.regionKey} className="hover:bg-slate-50/50">
                    <td className="py-2 px-4 font-mono font-medium text-slate-800">{reg.regionKey}</td>
                    <td className="py-2 px-4 text-slate-600">{reg.regionName}</td>
                    <td className="py-2 px-4">
                      {reg.isAuthoritative ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold">
                          Primary Authoritative
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                          Standby Region
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                        {reg.status}
                      </span>
                    </td>
                    <td className="py-2 px-4 font-mono text-[11px] text-slate-700">
                      Epoch {reg.currentEpoch ?? 1}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
