"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Target,
  Users,
  Calendar,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  Plus,
  RefreshCw,
  Search,
  Filter,
  FileText,
  Clock,
  ChevronRight,
  Eye,
  AlertCircle,
  HelpCircle,
  Award,
  Layers,
  ArrowRight,
  Building2,
  Sparkles,
  Check,
  X,
  ExternalLink,
} from "lucide-react";

export default function AccountPlanningPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    "overview" | "queue" | "plans" | "objectives" | "stakeholders" | "initiatives" | "reviews"
  >("overview");

  // Filter States
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals
  const [showConfigProfileModal, setShowConfigProfileModal] = useState(false);
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [showApprovePlanModal, setShowApprovePlanModal] = useState<any | null>(null);
  const [showNewObjectiveModal, setShowNewObjectiveModal] = useState(false);
  const [showRecordEvidenceModal, setShowRecordEvidenceModal] = useState<any | null>(null);
  const [showAddBlockerModal, setShowAddBlockerModal] = useState<any | null>(null);
  const [showResolveBlockerModal, setShowResolveBlockerModal] = useState<any | null>(null);
  const [showAssignStakeholderModal, setShowAssignStakeholderModal] = useState(false);
  const [showNewInitiativeModal, setShowNewInitiativeModal] = useState(false);
  const [showAddMilestoneModal, setShowAddMilestoneModal] = useState<any | null>(null);
  const [showScheduleReviewModal, setShowScheduleReviewModal] = useState(false);
  const [showCompleteReviewModal, setShowCompleteReviewModal] = useState<any | null>(null);
  const [showAddCommitmentModal, setShowAddCommitmentModal] = useState<any | null>(null);
  const [selectedPlanDetail, setSelectedPlanDetail] = useState<any | null>(null);
  const [selectedReviewSnapshot, setSelectedReviewSnapshot] = useState<any | null>(null);

  // Form States
  const [configProfileForm, setConfigProfileForm] = useState({
    customerAccountId: "",
    accountSegment: "ENTERPRISE",
    strategicTier: "TIER_1_CORE",
    reviewCadence: "QUARTERLY",
    industry: "",
    businessDomain: "",
    internalStrategicNotes: "",
  });

  const [newPlanForm, setNewPlanForm] = useState({
    customerAccountId: "",
    planNumber: `PLN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    title: "",
    planYear: new Date().getFullYear(),
    visionStatement: "",
    executiveSummary: "",
  });

  const [newObjectiveForm, setNewObjectiveForm] = useState({
    customerAccountId: "",
    accountPlanId: "",
    objectiveNumber: `OBJ-${Math.floor(1000 + Math.random() * 9000)}`,
    title: "",
    description: "",
    businessRationale: "",
    category: "ADOPTION_SCALE",
    priority: "HIGH",
    targetDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    baselineValue: 0,
    targetValue: 100,
    unit: "%",
  });

  const [evidenceForm, setEvidenceForm] = useState({
    evidenceType: "TELEMETRY_OBSERVATION",
    observedValue: 0,
    description: "",
    sourceRef: "",
  });

  const [blockerForm, setBlockerForm] = useState({
    title: "",
    description: "",
    severity: "HIGH",
    expectedResolutionDate: "",
  });

  const [resolveBlockerForm, setResolveBlockerForm] = useState({
    resolutionNotes: "",
  });

  const [stakeholderForm, setStakeholderForm] = useState({
    customerAccountId: "",
    contactId: "",
    role: "EXECUTIVE_SPONSOR",
    department: "",
    verificationSource: "EBR",
    notes: "",
  });

  const [initiativeForm, setInitiativeForm] = useState({
    customerAccountId: "",
    accountPlanId: "",
    initiativeNumber: `INIT-${Math.floor(100 + Math.random() * 900)}`,
    title: "",
    description: "",
    targetCompletionDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });

  const [milestoneForm, setMilestoneForm] = useState({
    title: "",
    targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });

  const [reviewForm, setReviewForm] = useState({
    customerAccountId: "",
    reviewNumber: `EBR-${new Date().getFullYear()}-Q${Math.floor((new Date().getMonth() + 3) / 3)}`,
    reviewPeriod: `Q${Math.floor((new Date().getMonth() + 3) / 3)} ${new Date().getFullYear()}`,
    plannedDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    meetingNotes: "",
  });

  const [completeReviewForm, setCompleteReviewForm] = useState({
    agreedSummary: "",
    nextReviewDate: "",
    meetingNotes: "",
  });

  const [commitmentForm, setCommitmentForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    generateSuccessTask: true,
  });

  // Queries
  const { data: accountsData } = useQuery({
    queryKey: ["customer-accounts"],
    queryFn: () => api.customers.listAccounts(),
  });
  const rawAccountsData: any = accountsData?.data;
  const accounts: any[] = Array.isArray(rawAccountsData)
    ? rawAccountsData
    : Array.isArray(rawAccountsData?.accounts)
    ? rawAccountsData.accounts
    : [];

  const { data: overviewData, isLoading: overviewLoading, refetch: refetchOverview } = useQuery({
    queryKey: ["portfolio-overview"],
    queryFn: () => api.accountPlanning.getPortfolioOverview(),
  });
  const overview = overviewData?.data;

  const { data: queueData, isLoading: queueLoading, refetch: refetchQueue } = useQuery({
    queryKey: ["portfolio-queue"],
    queryFn: () => api.accountPlanning.getPortfolioQueue(),
  });
  const queue = Array.isArray(queueData?.data) ? queueData.data : [];

  const { data: plansData, isLoading: plansLoading, refetch: refetchPlans } = useQuery({
    queryKey: ["account-plans", selectedAccountId],
    queryFn: () => api.accountPlanning.listPlans(selectedAccountId ? { customerAccountId: selectedAccountId } : undefined),
  });
  const plans = Array.isArray(plansData?.data) ? plansData.data : [];

  const { data: objectivesData, isLoading: objectivesLoading, refetch: refetchObjectives } = useQuery({
    queryKey: ["customer-objectives", selectedAccountId],
    queryFn: () => api.accountPlanning.listObjectives(selectedAccountId ? { customerAccountId: selectedAccountId } : undefined),
  });
  const objectives = Array.isArray(objectivesData?.data) ? objectivesData.data : [];

  const { data: stakeholdersData, isLoading: stakeholdersLoading, refetch: refetchStakeholders } = useQuery({
    queryKey: ["customer-stakeholders", selectedAccountId],
    queryFn: () => selectedAccountId ? api.accountPlanning.listStakeholders(selectedAccountId) : Promise.resolve({ data: [] }),
    enabled: !!selectedAccountId,
  });
  const stakeholders = Array.isArray(stakeholdersData?.data) ? stakeholdersData.data : [];

  const { data: coverageData, refetch: refetchCoverage } = useQuery({
    queryKey: ["stakeholder-coverage", selectedAccountId],
    queryFn: () => selectedAccountId ? api.accountPlanning.getCoverage(selectedAccountId) : Promise.resolve({ data: null }),
    enabled: !!selectedAccountId,
  });
  const coverage = coverageData?.data;

  const { data: contactsData } = useQuery({
    queryKey: ["customer-contacts", selectedAccountId],
    queryFn: () => selectedAccountId ? api.customers.listContacts(selectedAccountId) : Promise.resolve({ data: [] }),
    enabled: !!selectedAccountId,
  });
  const contacts = Array.isArray(contactsData?.data) ? contactsData.data : [];

  const { data: initiativesData, isLoading: initiativesLoading, refetch: refetchInitiatives } = useQuery({
    queryKey: ["strategic-initiatives", selectedAccountId],
    queryFn: () => api.accountPlanning.listInitiatives(selectedAccountId ? { customerAccountId: selectedAccountId } : undefined),
  });
  const initiatives = Array.isArray(initiativesData?.data) ? initiativesData.data : [];

  const { data: reviewsData, isLoading: reviewsLoading, refetch: refetchReviews } = useQuery({
    queryKey: ["executive-reviews", selectedAccountId],
    queryFn: () => api.accountPlanning.listReviews(selectedAccountId ? { customerAccountId: selectedAccountId } : undefined),
  });
  const reviews = Array.isArray(reviewsData?.data) ? reviewsData.data : [];

  // Mutations
  const configProfileMutation = useMutation({
    mutationFn: (body: any) => api.accountPlanning.configureProfile(body.customerAccountId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-queue"] });
      setShowConfigProfileModal(false);
    },
  });

  const createPlanMutation = useMutation({
    mutationFn: (body: any) => api.accountPlanning.createPlan(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-plans"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      setShowNewPlanModal(false);
    },
  });

  const approvePlanMutation = useMutation({
    mutationFn: ({ id, changeSummary }: { id: string; changeSummary?: string }) =>
      api.accountPlanning.approvePlan(id, { changeSummary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-plans"] });
      setShowApprovePlanModal(null);
    },
  });

  const createObjectiveMutation = useMutation({
    mutationFn: (body: any) => api.accountPlanning.createObjective({
      ...body,
      targetDate: new Date(body.targetDate).toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-objectives"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-queue"] });
      setShowNewObjectiveModal(false);
    },
  });

  const recordEvidenceMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.accountPlanning.recordEvidence(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-objectives"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      setShowRecordEvidenceModal(null);
    },
  });

  const recordBlockerMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.accountPlanning.recordBlocker(id, {
      ...body,
      expectedResolutionDate: body.expectedResolutionDate ? new Date(body.expectedResolutionDate).toISOString() : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-objectives"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-queue"] });
      setShowAddBlockerModal(null);
    },
  });

  const resolveBlockerMutation = useMutation({
    mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes: string }) =>
      api.accountPlanning.resolveBlocker(id, { resolutionNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-objectives"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-queue"] });
      setShowResolveBlockerModal(null);
    },
  });

  const assignStakeholderMutation = useMutation({
    mutationFn: ({ customerAccountId, body }: { customerAccountId: string; body: any }) =>
      api.accountPlanning.assignStakeholderRole(customerAccountId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-stakeholders"] });
      queryClient.invalidateQueries({ queryKey: ["stakeholder-coverage"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-queue"] });
      setShowAssignStakeholderModal(false);
    },
  });

  const createInitiativeMutation = useMutation({
    mutationFn: (body: any) => api.accountPlanning.createInitiative({
      ...body,
      targetCompletionDate: new Date(body.targetCompletionDate).toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategic-initiatives"] });
      setShowNewInitiativeModal(false);
    },
  });

  const addMilestoneMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.accountPlanning.addMilestone(id, {
      ...body,
      targetDate: new Date(body.targetDate).toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategic-initiatives"] });
      setShowAddMilestoneModal(null);
    },
  });

  const scheduleReviewMutation = useMutation({
    mutationFn: (body: any) => api.accountPlanning.scheduleReview({
      ...body,
      plannedDate: new Date(body.plannedDate).toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["executive-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      setShowScheduleReviewModal(false);
    },
  });

  const completeReviewMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.accountPlanning.completeReview(id, {
      ...body,
      nextReviewDate: body.nextReviewDate ? new Date(body.nextReviewDate).toISOString() : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["executive-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      setShowCompleteReviewModal(null);
    },
  });

  const recordCommitmentMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.accountPlanning.recordReviewCommitment(id, {
      ...body,
      dueDate: body.dueDate ? new Date(body.dueDate).toISOString() : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["executive-reviews"] });
      setShowAddCommitmentModal(null);
    },
  });

  const recalculatePriorityMutation = useMutation({
    mutationFn: (customerAccountId: string) => api.accountPlanning.recalculatePriority(customerAccountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-queue"] });
    },
  });

  // Helpers
  const getPriorityBadgeClass = (level: string) => {
    switch (level) {
      case "CRITICAL_ATTENTION":
        return "bg-rose-500/10 text-rose-400 border-rose-500/30";
      case "HIGH_PRIORITY":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "ROUTINE_MANAGEMENT":
        return "bg-sky-500/10 text-sky-400 border-sky-500/30";
      case "HEALTHY_STRATEGIC":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  const getObjectiveStatusBadge = (status: string) => {
    switch (status) {
      case "ACHIEVED":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "ACTIVE":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      case "AT_RISK":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "BLOCKED":
        return "bg-rose-500/10 text-rose-400 border-rose-500/30";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-white">
                    Strategic Account Planning & Portfolio Intelligence
                  </h1>
                  <span className="text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    Phase 27
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  Stakeholder coverage mapping, quantified customer business objectives, versioned account plans, and governed Executive Business Reviews (EBR/QBR).
                </p>
              </div>
            </div>
          </div>

          {/* Global Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowConfigProfileModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 transition"
            >
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              Configure Profile
            </button>
            <button
              onClick={() => setShowNewPlanModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 transition"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              New Account Plan
            </button>
            <button
              onClick={() => setShowNewObjectiveModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800 transition"
            >
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              New Objective
            </button>
            <button
              onClick={() => setShowScheduleReviewModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition"
            >
              <Calendar className="w-3.5 h-3.5" />
              Schedule EBR
            </button>
          </div>
        </div>

        {/* Global Account Context Selector */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Building2 className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-300">Account Filter:</span>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
            >
              <option value="">All Managed Accounts (Portfolio View)</option>
              {accounts.map((acc: any) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.tier || "STANDARD"})
                </option>
              ))}
            </select>
          </div>

          {selectedAccountId && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              Filtered to account: <strong className="text-slate-200">{accounts.find((a: any) => a.id === selectedAccountId)?.name}</strong>
              <button
                onClick={() => setSelectedAccountId("")}
                className="ml-2 text-[11px] text-indigo-400 hover:text-indigo-300 underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 gap-2 overflow-x-auto">
          {[
            { id: "overview", label: "Portfolio Intelligence", icon: TrendingUp },
            { id: "queue", label: "Prioritized Queue", icon: AlertTriangle, count: overview?.priorityQueue?.length },
            { id: "plans", label: "Account Plans", icon: FileText, count: plans.length },
            { id: "objectives", label: "Customer Objectives", icon: Target, count: objectives.length },
            { id: "stakeholders", label: "Stakeholders & Coverage", icon: Users, count: stakeholders.length },
            { id: "initiatives", label: "Strategic Initiatives", icon: Layers, count: initiatives.length },
            { id: "reviews", label: "Executive Reviews (EBR)", icon: Calendar, count: reviews.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                  isActive
                    ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    isActive ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-800 text-slate-400"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ========================================================= */}
        {/* TAB 1: PORTFOLIO INTELLIGENCE OVERVIEW */}
        {/* ========================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Managed Accounts</span>
                  <Building2 className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">
                  {overview?.totalManagedAccounts ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Strategic & Enterprise
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Attention Required</span>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl font-bold text-rose-400 mt-2">
                  {(overview?.priorityDistribution?.CRITICAL_ATTENTION || 0) + (overview?.priorityDistribution?.HIGH_PRIORITY || 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Critical or high priority
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Single-Thread Risk</span>
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-amber-400 mt-2">
                  {overview?.singleThreadedAccountsCount ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Vulnerable accounts
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Active Account Plans</span>
                  <FileText className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400 mt-2">
                  {overview?.activePlansCount ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Approved & active
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Blocked / At-Risk</span>
                  <Target className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-purple-400 mt-2">
                  {(overview?.blockedObjectivesCount || 0) + (overview?.atRiskObjectivesCount || 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Objectives needing support
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Overdue EBRs</span>
                  <Calendar className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-2xl font-bold text-sky-400 mt-2">
                  {overview?.overdueReviewsCount ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Reviews past target date
                </div>
              </div>
            </div>

            {/* Portfolio Matrix & Highlights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Priority Distribution Card */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    Portfolio Attention Distribution
                  </h3>
                  <button
                    onClick={() => refetchOverview()}
                    className="p-1 text-slate-400 hover:text-slate-200 transition"
                    title="Refresh Overview"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {[
                    { label: "Critical Attention (Score ≥ 75)", count: overview?.priorityDistribution?.CRITICAL_ATTENTION || 0, color: "bg-rose-500", text: "text-rose-400" },
                    { label: "High Priority (Score 50-74)", count: overview?.priorityDistribution?.HIGH_PRIORITY || 0, color: "bg-amber-500", text: "text-amber-400" },
                    { label: "Routine Management (Score 25-49)", count: overview?.priorityDistribution?.ROUTINE_MANAGEMENT || 0, color: "bg-sky-500", text: "text-sky-400" },
                    { label: "Healthy Strategic (Score < 25)", count: overview?.priorityDistribution?.HEALTHY_STRATEGIC || 0, color: "bg-emerald-500", text: "text-emerald-400" },
                  ].map((p, idx) => {
                    const total = overview?.totalManagedAccounts || 1;
                    const pct = Math.round((p.count / total) * 100);
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300">{p.label}</span>
                          <span className={`font-semibold ${p.text}`}>{p.count} accounts ({pct}%)</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${p.color} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Segment Breakdown */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    Account Segments
                  </h3>
                  <span className="text-xs text-slate-400">Total: {overview?.totalManagedAccounts ?? 0}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Strategic", count: overview?.segmentDistribution?.STRATEGIC || 0, tag: "STRATEGIC", color: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300" },
                    { label: "Enterprise", count: overview?.segmentDistribution?.ENTERPRISE || 0, tag: "ENTERPRISE", color: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
                    { label: "Growth", count: overview?.segmentDistribution?.GROWTH || 0, tag: "GROWTH", color: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" },
                    { label: "Standard", count: overview?.segmentDistribution?.STANDARD || 0, tag: "STANDARD", color: "border-slate-700 bg-slate-800/40 text-slate-300" },
                  ].map((seg, idx) => (
                    <div key={idx} className={`p-3 rounded-lg border ${seg.color} space-y-1`}>
                      <div className="text-[11px] font-medium opacity-80">{seg.label}</div>
                      <div className="text-xl font-bold">{seg.count}</div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 text-xs text-slate-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                  Deterministic prioritization updates continuously based on health evaluations, active blockers, single-thread risks, and contract renewals.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: PRIORITIZED ATTENTION QUEUE */}
        {/* ========================================================= */}
        {activeTab === "queue" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search accounts in queue..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => refetchQueue()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh Queue
                </button>
              </div>
            </div>

            {/* Queue Table */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3 font-medium">Rank & Account</th>
                      <th className="px-4 py-3 font-medium">Segment</th>
                      <th className="px-4 py-3 font-medium">Priority Score</th>
                      <th className="px-4 py-3 font-medium">Attention Level</th>
                      <th className="px-4 py-3 font-medium">Contributing Reasons</th>
                      <th className="px-4 py-3 font-medium">Recommended Action</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {queue.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No prioritized accounts evaluated yet. Click "Configure Profile" to register an account.
                        </td>
                      </tr>
                    ) : (
                      queue
                        .filter((item: any) => !searchQuery || item.accountName.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((item: any, idx: number) => (
                          <tr key={item.customerAccountId} className="hover:bg-slate-800/30 transition">
                            <td className="px-4 py-3.5 font-medium text-white">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-[10px] text-slate-400 font-bold">
                                  #{idx + 1}
                                </span>
                                <div>
                                  <div className="font-semibold">{item.accountName}</div>
                                  {item.renewalUrgency && (
                                    <span className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
                                      <Clock className="w-3 h-3" />
                                      {item.renewalUrgency}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3.5 text-slate-300">
                              <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 border border-slate-700">
                                {item.accountSegment}
                              </span>
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      item.priorityScore >= 75 ? "bg-rose-500" : item.priorityScore >= 50 ? "bg-amber-500" : "bg-sky-500"
                                    }`}
                                    style={{ width: `${item.priorityScore}%` }}
                                  />
                                </div>
                                <span className="font-bold text-slate-200">{Math.round(item.priorityScore)}</span>
                              </div>
                            </td>

                            <td className="px-4 py-3.5">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${getPriorityBadgeClass(item.priorityLevel)}`}>
                                {item.priorityLevel.replace("_", " ")}
                              </span>
                            </td>

                            <td className="px-4 py-3.5 max-w-xs text-slate-300">
                              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-400">
                                {item.reasons.slice(0, 2).map((r: string, rIdx: number) => (
                                  <li key={rIdx} className="truncate">{r}</li>
                                ))}
                              </ul>
                            </td>

                            <td className="px-4 py-3.5 text-slate-300 max-w-xs text-[11px]">
                              {item.nextAction}
                            </td>

                            <td className="px-4 py-3.5 text-right">
                              <button
                                onClick={() => recalculatePriorityMutation.mutate(item.customerAccountId)}
                                className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                                title="Recalculate Priority Score"
                              >
                                Recalculate
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: ACCOUNT PLANS */}
        {/* ========================================================= */}
        {activeTab === "plans" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-white">Strategic Account Plans</h2>
              <button
                onClick={() => setShowNewPlanModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                <Plus className="w-3.5 h-3.5" />
                New Account Plan
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.length === 0 ? (
                <div className="col-span-full p-8 text-center rounded-xl border border-slate-800 bg-slate-900/40 text-slate-500">
                  No account plans created yet. Click "New Account Plan" to get started.
                </div>
              ) : (
                plans.map((plan: any) => (
                  <div
                    key={plan.id}
                    className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {plan.planNumber}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          v{plan.currentVersion}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          plan.status === "ACTIVE" || plan.status === "APPROVED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : plan.status === "IN_REVIEW"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}>
                          {plan.status}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-white text-sm">{plan.title}</h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Account: <strong className="text-slate-300">{plan.customerAccount?.name}</strong> (Plan Year: {plan.planYear})
                      </div>
                    </div>

                    {plan.visionStatement && (
                      <p className="text-xs text-slate-400 italic bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                        "{plan.visionStatement}"
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-3">
                      <span>{plan._count?.objectives ?? 0} Objectives</span>
                      <span>{plan._count?.initiatives ?? 0} Initiatives</span>
                      <span>{plan._count?.versions ?? 0} Versions</span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      {(plan.status === "DRAFT" || plan.status === "IN_REVIEW") && (
                        <button
                          onClick={() => setShowApprovePlanModal(plan)}
                          className="px-2.5 py-1 text-[11px] rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 transition"
                        >
                          Approve Plan
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: CUSTOMER BUSINESS OBJECTIVES */}
        {/* ========================================================= */}
        {activeTab === "objectives" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-white">Customer Business Objectives & Value Realization</h2>
              <button
                onClick={() => setShowNewObjectiveModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition"
              >
                <Plus className="w-3.5 h-3.5" />
                New Objective
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {objectives.length === 0 ? (
                <div className="col-span-full p-8 text-center rounded-xl border border-slate-800 bg-slate-900/40 text-slate-500">
                  No quantifiable customer business objectives recorded yet. Click "New Objective" to define one.
                </div>
              ) : (
                objectives.map((obj: any) => (
                  <div
                    key={obj.id}
                    className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition space-y-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {obj.objectiveNumber}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getObjectiveStatusBadge(obj.status)}`}>
                        {obj.status}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-semibold text-white text-sm">{obj.title}</h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {obj.customerAccount?.name} &bull; <span className="text-indigo-400 font-medium">{obj.category.replace("_", " ")}</span>
                      </div>
                    </div>

                    {obj.description && (
                      <p className="text-xs text-slate-400 line-clamp-2">{obj.description}</p>
                    )}

                    {/* Progress Bar */}
                    <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Progress</span>
                        <span className="font-bold text-slate-200">
                          {obj.currentValue ?? 0} / {obj.targetValue ?? 100} {obj.unit || ""} ({Math.round(obj.progressPercent ?? 0)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${Math.min(100, obj.progressPercent ?? 0)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500 pt-1">
                        <span>Baseline: {obj.baselineValue ?? 0}</span>
                        <span>Target: {new Date(obj.targetDate).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-3">
                      <span>{obj._count?.evidence ?? 0} Evidence Entries</span>
                      <span className={obj._count?.blockers > 0 ? "text-rose-400 font-semibold" : ""}>
                        {obj._count?.blockers ?? 0} Blockers
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => setShowRecordEvidenceModal(obj)}
                        className="px-2.5 py-1 text-[11px] rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition"
                      >
                        Record Evidence
                      </button>
                      <button
                        onClick={() => setShowAddBlockerModal(obj)}
                        className="px-2.5 py-1 text-[11px] rounded bg-rose-600/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600/30 transition"
                      >
                        Add Blocker
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: STAKEHOLDERS & COVERAGE */}
        {/* ========================================================= */}
        {activeTab === "stakeholders" && (
          <div className="space-y-4">
            {!selectedAccountId ? (
              <div className="p-8 text-center rounded-xl border border-slate-800 bg-slate-900/40 text-slate-400">
                <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p>Please select an account in the top filter to view its stakeholder mapping & single-thread coverage.</p>
              </div>
            ) : (
              <>
                {/* Coverage Banner */}
                {coverage && (
                  <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
                    coverage.isSingleThreaded
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                  }`}>
                    <div className="flex items-center gap-3">
                      {coverage.isSingleThreaded ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                      ) : (
                        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold text-sm">
                          Coverage Status: {coverage.coverageStatus.replace(/_/g, " ")}
                        </div>
                        <p className="text-xs opacity-80 mt-0.5">
                          {coverage.isSingleThreaded
                            ? "Single-thread risk detected: Account lacks comprehensive executive sponsor, decision-maker, or champion alignment."
                            : "Multi-threaded relationship established across key leadership & operational roles."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
                        Total Contacts: <strong>{coverage.totalContacts}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
                        Mapped Roles: <strong>{coverage.mappedRolesCount}</strong>
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <h2 className="text-sm font-semibold text-white">Mapped Strategic Stakeholders</h2>
                  <button
                    onClick={() => setShowAssignStakeholderModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Assign Stakeholder Role
                  </button>
                </div>

                {/* Stakeholder Table */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3 font-medium">Contact</th>
                        <th className="px-4 py-3 font-medium">Strategic Role</th>
                        <th className="px-4 py-3 font-medium">Department</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Verification</th>
                        <th className="px-4 py-3 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {stakeholders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                            No stakeholders mapped for this account. Click "Assign Stakeholder Role" to connect contacts.
                          </td>
                        </tr>
                      ) : (
                        stakeholders.map((rel: any) => (
                          <tr key={rel.id} className="hover:bg-slate-800/30 transition">
                            <td className="px-4 py-3.5 font-medium text-white">
                              <div>{rel.contact?.name}</div>
                              <div className="text-[11px] text-slate-500 font-normal">{rel.contact?.email}</div>
                            </td>

                            <td className="px-4 py-3.5">
                              <span className="px-2 py-0.5 rounded text-[11px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                                {rel.role.replace(/_/g, " ")}
                              </span>
                            </td>

                            <td className="px-4 py-3.5 text-slate-300">
                              {rel.department || "—"}
                            </td>

                            <td className="px-4 py-3.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                rel.status === "ACTIVE"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  : "bg-slate-800 text-slate-400 border-slate-700"
                              }`}>
                                {rel.status}
                              </span>
                            </td>

                            <td className="px-4 py-3.5 text-slate-300">
                              <div>{rel.verificationSource || "MANUAL"}</div>
                              {rel.verifiedAt && (
                                <div className="text-[10px] text-slate-500">
                                  {new Date(rel.verifiedAt).toLocaleDateString()}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3.5 text-slate-400 max-w-xs truncate">
                              {rel.notes || "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: STRATEGIC INITIATIVES */}
        {/* ========================================================= */}
        {activeTab === "initiatives" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-white">Strategic Initiatives & Project Milestones</h2>
              <button
                onClick={() => setShowNewInitiativeModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                <Plus className="w-3.5 h-3.5" />
                New Initiative
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {initiatives.length === 0 ? (
                <div className="col-span-full p-8 text-center rounded-xl border border-slate-800 bg-slate-900/40 text-slate-500">
                  No strategic initiatives recorded yet.
                </div>
              ) : (
                initiatives.map((init: any) => (
                  <div
                    key={init.id}
                    className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {init.initiativeNumber}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        init.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : init.status === "IN_PROGRESS"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}>
                        {init.status}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-semibold text-white text-sm">{init.title}</h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {init.customerAccount?.name} {init.accountPlan?.title ? `&bull; Plan: ${init.accountPlan.title}` : ""}
                      </div>
                    </div>

                    {init.description && (
                      <p className="text-xs text-slate-400">{init.description}</p>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-3">
                      <span>Target: {new Date(init.targetCompletionDate).toLocaleDateString()}</span>
                      <span>{init._count?.milestones ?? 0} Milestones</span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => setShowAddMilestoneModal(init)}
                        className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      >
                        Add Milestone
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 7: EXECUTIVE BUSINESS REVIEWS */}
        {/* ========================================================= */}
        {activeTab === "reviews" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-white">Executive Business Reviews (EBR / QBR)</h2>
              <button
                onClick={() => setShowScheduleReviewModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Schedule Review
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reviews.length === 0 ? (
                <div className="col-span-full p-8 text-center rounded-xl border border-slate-800 bg-slate-900/40 text-slate-500">
                  No executive business reviews scheduled yet.
                </div>
              ) : (
                reviews.map((rev: any) => (
                  <div
                    key={rev.id}
                    className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {rev.reviewNumber}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        rev.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : rev.status === "READY_FOR_REVIEW"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}>
                        {rev.status}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-semibold text-white text-sm">{rev.reviewPeriod}</h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Account: <strong className="text-slate-300">{rev.customerAccount?.name}</strong>
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      Planned Date: {new Date(rev.plannedDate).toLocaleDateString()}
                    </div>

                    {rev.agreedSummary && (
                      <p className="text-xs text-slate-300 bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                        "{rev.agreedSummary}"
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-3">
                      <span>{rev._count?.participants ?? 0} Participants</span>
                      <span>{rev._count?.commitments ?? 0} Commitments</span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => setSelectedReviewSnapshot(rev)}
                        className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      >
                        View Prep Snapshot
                      </button>
                      {rev.status !== "COMPLETED" && (
                        <button
                          onClick={() => setShowCompleteReviewModal(rev)}
                          className="px-2.5 py-1 text-[11px] rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 transition"
                        >
                          Complete Review
                        </button>
                      )}
                      <button
                        onClick={() => setShowAddCommitmentModal(rev)}
                        className="px-2.5 py-1 text-[11px] rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition"
                      >
                        Add Action Item
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODALS & DRAWERS */}
        {/* ========================================================= */}

        {/* Configure Profile Modal */}
        {showConfigProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-semibold text-white text-sm">Configure Strategic Profile</h3>
                <button onClick={() => setShowConfigProfileModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Customer Account</label>
                  <select
                    value={configProfileForm.customerAccountId}
                    onChange={(e) => setConfigProfileForm({ ...configProfileForm, customerAccountId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  >
                    <option value="">Select an account...</option>
                    {accounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Strategic Tier</label>
                    <select
                      value={configProfileForm.strategicTier}
                      onChange={(e) => setConfigProfileForm({ ...configProfileForm, strategicTier: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="TIER_1_CORE">Tier 1 Core Strategic</option>
                      <option value="TIER_2_EXPANSION">Tier 2 Expansion</option>
                      <option value="TIER_3_SCALE">Tier 3 Scale</option>
                      <option value="TIER_4_FOUNDATIONAL">Tier 4 Foundational</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Account Segment</label>
                    <select
                      value={configProfileForm.accountSegment}
                      onChange={(e) => setConfigProfileForm({ ...configProfileForm, accountSegment: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="STRATEGIC">Strategic</option>
                      <option value="ENTERPRISE">Enterprise</option>
                      <option value="GROWTH">Growth</option>
                      <option value="STANDARD">Standard</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Review Cadence</label>
                  <select
                    value={configProfileForm.reviewCadence}
                    onChange={(e) => setConfigProfileForm({ ...configProfileForm, reviewCadence: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly (Standard QBR)</option>
                    <option value="BI_ANNUAL">Bi-Annual</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Internal Strategic Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Key strategic priorities, competitive displacement context..."
                    value={configProfileForm.internalStrategicNotes}
                    onChange={(e) => setConfigProfileForm({ ...configProfileForm, internalStrategicNotes: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowConfigProfileModal(false)}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={!configProfileForm.customerAccountId || configProfileMutation.isPending}
                  onClick={() => configProfileMutation.mutate(configProfileForm)}
                  className="px-4 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
                >
                  {configProfileMutation.isPending ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Account Plan Modal */}
        {showNewPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-semibold text-white text-sm">Create Strategic Account Plan</h3>
                <button onClick={() => setShowNewPlanModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Customer Account</label>
                  <select
                    value={newPlanForm.customerAccountId}
                    onChange={(e) => setNewPlanForm({ ...newPlanForm, customerAccountId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  >
                    <option value="">Select an account...</option>
                    {accounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Plan Number</label>
                    <input
                      type="text"
                      value={newPlanForm.planNumber}
                      onChange={(e) => setNewPlanForm({ ...newPlanForm, planNumber: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Plan Year</label>
                    <input
                      type="number"
                      value={newPlanForm.planYear}
                      onChange={(e) => setNewPlanForm({ ...newPlanForm, planYear: parseInt(e.target.value) || 2027 })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Plan Title</label>
                  <input
                    type="text"
                    placeholder="e.g. 2027 Global Enterprise Transformation Plan"
                    value={newPlanForm.title}
                    onChange={(e) => setNewPlanForm({ ...newPlanForm, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Vision Statement</label>
                  <input
                    type="text"
                    placeholder="e.g. Become the primary automation backbone across claims & underwriting"
                    value={newPlanForm.visionStatement}
                    onChange={(e) => setNewPlanForm({ ...newPlanForm, visionStatement: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowNewPlanModal(false)}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={!newPlanForm.customerAccountId || !newPlanForm.title || createPlanMutation.isPending}
                  onClick={() => createPlanMutation.mutate(newPlanForm)}
                  className="px-4 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
                >
                  {createPlanMutation.isPending ? "Creating..." : "Create Plan"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Approve Plan Modal */}
        {showApprovePlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-semibold text-white text-sm">Approve Strategic Plan</h3>
                <button onClick={() => setShowApprovePlanModal(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300">
                Approving plan <strong className="text-white">{showApprovePlanModal.title}</strong> will freeze an immutable version snapshot (v{showApprovePlanModal.currentVersion + 1}) and transition the plan status to APPROVED.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowApprovePlanModal(null)}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => approvePlanMutation.mutate({ id: showApprovePlanModal.id, changeSummary: "Executive plan approval" })}
                  className="px-4 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  Confirm Approval
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Objective Modal */}
        {showNewObjectiveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-semibold text-white text-sm">Create Quantified Customer Objective</h3>
                <button onClick={() => setShowNewObjectiveModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Customer Account</label>
                  <select
                    value={newObjectiveForm.customerAccountId}
                    onChange={(e) => setNewObjectiveForm({ ...newObjectiveForm, customerAccountId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  >
                    <option value="">Select an account...</option>
                    {accounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Objective Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Automate 95% of routine compliance reports"
                    value={newObjectiveForm.title}
                    onChange={(e) => setNewObjectiveForm({ ...newObjectiveForm, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Category</label>
                    <select
                      value={newObjectiveForm.category}
                      onChange={(e) => setNewObjectiveForm({ ...newObjectiveForm, category: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="ADOPTION_SCALE">Adoption Scale</option>
                      <option value="EFFICIENCY_GAIN">Efficiency Gain</option>
                      <option value="COMPLIANCE_READINESS">Compliance Readiness</option>
                      <option value="REVENUE_GROWTH">Revenue Growth</option>
                      <option value="RELIABILITY_IMPROVEMENT">Reliability Improvement</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Priority</label>
                    <select
                      value={newObjectiveForm.priority}
                      onChange={(e) => setNewObjectiveForm({ ...newObjectiveForm, priority: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Baseline Value</label>
                    <input
                      type="number"
                      value={newObjectiveForm.baselineValue}
                      onChange={(e) => setNewObjectiveForm({ ...newObjectiveForm, baselineValue: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Target Value</label>
                    <input
                      type="number"
                      value={newObjectiveForm.targetValue}
                      onChange={(e) => setNewObjectiveForm({ ...newObjectiveForm, targetValue: parseFloat(e.target.value) || 100 })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Unit</label>
                    <input
                      type="text"
                      placeholder="e.g. %, hours, $"
                      value={newObjectiveForm.unit}
                      onChange={(e) => setNewObjectiveForm({ ...newObjectiveForm, unit: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Target Date</label>
                  <input
                    type="date"
                    value={newObjectiveForm.targetDate}
                    onChange={(e) => setNewObjectiveForm({ ...newObjectiveForm, targetDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowNewObjectiveModal(false)}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={!newObjectiveForm.customerAccountId || !newObjectiveForm.title || createObjectiveMutation.isPending}
                  onClick={() => createObjectiveMutation.mutate(newObjectiveForm)}
                  className="px-4 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
                >
                  {createObjectiveMutation.isPending ? "Creating..." : "Create Objective"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Record Evidence Modal */}
        {showRecordEvidenceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-semibold text-white text-sm">Record Verified Evidence</h3>
                <button onClick={() => setShowRecordEvidenceModal(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-300">
                Recording evidence for: <strong className="text-white">{showRecordEvidenceModal.title}</strong>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Observed Value ({showRecordEvidenceModal.unit || ""})</label>
                  <input
                    type="number"
                    value={evidenceForm.observedValue}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, observedValue: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Description & Verification Context</label>
                  <textarea
                    rows={2}
                    placeholder="Telemetry verified from production execution logs..."
                    value={evidenceForm.description}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Source Reference (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. DataProduct:ClaimsAutomationV2"
                    value={evidenceForm.sourceRef}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, sourceRef: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowRecordEvidenceModal(null)}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={!evidenceForm.description || recordEvidenceMutation.isPending}
                  onClick={() => recordEvidenceMutation.mutate({ id: showRecordEvidenceModal.id, body: evidenceForm })}
                  className="px-4 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
                >
                  Save Evidence
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Blocker Modal */}
        {showAddBlockerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-semibold text-white text-sm">Record Operational Blocker</h3>
                <button onClick={() => setShowAddBlockerModal(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Blocker Title</label>
                  <input
                    type="text"
                    placeholder="e.g. SSO Certificate rotation failure in customer IdP"
                    value={blockerForm.title}
                    onChange={(e) => setBlockerForm({ ...blockerForm, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Severity</label>
                  <select
                    value={blockerForm.severity}
                    onChange={(e) => setBlockerForm({ ...blockerForm, severity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  >
                    <option value="CRITICAL">Critical (Blocks value realization)</option>
                    <option value="HIGH">High (Substantial risk)</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={blockerForm.description}
                    onChange={(e) => setBlockerForm({ ...blockerForm, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowAddBlockerModal(null)}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={!blockerForm.title || recordBlockerMutation.isPending}
                  onClick={() => recordBlockerMutation.mutate({ id: showAddBlockerModal.id, body: blockerForm })}
                  className="px-4 py-2 text-xs rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium disabled:opacity-50"
                >
                  Record Blocker
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assign Stakeholder Modal */}
        {showAssignStakeholderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-semibold text-white text-sm">Assign Stakeholder Role</h3>
                <button onClick={() => setShowAssignStakeholderModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Customer Contact</label>
                  <select
                    value={stakeholderForm.contactId}
                    onChange={(e) => setStakeholderForm({ ...stakeholderForm, contactId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  >
                    <option value="">Select a contact...</option>
                    {contacts.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Strategic Stakeholder Role</label>
                  <select
                    value={stakeholderForm.role}
                    onChange={(e) => setStakeholderForm({ ...stakeholderForm, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  >
                    <option value="EXECUTIVE_SPONSOR">Executive Sponsor</option>
                    <option value="BUSINESS_DECISION_MAKER">Business Decision Maker</option>
                    <option value="TECHNICAL_DECISION_MAKER">Technical Decision Maker</option>
                    <option value="DAY_TO_DAY_CHAMPION">Day-to-Day Champion</option>
                    <option value="OPERATIONAL_CONTACT">Operational Contact</option>
                    <option value="PROCUREMENT_CONTACT">Procurement Contact</option>
                    <option value="FINANCE_CONTACT">Finance Contact</option>
                    <option value="SECURITY_COMPLIANCE_CONTACT">Security & Compliance Contact</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Department</label>
                  <input
                    type="text"
                    placeholder="e.g. Information Security, Claims Operations"
                    value={stakeholderForm.department}
                    onChange={(e) => setStakeholderForm({ ...stakeholderForm, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Verification Source</label>
                  <select
                    value={stakeholderForm.verificationSource}
                    onChange={(e) => setStakeholderForm({ ...stakeholderForm, verificationSource: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  >
                    <option value="EBR">EBR / QBR Session</option>
                    <option value="MEETING">Strategic Alignment Meeting</option>
                    <option value="CALL">Executive Check-in Call</option>
                    <option value="EMAIL">Email Confirmation</option>
                    <option value="MANUAL">Manual Verification</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowAssignStakeholderModal(false)}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={!stakeholderForm.contactId || assignStakeholderMutation.isPending}
                  onClick={() => assignStakeholderMutation.mutate({ customerAccountId: selectedAccountId, body: stakeholderForm })}
                  className="px-4 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
                >
                  Assign Role
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Schedule EBR Modal */}
        {showScheduleReviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-semibold text-white text-sm">Schedule Executive Business Review</h3>
                <button onClick={() => setShowScheduleReviewModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Customer Account</label>
                  <select
                    value={reviewForm.customerAccountId}
                    onChange={(e) => setReviewForm({ ...reviewForm, customerAccountId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  >
                    <option value="">Select an account...</option>
                    {accounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Review Number</label>
                    <input
                      type="text"
                      value={reviewForm.reviewNumber}
                      onChange={(e) => setReviewForm({ ...reviewForm, reviewNumber: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Review Period</label>
                    <input
                      type="text"
                      placeholder="e.g. Q1 2027"
                      value={reviewForm.reviewPeriod}
                      onChange={(e) => setReviewForm({ ...reviewForm, reviewPeriod: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Planned Date</label>
                  <input
                    type="date"
                    value={reviewForm.plannedDate}
                    onChange={(e) => setReviewForm({ ...reviewForm, plannedDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowScheduleReviewModal(false)}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={!reviewForm.customerAccountId || scheduleReviewMutation.isPending}
                  onClick={() => scheduleReviewMutation.mutate(reviewForm)}
                  className="px-4 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
                >
                  Schedule Review
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Review Snapshot Drawer / Modal */}
        {selectedReviewSnapshot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-semibold text-white text-sm">
                    Preparation Snapshot — {selectedReviewSnapshot.reviewPeriod}
                  </h3>
                  <div className="text-xs text-slate-400">{selectedReviewSnapshot.reviewNumber}</div>
                </div>
                <button onClick={() => setSelectedReviewSnapshot(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-96">
                <pre>{JSON.stringify(selectedReviewSnapshot.prepDataSnapshot, null, 2)}</pre>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  onClick={() => setSelectedReviewSnapshot(null)}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
