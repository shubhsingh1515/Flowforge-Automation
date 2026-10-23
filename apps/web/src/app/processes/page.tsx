"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Layers,
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle2,
  GitCommit,
  ArrowRight,
  ShieldAlert,
  Filter,
  Plus,
  Sparkles,
  Cpu,
  BarChart2,
  XCircle,
  RotateCw,
  ChevronRight,
  TrendingUp,
  FileText,
  Workflow,
  Search,
} from "lucide-react";

export default function BusinessProcessesPage() {
  const queryClient = useQueryClient();

  const [selectedDomain, setSelectedDomain] = useState<string>("ALL");
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"MINING" | "INSTANCES" | "TOPOLOGY" | "SLA">("MINING");
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDomain, setFormDomain] = useState("OPERATIONS");
  const [formCriticality, setFormCriticality] = useState("HIGH");
  const [formSlaTargetMs, setFormSlaTargetMs] = useState(300000);
  const [formMilestone1, setFormMilestone1] = useState("Order Placed");
  const [formMilestone2, setFormMilestone2] = useState("Payment Fulfilled");
  const [formWorkflowId1, setFormWorkflowId1] = useState("");
  const [formWorkflowId2, setFormWorkflowId2] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Fetch workflows for mapping in process definition
  const { data: workflowsData } = useQuery({
    queryKey: ["workflows-list"],
    queryFn: () => api.workflows.list({ limit: 50 }),
  });
  const workflows = (workflowsData as any)?.data || (workflowsData as any)?.workflows || [];

  // Fetch Business Processes
  const { data: processesData, isLoading: processesLoading, refetch: refetchProcesses } = useQuery({
    queryKey: ["processes-list", selectedDomain],
    queryFn: () =>
      api.processes.listDefinitions(
        selectedDomain !== "ALL" ? { businessDomain: selectedDomain } : undefined
      ),
  });

  const processes = processesData?.data || [];
  const activeProcess = processes.find((p: any) => p.id === selectedProcessId) || processes[0] || null;
  const currentProcessId = activeProcess?.id;

  // Fetch Process Mining Analysis
  const { data: miningData, isLoading: miningLoading } = useQuery({
    queryKey: ["process-mining", currentProcessId],
    queryFn: () => api.processes.mine(currentProcessId),
    enabled: Boolean(currentProcessId),
  });
  const miningResult = miningData?.data;

  // Fetch Process Metrics
  const { data: metricsData } = useQuery({
    queryKey: ["process-metrics", currentProcessId],
    queryFn: () => api.processes.getMetrics(currentProcessId),
    enabled: Boolean(currentProcessId),
  });
  const metrics = metricsData?.data;

  // Fetch Instances
  const { data: instancesData, refetch: refetchInstances } = useQuery({
    queryKey: ["process-instances", currentProcessId],
    queryFn: () => api.processes.listInstances(currentProcessId, { limit: 20 }),
    enabled: Boolean(currentProcessId),
  });
  const instances = instancesData?.data?.items || [];

  // Fetch Selected Instance Detail
  const { data: selectedInstanceData } = useQuery({
    queryKey: ["process-instance-detail", selectedInstanceId],
    queryFn: () => api.processes.getInstance(selectedInstanceId!),
    enabled: Boolean(selectedInstanceId),
  });
  const currentInstance = selectedInstanceData?.data;

  // Create Process Mutation
  const createProcessMutation = useMutation({
    mutationFn: async () => {
      if (!formWorkflowId1) {
        throw new Error("Please select a workflow for Milestone 1.");
      }
      return api.processes.createDefinition({
        name: formName,
        slug: formSlug.toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
        businessDomain: formDomain,
        criticality: formCriticality,
        targetSlaDurationMs: Number(formSlaTargetMs),
        milestones: [
          {
            id: "m1",
            name: formMilestone1,
            workflowId: formWorkflowId1,
            order: 1,
            isEntry: true,
          },
          {
            id: "m2",
            name: formMilestone2,
            workflowId: formWorkflowId2 || formWorkflowId1,
            order: 2,
            isTerminal: true,
          },
        ],
        correlationRules: [
          {
            milestoneId: "m1",
            correlationField: "orderId",
            sourceType: "TRIGGER",
          },
        ],
      });
    },
    onSuccess: (res) => {
      setActionSuccess("Business process definition created successfully!");
      setCreateModalOpen(false);
      refetchProcesses();
      if (res?.data?.id) setSelectedProcessId(res.data.id);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to create business process definition.");
    },
  });

  // Ingest Event Simulation Mutation
  const triggerEventMutation = useMutation({
    mutationFn: async (payload: { milestoneId: string; eventType: string; correlationKey: string }) => {
      return api.processes.ingestEvent({
        processDefinitionId: currentProcessId,
        correlationKey: payload.correlationKey,
        milestoneId: payload.milestoneId,
        eventType: payload.eventType,
        durationMs: 1250,
      });
    },
    onSuccess: () => {
      setActionSuccess("Correlated event ingested successfully.");
      refetchInstances();
      queryClient.invalidateQueries({ queryKey: ["process-mining", currentProcessId] });
      queryClient.invalidateQueries({ queryKey: ["process-metrics", currentProcessId] });
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to ingest event.");
    },
  });

  return (
    <AppShell
      title="Business Process Intelligence"
      description="Cross-workflow orchestration, end-to-end SLA tracking, process mining, and automated bottleneck optimization."
      action={
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetchProcesses()}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RotateCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            data-testid="btn-new-process"
            onClick={() => {
              setActionError(null);
              setActionSuccess(null);
              setCreateModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-[#6558E8] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#5345D8] transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New Process Definition
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Notice Alerts */}
        {actionSuccess && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {actionError && (
          <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="text-rose-600 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Domain Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Filter className="h-3.5 w-3.5" /> Domain:
          </span>
          {["ALL", "OPERATIONS", "FINANCE", "SALES", "CUSTOMER_SUCCESS", "ENGINEERING", "HR", "SECURITY"].map(
            (domain) => (
              <button
                key={domain}
                onClick={() => setSelectedDomain(domain)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  selectedDomain === domain
                    ? "bg-[#6558E8] text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {domain}
              </button>
            )
          )}
        </div>

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Left Column: Process List */}
          <div className="space-y-3 lg:col-span-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Business Processes ({processes.length})</h3>
            </div>

            {processesLoading ? (
              <div className="p-8 text-center text-sm text-slate-400">Loading definitions...</div>
            ) : processes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                <Layers className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-600">No process definitions found</p>
                <p className="text-xs text-slate-400">Create one to start tracking cross-workflow outcomes.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {processes.map((proc: any) => {
                  const isSelected = proc.id === currentProcessId;
                  return (
                    <div
                      key={proc.id}
                      onClick={() => {
                        setSelectedProcessId(proc.id);
                        setSelectedInstanceId(null);
                      }}
                      className={`cursor-pointer rounded-xl border p-4 transition-all ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-600"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-slate-900">{proc.name}</h4>
                          <span className="text-xs font-mono text-slate-400">/{proc.slug}</span>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            proc.criticality === "MISSION_CRITICAL"
                              ? "bg-rose-100 text-rose-700"
                              : proc.criticality === "HIGH"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {proc.criticality}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />
                          v{proc.activeVersionNumber || 1}
                        </span>
                        <span>{proc.instanceCount || 0} instances</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Process Intelligence Console */}
          <div className="space-y-6 lg:col-span-3">
            {activeProcess ? (
              <>
                {/* Active Process Header Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-slate-900">{activeProcess.name}</h2>
                        <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                          {activeProcess.businessDomain}
                        </span>
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          {activeProcess.lifecycleStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {activeProcess.description || "End-to-end multi-workflow business process."}
                      </p>
                    </div>

                    {/* Quick Sim Event Dispatch */}
                    <div className="flex items-center gap-2">
                      <button
                        data-testid="btn-trigger-instance"
                        onClick={() =>
                          triggerEventMutation.mutate({
                            milestoneId: activeProcess.activeVersion?.milestones?.[0]?.id || "m1",
                            eventType: "MILESTONE_STARTED",
                            correlationKey: `sim_${Date.now()}`,
                          })
                        }
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                        Trigger New Instance
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Counters */}
                  <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
                    <div>
                      <span className="text-xs text-slate-400">Total Instances</span>
                      <p className="text-lg font-bold text-slate-900">{metrics?.totalInstances || 0}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Completion Rate</span>
                      <p className="text-lg font-bold text-emerald-600">
                        {metrics?.completionRate !== undefined ? `${metrics.completionRate}%` : "100%"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Median Duration</span>
                      <p className="text-lg font-bold text-slate-900">
                        {metrics?.medianDurationMs ? `${(metrics.medianDurationMs / 1000).toFixed(1)}s` : "<1s"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Deadline Attainment</span>
                      <p className="text-lg font-bold text-indigo-600">
                        {metrics?.deadlineAttainmentRate !== undefined
                          ? `${metrics.deadlineAttainmentRate}%`
                          : "100%"}
                      </p>
                    </div>
                  </div>

                  {/* Tab Navigation */}
                  <div className="mt-6 flex border-b border-slate-200 text-sm">
                    <button
                      data-testid="tab-mining"
                      onClick={() => setActiveTab("MINING")}
                      className={`border-b-2 px-4 py-2 font-medium transition-colors ${
                        activeTab === "MINING"
                          ? "border-indigo-600 text-indigo-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Process Mining & Bottlenecks
                    </button>
                    <button
                      data-testid="tab-instances"
                      onClick={() => setActiveTab("INSTANCES")}
                      className={`border-b-2 px-4 py-2 font-medium transition-colors ${
                        activeTab === "INSTANCES"
                          ? "border-indigo-600 text-indigo-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Instances & Timelines ({instances.length})
                    </button>
                    <button
                      data-testid="tab-topology"
                      onClick={() => setActiveTab("TOPOLOGY")}
                      className={`border-b-2 px-4 py-2 font-medium transition-colors ${
                        activeTab === "TOPOLOGY"
                          ? "border-indigo-600 text-indigo-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Milestones & Versioning
                    </button>
                    <button
                      data-testid="tab-sla"
                      onClick={() => setActiveTab("SLA")}
                      className={`border-b-2 px-4 py-2 font-medium transition-colors ${
                        activeTab === "SLA"
                          ? "border-indigo-600 text-indigo-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      End-to-End SLA Policy
                    </button>
                  </div>
                </div>

                {/* TAB 1: PROCESS MINING & DISCOVERY */}
                {activeTab === "MINING" && (
                  <div className="space-y-6">
                    {/* Data Sufficiency Alert */}
                    {miningResult?.dataSufficiency === "INSUFFICIENT_DATA" ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-6 w-6 text-amber-600" />
                          <div>
                            <h4 className="font-semibold text-amber-900">
                              Data Sufficiency Standard: INSUFFICIENT_DATA
                            </h4>
                            <p className="mt-1 text-xs text-amber-700">
                              FlowForge requires at least 3 completed process instances to discover observed transition
                              paths and reliably detect bottlenecks without hallucinating patterns. Examined:{" "}
                              {miningResult.instancesExamined} instances.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Observed Paths Discovery */}
                        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-slate-900">
                              Observed Process Paths ({miningResult?.observedPaths?.length || 0})
                            </h3>
                            <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              SUFFICIENT DATA
                            </span>
                          </div>

                          <div className="mt-4 divide-y divide-slate-100">
                            {miningResult?.observedPaths?.map((path: any, idx: number) => (
                              <div key={idx} className="py-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {path.path.map((milestoneName: string, mIdx: number) => (
                                      <React.Fragment key={mIdx}>
                                        <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                                          {milestoneName}
                                        </span>
                                        {mIdx < path.path.length - 1 && (
                                          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                                        )}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-4 text-xs">
                                    <span className="font-semibold text-slate-700">
                                      {path.frequency} runs ({path.percentage}%)
                                    </span>
                                    <span className="text-slate-500">
                                      Avg: {(path.averageDurationMs / 1000).toFixed(1)}s
                                    </span>
                                    {path.reworkRate > 0 && (
                                      <span className="rounded bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
                                        {(path.reworkRate * 100).toFixed(0)}% rework
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Milestone Latency & Rework Breakdown */}
                        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                          <h3 className="font-semibold text-slate-900">Milestone Performance & Stage Waiting</h3>
                          <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-400">
                                  <th className="pb-2 font-medium">Milestone</th>
                                  <th className="pb-2 font-medium">Executions</th>
                                  <th className="pb-2 font-medium">Median</th>
                                  <th className="pb-2 font-medium">P95</th>
                                  <th className="pb-2 font-medium">Approval Wait</th>
                                  <th className="pb-2 font-medium">Reworks</th>
                                  <th className="pb-2 font-medium">Failure Rate</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {miningResult?.milestoneStats?.map((m: any) => (
                                  <tr key={m.milestoneId} className="hover:bg-slate-50">
                                    <td className="py-3 font-semibold text-slate-800">{m.name}</td>
                                    <td className="py-3 text-slate-600">{m.visitCount}</td>
                                    <td className="py-3 text-slate-600">{(m.medianDurationMs / 1000).toFixed(1)}s</td>
                                    <td className="py-3 text-slate-600">{(m.p95DurationMs / 1000).toFixed(1)}s</td>
                                    <td className="py-3">
                                      {m.waitingForApprovalMs > 0 ? (
                                        <span className="font-semibold text-amber-600">
                                          {(m.waitingForApprovalMs / 1000).toFixed(1)}s
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">0s</span>
                                      )}
                                    </td>
                                    <td className="py-3">
                                      {m.reworkCount > 0 ? (
                                        <span className="font-semibold text-rose-600">{m.reworkCount}</span>
                                      ) : (
                                        <span className="text-slate-400">0</span>
                                      )}
                                    </td>
                                    <td className="py-3">
                                      {m.failureRate > 0 ? (
                                        <span className="text-rose-600">{(m.failureRate * 100).toFixed(1)}%</span>
                                      ) : (
                                        <span className="text-emerald-600">0.0%</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Evidence-Backed Bottleneck Recommendations */}
                        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-indigo-600" />
                            <h3 className="font-semibold text-slate-900">Evidence-Backed Bottleneck Recommendations</h3>
                          </div>

                          <div className="mt-4 space-y-4">
                            {miningResult?.recommendations?.length === 0 ? (
                              <p className="text-xs text-slate-500">
                                No critical bottlenecks detected across current sample. Process flow is operating
                                within expected tolerances.
                              </p>
                            ) : (
                              miningResult?.recommendations?.map((rec: any) => (
                                <div key={rec.id} className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-4">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <h4 className="text-sm font-semibold text-indigo-950">{rec.title}</h4>
                                      <p className="mt-1 text-xs text-slate-600">{rec.evidence}</p>
                                    </div>
                                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                      {(rec.confidence * 100).toFixed(0)}% Confidence
                                    </span>
                                  </div>

                                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                                    <div className="rounded bg-white p-2.5 border border-slate-100">
                                      <span className="font-semibold text-slate-700">Proposed Action:</span>
                                      <p className="text-slate-600 mt-0.5">{rec.proposedAction}</p>
                                    </div>
                                    <div className="rounded bg-white p-2.5 border border-slate-100">
                                      <span className="font-semibold text-slate-700">Expected Benefit:</span>
                                      <p className="text-slate-600 mt-0.5">{rec.expectedBenefit}</p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* TAB 2: INSTANCES & TIMELINES */}
                {activeTab === "INSTANCES" && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="font-semibold text-slate-900">Correlated Process Instances</h3>

                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-400">
                              <th className="pb-2 font-medium">Correlation Key</th>
                              <th className="pb-2 font-medium">Status</th>
                              <th className="pb-2 font-medium">Current Milestone</th>
                              <th className="pb-2 font-medium">Started At</th>
                              <th className="pb-2 font-medium">Duration</th>
                              <th className="pb-2 font-medium">Outcome</th>
                              <th className="pb-2 font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {instances.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="py-6 text-center text-slate-400">
                                  No instances found. Trigger a new instance above to simulate cross-workflow tracking.
                                </td>
                              </tr>
                            ) : (
                              instances.map((inst: any) => (
                                <tr key={inst.id} className="hover:bg-slate-50">
                                  <td className="py-3 font-mono font-medium text-slate-900">{inst.correlationKey}</td>
                                  <td className="py-3">
                                    <span
                                      className={`rounded px-2 py-0.5 font-semibold ${
                                        inst.status === "COMPLETED"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : inst.status === "AT_RISK"
                                          ? "bg-rose-100 text-rose-700"
                                          : inst.status === "WAITING"
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-blue-100 text-blue-700"
                                      }`}
                                    >
                                      {inst.status}
                                    </span>
                                  </td>
                                  <td className="py-3 text-slate-700">{inst.currentMilestoneName || "-"}</td>
                                  <td className="py-3 text-slate-500">
                                    {new Date(inst.startedAt).toLocaleTimeString()}
                                  </td>
                                  <td className="py-3 text-slate-700">
                                    {inst.durationMs ? `${(inst.durationMs / 1000).toFixed(1)}s` : "Running..."}
                                  </td>
                                  <td className="py-3">
                                    {inst.terminalOutcome ? (
                                      <span className="font-semibold text-slate-800">{inst.terminalOutcome}</span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="py-3">
                                    <button
                                      onClick={() => setSelectedInstanceId(inst.id)}
                                      className="text-xs font-semibold text-indigo-600 hover:underline"
                                    >
                                      View Timeline
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Instance Timeline Drawer/Card if selected */}
                    {currentInstance && (
                      <div className="rounded-xl border border-indigo-200 bg-white p-6 shadow-md">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <div>
                            <h4 className="font-bold text-slate-900">
                              Instance Timeline: {currentInstance.correlationKey}
                            </h4>
                            <span className="text-xs text-slate-400">Instance ID: {currentInstance.id}</span>
                          </div>
                          <button
                            onClick={() => setSelectedInstanceId(null)}
                            className="text-xs font-medium text-slate-500 hover:underline"
                          >
                            Close
                          </button>
                        </div>

                        <div className="mt-4 space-y-3">
                          {currentInstance.events?.map((evt: any, i: number) => (
                            <div key={evt.id} className="flex items-start gap-3 text-xs">
                              <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                                <GitCommit className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-slate-800">
                                    {evt.milestoneName} - {evt.eventType}
                                  </span>
                                  <span className="text-slate-400">
                                    {new Date(evt.createdAt).toLocaleTimeString()}
                                  </span>
                                </div>
                                <span className="font-mono text-[10px] text-slate-400">
                                  Idempotency: {evt.idempotencyKey}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: TOPOLOGY & VERSIONING */}
                {activeTab === "TOPOLOGY" && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900">
                          Active Version Topology (v{activeProcess.activeVersionNumber || 1})
                        </h3>
                        <span className="font-mono text-xs text-slate-400">
                          Content Hash: {activeProcess.contentHash?.substring(0, 16)}...
                        </span>
                      </div>

                      <div className="mt-6 space-y-4">
                        {(activeProcess.activeVersion?.milestones || []).map((m: any, idx: number) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                                {m.order}
                              </span>
                              <div>
                                <h4 className="font-semibold text-slate-900">{m.name}</h4>
                                <span className="text-xs text-slate-400">Workflow ID: {m.workflowId}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {m.isEntry && (
                                <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                  Entry
                                </span>
                              )}
                              {m.isTerminal && (
                                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                  Terminal
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: SLA POLICY */}
                {activeTab === "SLA" && (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="font-semibold text-slate-900">Process SLA & Deadline Attainment</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      FlowForge continuously evaluates elapsed process instance durations against operational SLAs and
                      creates deduplicated high-priority incidents when breached.
                    </p>

                    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 p-4">
                        <span className="text-xs text-slate-400">Target Duration</span>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {activeProcess.slaPolicy?.targetDurationMs
                            ? `${(activeProcess.slaPolicy.targetDurationMs / 1000).toFixed(0)}s`
                            : "300s"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4">
                        <span className="text-xs text-slate-400">Warning Threshold</span>
                        <p className="mt-1 text-xl font-bold text-amber-600">
                          {activeProcess.slaPolicy?.warningThresholdMs
                            ? `${(activeProcess.slaPolicy.warningThresholdMs / 1000).toFixed(0)}s`
                            : "240s"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4">
                        <span className="text-xs text-slate-400">Incident Cooldown</span>
                        <p className="mt-1 text-xl font-bold text-slate-900">15 min</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* CREATE PROCESS MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Create Business Process Definition</h3>
            <p className="text-xs text-slate-500">
              Compose cross-workflow milestones with correlation keys and SLA policies.
            </p>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Process Name</label>
                <input
                  data-testid="modal-process-name"
                  type="text"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (!formSlug) setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "-"));
                  }}
                  placeholder="e.g. Order To Cash"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">URL Slug</label>
                <input
                  data-testid="modal-process-slug"
                  type="text"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  placeholder="e.g. order-to-cash"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700">Domain</label>
                  <select
                    value={formDomain}
                    onChange={(e) => setFormDomain(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                  >
                    {["OPERATIONS", "FINANCE", "SALES", "CUSTOMER_SUCCESS", "ENGINEERING", "HR", "SECURITY"].map(
                      (d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Criticality</label>
                  <select
                    value={formCriticality}
                    onChange={(e) => setFormCriticality(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                  >
                    {["LOW", "MEDIUM", "HIGH", "MISSION_CRITICAL"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Milestone 1 (Entry Workflow)</label>
                <input
                  type="text"
                  value={formMilestone1}
                  onChange={(e) => setFormMilestone1(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
                <select
                  value={formWorkflowId1}
                  onChange={(e) => setFormWorkflowId1(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                >
                  <option value="">-- Select Workflow --</option>
                  {workflows.map((wf: any) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name} ({wf.id.substring(0, 8)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Milestone 2 (Terminal Workflow)</label>
                <input
                  type="text"
                  value={formMilestone2}
                  onChange={(e) => setFormMilestone2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
                <select
                  value={formWorkflowId2}
                  onChange={(e) => setFormWorkflowId2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                >
                  <option value="">-- Select Workflow (or reuse Milestone 1) --</option>
                  {workflows.map((wf: any) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name} ({wf.id.substring(0, 8)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Target SLA Duration (ms)</label>
                <input
                  type="number"
                  value={formSlaTargetMs}
                  onChange={(e) => setFormSlaTargetMs(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                data-testid="modal-btn-create"
                onClick={() => createProcessMutation.mutate()}
                disabled={createProcessMutation.isPending || !formName || !formSlug}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {createProcessMutation.isPending ? "Creating..." : "Create Process"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
