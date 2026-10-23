"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Building2,
  Users,
  GitPullRequest,
  Activity,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Plus,
  Trash2,
  Edit3,
  Download,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Key,
  Lock,
  Globe,
  RefreshCw,
} from "lucide-react";
import { cn } from "../../lib/utils";

export default function EnterpriseGovernancePage() {
  const queryClient = useQueryClient();

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    "overview" | "orgs_teams" | "reviews" | "policy" | "reliability" | "compliance"
  >("overview");

  // Notifications / feedback
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const clearFeedback = () => {
    setActionSuccess(null);
    setActionError(null);
  };

  // ==========================================
  // TAB 1: OVERVIEW & STEWARDSHIP
  // ==========================================
  const { data: ownershipData, isLoading: loadingOwnership } = useQuery({
    queryKey: ["governance-ownership"],
    queryFn: () => api.governance.getOwnership(),
  });

  const intelligence = (ownershipData as any)?.data;

  // Stewardship Edit Modal
  const [editingWorkflow, setEditingWorkflow] = useState<any | null>(null);
  const [stewardshipForm, setStewardshipForm] = useState({
    criticality: "MEDIUM",
    businessDomain: "OPERATIONS",
    escalationContact: "",
    lifecycleStatus: "DRAFT",
    owningTeamId: "",
  });

  const updateStewardshipMutation = useMutation({
    mutationFn: ({ workflowId, data }: { workflowId: string; data: any }) =>
      api.governance.updateStewardship(workflowId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governance-ownership"] });
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      setEditingWorkflow(null);
      setActionSuccess("Workflow stewardship updated successfully.");
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to update workflow stewardship.");
    },
  });

  // ==========================================
  // TAB 2: ORGANIZATIONS & TEAMS
  // ==========================================
  const { data: orgsData } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.organizations.list(),
  });
  const organizations = (orgsData as any)?.data || [];

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.teams.list(),
  });
  const teams = (teamsData as any)?.data || [];

  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");

  const createTeamMutation = useMutation({
    mutationFn: (body: any) => api.teams.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setShowCreateTeamModal(false);
      setNewTeamName("");
      setNewTeamDescription("");
      setActionSuccess("Team created successfully.");
    },
    onError: (err: any) => setActionError(err.message || "Failed to create team."),
  });

  // ==========================================
  // TAB 3: COLLABORATIVE REVIEWS
  // ==========================================
  const [reviewFilterStatus, setReviewFilterStatus] = useState<string>("ALL");
  const { data: reviewsData } = useQuery({
    queryKey: ["reviews", reviewFilterStatus],
    queryFn: () =>
      api.reviews.list({
        status: reviewFilterStatus === "ALL" ? undefined : reviewFilterStatus,
      }),
  });
  const reviews = (reviewsData as any)?.data || [];

  // Submit Review Modal
  const [showSubmitReviewModal, setShowSubmitReviewModal] = useState(false);
  const [reviewWorkflowId, setReviewWorkflowId] = useState("");
  const [reviewVersionNumber, setReviewVersionNumber] = useState(1);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewChangeSummary, setReviewChangeSummary] = useState("");

  const submitReviewMutation = useMutation({
    mutationFn: (body: any) => api.reviews.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      setShowSubmitReviewModal(false);
      setReviewTitle("");
      setReviewChangeSummary("");
      setActionSuccess("Review submitted for collaborative change evaluation.");
    },
    onError: (err: any) => setActionError(err.message || "Failed to submit review."),
  });

  // Review Detail & Decision Drawer
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const { data: selectedReviewData } = useQuery({
    queryKey: ["review-detail", selectedReviewId],
    queryFn: () => (selectedReviewId ? api.reviews.get(selectedReviewId) : null),
    enabled: Boolean(selectedReviewId),
  });
  const currentReview = (selectedReviewData as any)?.data;

  const [decisionReason, setDecisionReason] = useState("");
  const [commentText, setCommentText] = useState("");

  const decideReviewMutation = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: string; reason: string }) =>
      api.reviews.decide(id, { decision, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      queryClient.invalidateQueries({ queryKey: ["review-detail", selectedReviewId] });
      queryClient.invalidateQueries({ queryKey: ["governance-ownership"] });
      setDecisionReason("");
      setActionSuccess("Review decision recorded successfully.");
    },
    onError: (err: any) => setActionError(err.message || "Failed to submit decision."),
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.reviews.addComment(id, { comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-detail", selectedReviewId] });
      setCommentText("");
      setActionSuccess("Comment posted.");
    },
    onError: (err: any) => setActionError(err.message || "Failed to add comment."),
  });

  // ==========================================
  // TAB 4: GOVERNANCE POLICY & ENFORCEMENT
  // ==========================================
  const { data: policyData } = useQuery({
    queryKey: ["governance-policy"],
    queryFn: () => api.governance.getPolicy(),
  });
  const currentPolicy = (policyData as any)?.data || policyData;

  const [policyForm, setPolicyForm] = useState({
    requireWorkflowOwner: false,
    requireReviewForCritical: false,
    requirePassingTests: false,
    requireHttpsWebhooks: false,
    enforceReliabilitySlo: false,
    requireTwoPersonRule: false,
    maxExecutionDurationMs: 60000,
  });

  // Update policyForm when data is loaded
  React.useEffect(() => {
    if (currentPolicy) {
      setPolicyForm({
        requireWorkflowOwner: Boolean(currentPolicy.requireWorkflowOwner),
        requireReviewForCritical: Boolean(currentPolicy.requireReviewForCritical),
        requirePassingTests: Boolean(currentPolicy.requirePassingTests),
        requireHttpsWebhooks: Boolean(currentPolicy.requireHttpsWebhooks),
        enforceReliabilitySlo: Boolean(currentPolicy.enforceReliabilitySlo),
        requireTwoPersonRule: Boolean(currentPolicy.requireTwoPersonRule),
        maxExecutionDurationMs: currentPolicy.maxExecutionDurationMs || 60000,
      });
    }
  }, [currentPolicy]);

  const updatePolicyMutation = useMutation({
    mutationFn: (body: any) => api.governance.updatePolicy(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governance-policy"] });
      setActionSuccess("Workspace governance policy updated.");
    },
    onError: (err: any) => setActionError(err.message || "Failed to update policy."),
  });

  // Policy Evaluation Sandbox
  const [evalWorkflowId, setEvalWorkflowId] = useState("");
  const [evalAction, setEvalAction] = useState<"ACTIVATE" | "PROMOTE" | "DEPLOY">("ACTIVATE");
  const [evalResult, setEvalResult] = useState<any | null>(null);

  const evaluatePolicyMutation = useMutation({
    mutationFn: (body: any) => api.governance.evaluate(body),
    onSuccess: (data) => {
      setEvalResult((data as any)?.data || (data as any)?.result || data);
      setActionSuccess("Policy evaluation completed.");
    },
    onError: (err: any) => setActionError(err.message || "Policy evaluation failed."),
  });

  // ==========================================
  // TAB 5: RELIABILITY OBJECTIVES (SLO)
  // ==========================================
  const { data: slosData } = useQuery({
    queryKey: ["slo-objectives"],
    queryFn: () => api.reliability.list(),
  });
  const objectives = (slosData as any)?.data || [];

  const [showCreateSloModal, setShowCreateSloModal] = useState(false);
  const [sloName, setSloName] = useState("");
  const [sloMetric, setSloMetric] = useState<"SUCCESS_RATE" | "LATENCY_P95" | "EXECUTION_DURATION">(
    "SUCCESS_RATE"
  );
  const [sloTargetValue, setSloTargetValue] = useState(99.0);
  const [sloTimeWindow, setSloTimeWindow] = useState(24);
  const [sloWorkflowId, setSloWorkflowId] = useState("");

  const createSloMutation = useMutation({
    mutationFn: (body: any) => api.reliability.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slo-objectives"] });
      setShowCreateSloModal(false);
      setSloName("");
      setActionSuccess("Reliability objective created.");
    },
    onError: (err: any) => setActionError(err.message || "Failed to create SLO."),
  });

  const evaluateSloMutation = useMutation({
    mutationFn: (id: string) => api.reliability.evaluate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slo-objectives"] });
      setActionSuccess("Reliability objective re-evaluated against real telemetry.");
    },
    onError: (err: any) => setActionError(err.message || "Evaluation failed."),
  });

  // ==========================================
  // TAB 6: AUDIT SEARCH & COMPLIANCE EXPORT
  // ==========================================
  const [auditKeyword, setAuditKeyword] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const { data: auditData } = useQuery({
    queryKey: ["compliance-audit", auditKeyword, auditActionFilter],
    queryFn: () =>
      api.compliance.searchAudit({
        keyword: auditKeyword || undefined,
        action: auditActionFilter || undefined,
        limit: 25,
      }),
  });
  const auditLogs = auditData?.logs || [];

  const { data: exportsData } = useQuery({
    queryKey: ["compliance-exports"],
    queryFn: () => api.compliance.listExports(),
  });
  const complianceExports = (exportsData as any)?.data || [];

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportReason, setExportReason] = useState("");
  const [exportStartDate, setExportStartDate] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]
  );
  const [exportEndDate, setExportEndDate] = useState(new Date().toISOString().split("T")[0]);

  const createExportMutation = useMutation({
    mutationFn: (body: any) => api.compliance.createExport(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-exports"] });
      setShowExportModal(false);
      setExportReason("");
      setActionSuccess("Sanitized compliance evidence package generated (valid for 48 hours).");
    },
    onError: (err: any) => setActionError(err.message || "Failed to generate compliance export."),
  });

  // Download export inspection
  const [previewExportPayload, setPreviewExportPayload] = useState<any | null>(null);
  const inspectExport = async (token: string) => {
    try {
      const res = await api.compliance.downloadExport(token);
      setPreviewExportPayload(res?.data || res?.exportPayload || res);
    } catch (err: any) {
      setActionError(err.message || "Failed to retrieve export.");
    }
  };

  // ==========================================
  // PHASE 17: RESIDENCY, CMEK & LEGAL HOLD HOOKS
  // ==========================================
  const { data: residencyData } = useQuery({
    queryKey: ["governance-residency"],
    queryFn: () => api.residency.get(),
  });
  const residencyPolicy = (residencyData as any)?.policy || (residencyData as any);

  const { data: cmekData } = useQuery({
    queryKey: ["governance-cmek"],
    queryFn: () => api.cmek.getStatus(),
  });
  const cmekStatus = cmekData as any;

  const { data: retentionData } = useQuery({
    queryKey: ["governance-retention"],
    queryFn: () => api.compliance.getRetentionPolicy(),
  });
  const retentionPolicy = retentionData as any;

  const [showResidencyModal, setShowResidencyModal] = useState(false);
  const [residencyForm, setResidencyForm] = useState({
    homeRegion: "us-east-1",
    permittedProcessingRegions: "us-east-1, eu-central-1",
    crossRegionReplicationAllowed: true,
  });

  const [showCmekModal, setShowCmekModal] = useState(false);
  const [cmekForm, setCmekForm] = useState({
    keyProvider: "LOCAL",
    keyReference: "tenant-kms-primary-01",
  });

  const [showLegalHoldModal, setShowLegalHoldModal] = useState(false);
  const [legalHoldForm, setLegalHoldForm] = useState({
    legalHold: true,
    reason: "Pending litigation preservation order",
  });

  const verifyResidencyMutation = useMutation({
    mutationFn: () => api.residency.verify(),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["governance-residency"] });
      setActionSuccess(`Residency verified: ${res?.status || "VERIFIED"} (Worker Region: ${res?.workerRegion || "us-east-1"})`);
    },
    onError: (err: any) => {
      setActionError(err.message || "Residency verification failed.");
    },
  });

  const updateResidencyMutation = useMutation({
    mutationFn: (data: any) => api.residency.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governance-residency"] });
      setShowResidencyModal(false);
      setActionSuccess("Data residency policy updated successfully.");
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to update residency policy.");
    },
  });

  const registerCmekMutation = useMutation({
    mutationFn: (data: any) => api.cmek.register(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governance-cmek"] });
      setShowCmekModal(false);
      setActionSuccess("CMEK key reference registered and envelope encryption activated.");
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to register CMEK key.");
    },
  });

  const rotateCmekMutation = useMutation({
    mutationFn: (reason?: string) => api.cmek.rotate({ reason }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["governance-cmek"] });
      setActionSuccess(`CMEK key successfully rotated to version ${res?.newKeyVersion || "2"}.`);
    },
    onError: (err: any) => {
      setActionError(err.message || "Key rotation failed.");
    },
  });

  const revokeCmekMutation = useMutation({
    mutationFn: (reason: string) => api.cmek.revoke({ confirmRevocation: true, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["governance-cmek"] });
      setActionSuccess("CMEK key permanently REVOKED. Decryption kill-switch triggered.");
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to revoke key.");
    },
  });

  const legalHoldMutation = useMutation({
    mutationFn: (data: any) => api.compliance.setLegalHold(data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["governance-retention"] });
      setShowLegalHoldModal(false);
      setActionSuccess(res?.legalHold ? "Legal Hold ACTIVE: Automated and manual purges blocked." : "Legal Hold RELEASED: Normal retention purges restored.");
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to update legal hold status.");
    },
  });

  const simulateCleanupMutation = useMutation({
    mutationFn: () => api.compliance.cleanupExpired({ dryRun: true }),
    onSuccess: (res: any) => {
      setActionSuccess(`Dry-Run Retention Simulation: ${res?.totalExecutionsCleaned ?? 0} executions eligible for purge. Actual deleted: 0 (simulation mode).`);
    },
    onError: (err: any) => {
      setActionError(err.message || "Cleanup simulation failed.");
    },
  });

  return (
    <AppShell
      title="Enterprise Governance & Collaboration"
      description="Organization hierarchies, workflow stewardship, deterministic policy gates, collaborative change reviews, and operational reliability objectives."
    >
      <div className="space-y-6 pb-12">
        {/* Banner feedback */}
        {actionSuccess && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-medium">{actionSuccess}</span>
            </div>
            <button
              onClick={clearFeedback}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
            >
              Dismiss
            </button>
          </div>
        )}

        {actionError && (
          <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-600" />
              <span className="text-sm font-medium">{actionError}</span>
            </div>
            <button
              onClick={clearFeedback}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {[
              { id: "overview", label: "Stewardship Overview", icon: ShieldCheck },
              { id: "orgs_teams", label: "Organizations & Teams", icon: Building2 },
              { id: "reviews", label: "Collaborative Reviews", icon: GitPullRequest },
              { id: "policy", label: "Governance Policies", icon: Shield },
              { id: "reliability", label: "Reliability & SLOs", icon: Activity },
              { id: "compliance", label: "Audit & Compliance", icon: FileCheck2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    clearFeedback();
                    setActiveTab(tab.id as any);
                  }}
                  data-testid={`tab-${tab.id}`}
                  className={cn(
                    "flex items-center gap-2 border-b-2 py-4 px-1 text-sm font-medium transition-colors",
                    isActive
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: OVERVIEW & WORKFLOW STEWARDSHIP */}
        {/* ========================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">Total Workflows</span>
                  <Shield className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {intelligence?.totalWorkflows || 0}
                </div>
                <div className="mt-1 text-xs text-slate-500">Governed across all business domains</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">Critical Workflows</span>
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div className="mt-2 text-2xl font-bold text-rose-600">
                  {intelligence?.criticalWorkflows || 0}
                </div>
                <div className="mt-1 text-xs text-slate-500">Mission-critical production flows</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">Orphaned Workflows</span>
                  <Users className="h-5 w-5 text-amber-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-amber-600">
                  {intelligence?.orphanedWorkflows || 0}
                </div>
                <div className="mt-1 text-xs text-slate-500">Workflows with no designated owner</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">Overdue Reviews</span>
                  <Clock className="h-5 w-5 text-orange-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-orange-600">
                  {intelligence?.overdueReviews || 0}
                </div>
                <div className="mt-1 text-xs text-slate-500">Passed scheduled periodic audit date</div>
              </div>
            </div>

            {/* Workflow Stewardship Directory */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-base font-semibold text-slate-900">
                  Workflow Stewardship & Ownership Directory
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Assign accountability, escalation contacts, business domains, and review cadences.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Workflow</th>
                      <th className="px-6 py-3">Criticality</th>
                      <th className="px-6 py-3">Domain</th>
                      <th className="px-6 py-3">Owner User</th>
                      <th className="px-6 py-3">Owning Team</th>
                      <th className="px-6 py-3">Next Review</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {intelligence?.workflows?.map((wf: any) => (
                      <tr key={wf.id} className="hover:bg-slate-50/75">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{wf.name}</div>
                          <div className="text-xs text-slate-400 font-mono">{wf.id.slice(0, 12)}...</div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                              wf.criticality === "CRITICAL"
                                ? "bg-rose-100 text-rose-800"
                                : wf.criticality === "HIGH"
                                ? "bg-orange-100 text-orange-800"
                                : wf.criticality === "MEDIUM"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-slate-100 text-slate-800"
                            )}
                          >
                            {wf.criticality}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{wf.businessDomain || "OPERATIONS"}</td>
                        <td className="px-6 py-4">
                          {wf.owner ? (
                            <span className="text-slate-900 font-medium">{wf.owner.name}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                              <AlertCircle className="h-3 w-3" /> Unowned
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {wf.owningTeam ? (
                            <span className="text-indigo-600 font-medium">{wf.owningTeam.name}</span>
                          ) : (
                            <span className="text-slate-400 text-xs italic">None</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {wf.nextReviewDate ? new Date(wf.nextReviewDate).toLocaleDateString() : "Unscheduled"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              setEditingWorkflow(wf);
                              setStewardshipForm({
                                criticality: wf.criticality || "MEDIUM",
                                businessDomain: wf.businessDomain || "OPERATIONS",
                                escalationContact: wf.escalationContact || "",
                                lifecycleStatus: wf.lifecycleStatus || "DRAFT",
                                owningTeamId: wf.owningTeamId || "",
                              });
                            }}
                            data-testid={`btn-edit-stewardship-${wf.id}`}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                            Stewardship
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!intelligence?.workflows || intelligence.workflows.length === 0) && (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                          No workflows found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stewardship Edit Modal */}
            {editingWorkflow && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h4 className="font-semibold text-slate-900">
                      Update Stewardship: {editingWorkflow.name}
                    </h4>
                    <button
                      onClick={() => setEditingWorkflow(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div>
                      <label className="block font-medium text-slate-700">Criticality Tier</label>
                      <select
                        value={stewardshipForm.criticality}
                        onChange={(e) =>
                          setStewardshipForm({ ...stewardshipForm, criticality: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="CRITICAL">CRITICAL</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">Business Domain</label>
                      <select
                        value={stewardshipForm.businessDomain}
                        onChange={(e) =>
                          setStewardshipForm({ ...stewardshipForm, businessDomain: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        <option value="OPERATIONS">OPERATIONS</option>
                        <option value="FINANCE">FINANCE</option>
                        <option value="MARKETING">MARKETING</option>
                        <option value="ENGINEERING">ENGINEERING</option>
                        <option value="SECURITY">SECURITY</option>
                        <option value="HR">HR</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">Owning Team</label>
                      <select
                        value={stewardshipForm.owningTeamId}
                        onChange={(e) =>
                          setStewardshipForm({ ...stewardshipForm, owningTeamId: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        <option value="">(None)</option>
                        {teams.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">Escalation Contact</label>
                      <input
                        type="text"
                        value={stewardshipForm.escalationContact}
                        placeholder="e.g. devops-oncall@acme.com or Slack #ops-alerts"
                        onChange={(e) =>
                          setStewardshipForm({ ...stewardshipForm, escalationContact: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      >
                      </input>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button
                      onClick={() => setEditingWorkflow(null)}
                      className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const payload: any = { ...stewardshipForm };
                        if (!payload.owningTeamId) delete payload.owningTeamId;
                        updateStewardshipMutation.mutate({
                          workflowId: editingWorkflow.id,
                          data: payload,
                        });
                      }}
                      data-testid="btn-save-stewardship"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: ORGANIZATIONS & TEAMS */}
        {/* ========================================================= */}
        {activeTab === "orgs_teams" && (
          <div className="space-y-6">
            {/* Organizations Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Organization Hierarchy</h3>
                  <p className="text-xs text-slate-500">
                    Parent container governing workspaces, centralized billing, and enterprise role rosters.
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  Last-Owner Protection Enabled
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {organizations.map((org: any) => (
                  <div key={org.id} className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900">{org.name}</div>
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-mono font-medium text-slate-700">
                        {org.tier}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Slug: <span className="font-mono">{org.slug}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Members: <span className="font-semibold">{org.members?.length || 0}</span> | Workspaces:{" "}
                      <span className="font-semibold">{org.workspaces?.length || 0}</span>
                    </div>
                  </div>
                ))}
                {organizations.length === 0 && (
                  <div className="col-span-2 py-6 text-center text-sm text-slate-500">
                    No parent organization configured. Workspaces can be mapped to an organization hierarchy.
                  </div>
                )}
              </div>
            </div>

            {/* Teams Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Functional Workspace Teams</h3>
                  <p className="text-xs text-slate-500">
                    Organize members into functional units for shared resource permissions and workflow stewardship.
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateTeamModal(true)}
                  data-testid="btn-create-team-open"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" />
                  Create Team
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {teams.map((t: any) => (
                  <div key={t.id} className="rounded-lg border border-slate-200 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900">{t.name}</div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                        {t.members?.length || 0} members
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {t.description || "No description provided."}
                    </p>
                    <div className="pt-2 border-t text-xs text-slate-400">
                      Team ID: <span className="font-mono">{t.id.slice(0, 10)}...</span>
                    </div>
                  </div>
                ))}
                {teams.length === 0 && (
                  <div className="col-span-3 py-6 text-center text-sm text-slate-500">
                    No teams configured yet. Create a team like 'Platform Ops' or 'Security' to assign workflow stewardship.
                  </div>
                )}
              </div>
            </div>

            {/* Create Team Modal */}
            {showCreateTeamModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h4 className="font-semibold text-slate-900">Create Functional Team</h4>
                    <button
                      onClick={() => setShowCreateTeamModal(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div>
                      <label className="block font-medium text-slate-700">Team Name</label>
                      <input
                        type="text"
                        placeholder="e.g. SRE & Platform Operations"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        data-testid="input-team-name"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">Description</label>
                      <textarea
                        rows={3}
                        placeholder="Describe the team's operational scope..."
                        value={newTeamDescription}
                        onChange={(e) => setNewTeamDescription(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button
                      onClick={() => setShowCreateTeamModal(false)}
                      className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!newTeamName.trim()}
                      onClick={() =>
                        createTeamMutation.mutate({
                          name: newTeamName,
                          description: newTeamDescription,
                        })
                      }
                      data-testid="btn-create-team-submit"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Create Team
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: COLLABORATIVE REVIEWS */}
        {/* ========================================================= */}
        {activeTab === "reviews" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Collaborative Change Reviews</h3>
                <p className="text-xs text-slate-500">
                  Four-eyes approval gates locked to immutable SHA-256 graph hashes. Stale edits invalidate reviews automatically.
                </p>
              </div>
              <button
                onClick={() => setShowSubmitReviewModal(true)}
                data-testid="btn-submit-review-open"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Submit Review
              </button>
            </div>

            {/* Filter pills */}
            <div className="flex gap-2">
              {["ALL", "SUBMITTED", "APPROVED", "CHANGES_REQUESTED", "REJECTED", "SUPERSEDED"].map(
                (status) => (
                  <button
                    key={status}
                    onClick={() => setReviewFilterStatus(status)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      reviewFilterStatus === status
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {status}
                  </button>
                )
              )}
            </div>

            {/* Reviews Table */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Review Title</th>
                    <th className="px-6 py-3">Workflow</th>
                    <th className="px-6 py-3">Version</th>
                    <th className="px-6 py-3">Author</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Content Hash</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {reviews.map((rev: any) => (
                    <tr key={rev.id} className="hover:bg-slate-50/75">
                      <td className="px-6 py-4 font-medium text-slate-900">{rev.title}</td>
                      <td className="px-6 py-4 text-slate-600">{rev.workflow?.name}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">
                        v{rev.workflowVersionNumber}
                      </td>
                      <td className="px-6 py-4 text-slate-600">{rev.author?.name}</td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            rev.status === "APPROVED"
                              ? "bg-emerald-100 text-emerald-800"
                              : rev.status === "SUBMITTED"
                              ? "bg-blue-100 text-blue-800"
                              : rev.status === "CHANGES_REQUESTED"
                              ? "bg-amber-100 text-amber-800"
                              : rev.status === "REJECTED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-slate-100 text-slate-500 line-through"
                          )}
                        >
                          {rev.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {rev.contentHash?.slice(0, 10)}...
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedReviewId(rev.id)}
                          data-testid={`btn-view-review-${rev.id}`}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          Inspect Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {reviews.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                        No reviews found for this status.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Submit Review Modal */}
            {showSubmitReviewModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h4 className="font-semibold text-slate-900">Submit Workflow for Review</h4>
                    <button
                      onClick={() => setShowSubmitReviewModal(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div>
                      <label className="block font-medium text-slate-700">Select Workflow</label>
                      <select
                        value={reviewWorkflowId}
                        onChange={(e) => setReviewWorkflowId(e.target.value)}
                        data-testid="select-review-workflow"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        <option value="">-- Choose workflow --</option>
                        {intelligence?.workflows?.map((w: any) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.criticality})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">Workflow Version</label>
                      <input
                        type="number"
                        min={1}
                        value={reviewVersionNumber}
                        onChange={(e) => setReviewVersionNumber(parseInt(e.target.value) || 1)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">Review Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Add webhook authentication & retries"
                        value={reviewTitle}
                        onChange={(e) => setReviewTitle(e.target.value)}
                        data-testid="input-review-title"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">Change Summary</label>
                      <textarea
                        rows={3}
                        placeholder="Explain why this change is safe for production..."
                        value={reviewChangeSummary}
                        onChange={(e) => setReviewChangeSummary(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button
                      onClick={() => setShowSubmitReviewModal(false)}
                      className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!reviewWorkflowId || !reviewTitle.trim()}
                      onClick={() =>
                        submitReviewMutation.mutate({
                          workflowId: reviewWorkflowId,
                          workflowVersionNumber: reviewVersionNumber,
                          title: reviewTitle,
                          changeSummary: reviewChangeSummary,
                        })
                      }
                      data-testid="btn-submit-review-confirm"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Submit Review
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Review Detail Drawer / Modal */}
            {selectedReviewId && currentReview && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">{currentReview.title}</h4>
                      <p className="text-xs text-slate-500">
                        Workflow: {currentReview.workflow?.name} (v{currentReview.workflowVersionNumber})
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedReviewId(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      &times;
                    </button>
                  </div>

                  {/* Hash Integrity Validation Banner */}
                  <div
                    className={cn(
                      "rounded-lg p-3 text-xs flex items-center gap-2",
                      currentReview.isHashMatched
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-rose-50 text-rose-800 border border-rose-200"
                    )}
                  >
                    {currentReview.isHashMatched ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <div>
                          <span className="font-semibold">Cryptographic Hash Matched: </span>
                          Underlying workflow definition has NOT been modified since review submission. Safe to decide.
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                        <div>
                          <span className="font-semibold">Stale Draft Hash Detected: </span>
                          Workflow was modified after submission. Approval is invalidated and marked SUPERSEDED.
                        </div>
                      </>
                    )}
                  </div>

                  {/* Decision Controls (Admins/Owners) */}
                  {currentReview.status === "SUBMITTED" && (
                    <div className="rounded-lg border border-slate-200 p-4 bg-slate-50 space-y-3">
                      <h5 className="text-xs font-semibold text-slate-700 uppercase">
                        Review Decision (Admins / Owners)
                      </h5>
                      <input
                        type="text"
                        placeholder="Provide reason for approval or change request..."
                        value={decisionReason}
                        onChange={(e) => setDecisionReason(e.target.value)}
                        data-testid="input-decision-reason"
                        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            decideReviewMutation.mutate({
                              id: currentReview.id,
                              decision: "APPROVED",
                              reason: decisionReason,
                            })
                          }
                          data-testid="btn-decision-approve"
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          Approve Review
                        </button>
                        <button
                          onClick={() =>
                            decideReviewMutation.mutate({
                              id: currentReview.id,
                              decision: "CHANGES_REQUESTED",
                              reason: decisionReason,
                            })
                          }
                          data-testid="btn-decision-changes"
                          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
                        >
                          Request Changes
                        </button>
                        <button
                          onClick={() =>
                            decideReviewMutation.mutate({
                              id: currentReview.id,
                              decision: "REJECTED",
                              reason: decisionReason,
                            })
                          }
                          data-testid="btn-decision-reject"
                          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Discussion Comments */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-semibold text-slate-700 uppercase">
                      Auditable Discussion ({currentReview.comments?.length || 0})
                    </h5>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {currentReview.comments?.map((c: any) => (
                        <div key={c.id} className="rounded-lg border border-slate-200 p-3 text-xs bg-white">
                          <div className="flex items-center justify-between text-slate-500 mb-1">
                            <span className="font-semibold text-slate-900">{c.author?.name}</span>
                            <span>{new Date(c.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-slate-700">{c.comment}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add comment to review thread..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        data-testid="input-review-comment"
                        className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                      />
                      <button
                        disabled={!commentText.trim()}
                        onClick={() =>
                          addCommentMutation.mutate({
                            id: currentReview.id,
                            comment: commentText,
                          })
                        }
                        data-testid="btn-add-review-comment"
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Comment
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: GOVERNANCE POLICY & ENFORCEMENT */}
        {/* ========================================================= */}
        {activeTab === "policy" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Policy Editor */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Workspace Governance Policy
                  </h3>
                  <p className="text-xs text-slate-500">
                    Deterministic server-side gates enforced before workflow activations or environment promotions.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={policyForm.requireWorkflowOwner}
                      onChange={(e) =>
                        setPolicyForm({ ...policyForm, requireWorkflowOwner: e.target.checked })
                      }
                      data-testid="checkbox-require-owner"
                      className="mt-0.5 rounded border-slate-300 text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Require Designated Owner</div>
                      <div className="text-xs text-slate-500">
                        Workflows without an assigned user owner cannot be activated or promoted.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={policyForm.requireReviewForCritical}
                      onChange={(e) =>
                        setPolicyForm({ ...policyForm, requireReviewForCritical: e.target.checked })
                      }
                      data-testid="checkbox-require-review"
                      className="mt-0.5 rounded border-slate-300 text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Require Review for Critical Flows</div>
                      <div className="text-xs text-slate-500">
                        CRITICAL tier workflows require an APPROVED review before deployment.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={policyForm.requirePassingTests}
                      onChange={(e) =>
                        setPolicyForm({ ...policyForm, requirePassingTests: e.target.checked })
                      }
                      data-testid="checkbox-require-tests"
                      className="mt-0.5 rounded border-slate-300 text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Require Passing Pre-Deployment Tests</div>
                      <div className="text-xs text-slate-500">
                        Enforces 100% green dry-run test cases prior to release promotion.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={policyForm.requireHttpsWebhooks}
                      onChange={(e) =>
                        setPolicyForm({ ...policyForm, requireHttpsWebhooks: e.target.checked })
                      }
                      className="mt-0.5 rounded border-slate-300 text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Enforce HTTPS Outbound Endpoints</div>
                      <div className="text-xs text-slate-500">
                        Rejects HTTP Request nodes using unencrypted http:// urls.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={policyForm.enforceReliabilitySlo}
                      onChange={(e) =>
                        setPolicyForm({ ...policyForm, enforceReliabilitySlo: e.target.checked })
                      }
                      className="mt-0.5 rounded border-slate-300 text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900">Enforce Operational Reliability SLOs</div>
                      <div className="text-xs text-slate-500">
                        Warns if an active SLO error budget is currently BREACHED.
                      </div>
                    </div>
                  </label>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => updatePolicyMutation.mutate(policyForm)}
                    data-testid="btn-save-policy"
                    className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    Save Governance Policy
                  </button>
                </div>
              </div>

              {/* Policy Evaluation Sandbox */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Policy Evaluation Sandbox
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dry-run evaluate policies against any workflow to verify compliance before deployment.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Target Workflow</label>
                    <select
                      value={evalWorkflowId}
                      onChange={(e) => setEvalWorkflowId(e.target.value)}
                      data-testid="select-eval-workflow"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                    >
                      <option value="">-- Choose workflow --</option>
                      {intelligence?.workflows?.map((w: any) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.criticality})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700">Action Context</label>
                    <select
                      value={evalAction}
                      onChange={(e) => setEvalAction(e.target.value as any)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                    >
                      <option value="ACTIVATE">ACTIVATE (Turn workflow live)</option>
                      <option value="PROMOTE">PROMOTE (Promote release to environment)</option>
                      <option value="DEPLOY">DEPLOY (Execute deployment)</option>
                    </select>
                  </div>

                  <button
                    disabled={!evalWorkflowId}
                    onClick={() =>
                      evaluatePolicyMutation.mutate({
                        workflowId: evalWorkflowId,
                        action: evalAction,
                      })
                    }
                    data-testid="btn-run-policy-eval"
                    className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                  >
                    Evaluate Governance Rules
                  </button>
                </div>

                {/* Evaluation Results Output */}
                {evalResult && (
                  <div
                    data-testid="eval-result-card"
                    className={cn(
                      "rounded-lg border p-4 text-xs space-y-2 mt-4",
                      evalResult.compliant
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-rose-200 bg-rose-50 text-rose-900"
                    )}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        {evalResult.compliant ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-rose-600" />
                        )}
                        Compliance Status: {evalResult.compliant ? "COMPLIANT (PASSED)" : "NON-COMPLIANT (BLOCKED)"}
                      </span>
                    </div>

                    {evalResult.violations?.length > 0 && (
                      <div className="space-y-1 pt-2">
                        <span className="font-semibold text-rose-800">Blocking Violations:</span>
                        {evalResult.violations.map((v: any, idx: number) => (
                          <div key={idx} className="bg-white/80 p-2 rounded border border-rose-200">
                            <div className="font-semibold text-rose-700">[{v.rule}] {v.message}</div>
                            <div className="text-slate-600 mt-0.5">Fix: {v.remediation}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {evalResult.passedRules?.length > 0 && (
                      <div className="text-slate-600 pt-1">
                        Passed rules: {evalResult.passedRules.join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: RELIABILITY OBJECTIVES (SLO) */}
        {/* ========================================================= */}
        {activeTab === "reliability" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Operational Reliability Objectives (SLOs)</h3>
                <p className="text-xs text-slate-500">
                  Real-time error budgets, burn rate calculation, and statistical integrity gates (&ge;5 executions required).
                </p>
              </div>
              <button
                onClick={() => setShowCreateSloModal(true)}
                data-testid="btn-create-slo-open"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Define SLO
              </button>
            </div>

            {/* SLO Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {objectives.map((obj: any) => (
                <div key={obj.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-900">{obj.name}</h4>
                      <p className="text-xs text-slate-500">
                        {obj.targetMetric === "SUCCESS_RATE" ? "Success Rate" : "Latency P95"} over{" "}
                        {obj.timeWindowHours}h window
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        obj.status === "HEALTHY"
                          ? "bg-emerald-100 text-emerald-800"
                          : obj.status === "AT_RISK"
                          ? "bg-amber-100 text-amber-800"
                          : obj.status === "BREACHED"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {obj.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded">
                      <span className="text-slate-400">Target</span>
                      <div className="font-bold text-slate-800">
                        {obj.targetValue} {obj.targetMetric === "SUCCESS_RATE" ? "%" : "ms"}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded">
                      <span className="text-slate-400">Current</span>
                      <div className="font-bold text-slate-800">
                        {obj.evaluationSummary?.insufficientData ? (
                          <span className="text-slate-500 italic">Insufficient Data (&lt;5)</span>
                        ) : (
                          `${obj.evaluationSummary?.currentValue ?? "N/A"}${
                            obj.targetMetric === "SUCCESS_RATE" ? "%" : "ms"
                          }`
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Error budget progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Error Budget Remaining</span>
                      <span className="font-semibold">
                        {obj.evaluationSummary?.errorBudgetRemainingPct !== undefined
                          ? `${obj.evaluationSummary.errorBudgetRemainingPct.toFixed(1)}%`
                          : "100%"}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          (obj.evaluationSummary?.errorBudgetRemainingPct ?? 100) > 30
                            ? "bg-emerald-500"
                            : (obj.evaluationSummary?.errorBudgetRemainingPct ?? 100) > 0
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        )}
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, obj.evaluationSummary?.errorBudgetRemainingPct ?? 100)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t flex justify-end">
                    <button
                      onClick={() => evaluateSloMutation.mutate(obj.id)}
                      data-testid={`btn-evaluate-slo-${obj.id}`}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      Evaluate Telemetry
                    </button>
                  </div>
                </div>
              ))}
              {objectives.length === 0 && (
                <div className="col-span-3 py-10 text-center text-sm text-slate-500">
                  No reliability objectives defined. Create an SLO to monitor workflow health and error budgets.
                </div>
              )}
            </div>

            {/* Create SLO Modal */}
            {showCreateSloModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h4 className="font-semibold text-slate-900">Define Reliability Objective (SLO)</h4>
                    <button
                      onClick={() => setShowCreateSloModal(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div>
                      <label className="block font-medium text-slate-700">Objective Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Production Order Pipeline 99.5% SLO"
                        value={sloName}
                        onChange={(e) => setSloName(e.target.value)}
                        data-testid="input-slo-name"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">Target Metric</label>
                      <select
                        value={sloMetric}
                        onChange={(e) => setSloMetric(e.target.value as any)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        <option value="SUCCESS_RATE">SUCCESS_RATE (%)</option>
                        <option value="LATENCY_P95">LATENCY_P95 (ms)</option>
                        <option value="EXECUTION_DURATION">EXECUTION_DURATION (ms)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">Target Threshold Value</label>
                      <input
                        type="number"
                        step={0.1}
                        value={sloTargetValue}
                        onChange={(e) => setSloTargetValue(parseFloat(e.target.value) || 99.0)}
                        data-testid="input-slo-target"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700">Time Window (Hours)</label>
                      <select
                        value={sloTimeWindow}
                        onChange={(e) => setSloTimeWindow(parseInt(e.target.value) || 24)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        <option value={1}>1 hour</option>
                        <option value={24}>24 hours (1 day)</option>
                        <option value={168}>168 hours (7 days)</option>
                        <option value={720}>720 hours (30 days)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button
                      onClick={() => setShowCreateSloModal(false)}
                      className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!sloName.trim()}
                      onClick={() =>
                        createSloMutation.mutate({
                          name: sloName,
                          targetMetric: sloMetric,
                          targetValue: sloTargetValue,
                          timeWindowHours: sloTimeWindow,
                          workflowId: sloWorkflowId || null,
                        })
                      }
                      data-testid="btn-create-slo-submit"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Save Objective
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: AUDIT SEARCH & COMPLIANCE EVIDENCE EXPORTS */}
        {/* ========================================================= */}
        {activeTab === "compliance" && (
          <div className="space-y-6">
            {/* Phase 17: Enterprise Data Residency, CMEK & Legal Hold Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Data Residency */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-indigo-600" />
                    <h3 className="text-sm font-semibold text-slate-900">Data Residency</h3>
                  </div>
                  <span
                    data-testid="badge-residency-status"
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      residencyPolicy?.verificationStatus === "VERIFIED"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    )}
                  >
                    {residencyPolicy?.verificationStatus || "UNVERIFIED"}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Home Region:</span>
                    <span className="font-semibold text-slate-800">{residencyPolicy?.homeRegion || "us-east-1"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Processing Zones:</span>
                    <span className="font-mono text-slate-700">
                      {(residencyPolicy?.permittedProcessingRegions || ["us-east-1"]).join(", ")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cross-Region Replication:</span>
                    <span className="font-medium text-slate-700">
                      {residencyPolicy?.crossRegionReplicationAllowed ? "Allowed" : "Strictly Disallowed"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={() => verifyResidencyMutation.mutate()}
                    data-testid="btn-verify-residency"
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                    Verify Placement
                  </button>
                  <button
                    onClick={() => {
                      setResidencyForm({
                        homeRegion: residencyPolicy?.homeRegion || "us-east-1",
                        permittedProcessingRegions: (residencyPolicy?.permittedProcessingRegions || ["us-east-1"]).join(", "),
                        crossRegionReplicationAllowed: residencyPolicy?.crossRegionReplicationAllowed ?? true,
                      });
                      setShowResidencyModal(true);
                    }}
                    data-testid="btn-edit-residency"
                    className="rounded bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    Policy
                  </button>
                </div>
              </div>

              {/* Card 2: Customer-Managed Encryption Keys (CMEK) */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-indigo-600" />
                    <h3 className="text-sm font-semibold text-slate-900">CMEK Encryption</h3>
                  </div>
                  <span
                    data-testid="badge-cmek-status"
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      cmekStatus?.config?.keyStatus === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-800"
                        : cmekStatus?.config?.keyStatus === "REVOKED"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {cmekStatus?.config?.keyStatus || "NOT CONFIGURED"}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Provider:</span>
                    <span className="font-semibold text-slate-800">{cmekStatus?.config?.keyProvider || "LOCAL"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Key Reference:</span>
                    <span className="font-mono text-slate-700 truncate max-w-[140px]" title={cmekStatus?.config?.keyReference}>
                      {cmekStatus?.config?.keyReference || "Platform Managed"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Key Version / Epoch:</span>
                    <span className="font-mono text-slate-700">
                      v{cmekStatus?.config?.keyVersion || "1"} (Epoch {cmekStatus?.config?.rotationEpoch || "1"})
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  {!cmekStatus?.isConfigured || cmekStatus?.config?.keyStatus === "REVOKED" ? (
                    <button
                      onClick={() => setShowCmekModal(true)}
                      data-testid="btn-register-cmek"
                      className="w-full inline-flex items-center justify-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      <Key className="h-3.5 w-3.5" />
                      Register KMS Key
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => rotateCmekMutation.mutate("Admin scheduled rotation")}
                        data-testid="btn-rotate-cmek"
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                        Rotate Key
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Are you sure you want to permanently REVOKE this key? All encrypted data will be inaccessible.")) {
                            revokeCmekMutation.mutate("Tenant admin emergency revocation drill");
                          }
                        }}
                        data-testid="btn-revoke-cmek"
                        className="rounded bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Revoke
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Card 3: Legal Hold & Retention */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" />
                    <h3 className="text-sm font-semibold text-slate-900">Legal Hold Guard</h3>
                  </div>
                  <span
                    data-testid="badge-legal-hold-status"
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      retentionPolicy?.legalHold
                        ? "bg-purple-100 text-purple-800"
                        : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {retentionPolicy?.legalHold ? "LEGAL HOLD ACTIVE" : "PURGES PERMITTED"}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Retention Horizon:</span>
                    <span className="font-semibold text-slate-800">{retentionPolicy?.executionRetentionDays || 90} Days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Purge Enforcement:</span>
                    <span className={retentionPolicy?.legalHold ? "font-semibold text-purple-700" : "text-emerald-700"}>
                      {retentionPolicy?.legalHold ? "BLOCKED by Legal Hold" : "Standard Automated"}
                    </span>
                  </div>
                  <div className="flex justify-between truncate">
                    <span className="text-slate-500">Reason:</span>
                    <span className="text-slate-700 truncate max-w-[140px]" title={retentionPolicy?.legalHoldReason || "None"}>
                      {retentionPolicy?.legalHoldReason || "None"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={() => {
                      setLegalHoldForm({
                        legalHold: !retentionPolicy?.legalHold,
                        reason: retentionPolicy?.legalHold ? "" : "Active litigation compliance preservation order",
                      });
                      setShowLegalHoldModal(true);
                    }}
                    data-testid="btn-toggle-legal-hold"
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {retentionPolicy?.legalHold ? "Release Hold" : "Place Legal Hold"}
                  </button>
                  <button
                    onClick={() => simulateCleanupMutation.mutate()}
                    data-testid="btn-dry-run-cleanup"
                    className="rounded bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Dry Run
                  </button>
                </div>
              </div>
            </div>

            {/* Modals for Residency, CMEK, and Legal Hold */}
            {showResidencyModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h4 className="font-semibold text-slate-900">Configure Data Residency Policy</h4>
                    <button onClick={() => setShowResidencyModal(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700">Home Region</label>
                      <input
                        type="text"
                        value={residencyForm.homeRegion}
                        onChange={(e) => setResidencyForm({ ...residencyForm, homeRegion: e.target.value })}
                        data-testid="input-residency-home"
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700">Permitted Processing Regions (comma separated)</label>
                      <input
                        type="text"
                        value={residencyForm.permittedProcessingRegions}
                        onChange={(e) => setResidencyForm({ ...residencyForm, permittedProcessingRegions: e.target.value })}
                        data-testid="input-residency-processing"
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="chk-cross-region"
                        checked={residencyForm.crossRegionReplicationAllowed}
                        onChange={(e) => setResidencyForm({ ...residencyForm, crossRegionReplicationAllowed: e.target.checked })}
                      />
                      <label htmlFor="chk-cross-region" className="text-slate-700">Allow Cross-Region Replication</label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button onClick={() => setShowResidencyModal(false)} className="rounded border px-4 py-1.5 text-xs text-slate-700">Cancel</button>
                    <button
                      onClick={() =>
                        updateResidencyMutation.mutate({
                          homeRegion: residencyForm.homeRegion,
                          permittedProcessingRegions: residencyForm.permittedProcessingRegions.split(",").map((s) => s.trim()).filter(Boolean),
                          crossRegionReplicationAllowed: residencyForm.crossRegionReplicationAllowed,
                          changeReason: "Admin updated residency boundaries",
                        })
                      }
                      data-testid="btn-save-residency"
                      className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      Save Policy
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showCmekModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h4 className="font-semibold text-slate-900">Register Customer-Managed Key (CMEK)</h4>
                    <button onClick={() => setShowCmekModal(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700">Key Provider</label>
                      <select
                        value={cmekForm.keyProvider}
                        onChange={(e) => setCmekForm({ ...cmekForm, keyProvider: e.target.value })}
                        data-testid="select-cmek-provider"
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5"
                      >
                        <option value="LOCAL">Local AES-256 Envelope KMS</option>
                        <option value="AWS_KMS">AWS KMS (KMS Key ARN)</option>
                        <option value="VAULT">HashiCorp Vault Transit</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700">Key Reference (ARN or ID)</label>
                      <input
                        type="text"
                        placeholder="arn:aws:kms:us-east-1:123456789012:key/... or local-key-ref"
                        value={cmekForm.keyReference}
                        onChange={(e) => setCmekForm({ ...cmekForm, keyReference: e.target.value })}
                        data-testid="input-cmek-key-ref"
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button onClick={() => setShowCmekModal(false)} className="rounded border px-4 py-1.5 text-xs text-slate-700">Cancel</button>
                    <button
                      onClick={() => registerCmekMutation.mutate(cmekForm)}
                      data-testid="btn-save-cmek"
                      className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      Register Key
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showLegalHoldModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h4 className="font-semibold text-slate-900">
                      {legalHoldForm.legalHold ? "Place Legal Hold" : "Release Legal Hold"}
                    </h4>
                    <button onClick={() => setShowLegalHoldModal(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
                  </div>
                  <div className="space-y-3 text-xs">
                    <p className="text-slate-600">
                      {legalHoldForm.legalHold
                        ? "Placing a legal hold will immediately prevent all automated data retention purges and manual data deletion requests until explicitly released."
                        : "Releasing this legal hold will permit normal automated lifecycle purges to resume across all expired executions and audit logs."}
                    </p>
                    {legalHoldForm.legalHold && (
                      <div>
                        <label className="block font-medium text-slate-700">Justification / Matter Reference</label>
                        <input
                          type="text"
                          placeholder="e.g. Litigation Matter Case #2026-CV-889"
                          value={legalHoldForm.reason}
                          onChange={(e) => setLegalHoldForm({ ...legalHoldForm, reason: e.target.value })}
                          data-testid="input-legal-hold-reason"
                          className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button onClick={() => setShowLegalHoldModal(false)} className="rounded border px-4 py-1.5 text-xs text-slate-700">Cancel</button>
                    <button
                      onClick={() => legalHoldMutation.mutate(legalHoldForm)}
                      data-testid="btn-save-legal-hold"
                      className={cn(
                        "rounded px-4 py-1.5 text-xs font-semibold text-white",
                        legalHoldForm.legalHold ? "bg-purple-600 hover:bg-purple-700" : "bg-emerald-600 hover:bg-emerald-700"
                      )}
                    >
                      {legalHoldForm.legalHold ? "Confirm Legal Hold" : "Confirm Release"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Compliance Export Package Generator */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Compliance Evidence Export Center
                  </h3>
                  <p className="text-xs text-slate-500">
                    Generate tamper-evident, sanitized compliance packages for SOC 2, ISO 27001, and enterprise auditor verification.
                  </p>
                </div>
                <button
                  onClick={() => setShowExportModal(true)}
                  data-testid="btn-generate-export-open"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  <Download className="h-4 w-4" />
                  Generate Compliance Export
                </button>
              </div>

              {/* Exports list */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Requested At</th>
                      <th className="px-4 py-2.5">Reason</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Expires In</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {complianceExports.map((exp: any) => (
                      <tr key={exp.id}>
                        <td className="px-4 py-3 text-slate-700 font-mono">
                          {new Date(exp.requestedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-900 font-medium">{exp.reason}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold",
                              exp.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-600"
                            )}
                          >
                            {exp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {exp.expiresAt ? new Date(exp.expiresAt).toLocaleDateString() : "48 hours"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => inspectExport(exp.downloadToken)}
                            data-testid={`btn-inspect-export-${exp.id}`}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            View Evidence Payload
                          </button>
                        </td>
                      </tr>
                    ))}
                    {complianceExports.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          No compliance exports generated yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Multi-Dimensional Audit Search */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Enterprise Audit Log Stream</h3>
                  <p className="text-xs text-slate-500">
                    Comprehensive immutable search across authentication, permissions, releases, and workflow changes.
                  </p>
                </div>

                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search keyword or actor..."
                      value={auditKeyword}
                      onChange={(e) => setAuditKeyword(e.target.value)}
                      data-testid="input-audit-search"
                      className="rounded-md border border-slate-300 pl-8 pr-3 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Logs Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Timestamp</th>
                      <th className="px-4 py-2.5">Action</th>
                      <th className="px-4 py-2.5">Target Type</th>
                      <th className="px-4 py-2.5">Actor</th>
                      <th className="px-4 py-2.5">Target ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white font-mono">
                    {auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50/75">
                        <td className="px-4 py-2 text-slate-500">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 font-bold text-slate-800">{log.action}</td>
                        <td className="px-4 py-2 text-slate-600">{log.targetType}</td>
                        <td className="px-4 py-2 text-indigo-600">{log.actor?.name || log.actorId}</td>
                        <td className="px-4 py-2 text-slate-400">{log.targetId?.slice(0, 14)}...</td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500 font-sans">
                          No audit entries matching filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Generate Export Modal */}
            {showExportModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h4 className="font-semibold text-slate-900">Export Compliance Evidence</h4>
                    <button
                      onClick={() => setShowExportModal(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div>
                      <label className="block font-medium text-slate-700">Audit Inquiry Reason</label>
                      <input
                        type="text"
                        placeholder="e.g. Annual SOC 2 Type II external audit verification"
                        value={exportReason}
                        onChange={(e) => setExportReason(e.target.value)}
                        data-testid="input-export-reason"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700">Start Date</label>
                        <input
                          type="date"
                          value={exportStartDate}
                          onChange={(e) => setExportStartDate(e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">End Date</label>
                        <input
                          type="date"
                          value={exportEndDate}
                          onChange={(e) => setExportEndDate(e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button
                      onClick={() => setShowExportModal(false)}
                      className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!exportReason.trim()}
                      onClick={() =>
                        createExportMutation.mutate({
                          startDate: new Date(exportStartDate).toISOString(),
                          endDate: new Date(exportEndDate).toISOString(),
                          reason: exportReason,
                          includePayloads: false,
                        })
                      }
                      data-testid="btn-generate-export-submit"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Generate Package
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Inspect Payload Modal */}
            {previewExportPayload && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h4 className="font-semibold text-slate-900">
                      Sanitized Compliance Export Evidence (Valid 48h)
                    </h4>
                    <button
                      onClick={() => setPreviewExportPayload(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto bg-slate-900 text-emerald-400 p-4 rounded-lg font-mono text-xs">
                    <pre>{JSON.stringify(previewExportPayload, null, 2)}</pre>
                  </div>

                  <div className="flex justify-end pt-2 border-t">
                    <button
                      onClick={() => setPreviewExportPayload(null)}
                      className="rounded-md bg-slate-800 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                    >
                      Close Preview
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
