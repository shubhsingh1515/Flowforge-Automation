"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  Plus,
  RefreshCw,
  Search,
  Filter,
  FileText,
  Clock,
  Sparkles,
  ChevronRight,
  Activity,
  Award,
  Sliders,
  Check,
  X,
  Eye,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

export default function RevenuePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    "overview" | "renewals" | "at_risk" | "expansion" | "contracts" | "policy"
  >("overview");
  const [preferredCurrency, setPreferredCurrency] = useState("USD");

  // Filter States
  const [renewalStageFilter, setRenewalStageFilter] = useState<string>("ALL");
  const [renewalRiskFilter, setRenewalRiskFilter] = useState<string>("ALL");
  const [contractStatusFilter, setContractStatusFilter] = useState<string>("ALL");
  const [expansionStageFilter, setExpansionStageFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Drawers
  const [showNewContractModal, setShowNewContractModal] = useState(false);
  const [showNewRenewalModal, setShowNewRenewalModal] = useState(false);
  const [showNewExpansionModal, setShowNewExpansionModal] = useState(false);
  const [showAdvanceStageModal, setShowAdvanceStageModal] = useState(false);
  const [showRecordOutcomeModal, setShowRecordOutcomeModal] = useState(false);
  const [showQualifyExpansionModal, setShowQualifyExpansionModal] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [showRiskDetailModal, setShowRiskDetailModal] = useState(false);
  const [showContractChangesModal, setShowContractChangesModal] = useState(false);

  // Selected Entities
  const [selectedOpportunity, setSelectedOpportunity] = useState<any>(null);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [selectedExpansion, setSelectedExpansion] = useState<any>(null);
  const [latestRiskEvaluation, setLatestRiskEvaluation] = useState<any>(null);

  // Form Inputs: New Contract
  const [newContractAccountId, setNewContractAccountId] = useState("");
  const [newContractNumber, setNewContractNumber] = useState("");
  const [newContractName, setNewContractName] = useState("");
  const [newContractValue, setNewContractValue] = useState("");
  const [newContractARR, setNewContractARR] = useState("");
  const [newContractStartDate, setNewContractStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newContractEndDate, setNewContractEndDate] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [newContractNoticeDays, setNewContractNoticeDays] = useState("30");
  const [newContractAutoRenew, setNewContractAutoRenew] = useState(false);

  // Form Inputs: New Renewal Opportunity
  const [newRenewalContractId, setNewRenewalContractId] = useState("");
  const [newRenewalNumber, setNewRenewalNumber] = useState("");
  const [newRenewalAmount, setNewRenewalAmount] = useState("");
  const [newRenewalTargetDate, setNewRenewalTargetDate] = useState("");

  // Form Inputs: Advance Stage
  const [advanceTargetStage, setAdvanceTargetStage] = useState("");
  const [advanceNotes, setAdvanceNotes] = useState("");
  const [advanceNextAction, setAdvanceNextAction] = useState("");

  // Form Inputs: Finalize Outcome
  const [outcomeType, setOutcomeType] = useState("RENEWED_AS_IS");
  const [outcomeFinalAmount, setOutcomeFinalAmount] = useState("");
  const [outcomeSuccessorNumber, setOutcomeSuccessorNumber] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");

  // Form Inputs: New Expansion
  const [newExpAccountId, setNewExpAccountId] = useState("");
  const [newExpNumber, setNewExpNumber] = useState("");
  const [newExpType, setNewExpType] = useState("ADDITIONAL_CAPACITY");
  const [newExpTitle, setNewExpTitle] = useState("");
  const [newExpValue, setNewExpValue] = useState("");

  // Form Inputs: Qualify Expansion
  const [qualifyStatus, setQualifyStatus] = useState<boolean>(true);
  const [qualifyNotes, setQualifyNotes] = useState("");
  const [qualifyValue, setQualifyValue] = useState("");

  // Form Inputs: Revenue Policy
  const [policyPrepDays, setPolicyPrepDays] = useState(90);
  const [policyHealthDays, setPolicyHealthDays] = useState(60);
  const [policyEngageDays, setPolicyEngageDays] = useState(45);
  const [policyCommDays, setPolicyCommDays] = useState(30);
  const [policyAutoTask, setPolicyAutoTask] = useState(true);

  // -------------------------------------------------------------
  // Data Queries
  // -------------------------------------------------------------
  const { data: overviewData, isLoading: overviewLoading, refetch: refetchOverview } = useQuery({
    queryKey: ["revenue", "overview", preferredCurrency],
    queryFn: () => api.revenue.getOverview(preferredCurrency),
  });

  const { data: contractsData, isLoading: contractsLoading } = useQuery({
    queryKey: ["revenue", "contracts", contractStatusFilter],
    queryFn: () =>
      api.revenue.listContracts(
        contractStatusFilter !== "ALL" ? { status: contractStatusFilter } : undefined
      ),
  });

  const { data: renewalsData, isLoading: renewalsLoading } = useQuery({
    queryKey: ["revenue", "renewals", renewalStageFilter, renewalRiskFilter],
    queryFn: () =>
      api.revenue.listRenewals({
        ...(renewalStageFilter !== "ALL" ? { stage: renewalStageFilter } : {}),
        ...(renewalRiskFilter !== "ALL" ? { riskClassification: renewalRiskFilter } : {}),
      }),
  });

  const { data: expansionData, isLoading: expansionLoading } = useQuery({
    queryKey: ["revenue", "expansion", expansionStageFilter],
    queryFn: () =>
      api.revenue.listExpansion(
        expansionStageFilter !== "ALL" ? { stage: expansionStageFilter } : undefined
      ),
  });

  const { data: policyData, refetch: refetchPolicy } = useQuery({
    queryKey: ["revenue", "policy"],
    queryFn: async () => {
      const res = await api.revenue.getPolicy();
      if (res?.data) {
        setPolicyPrepDays(res.data.renewalPreparationDays ?? 90);
        setPolicyHealthDays(res.data.healthReviewDays ?? 60);
        setPolicyEngageDays(res.data.engagementDays ?? 45);
        setPolicyCommDays(res.data.commercialReviewDays ?? 30);
        setPolicyAutoTask(res.data.autoTaskGeneration ?? true);
      }
      return res;
    },
  });

  const { data: accountsData } = useQuery({
    queryKey: ["customers", "accounts"],
    queryFn: () => api.customers.listAccounts(),
  });

  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ["revenue", "timeline", selectedOpportunity?.id],
    queryFn: () =>
      selectedOpportunity ? api.revenue.getRenewalTimeline(selectedOpportunity.id) : null,
    enabled: !!selectedOpportunity && showTimelineModal,
  });

  const { data: contractChangesData, isLoading: changesLoading } = useQuery({
    queryKey: ["revenue", "contractChanges", selectedContract?.id],
    queryFn: () =>
      selectedContract ? api.revenue.getContractChanges(selectedContract.id) : null,
    enabled: !!selectedContract && showContractChangesModal,
  });

  // -------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------
  const createContractMutation = useMutation({
    mutationFn: (body: any) => api.revenue.createContract(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
      setShowNewContractModal(false);
      setNewContractNumber("");
      setNewContractName("");
      setNewContractValue("");
      setNewContractARR("");
    },
  });

  const createRenewalMutation = useMutation({
    mutationFn: (body: any) => api.revenue.createRenewal(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
      setShowNewRenewalModal(false);
      setNewRenewalNumber("");
      setNewRenewalAmount("");
    },
  });

  const advanceStageMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.revenue.updateRenewalStage(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
      setShowAdvanceStageModal(false);
      setAdvanceNotes("");
      setAdvanceNextAction("");
    },
  });

  const recordOutcomeMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.revenue.recordRenewalOutcome(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
      setShowRecordOutcomeModal(false);
      setOutcomeNotes("");
      setOutcomeSuccessorNumber("");
    },
  });

  const evaluateRiskMutation = useMutation({
    mutationFn: (opportunityId: string) =>
      api.revenue.evaluateRenewalRisk(opportunityId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
      setLatestRiskEvaluation(res.data);
      setShowRiskDetailModal(true);
    },
  });

  const createExpansionMutation = useMutation({
    mutationFn: (body: any) => api.revenue.createExpansion(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
      setShowNewExpansionModal(false);
      setNewExpNumber("");
      setNewExpTitle("");
      setNewExpValue("");
    },
  });

  const qualifyExpansionMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.revenue.qualifyExpansion(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
      setShowQualifyExpansionModal(false);
      setQualifyNotes("");
    },
  });

  const savePolicyMutation = useMutation({
    mutationFn: (body: any) => api.revenue.configurePolicy(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue", "policy"] });
      refetchPolicy();
    },
  });

  const generateTasksMutation = useMutation({
    mutationFn: () => api.revenue.generateTasks(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
      refetchOverview();
    },
  });

  // Derived metrics
  const overview = overviewData?.data;
  const contracts = Array.isArray(contractsData?.data) ? contractsData.data : [];
  const renewals = Array.isArray(renewalsData?.data) ? renewalsData.data : [];
  const expansion = Array.isArray(expansionData?.data) ? expansionData.data : [];
  const accounts = Array.isArray(accountsData?.data) ? accountsData.data : [];

  const atRiskRenewals = renewals.filter(
    (r) => ["HIGH", "CRITICAL"].includes(r.riskClassification) && !["RENEWED", "LOST"].includes(r.stage)
  );

  const formatCurrency = (val?: number | null, curr = preferredCurrency) => {
    if (val === undefined || val === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900";
      case "HIGH":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900";
      case "MODERATE":
        return "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900";
      case "LOW":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900";
      default:
        return "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
    }
  };

  const getStageBadge = (stage: string) => {
    switch (stage) {
      case "RENEWED":
      case "WON":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400";
      case "LOST":
      case "DISMISSED":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400";
      case "NEGOTIATION":
      case "COMMIT_PENDING":
      case "PROPOSAL_IN_PROGRESS":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400";
      case "QUALIFIED":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400";
      case "UPCOMING":
      case "DETECTED":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400";
      default:
        return "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                Phase 26
              </span>
              <span className="text-xs text-gray-500 font-mono">TENANT-ISOLATED REVENUE PLATFORM</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mt-1">
              Revenue Intelligence & Retention Governance
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Durable contract registries, deterministic renewal risk models, governed expansion pipeline, and milestone interventions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Preferred Currency Selector */}
            <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-1 text-xs">
              {["USD", "EUR", "GBP"].map((curr) => (
                <button
                  key={curr}
                  onClick={() => setPreferredCurrency(curr)}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    preferredCurrency === curr
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                refetchOverview();
                queryClient.invalidateQueries({ queryKey: ["revenue"] });
              }}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              title="Refresh Revenue Intelligence"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowNewContractModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Contract
            </button>
          </div>
        </div>

        {/* Executive KPI Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Total Active Contracts & TCV */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500 text-xs">
              <span>Active Contracts</span>
              <FileText className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">
              {overview?.totalActiveContracts ?? contracts.length}
            </div>
            <div className="text-[11px] text-gray-500">
              TCV: <span className="font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(overview?.totalContractValue)}</span>
            </div>
          </div>

          {/* Card 2: Annual Recurring Revenue (ARR) */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500 text-xs">
              <span>Contracted ARR</span>
              <DollarSign className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(overview?.totalAnnualRecurringRevenue)}
            </div>
            <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">
              Verified baseline revenue
            </div>
          </div>

          {/* Card 3: Upcoming Renewals (90-day window) */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500 text-xs">
              <span>Upcoming Renewals</span>
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">
              {overview?.upcomingRenewalsCount ?? renewals.length}
            </div>
            <div className="text-[11px] text-gray-500">
              Pipeline: <span className="font-semibold">{formatCurrency(overview?.upcomingRenewalsValue)}</span>
            </div>
          </div>

          {/* Card 4: Revenue At Risk */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500 text-xs">
              <span>Revenue At Risk</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
              {formatCurrency(overview?.revenueAtRiskValue)}
            </div>
            <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80 font-medium">
              {overview?.revenueAtRiskCount ?? atRiskRenewals.length} high/critical account(s)
            </div>
          </div>

          {/* Card 5: Expansion Pipeline */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500 text-xs">
              <span>Expansion Pipeline</span>
              <TrendingUp className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
              {formatCurrency(overview?.expansionPipeline?.pipelineValue)}
            </div>
            <div className="text-[11px] text-purple-600/80 dark:text-purple-400/80 font-medium">
              {overview?.expansionPipeline?.totalQualified ?? 0} qualified • {overview?.expansionPipeline?.totalDetected ?? 0} detected
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
          <nav className="flex space-x-6 min-w-max">
            {[
              { id: "overview", label: "Executive Overview", icon: Activity },
              { id: "renewals", label: `Renewals Pipeline (${renewals.length})`, icon: Calendar },
              { id: "at_risk", label: `At-Risk Accounts (${atRiskRenewals.length})`, icon: AlertTriangle },
              { id: "expansion", label: `Expansion (${expansion.length})`, icon: TrendingUp },
              { id: "contracts", label: `Contracts Registry (${contracts.length})`, icon: FileText },
              { id: "policy", label: "Revenue Policy & Tasks", icon: Sliders },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* TAB 1: EXECUTIVE OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Stage Distribution */}
              <div className="lg:col-span-2 p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    Renewal Pipeline Stage Distribution
                  </h3>
                  <span className="text-xs text-gray-400">Currency: {preferredCurrency}</span>
                </div>

                <div className="space-y-3">
                  {overview?.pipelineByStage &&
                    Object.entries(overview.pipelineByStage).map(([stage, info]: [string, any]) => {
                      const totalVal = overview.totalAnnualRecurringRevenue || 1;
                      const pct = Math.min(100, Math.round((info.value / totalVal) * 100));
                      return (
                        <div key={stage} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {stage.replace(/_/g, " ")}
                            </span>
                            <div className="flex items-center gap-2 font-mono">
                              <span className="text-gray-400">{info.count} opp(s)</span>
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {formatCurrency(info.value)}
                              </span>
                            </div>
                          </div>
                          <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(4, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Right Column: Risk Distribution & Retention Interventions */}
              <div className="space-y-6">
                {/* Risk Distribution Card */}
                <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    Renewal Risk Classification
                  </h3>

                  <div className="space-y-2.5">
                    {overview?.riskDistribution &&
                      Object.entries(overview.riskDistribution).map(([level, info]: [string, any]) => (
                        <div
                          key={level}
                          className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-xs"
                        >
                          <span
                            className={`px-2 py-0.5 rounded border font-semibold text-[10px] ${getRiskBadge(
                              level
                            )}`}
                          >
                            {level}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400">{info.count} contracts</span>
                            <span className="font-mono font-medium text-gray-800 dark:text-gray-200">
                              {formatCurrency(info.value)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Retention Interventions Alert Card */}
                <div className="p-6 bg-linear-to-br from-indigo-50/50 to-blue-50/50 dark:from-indigo-950/20 dark:to-blue-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-semibold text-sm">
                    <Sparkles className="w-4 h-4" />
                    Retention Governance Engine
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    Automated milestone evaluation generates tenant-scoped retention tasks at 90, 60, 45, and 30 days prior to contract expiration.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                    <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="text-gray-400">Active Tasks</div>
                      <div className="text-base font-bold text-gray-900 dark:text-white">
                        {overview?.retentionInterventions?.activeTasksCount ?? 0}
                      </div>
                    </div>
                    <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="text-gray-400">Overdue Tasks</div>
                      <div className="text-base font-bold text-rose-600 dark:text-rose-400">
                        {overview?.retentionInterventions?.overdueTasksCount ?? 0}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => generateTasksMutation.mutate()}
                    disabled={generateTasksMutation.isPending}
                    className="w-full mt-2 py-2 px-3 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-gray-700 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${generateTasksMutation.isPending ? "animate-spin" : ""}`} />
                    {generateTasksMutation.isPending ? "Evaluating..." : "Run Milestone Evaluation Now"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: RENEWALS PIPELINE */}
        {activeTab === "renewals" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">Stage:</span>
                <select
                  value={renewalStageFilter}
                  onChange={(e) => setRenewalStageFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md"
                >
                  <option value="ALL">All Stages</option>
                  <option value="UPCOMING">Upcoming</option>
                  <option value="PREPARATION">Preparation</option>
                  <option value="CUSTOMER_ENGAGEMENT">Customer Engagement</option>
                  <option value="COMMERCIAL_REVIEW">Commercial Review</option>
                  <option value="NEGOTIATION">Negotiation</option>
                  <option value="COMMIT_PENDING">Commit Pending</option>
                  <option value="RENEWED">Renewed</option>
                  <option value="LOST">Lost</option>
                  <option value="ON_HOLD">On Hold</option>
                </select>

                <span className="text-xs text-gray-400 font-medium ml-2">Risk:</span>
                <select
                  value={renewalRiskFilter}
                  onChange={(e) => setRenewalRiskFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md"
                >
                  <option value="ALL">All Risk Levels</option>
                  <option value="LOW">Low</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="INSUFFICIENT_DATA">Insufficient Data</option>
                </select>
              </div>

              <button
                onClick={() => setShowNewRenewalModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Renewal Opportunity
              </button>
            </div>

            {/* Renewals Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-gray-500 font-medium">
                  <tr>
                    <th className="py-3 px-4">Opportunity #</th>
                    <th className="py-3 px-4">Customer Account</th>
                    <th className="py-3 px-4">Target Date</th>
                    <th className="py-3 px-4">Renewal Value</th>
                    <th className="py-3 px-4">Stage</th>
                    <th className="py-3 px-4">Risk Classification</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {renewals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400">
                        No renewal opportunities found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    renewals.map((opp: any) => (
                      <tr key={opp.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                        <td className="py-3 px-4 font-mono font-medium text-gray-900 dark:text-white">
                          {opp.opportunityNumber}
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-800 dark:text-gray-200">
                          {opp.customerAccount?.name || "—"}
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                          {new Date(opp.targetDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(opp.renewalAmount, opp.currency)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${getStageBadge(opp.stage)}`}>
                            {opp.stage.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getRiskBadge(
                              opp.riskClassification
                            )}`}
                          >
                            {opp.riskClassification}
                            {opp.riskScore !== null && ` (${opp.riskScore})`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button
                            onClick={() => evaluateRiskMutation.mutate(opp.id)}
                            title="Run Deterministic Risk Evaluation"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOpportunity(opp);
                              setAdvanceTargetStage("");
                              setShowAdvanceStageModal(true);
                            }}
                            title="Advance Stage"
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOpportunity(opp);
                              setOutcomeFinalAmount(String(opp.renewalAmount));
                              setShowRecordOutcomeModal(true);
                            }}
                            title="Record Final Outcome"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded"
                          >
                            <Award className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOpportunity(opp);
                              setShowTimelineModal(true);
                            }}
                            title="View Chronological Timeline"
                            className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: AT-RISK ACCOUNTS */}
        {activeTab === "at_risk" && (
          <div className="space-y-4">
            <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-900/50 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-rose-900 dark:text-rose-300 text-sm">
                  Active Renewal Risk Interventions ({atRiskRenewals.length} accounts at risk)
                </h4>
                <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-0.5">
                  Accounts evaluated as HIGH or CRITICAL risk require human review and dedicated retention tasks.
                  Deterministic evaluations calculate risk from health scores, product telemetry, and compression of milestone deadlines.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {atRiskRenewals.length === 0 ? (
                <div className="col-span-2 p-12 text-center text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="font-medium text-gray-700 dark:text-gray-300">No Critical Renewal Risks Detected</p>
                  <p className="text-xs text-gray-400 mt-0.5">All approaching renewals are in healthy or moderate standings.</p>
                </div>
              ) : (
                atRiskRenewals.map((opp: any) => (
                  <div
                    key={opp.id}
                    className="p-5 bg-white dark:bg-gray-800 rounded-2xl border border-rose-200 dark:border-rose-900/60 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-gray-400">{opp.opportunityNumber}</span>
                        <h4 className="font-bold text-gray-900 dark:text-white text-base">
                          {opp.customerAccount?.name || "Customer Account"}
                        </h4>
                      </div>
                      <span className={`px-2.5 py-1 rounded border text-xs font-bold ${getRiskBadge(opp.riskClassification)}`}>
                        {opp.riskClassification} ({opp.riskScore}/100)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl">
                      <div>
                        <span className="text-gray-400">Renewal Value:</span>
                        <div className="font-mono font-bold text-gray-900 dark:text-white">
                          {formatCurrency(opp.renewalAmount, opp.currency)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-400">Target Date:</span>
                        <div className="font-medium text-gray-800 dark:text-gray-200">
                          {new Date(opp.targetDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-xs text-gray-500">Stage: <strong className="text-gray-700 dark:text-gray-300">{opp.stage}</strong></span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => evaluateRiskMutation.mutate(opp.id)}
                          className="px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 rounded-md border border-rose-200 dark:border-rose-800"
                        >
                          Re-Evaluate Risk
                        </button>
                        <button
                          onClick={() => {
                            setSelectedOpportunity(opp);
                            setShowTimelineModal(true);
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200"
                        >
                          View Timeline
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: EXPANSION PIPELINE */}
        {activeTab === "expansion" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">Stage:</span>
                <select
                  value={expansionStageFilter}
                  onChange={(e) => setExpansionStageFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md"
                >
                  <option value="ALL">All Stages</option>
                  <option value="DETECTED">Detected</option>
                  <option value="NEEDS_REVIEW">Needs Review</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="PROPOSAL_IN_PROGRESS">Proposal In Progress</option>
                  <option value="WON">Won</option>
                  <option value="LOST">Lost</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>
              </div>

              <button
                onClick={() => setShowNewExpansionModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Expansion Opportunity
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-gray-500 font-medium">
                  <tr>
                    <th className="py-3 px-4">Opportunity #</th>
                    <th className="py-3 px-4">Customer Account</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Estimated ARR</th>
                    <th className="py-3 px-4">Stage</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {expansion.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400">
                        No expansion opportunities registered.
                      </td>
                    </tr>
                  ) : (
                    expansion.map((opp: any) => (
                      <tr key={opp.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                        <td className="py-3 px-4 font-mono font-medium text-gray-900 dark:text-white">
                          {opp.opportunityNumber}
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-800 dark:text-gray-200">
                          {opp.customerAccount?.name || "—"}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 text-[10px] font-semibold">
                            {opp.opportunityType.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">
                          {opp.title}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-gray-900 dark:text-white">
                          {formatCurrency(opp.estimatedValue, opp.currency)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${getStageBadge(opp.stage)}`}>
                            {opp.stage}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          {["DETECTED", "NEEDS_REVIEW"].includes(opp.stage) && (
                            <button
                              onClick={() => {
                                setSelectedExpansion(opp);
                                setQualifyValue(String(opp.estimatedValue || ""));
                                setShowQualifyExpansionModal(true);
                              }}
                              className="px-2 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 rounded border border-purple-200 dark:border-purple-800"
                            >
                              Qualify
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: CONTRACTS REGISTRY */}
        {activeTab === "contracts" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">Status:</span>
                <select
                  value={contractStatusFilter}
                  onChange={(e) => setContractStatusFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="RENEWAL_PENDING">Renewal Pending</option>
                  <option value="RENEWED">Renewed</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="DRAFT">Draft</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <button
                onClick={() => setShowNewContractModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Contract
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-gray-500 font-medium">
                  <tr>
                    <th className="py-3 px-4">Contract #</th>
                    <th className="py-3 px-4">Name & Customer</th>
                    <th className="py-3 px-4">Term Dates</th>
                    <th className="py-3 px-4">Renewal Date</th>
                    <th className="py-3 px-4">Annual ARR</th>
                    <th className="py-3 px-4">Auto-Renew</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {contracts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400">
                        No contracts registered.
                      </td>
                    </tr>
                  ) : (
                    contracts.map((contract: any) => (
                      <tr key={contract.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                        <td className="py-3 px-4 font-mono font-medium text-gray-900 dark:text-white">
                          {contract.contractNumber}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-gray-900 dark:text-white">{contract.name}</div>
                          <div className="text-[11px] text-gray-400">{contract.customerAccount?.name}</div>
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                          {new Date(contract.startDate).toLocaleDateString()} – {new Date(contract.termEndDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-800 dark:text-gray-200">
                          {new Date(contract.renewalDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(contract.annualRecurringValue, contract.currency)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              contract.autoRenew
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            }`}
                          >
                            {contract.autoRenew ? "YES" : "NO"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${getStageBadge(contract.status)}`}>
                            {contract.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button
                            onClick={() => {
                              setSelectedContract(contract);
                              setShowContractChangesModal(true);
                            }}
                            title="View Immutable Change History"
                            className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: REVENUE POLICY & TASKS */}
        {activeTab === "policy" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white text-base flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-500" />
                Workspace Revenue Governance Policy
              </h3>
              <p className="text-xs text-gray-500">
                Configure deterministic notice thresholds, milestone timing, and automated retention task triggers.
              </p>

              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Renewal Preparation Window (Days Prior)
                  </label>
                  <input
                    type="number"
                    value={policyPrepDays}
                    onChange={(e) => setPolicyPrepDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                  <span className="text-[11px] text-gray-400">Default: 90 days prior to contract expiration</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Health Review Window (Days Prior)
                  </label>
                  <input
                    type="number"
                    value={policyHealthDays}
                    onChange={(e) => setPolicyHealthDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                  <span className="text-[11px] text-gray-400">Default: 60 days prior</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Customer Engagement Window (Days Prior)
                  </label>
                  <input
                    type="number"
                    value={policyEngageDays}
                    onChange={(e) => setPolicyEngageDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                  <span className="text-[11px] text-gray-400">Default: 45 days prior</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Commercial Review Window (Days Prior)
                  </label>
                  <input
                    type="number"
                    value={policyCommDays}
                    onChange={(e) => setPolicyCommDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                  <span className="text-[11px] text-gray-400">Default: 30 days prior (Generates HIGH priority task)</span>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="autoTask"
                    checked={policyAutoTask}
                    onChange={(e) => setPolicyAutoTask(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <label htmlFor="autoTask" className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Enable Automated Scheduled Retention Task Generation
                  </label>
                </div>

                <button
                  onClick={() =>
                    savePolicyMutation.mutate({
                      renewalPreparationDays: policyPrepDays,
                      healthReviewDays: policyHealthDays,
                      engagementDays: policyEngageDays,
                      commercialReviewDays: policyCommDays,
                      autoTaskGeneration: policyAutoTask,
                    })
                  }
                  disabled={savePolicyMutation.isPending}
                  className="w-full py-2 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
                >
                  {savePolicyMutation.isPending ? "Saving..." : "Save Policy Configuration"}
                </button>
              </div>
            </div>

            {/* Run Milestone Governance Card */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Deterministic Retention Governance Evaluator
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Evaluates all active contracts against defined milestone deadlines. Tasks are generated with deterministic idempotency keys to ensure no duplicate tasks are ever instantiated.
              </p>

              <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl space-y-2 text-xs">
                <div className="font-semibold text-gray-800 dark:text-gray-200">Scheduled Task Idempotency:</div>
                <div className="font-mono text-gray-500 text-[11px]">RENEWAL-MILESTONE-[CONTRACT_ID]-[DAYS]</div>
                <p className="text-[11px] text-gray-400">
                  Guarantees exactly-once task instantiation per contract milestone window.
                </p>
              </div>

              <button
                onClick={() => generateTasksMutation.mutate()}
                disabled={generateTasksMutation.isPending}
                className="w-full py-2 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${generateTasksMutation.isPending ? "animate-spin" : ""}`} />
                {generateTasksMutation.isPending ? "Evaluating Active Contracts..." : "Run Milestone Evaluation Now"}
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 1: NEW CONTRACT */}
        {/* ------------------------------------------------------------- */}
        {showNewContractModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-white text-base">Register Customer Contract</h3>
                <button onClick={() => setShowNewContractModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Customer Account</label>
                  <select
                    value={newContractAccountId}
                    onChange={(e) => setNewContractAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <option value="">Select Account</option>
                    {accounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.tier})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Contract Number</label>
                    <input
                      type="text"
                      placeholder="CNT-2026-001"
                      value={newContractNumber}
                      onChange={(e) => setNewContractNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Contract Name</label>
                    <input
                      type="text"
                      placeholder="Enterprise Master Subscription"
                      value={newContractName}
                      onChange={(e) => setNewContractName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Total Contract Value ({preferredCurrency})</label>
                    <input
                      type="number"
                      placeholder="120000"
                      value={newContractValue}
                      onChange={(e) => setNewContractValue(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Annual Recurring ARR ({preferredCurrency})</label>
                    <input
                      type="number"
                      placeholder="120000"
                      value={newContractARR}
                      onChange={(e) => setNewContractARR(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Start Date</label>
                    <input
                      type="date"
                      value={newContractStartDate}
                      onChange={(e) => setNewContractStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Term End Date</label>
                    <input
                      type="date"
                      value={newContractEndDate}
                      onChange={(e) => setNewContractEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="modalAutoRenew"
                    checked={newContractAutoRenew}
                    onChange={(e) => setNewContractAutoRenew(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <label htmlFor="modalAutoRenew" className="text-gray-700 dark:text-gray-300">
                    Auto-Renew Contract
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowNewContractModal(false)}
                  className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    createContractMutation.mutate({
                      customerAccountId: newContractAccountId,
                      contractNumber: newContractNumber,
                      name: newContractName,
                      contractValue: Number(newContractValue),
                      annualRecurringValue: Number(newContractARR || newContractValue),
                      currency: preferredCurrency,
                      startDate: new Date(newContractStartDate).toISOString(),
                      termEndDate: new Date(newContractEndDate).toISOString(),
                      renewalDate: new Date(newContractEndDate).toISOString(),
                      autoRenew: newContractAutoRenew,
                    })
                  }
                  disabled={createContractMutation.isPending || !newContractAccountId || !newContractNumber}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  {createContractMutation.isPending ? "Creating..." : "Save Contract"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 2: NEW RENEWAL OPPORTUNITY */}
        {/* ------------------------------------------------------------- */}
        {showNewRenewalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-white text-base">New Renewal Opportunity</h3>
                <button onClick={() => setShowNewRenewalModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Contract</label>
                  <select
                    value={newRenewalContractId}
                    onChange={(e) => {
                      setNewRenewalContractId(e.target.value);
                      const c = contracts.find((c: any) => c.id === e.target.value);
                      if (c) {
                        setNewRenewalAmount(String(c.annualRecurringValue || c.contractValue));
                        setNewRenewalTargetDate(c.renewalDate.split("T")[0]);
                      }
                    }}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <option value="">Select Contract</option>
                    {contracts.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.contractNumber} — {c.name} ({c.customerAccount?.name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Opportunity #</label>
                  <input
                    type="text"
                    placeholder="REN-2026-001"
                    value={newRenewalNumber}
                    onChange={(e) => setNewRenewalNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Renewal Amount ({preferredCurrency})</label>
                  <input
                    type="number"
                    value={newRenewalAmount}
                    onChange={(e) => setNewRenewalAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Target Renewal Date</label>
                  <input
                    type="date"
                    value={newRenewalTargetDate}
                    onChange={(e) => setNewRenewalTargetDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowNewRenewalModal(false)}
                  className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    createRenewalMutation.mutate({
                      contractId: newRenewalContractId,
                      opportunityNumber: newRenewalNumber,
                      renewalAmount: Number(newRenewalAmount),
                      currency: preferredCurrency,
                      targetDate: new Date(newRenewalTargetDate).toISOString(),
                      stage: "UPCOMING",
                    })
                  }
                  disabled={createRenewalMutation.isPending || !newRenewalContractId || !newRenewalNumber}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  {createRenewalMutation.isPending ? "Creating..." : "Save Opportunity"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 3: ADVANCE STAGE */}
        {/* ------------------------------------------------------------- */}
        {showAdvanceStageModal && selectedOpportunity && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-gray-400">Opportunity {selectedOpportunity.opportunityNumber}</span>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Advance Renewal Stage</h3>
                </div>
                <button onClick={() => setShowAdvanceStageModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-xs space-y-1">
                <div>Current Stage: <strong className="text-indigo-600">{selectedOpportunity.stage}</strong></div>
                <div className="text-gray-500">Account: {selectedOpportunity.customerAccount?.name}</div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Target Stage</label>
                  <select
                    value={advanceTargetStage}
                    onChange={(e) => setAdvanceTargetStage(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <option value="">Select Next Stage</option>
                    <option value="PREPARATION">Preparation</option>
                    <option value="CUSTOMER_ENGAGEMENT">Customer Engagement</option>
                    <option value="COMMERCIAL_REVIEW">Commercial Review</option>
                    <option value="NEGOTIATION">Negotiation</option>
                    <option value="COMMIT_PENDING">Commit Pending</option>
                    <option value="ON_HOLD">On Hold</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Transition Notes / Evidence</label>
                  <textarea
                    rows={2}
                    value={advanceNotes}
                    onChange={(e) => setAdvanceNotes(e.target.value)}
                    placeholder="Rationale, stakeholder alignment, commercial terms discussed..."
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Next Action</label>
                  <input
                    type="text"
                    value={advanceNextAction}
                    onChange={(e) => setAdvanceNextAction(e.target.value)}
                    placeholder="Send executive business review slide deck"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowAdvanceStageModal(false)}
                  className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    advanceStageMutation.mutate({
                      id: selectedOpportunity.id,
                      body: {
                        stage: advanceTargetStage,
                        notes: advanceNotes,
                        nextAction: advanceNextAction,
                      },
                    })
                  }
                  disabled={advanceStageMutation.isPending || !advanceTargetStage}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  {advanceStageMutation.isPending ? "Updating..." : "Confirm Stage Transition"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 4: RECORD OUTCOME */}
        {/* ------------------------------------------------------------- */}
        {showRecordOutcomeModal && selectedOpportunity && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-gray-400">Opportunity {selectedOpportunity.opportunityNumber}</span>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Record Renewal Outcome</h3>
                </div>
                <button onClick={() => setShowRecordOutcomeModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Final Outcome</label>
                  <select
                    value={outcomeType}
                    onChange={(e) => setOutcomeType(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <option value="RENEWED_AS_IS">Renewed (As-Is)</option>
                    <option value="RENEWED_EXPANSION">Renewed with Expansion</option>
                    <option value="RENEWED_CONTRACTION">Renewed with Contraction</option>
                    <option value="CHURNED">Churned (Lost)</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Final Contract Amount ({preferredCurrency})</label>
                  <input
                    type="number"
                    value={outcomeFinalAmount}
                    onChange={(e) => setOutcomeFinalAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                </div>

                {outcomeType.startsWith("RENEWED") && (
                  <div>
                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Successor Contract Number</label>
                    <input
                      type="text"
                      placeholder="CNT-2027-001"
                      value={outcomeSuccessorNumber}
                      onChange={(e) => setOutcomeSuccessorNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                    <span className="text-[11px] text-gray-400">Instantiates next contract term automatically upon renewal</span>
                  </div>
                )}

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Outcome Evidence & Notes</label>
                  <textarea
                    rows={2}
                    value={outcomeNotes}
                    onChange={(e) => setOutcomeNotes(e.target.value)}
                    placeholder="Contract executed by VP of Procurement..."
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowRecordOutcomeModal(false)}
                  className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    recordOutcomeMutation.mutate({
                      id: selectedOpportunity.id,
                      body: {
                        outcome: outcomeType,
                        finalAmount: Number(outcomeFinalAmount),
                        successorContractNumber: outcomeSuccessorNumber || undefined,
                        notes: outcomeNotes || "Outcome recorded via console",
                      },
                    })
                  }
                  disabled={recordOutcomeMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
                >
                  {recordOutcomeMutation.isPending ? "Finalizing..." : "Finalize Outcome"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 5: RISK EVALUATION DETAIL */}
        {/* ------------------------------------------------------------- */}
        {showRiskDetailModal && latestRiskEvaluation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-gray-400">Deterministic Model v{latestRiskEvaluation.policyVersion}</span>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Renewal Risk Evaluation</h3>
                </div>
                <button onClick={() => setShowRiskDetailModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                <div>
                  <div className="text-xs text-gray-500">Calculated Score</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {latestRiskEvaluation.riskScore} <span className="text-sm font-normal text-gray-400">/ 100</span>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-md border text-xs font-bold ${getRiskBadge(latestRiskEvaluation.riskLevel)}`}>
                  {latestRiskEvaluation.riskLevel}
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">Executive Explanation</div>
                <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 p-3 rounded-lg leading-relaxed">
                  {latestRiskEvaluation.explanation}
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                  Contributing Evidence Signals ({latestRiskEvaluation.contributingSignals?.length || 0})
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {latestRiskEvaluation.contributingSignals?.map((sig: any, idx: number) => (
                    <div key={idx} className="p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{sig.signalName}</span>
                        <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">+{sig.impact} pts</span>
                      </div>
                      <p className="text-gray-500 text-[11px]">{sig.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowRiskDetailModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 6: RENEWAL TIMELINE */}
        {/* ------------------------------------------------------------- */}
        {showTimelineModal && selectedOpportunity && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-gray-400">Opportunity {selectedOpportunity.opportunityNumber}</span>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Chronological Timeline</h3>
                </div>
                <button onClick={() => setShowTimelineModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {timelineLoading ? (
                  <div className="text-center py-8 text-xs text-gray-400">Loading timeline...</div>
                ) : Array.isArray(timelineData?.data) && timelineData.data.length > 0 ? (
                  timelineData.data.map((evt: any) => (
                    <div key={evt.id} className="relative pl-5 pb-3 border-l-2 border-indigo-200 dark:border-indigo-800 space-y-1">
                      <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-indigo-600" />
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-900 dark:text-white">{evt.eventTitle}</span>
                        <span className="text-[10px] text-gray-400">{new Date(evt.createdAt).toLocaleString()}</span>
                      </div>
                      {evt.description && <p className="text-xs text-gray-500">{evt.description}</p>}
                      <div className="text-[10px] font-mono text-gray-400">Type: {evt.eventType}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-xs text-gray-400">No timeline events recorded yet.</div>
                )}
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowTimelineModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 7: QUALIFY EXPANSION */}
        {/* ------------------------------------------------------------- */}
        {showQualifyExpansionModal && selectedExpansion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-gray-400">Expansion {selectedExpansion.opportunityNumber}</span>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Human Qualification Checkpoint</h3>
                </div>
                <button onClick={() => setShowQualifyExpansionModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl text-xs space-y-1 text-purple-900 dark:text-purple-300">
                <div>Opportunity: <strong>{selectedExpansion.title}</strong></div>
                <div>Account: {selectedExpansion.customerAccount?.name}</div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Qualification Decision</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setQualifyStatus(true)}
                      className={`py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-1.5 ${
                        qualifyStatus
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" /> Qualify
                    </button>
                    <button
                      type="button"
                      onClick={() => setQualifyStatus(false)}
                      className={`py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-1.5 ${
                        !qualifyStatus
                          ? "bg-rose-600 text-white border-rose-600"
                          : "bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      <X className="w-3.5 h-3.5" /> Dismiss
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Estimated Value ({preferredCurrency})</label>
                  <input
                    type="number"
                    value={qualifyValue}
                    onChange={(e) => setQualifyValue(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Qualification Notes / Rationale</label>
                  <textarea
                    rows={2}
                    value={qualifyNotes}
                    onChange={(e) => setQualifyNotes(e.target.value)}
                    placeholder="Validated account capacity usage and approved expansion outreach..."
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowQualifyExpansionModal(false)}
                  className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    qualifyExpansionMutation.mutate({
                      id: selectedExpansion.id,
                      body: {
                        qualified: qualifyStatus,
                        notes: qualifyNotes || "Qualified via console review",
                        estimatedValue: Number(qualifyValue),
                      },
                    })
                  }
                  disabled={qualifyExpansionMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs"
                >
                  {qualifyExpansionMutation.isPending ? "Submitting..." : "Confirm Decision"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 8: CONTRACT CHANGE HISTORY */}
        {/* ------------------------------------------------------------- */}
        {showContractChangesModal && selectedContract && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-gray-400">Contract {selectedContract.contractNumber}</span>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">Immutable Change Audit History</h3>
                </div>
                <button onClick={() => setShowContractChangesModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {changesLoading ? (
                  <div className="text-center py-8 text-xs text-gray-400">Loading audit changes...</div>
                ) : Array.isArray(contractChangesData?.data) && contractChangesData.data.length > 0 ? (
                  contractChangesData.data.map((chg: any) => (
                    <div key={chg.id} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900 dark:text-white">{chg.changeType}</span>
                        <span className="text-[10px] text-gray-400">{new Date(chg.changedAt).toLocaleString()}</span>
                      </div>
                      {chg.changeReason && <p className="text-gray-500">{chg.changeReason}</p>}
                      <div className="text-[10px] font-mono text-gray-400">Actor: {chg.changedById || "System"}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-xs text-gray-400">No change history found.</div>
                )}
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowContractChangesModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
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
