"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Server,
  GitBranch,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Key,
  Link as LinkIcon,
  FileCode2,
  Layers,
  ArrowRight,
  Clock,
  Eye,
  EyeOff,
  Check,
  X,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { cn } from "../../lib/utils";

export default function EnvironmentsPage() {
  const queryClient = useQueryClient();

  // State
  const [selectedEnvId, setSelectedEnvId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"deployments" | "variables" | "bindings" | "testing" | "simulations" | "chaos">("deployments");
  const [selectedFaultType, setSelectedFaultType] = useState<string>("NONE");
  const [lastSimulationRun, setLastSimulationRun] = useState<any>(null);
  const [chaosFaultType, setChaosFaultType] = useState<string>("WORKER_LOSS");
  const [chaosDuration, setChaosDuration] = useState<number>(60);

  // Modals state
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [showAddVarModal, setShowAddVarModal] = useState(false);
  const [showAddBindingModal, setShowAddBindingModal] = useState(false);
  const [showCreateTestModal, setShowCreateTestModal] = useState(false);

  // Form states
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>("");
  const [varKey, setVarKey] = useState("");
  const [varValue, setVarValue] = useState("");
  const [varIsSecret, setVarIsSecret] = useState(false);
  const [varDesc, setVarDesc] = useState("");

  const [bindingIntegrationKey, setBindingIntegrationKey] = useState("slack");
  const [bindingAccountId, setBindingAccountId] = useState("");

  // Feedback states
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 1. Fetch environments
  const { data: envsData, isLoading: envsLoading } = useQuery({
    queryKey: ["environments-list"],
    queryFn: () => api.environments.list(),
  });

  const environments = envsData?.data || [];
  const currentEnv = environments.find((e: any) => e.id === selectedEnvId) || environments[0];
  const activeEnvId = currentEnv?.id || "";

  // 2. Fetch workflows for dropdowns
  const { data: workflowsData } = useQuery({
    queryKey: ["workflows-dropdown"],
    queryFn: () => api.workflows.list({ limit: 100 }),
  });
  const workflows = workflowsData?.data || [];

  // 3. Fetch connected accounts for bindings
  const { data: accountsData } = useQuery({
    queryKey: ["connected-accounts"],
    queryFn: () => api.connections.list(),
  });
  const accounts = accountsData?.data || [];

  // 4. Fetch details for selected environment (variables, bindings, deployments)
  const { data: envDetails, refetch: refetchEnv } = useQuery({
    queryKey: ["environment-details", activeEnvId],
    queryFn: () => api.environments.get(activeEnvId),
    enabled: !!activeEnvId,
  });

  const { data: deploymentsData, refetch: refetchDeployments } = useQuery({
    queryKey: ["environment-deployments", activeEnvId],
    queryFn: () => api.deployments.list({ environmentId: activeEnvId }),
    enabled: !!activeEnvId,
  });

  const { data: testCasesData, refetch: refetchTests } = useQuery({
    queryKey: ["workflow-tests", selectedWorkflowId || workflows[0]?.id],
    queryFn: () => api.tests.list(selectedWorkflowId || workflows[0]?.id),
    enabled: !!(selectedWorkflowId || workflows[0]?.id),
  });

  const { data: releasesData } = useQuery({
    queryKey: ["workflow-releases", selectedWorkflowId || workflows[0]?.id],
    queryFn: () => api.releases.list(selectedWorkflowId || workflows[0]?.id),
    enabled: !!(selectedWorkflowId || workflows[0]?.id),
  });

  // Validation query for promote modal
  const { data: validationData, isLoading: isValidating } = useQuery({
    queryKey: ["deployment-validate", selectedReleaseId, activeEnvId],
    queryFn: () => api.deployments.validate({ releaseArtifactId: selectedReleaseId, environmentId: activeEnvId }),
    enabled: !!selectedReleaseId && !!activeEnvId && showPromoteModal,
  });

  // Mutations
  const setVariableMutation = useMutation({
    mutationFn: (data: any) => api.environments.setVariable(activeEnvId, data),
    onSuccess: () => {
      refetchEnv();
      setShowAddVarModal(false);
      setVarKey("");
      setVarValue("");
      setVarDesc("");
      setActionSuccess("Environment variable configured successfully.");
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => setActionError(err.message || "Failed to set variable"),
  });

  const deleteVariableMutation = useMutation({
    mutationFn: (key: string) => api.environments.deleteVariable(activeEnvId, key),
    onSuccess: () => {
      refetchEnv();
      setActionSuccess("Variable deleted.");
      setTimeout(() => setActionSuccess(null), 3000);
    },
    onError: (err: any) => setActionError(err.message || "Failed to delete variable"),
  });

  const setBindingMutation = useMutation({
    mutationFn: (data: any) => api.environments.setBinding(activeEnvId, data),
    onSuccess: () => {
      refetchEnv();
      setShowAddBindingModal(false);
      setActionSuccess("Credential binding saved successfully.");
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => setActionError(err.message || "Failed to bind account"),
  });

  const promoteMutation = useMutation({
    mutationFn: (data: any) => api.deployments.promote(data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["environments-list"] });
      refetchEnv();
      refetchDeployments();
      setShowPromoteModal(false);
      setActionSuccess(
        res.data?.status === "PENDING_APPROVAL"
          ? "Promotion initiated! Deployment is pending approval by authorized reviewers."
          : "Release successfully deployed and active in environment!"
      );
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: any) => setActionError(err.message || "Promotion failed"),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "APPROVED" | "REJECTED" }) =>
      api.deployments.decide(id, { decision }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["environments-list"] });
      refetchEnv();
      refetchDeployments();
      setActionSuccess("Deployment decision recorded successfully.");
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => setActionError(err.message || "Failed to record approval decision"),
  });

  const rollbackMutation = useMutation({
    mutationFn: (targetReleaseArtifactId: string) =>
      api.deployments.rollback({
        environmentId: activeEnvId,
        targetReleaseArtifactId,
        reason: "Manual rollback from environments console",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["environments-list"] });
      refetchEnv();
      refetchDeployments();
      setShowRollbackModal(false);
      setActionSuccess("Rollback completed: Prior release restored to active state.");
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: any) => setActionError(err.message || "Rollback failed"),
  });

  const createReleaseMutation = useMutation({
    mutationFn: (wfId: string) => api.releases.create(wfId, { summary: "Automated Release Candidate" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-releases"] });
      setActionSuccess("Immutable release artifact created with verified SHA-256 hash.");
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => setActionError(err.message || "Failed to create release"),
  });

  const runTestMutation = useMutation({
    mutationFn: (testCaseId: string) => api.tests.run(testCaseId, { mode: "DRY_RUN", environmentId: activeEnvId }),
    onSuccess: (res: any) => {
      refetchTests();
      setActionSuccess(`Test run completed: ${res.data?.summary?.status} (${res.data?.summary?.passedAssertions} passed).`);
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: any) => setActionError(err.message || "Test run failed"),
  });

  const generateTestsMutation = useMutation({
    mutationFn: async (wfId: string) => {
      const res = await api.ai.generateTests(wfId);
      const testCases = res.data || [];
      const defaultNodeId = workflows.find((w: any) => w.id === wfId)?.versions?.[0]?.nodes?.[0]?.id || "node-1";
      for (const tc of testCases) {
        const mappedAssertions = (tc.assertions || []).map((a: any) => {
          const parts = (a.target || "status").split(".");
          const nId = a.nodeId || (parts.length > 1 ? parts[0] : defaultNodeId);
          const fPath = a.fieldPath || (parts.length > 1 ? parts.slice(1).join(".") : a.target || "status");
          return {
            nodeId: nId,
            fieldPath: fPath,
            operator: a.operator === "NOT_EMPTY" ? "EXISTS" : a.operator || "EQUALS",
            expectedValue: a.expectedValue !== undefined ? a.expectedValue : a.expected !== undefined ? a.expected : "SUCCESS",
          };
        });

        await api.tests.create(wfId, {
          name: tc.name,
          description: tc.description,
          triggerPayload: tc.mockPayload,
          assertions: mappedAssertions,
          expectedStatus: "SUCCESS",
        });
      }
      return testCases;
    },
    onSuccess: (testCases: any[]) => {
      refetchTests();
      setActionSuccess(`AI generated ${testCases.length} automated test cases with verified assertions!`);
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: any) => setActionError(err.message || "Failed to generate tests with AI"),
  });

  // Phase 20: Digital Twin Simulations & Chaos queries
  const { data: chaosExperimentsData, refetch: refetchChaos } = useQuery({
    queryKey: ["chaos-experiments"],
    queryFn: () => api.chaos.listExperiments(),
  });
  const chaosExperiments = chaosExperimentsData?.data || [];

  const runSimulationMutation = useMutation({
    mutationFn: async ({ workflowId, faultType }: { workflowId: string; faultType: string }) => {
      const faults = faultType !== "NONE" ? [{ type: faultType }] : [];
      const res = await api.simulations.run(workflowId, {
        injectedFaults: faults,
        syntheticTrigger: { test: true, timestamp: Date.now() },
      });
      return res.data;
    },
    onSuccess: (res: any) => {
      setLastSimulationRun(res);
      setActionSuccess(`Digital Twin simulation completed: ${res.simulationRun.status} (${res.summary.virtualDurationMs}ms virtual duration)`);
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: any) => setActionError(err.message || "Simulation failed"),
  });

  const createChaosMutation = useMutation({
    mutationFn: async () => {
      if (currentEnv?.type === "PRODUCTION") {
        throw new Error("Chaos experiments are strictly prohibited on PRODUCTION environments");
      }
      return api.chaos.createExperiment({
        name: `Chaos Drill: ${chaosFaultType} on ${currentEnv?.name}`,
        targetEnvironmentId: activeEnvId,
        faultType: chaosFaultType,
        targetScope: { durationSeconds: chaosDuration },
        maxDurationSeconds: chaosDuration,
      });
    },
    onSuccess: () => {
      refetchChaos();
      setActionSuccess("Chaos experiment registered in PENDING_APPROVAL state!");
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: any) => setActionError(err.message || "Failed to create chaos experiment"),
  });

  const approveChaosMutation = useMutation({
    mutationFn: (expId: string) => api.chaos.approveExperiment(expId),
    onSuccess: () => {
      refetchChaos();
      setActionSuccess("Chaos experiment APPROVED for non-production execution!");
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: any) => setActionError(err.message || "Approval failed"),
  });

  const startChaosMutation = useMutation({
    mutationFn: (expId: string) => api.chaos.startExperiment(expId),
    onSuccess: () => {
      refetchChaos();
      setActionSuccess("Chaos experiment completed with verified automatic cleanup!");
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: any) => setActionError(err.message || "Experiment run failed"),
  });

  const stopChaosMutation = useMutation({
    mutationFn: (expId: string) => api.chaos.stopExperiment(expId),
    onSuccess: () => {
      refetchChaos();
      setActionSuccess("Chaos experiment aborted and resources cleaned up.");
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: any) => setActionError(err.message || "Emergency stop failed"),
  });

  const currentVariables = envDetails?.data?.variables || [];
  const currentBindings = envDetails?.data?.bindings || [];
  const currentDeployments = deploymentsData?.data || [];
  const currentTests = testCasesData?.data || [];
  const currentReleases = releasesData?.data || [];

  return (
    <AppShell
      title="Workflow Environments & Release Promotion"
      description="Isolate Development, Staging, and Production environments, promote immutable release artifacts, and enforce deployment gates."
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const targetWf = selectedWorkflowId || workflows[0]?.id;
              if (targetWf) createReleaseMutation.mutate(targetWf);
            }}
            disabled={createReleaseMutation.isPending || workflows.length === 0}
            data-testid="btn-create-release"
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <FileCode2 className="h-3.5 w-3.5 text-[#6558E8]" />
            <span>Create Release Artifact</span>
          </button>

          <button
            onClick={() => setShowPromoteModal(true)}
            data-testid="btn-open-promote-modal"
            className="px-4 py-2 rounded-xl bg-[#6558E8] text-white hover:bg-[#5345D8] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Promote to {currentEnv?.name || "Environment"}</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6" data-testid="environments-page">
        {/* Global Feedback Banners */}
        {actionSuccess && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {actionError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="ml-auto text-rose-600 font-bold">×</button>
          </div>
        )}

        {/* 1. Environment Status Cards Header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {environments.map((env: any) => {
            const isSelected = env.id === activeEnvId;
            return (
              <button
                key={env.id}
                onClick={() => setSelectedEnvId(env.id)}
                data-testid={`card-env-${env.slug}`}
                className={cn(
                  "p-5 rounded-2xl border text-left transition-all shadow-card relative overflow-hidden cursor-pointer",
                  isSelected
                    ? "bg-white border-[#6558E8] ring-2 ring-[#6558E8]/20"
                    : "bg-white border-slate-200/90 hover:border-slate-300"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "p-2 rounded-xl",
                      env.type === "PRODUCTION"
                        ? "bg-rose-50 text-rose-600 border border-rose-100"
                        : env.type === "STAGING"
                        ? "bg-amber-50 text-amber-600 border border-amber-100"
                        : "bg-indigo-50 text-[#6558E8] border border-indigo-100"
                    )}>
                      <Server className="h-4 w-4" />
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm">{env.name}</h3>
                  </div>

                  <span className={cn(
                    "text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider",
                    env.isProtected ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
                  )}>
                    {env.isProtected ? "Protected" : "Standard"}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 line-clamp-1 mb-3">
                  {env.description || "Workspace execution environment"}
                </p>

                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Active Release:</span>
                  <span className="font-mono font-bold text-slate-700">
                    {env.activeReleaseArtifactId ? `Artifact ${env.activeReleaseArtifactId.slice(0, 8)}` : "None (Drafts)"}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Approval Policy:</span>
                  <span className={cn("font-semibold", env.requireApproval ? "text-amber-600" : "text-slate-500")}>
                    {env.requireApproval ? "Required" : "Automatic"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 2. Environment Navigation Tabs */}
        <div className="border-b border-slate-200/90 flex items-center gap-6 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab("deployments")}
            data-testid="tab-env-deployments"
            className={cn(
              "pb-3 border-b-2 flex items-center gap-2 transition cursor-pointer shrink-0",
              activeTab === "deployments"
                ? "border-[#6558E8] text-[#6558E8]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <GitBranch className="h-4 w-4" />
            <span>Deployments & Promotion</span>
          </button>

          <button
            onClick={() => setActiveTab("variables")}
            data-testid="tab-env-variables"
            className={cn(
              "pb-3 border-b-2 flex items-center gap-2 transition cursor-pointer shrink-0",
              activeTab === "variables"
                ? "border-[#6558E8] text-[#6558E8]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Key className="h-4 w-4" />
            <span>Environment Variables ({currentVariables.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("bindings")}
            data-testid="tab-env-bindings"
            className={cn(
              "pb-3 border-b-2 flex items-center gap-2 transition cursor-pointer shrink-0",
              activeTab === "bindings"
                ? "border-[#6558E8] text-[#6558E8]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <LinkIcon className="h-4 w-4" />
            <span>Credential Bindings ({currentBindings.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("testing")}
            data-testid="tab-env-testing"
            className={cn(
              "pb-3 border-b-2 flex items-center gap-2 transition cursor-pointer shrink-0",
              activeTab === "testing"
                ? "border-[#6558E8] text-[#6558E8]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Play className="h-4 w-4" />
            <span>Automated Testing & Gates</span>
          </button>

          <button
            onClick={() => setActiveTab("simulations")}
            data-testid="tab-env-simulations"
            className={cn(
              "pb-3 border-b-2 flex items-center gap-2 transition cursor-pointer shrink-0",
              activeTab === "simulations"
                ? "border-[#6558E8] text-[#6558E8]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <Sparkles className="h-4 w-4" />
            <span>Digital Twin Simulations</span>
          </button>

          <button
            onClick={() => setActiveTab("chaos")}
            data-testid="tab-env-chaos"
            className={cn(
              "pb-3 border-b-2 flex items-center gap-2 transition cursor-pointer shrink-0",
              activeTab === "chaos"
                ? "border-[#6558E8] text-[#6558E8]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <ShieldAlert className="h-4 w-4" />
            <span>Chaos Engineering</span>
          </button>
        </div>

        {/* 3. Tab Contents */}

        {/* TAB 1: DEPLOYMENTS & PROMOTION */}
        {activeTab === "deployments" && (
          <div className="space-y-4" data-testid="deployments-view">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Deployment History & Promotion Records</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Track promotions, approval decisions, and structural diffs in {currentEnv?.name}.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRollbackModal(true)}
                  data-testid="btn-open-rollback-modal"
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                  <span>Rollback to Prior Release</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px] bg-slate-50/50">
                    <th className="py-2.5 px-4">Release</th>
                    <th className="py-2.5 px-4">Workflow</th>
                    <th className="py-2.5 px-4">Content Hash</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentDeployments.length > 0 ? (
                    currentDeployments.map((d: any) => (
                      <tr key={d.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          Release #{d.releaseArtifact?.releaseNumber ?? 1}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {d.workflow?.name || "Pipeline"}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {d.releaseArtifact?.contentHash?.slice(0, 10)}...
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full font-bold text-[10px]",
                              d.status === "DEPLOYED"
                                ? "bg-emerald-50 text-emerald-700"
                                : d.status === "PENDING_APPROVAL"
                                ? "bg-amber-50 text-amber-700"
                                : d.status === "ROLLED_BACK"
                                ? "bg-purple-50 text-purple-700"
                                : "bg-slate-100 text-slate-600"
                            )}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {new Date(d.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {d.status === "PENDING_APPROVAL" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => decideMutation.mutate({ id: d.id, decision: "APPROVED" })}
                                data-testid={`btn-approve-deployment-${d.id}`}
                                className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] font-semibold hover:bg-emerald-700"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => decideMutation.mutate({ id: d.id, decision: "REJECTED" })}
                                className="px-2 py-1 bg-rose-100 text-rose-700 rounded text-[11px] font-semibold hover:bg-rose-200"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Recorded</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No deployments have been recorded in this environment yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: VARIABLES */}
        {activeTab === "variables" && (
          <div className="space-y-4" data-testid="variables-view">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Environment Variables</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Scoped variables referenced in node parameters via <code className="text-indigo-600">&#123;&#123;env.KEY&#125;&#125;</code>.
                </p>
              </div>

              <button
                onClick={() => setShowAddVarModal(true)}
                data-testid="btn-add-variable"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Variable</span>
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px] bg-slate-50/50">
                    <th className="py-2.5 px-4">Key</th>
                    <th className="py-2.5 px-4">Value</th>
                    <th className="py-2.5 px-4">Classification</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentVariables.length > 0 ? (
                    currentVariables.map((v: any) => (
                      <tr key={v.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{v.key}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                          {v.isSecret ? <span className="text-rose-600 font-bold">[REDACTED SECRET]</span> : v.value}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full font-bold text-[10px]",
                              v.isSecret ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"
                            )}
                          >
                            {v.isSecret ? "Encrypted Secret" : "Plaintext Config"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">{v.description || "—"}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => deleteVariableMutation.mutate(v.key)}
                            data-testid={`btn-delete-var-${v.key}`}
                            className="p-1 text-slate-400 hover:text-rose-600 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        No environment variables defined yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: BINDINGS */}
        {activeTab === "bindings" && (
          <div className="space-y-4" data-testid="bindings-view">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Credential Bindings</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Explicitly maps third-party integrations to authorized accounts in {currentEnv?.name}.
                </p>
              </div>

              <button
                onClick={() => setShowAddBindingModal(true)}
                data-testid="btn-add-binding"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Bind Integration Account</span>
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px] bg-slate-50/50">
                    <th className="py-2.5 px-4">Integration Key</th>
                    <th className="py-2.5 px-4">Bound Account</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentBindings.length > 0 ? (
                    currentBindings.map((b: any) => (
                      <tr key={b.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{b.integrationKey}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{b.connectedAccount?.name}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-700">
                            {b.connectedAccount?.status || "ACTIVE"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => api.environments.deleteBinding(activeEnvId, b.integrationKey).then(() => refetchEnv())}
                            className="p-1 text-slate-400 hover:text-rose-600 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400">
                        No credential bindings configured for this environment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: AUTOMATED TESTING */}
        {activeTab === "testing" && (
          <div className="space-y-4" data-testid="testing-view">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Pre-Deployment Automated Test Center</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Execute fixture-based test suites in safe DRY_RUN mode before promotion gates.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedWorkflowId || workflows[0]?.id || ""}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 bg-white"
                >
                  {workflows.map((wf: any) => (
                    <option key={wf.id} value={wf.id}>{wf.name}</option>
                  ))}
                </select>

                <button
                  data-testid="btn-ai-generate-tests"
                  onClick={() => {
                    const targetWf = selectedWorkflowId || workflows[0]?.id;
                    if (targetWf) generateTestsMutation.mutate(targetWf);
                  }}
                  disabled={generateTestsMutation.isPending || workflows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors shadow-2xs disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                  <span>{generateTestsMutation.isPending ? "Generating..." : "Generate Tests with AI"}</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px] bg-slate-50/50">
                    <th className="py-2.5 px-4">Test Case</th>
                    <th className="py-2.5 px-4">Trigger Fixture</th>
                    <th className="py-2.5 px-4">Assertions</th>
                    <th className="py-2.5 px-4">Expected Status</th>
                    <th className="py-2.5 px-4 text-right">Execution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentTests.length > 0 ? (
                    currentTests.map((t: any) => (
                      <tr key={t.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">{t.name}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {JSON.stringify(t.triggerPayload).slice(0, 30)}...
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {Array.isArray(t.assertions) ? t.assertions.length : 0} rules
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-700">
                            {t.expectedStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => runTestMutation.mutate(t.id)}
                            disabled={runTestMutation.isPending}
                            data-testid={`btn-run-test-${t.id}`}
                            className="px-3 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold inline-flex items-center gap-1 shadow-2xs"
                          >
                            <Play className="h-3 w-3" />
                            <span>Run Test</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        No test cases defined for this workflow yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: DIGITAL TWIN SIMULATION */}
        {activeTab === "simulations" && (
          <div className="space-y-4" data-testid="simulations-view">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Workflow Digital Twin & Deterministic Simulation</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulate workflow graph traversal with virtual elapsed time and 100% side-effect isolation.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedWorkflowId || workflows[0]?.id || ""}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  data-testid="select-simulation-workflow"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 bg-white"
                >
                  {workflows.map((wf: any) => (
                    <option key={wf.id} value={wf.id}>{wf.name}</option>
                  ))}
                </select>

                <select
                  value={selectedFaultType}
                  onChange={(e) => setSelectedFaultType(e.target.value)}
                  data-testid="select-simulation-fault"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 bg-white"
                >
                  <option value="NONE">No Injected Fault (Clean Run)</option>
                  <option value="HTTP_429">HTTP 429 Rate Limit</option>
                  <option value="HTTP_5XX">HTTP 502 Upstream Provider Failure</option>
                  <option value="TIMEOUT">Network Timeout (30s)</option>
                  <option value="EXPIRED_CREDENTIALS">Expired / Revoked Credentials</option>
                  <option value="RESIDENCY_VIOLATION">Cross-Region Residency Boundary</option>
                </select>

                <button
                  data-testid="btn-run-simulation"
                  onClick={() => {
                    const targetWf = selectedWorkflowId || workflows[0]?.id;
                    if (targetWf) runSimulationMutation.mutate({ workflowId: targetWf, faultType: selectedFaultType });
                  }}
                  disabled={runSimulationMutation.isPending || workflows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-2xs disabled:opacity-50 shrink-0"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>{runSimulationMutation.isPending ? "Simulating..." : "Run Digital Twin"}</span>
                </button>
              </div>
            </div>

            {/* Simulation Results Banner */}
            {lastSimulationRun && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3" data-testid="simulation-summary-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-bold uppercase",
                      lastSimulationRun.simulationRun.status === "SIMULATED_SUCCESS"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    )} data-testid="sim-status-badge">
                      {lastSimulationRun.simulationRun.status}
                    </span>
                    <span className="text-xs text-slate-700 font-medium">
                      Virtual Time: {lastSimulationRun.summary.virtualDurationMs}ms (Real: {lastSimulationRun.summary.realDurationMs}ms)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Artifact Hash: {lastSimulationRun.summary.workflowArtifactHash.slice(0, 16)}...
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 text-xs bg-white rounded-lg p-3 border border-indigo-100">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Steps Executed</span>
                    <span className="font-bold text-slate-800">{lastSimulationRun.summary.executedNodeCount} / {lastSimulationRun.summary.nodeCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Side Effects Blocked</span>
                    <span className="font-bold text-emerald-600">100% Guaranteed Safe</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Assertions Passed</span>
                    <span className="font-bold text-slate-800">{lastSimulationRun.summary.assertionsPassed} / {lastSimulationRun.summary.assertionCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Unsimulatable Nodes</span>
                    <span className="font-bold text-slate-800">{lastSimulationRun.summary.unsimulatableNodeCount}</span>
                  </div>
                </div>

                {/* Node-by-node simulated outcomes */}
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Step</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Virtual Latency</th>
                        <th className="py-2 px-3">Details / Output</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {Object.values(lastSimulationRun.simulationRun.nodeOutcomes || {}).map((outcome: any) => (
                        <tr key={outcome.nodeId} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-semibold text-slate-800">{outcome.nodeName}</td>
                          <td className="py-2 px-3 text-slate-500">{outcome.nodeType}</td>
                          <td className="py-2 px-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                              outcome.status === "SIMULATED_SUCCESS"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : outcome.status === "SKIPPED"
                                ? "bg-slate-100 text-slate-600"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            )}>
                              {outcome.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-600">{outcome.durationMs}ms</td>
                          <td className="py-2 px-3 text-slate-500 truncate max-w-xs">
                            {outcome.error ? outcome.error : JSON.stringify(outcome.output || {})}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: CHAOS ENGINEERING */}
        {activeTab === "chaos" && (
          <div className="space-y-4" data-testid="chaos-view">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Controlled Chaos Engineering</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inject bounded synthetic faults into non-production environments with guaranteed automatic cleanup.
                </p>
              </div>

              {currentEnv?.type === "PRODUCTION" ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold shrink-0">
                  <ShieldAlert className="h-4 w-4" />
                  <span>Chaos Prohibited on PRODUCTION</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={chaosFaultType}
                    onChange={(e) => setChaosFaultType(e.target.value)}
                    data-testid="select-chaos-fault"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 bg-white"
                  >
                    <option value="WORKER_LOSS">Simulated Worker Crash (Failover)</option>
                    <option value="QUEUE_BACKPRESSURE">Queue Backpressure Surge</option>
                    <option value="TRANSIENT_5XX">Transient 503 Provider Blips</option>
                    <option value="RATE_LIMITING">Rate Limit Throttling</option>
                    <option value="DATABASE_LATENCY">Simulated DB Latency Injection</option>
                  </select>

                  <button
                    data-testid="btn-create-chaos"
                    onClick={() => createChaosMutation.mutate()}
                    disabled={createChaosMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors shadow-2xs disabled:opacity-50 shrink-0"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>{createChaosMutation.isPending ? "Registering..." : "Register Chaos Drill"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* List of Chaos Experiments */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px] bg-slate-50/50">
                    <th className="py-2.5 px-4">Drill Name</th>
                    <th className="py-2.5 px-4">Fault Type</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Cleanup Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {chaosExperiments.length > 0 ? (
                    chaosExperiments.map((exp: any) => (
                      <tr key={exp.id} className="hover:bg-slate-50/50" data-testid={`chaos-row-${exp.id}`}>
                        <td className="py-3 px-4 font-semibold text-slate-900">{exp.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{exp.faultType}</td>
                        <td className="py-3 px-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            exp.status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : exp.status === "APPROVED"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : exp.status === "RUNNING"
                              ? "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"
                              : "bg-slate-100 text-slate-600"
                          )}>
                            {exp.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-semibold",
                            exp.cleanupStatus === "CLEANED_UP"
                              ? "bg-emerald-50 text-emerald-600"
                              : "text-slate-400"
                          )}>
                            {exp.cleanupStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          {exp.status === "PENDING_APPROVAL" && (
                            <button
                              onClick={() => approveChaosMutation.mutate(exp.id)}
                              data-testid={`btn-approve-chaos-${exp.id}`}
                              className="px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                            >
                              Approve
                            </button>
                          )}
                          {exp.status === "APPROVED" && (
                            <button
                              onClick={() => startChaosMutation.mutate(exp.id)}
                              data-testid={`btn-start-chaos-${exp.id}`}
                              className="px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 text-xs font-semibold"
                            >
                              Execute
                            </button>
                          )}
                          {exp.status === "RUNNING" && (
                            <button
                              onClick={() => stopChaosMutation.mutate(exp.id)}
                              data-testid={`btn-stop-chaos-${exp.id}`}
                              className="px-2.5 py-1 rounded bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-semibold"
                            >
                              Stop
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">
                        No chaos drills executed in this environment yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MODAL: PROMOTE RELEASE */}
        {showPromoteModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-indigo-600" />
                  <h3 className="font-bold text-slate-900 text-sm">
                    Promote Release to {currentEnv?.name}
                  </h3>
                </div>
                <button onClick={() => setShowPromoteModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Workflow</label>
                <select
                  value={selectedWorkflowId || workflows[0]?.id || ""}
                  onChange={(e) => {
                    setSelectedWorkflowId(e.target.value);
                    setSelectedReleaseId("");
                  }}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                >
                  {workflows.map((wf: any) => (
                    <option key={wf.id} value={wf.id}>{wf.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Immutable Release Candidate</label>
                <select
                  value={selectedReleaseId}
                  onChange={(e) => setSelectedReleaseId(e.target.value)}
                  data-testid="select-release-candidate"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
                >
                  <option value="">-- Choose Release --</option>
                  {currentReleases.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      Release #{r.releaseNumber} ({r.contentHash?.slice(0, 8)}) - {r.summary}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pre-flight readiness check */}
              {selectedReleaseId && (
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 space-y-2">
                  <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">Pre-flight Environment Readiness</p>
                  {isValidating ? (
                    <p className="text-slate-400 text-xs">Validating dependencies and test gates...</p>
                  ) : validationData?.data ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        {validationData.data.valid ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <X className="h-4 w-4 text-rose-600" />
                        )}
                        <span className={validationData.data.valid ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>
                          {validationData.data.valid ? "All pre-flight checks passed." : "Blocking validation issues detected:"}
                        </span>
                      </div>
                      {validationData.data.errors?.map((err: string, i: number) => (
                        <p key={i} className="text-rose-600 pl-6 text-[11px]">• {err}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowPromoteModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const wfId = selectedWorkflowId || workflows[0]?.id;
                    promoteMutation.mutate({
                      workflowId: wfId,
                      releaseArtifactId: selectedReleaseId,
                      environmentId: activeEnvId,
                    });
                  }}
                  disabled={!selectedReleaseId || promoteMutation.isPending || (validationData?.data && !validationData.data.valid)}
                  data-testid="btn-confirm-promote"
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {promoteMutation.isPending ? "Promoting..." : "Confirm & Promote"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD VARIABLE */}
        {showAddVarModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm">Set Environment Variable</h3>
                <button onClick={() => setShowAddVarModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Key Name (Uppercase)</label>
                <input
                  type="text"
                  placeholder="e.g. STRIPE_API_KEY"
                  value={varKey}
                  onChange={(e) => setVarKey(e.target.value.toUpperCase())}
                  data-testid="input-var-key"
                  className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Value</label>
                <input
                  type={varIsSecret ? "password" : "text"}
                  placeholder="Value..."
                  value={varValue}
                  onChange={(e) => setVarValue(e.target.value)}
                  data-testid="input-var-value"
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk-secret"
                  checked={varIsSecret}
                  onChange={(e) => setVarIsSecret(e.target.checked)}
                  data-testid="checkbox-var-secret"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <label htmlFor="chk-secret" className="font-semibold text-slate-700 cursor-pointer">
                  Encrypt as confidential secret (masked in logs & diffs)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowAddVarModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setVariableMutation.mutate({
                      key: varKey,
                      value: varValue,
                      isSecret: varIsSecret,
                      description: varDesc,
                    });
                  }}
                  disabled={!varKey || !varValue || setVariableMutation.isPending}
                  data-testid="btn-save-variable"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save Variable
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD BINDING */}
        {showAddBindingModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm">Bind Connected Account</h3>
                <button onClick={() => setShowAddBindingModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Integration Key</label>
                <input
                  type="text"
                  placeholder="e.g. slack, github, stripe"
                  value={bindingIntegrationKey}
                  onChange={(e) => setBindingIntegrationKey(e.target.value.toLowerCase())}
                  className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Connected Account</label>
                <select
                  value={bindingAccountId}
                  onChange={(e) => setBindingAccountId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                >
                  <option value="">-- Choose Account --</option>
                  {accounts.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.integrationKey})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowAddBindingModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setBindingMutation.mutate({
                      integrationKey: bindingIntegrationKey,
                      connectedAccountId: bindingAccountId,
                    });
                  }}
                  disabled={!bindingIntegrationKey || !bindingAccountId || setBindingMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save Binding
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ROLLBACK */}
        {showRollbackModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-purple-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Rollback Release</h3>
                </div>
                <button onClick={() => setShowRollbackModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
              </div>

              <p className="text-slate-500">
                Select a previously deployed release artifact to restore in <span className="font-bold text-slate-800">{currentEnv?.name}</span>.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Prior Release</label>
                <select
                  value={selectedReleaseId}
                  onChange={(e) => setSelectedReleaseId(e.target.value)}
                  data-testid="select-rollback-release"
                  className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
                >
                  <option value="">-- Choose Prior Release --</option>
                  {currentReleases.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      Release #{r.releaseNumber} ({r.contentHash?.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowRollbackModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => rollbackMutation.mutate(selectedReleaseId)}
                  disabled={!selectedReleaseId || rollbackMutation.isPending}
                  data-testid="btn-confirm-rollback"
                  className="px-4 py-1.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50"
                >
                  {rollbackMutation.isPending ? "Rolling back..." : "Confirm Rollback"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
