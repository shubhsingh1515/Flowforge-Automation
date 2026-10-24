"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Brain,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Activity,
  Layers,
  Radio,
  Database,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Play,
  Check,
  X,
  FileText,
  Sliders,
  BarChart2,
  Workflow,
  Lock,
} from "lucide-react";

export default function IntelligencePage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<
    "OVERVIEW" | "INSIGHTS" | "FORECASTS" | "INVESTIGATIONS" | "DECISIONS" | "OUTCOMES"
  >("OVERVIEW");

  // Filter states
  const [insightCategoryFilter, setInsightCategoryFilter] = useState("");
  const [insightSeverityFilter, setInsightSeverityFilter] = useState("");
  const [proposalStatusFilter, setProposalStatusFilter] = useState("");

  // Modals
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [runForecastOpen, setRunForecastOpen] = useState(false);
  const [startInvestigationOpen, setStartInvestigationOpen] = useState(false);
  const [createProposalOpen, setCreateProposalOpen] = useState(false);
  const [approveProposalId, setApproveProposalId] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [executeImmediately, setExecuteImmediately] = useState(true);

  // Form states
  const [newWsName, setNewWsName] = useState("");
  const [newWsQuestion, setNewWsQuestion] = useState("");
  const [newWsDescription, setNewWsDescription] = useState("");

  const [forecastMetric, setForecastMetric] = useState("WORKFLOW_FAILURE_RISK");
  const [forecastResourceType, setForecastResourceType] = useState("WORKFLOW");
  const [forecastResourceId, setForecastResourceId] = useState("");
  const [forecastHorizon, setForecastHorizon] = useState(24);

  const [invTitle, setInvTitle] = useState("");
  const [invDescription, setInvDescription] = useState("");
  const [invResourceType, setInvResourceType] = useState("WORKFLOW");
  const [invResourceId, setInvResourceId] = useState("");

  const [propActionType, setPropActionType] = useState("REPLAY_EVENT_DELIVERY");
  const [propTargetType, setPropTargetType] = useState("EVENT_DELIVERY");
  const [propTargetId, setPropTargetId] = useState("");
  const [propRationale, setPropRationale] = useState("");
  const [propBenefit, setPropBenefit] = useState("");
  const [propRisk, setPropRisk] = useState("LOW");

  // 1. Fetch Overview & Live Context
  const { data: overviewData, isLoading: overviewLoading, refetch: refetchOverview } = useQuery({
    queryKey: ["intelligence-overview"],
    queryFn: () => api.intelligence.getOverview({ timeRangeHours: 24 }),
  });

  // 2. Fetch Insights
  const { data: insightsData, isLoading: insightsLoading, refetch: refetchInsights } = useQuery({
    queryKey: ["intelligence-insights", insightCategoryFilter, insightSeverityFilter],
    queryFn: () =>
      api.intelligence.insights.list({
        category: insightCategoryFilter || undefined,
        severity: insightSeverityFilter || undefined,
      }),
  });

  // 3. Fetch Forecasts
  const { data: forecastsData, isLoading: forecastsLoading, refetch: refetchForecasts } = useQuery({
    queryKey: ["intelligence-forecasts"],
    queryFn: () => api.intelligence.forecasts.list(),
  });

  // 4. Fetch Investigations
  const { data: investigationsData, isLoading: investigationsLoading, refetch: refetchInvestigations } = useQuery({
    queryKey: ["intelligence-investigations"],
    queryFn: () => api.intelligence.investigations.list(),
  });

  // 5. Fetch Decision Proposals
  const { data: proposalsData, isLoading: proposalsLoading, refetch: refetchProposals } = useQuery({
    queryKey: ["intelligence-proposals", proposalStatusFilter],
    queryFn: () =>
      api.intelligence.proposals.list({
        status: proposalStatusFilter || undefined,
      }),
  });

  // 6. Fetch Outcomes
  const { data: outcomesData, isLoading: outcomesLoading, refetch: refetchOutcomes } = useQuery({
    queryKey: ["intelligence-outcomes"],
    queryFn: () => api.intelligence.outcomes.list(),
  });

  // Mutations
  const analyzeMutation = useMutation({
    mutationFn: () => api.intelligence.insights.analyze({ timeRangeHours: 24 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intelligence-insights"] });
      queryClient.invalidateQueries({ queryKey: ["intelligence-overview"] });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => api.intelligence.insights.acknowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intelligence-insights"] });
    },
  });

  const runForecastMutation = useMutation({
    mutationFn: (body: any) => api.intelligence.forecasts.run(body),
    onSuccess: () => {
      setRunForecastOpen(false);
      queryClient.invalidateQueries({ queryKey: ["intelligence-forecasts"] });
    },
  });

  const startInvMutation = useMutation({
    mutationFn: (body: any) => api.intelligence.investigations.start(body),
    onSuccess: () => {
      setStartInvestigationOpen(false);
      queryClient.invalidateQueries({ queryKey: ["intelligence-investigations"] });
    },
  });

  const createProposalMutation = useMutation({
    mutationFn: (body: any) => api.intelligence.proposals.create(body),
    onSuccess: () => {
      setCreateProposalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["intelligence-proposals"] });
    },
  });

  const approveProposalMutation = useMutation({
    mutationFn: ({ id, notes, execute }: { id: string; notes: string; execute: boolean }) =>
      api.intelligence.proposals.approve(id, { comment: notes, executeImmediately: execute }),
    onSuccess: () => {
      setApproveProposalId(null);
      setApprovalNotes("");
      queryClient.invalidateQueries({ queryKey: ["intelligence-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["intelligence-outcomes"] });
    },
  });

  const executeProposalMutation = useMutation({
    mutationFn: (id: string) => api.intelligence.proposals.execute(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intelligence-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["intelligence-outcomes"] });
    },
  });

  const evaluateOutcomeMutation = useMutation({
    mutationFn: (proposalId: string) => api.intelligence.outcomes.evaluate(proposalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intelligence-outcomes"] });
    },
  });

  const overview = overviewData?.data;
  const metrics = overview?.metrics;
  const insightsList = insightsData?.data || [];
  const forecastsList = forecastsData?.data || [];
  const investigationsList = investigationsData?.data || [];
  const proposalsList = proposalsData?.data || [];
  const outcomesList = outcomesData?.data || [];

  return (
    <AppShell
      title="Enterprise AI Intelligence & Decision Support"
      description="Evidence-grounded operational insights, statistical outcome forecasts, and policy-governed automated business decisions."
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-[#6558E8] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#5345D8] disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Sparkles className={`h-4 w-4 ${analyzeMutation.isPending ? "animate-spin" : ""}`} />
            {analyzeMutation.isPending ? "Analyzing Telemetry..." : "Analyze Insights"}
          </button>
        </div>
      }
    >
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Workflow Failures
            </span>
            <Workflow className="h-5 w-5 text-[#6558E8]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {metrics?.failedExecutions ?? 0}
            </span>
            <span className="text-xs font-medium text-slate-500">
              / {metrics?.totalExecutions ?? 0} runs
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Failure Rate: {((metrics?.workflowFailureRate ?? 0) * 100).toFixed(1)}%
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Dead Letter Deliveries
            </span>
            <Radio className="h-5 w-5 text-rose-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {metrics?.deadLetterDeliveriesCount ?? 0}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Event fabric integration failures</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Insights
            </span>
            <Brain className="h-5 w-5 text-amber-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{insightsList.length}</span>
            <span className="text-xs font-semibold text-rose-600">
              {insightsList.filter((i: any) => i.severity === "CRITICAL").length} critical
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Evidence-grounded findings</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending Decisions
            </span>
            <ShieldCheck className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {proposalsList.filter((p: any) => p.status === "PENDING_APPROVAL").length}
            </span>
            <span className="text-xs font-medium text-slate-500">awaiting review</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Strictly allowlisted actions</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Outcome Evaluations
            </span>
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{outcomesList.length}</span>
            <span className="text-xs font-semibold text-emerald-600">
              {outcomesList.filter((o: any) => o.outcomeVerdict === "IMPROVED").length} improved
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Closed-loop verification</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-slate-200 overflow-x-auto min-w-0">
        <nav className="-mb-px flex space-x-6 min-w-max">
          {[
            { id: "OVERVIEW", label: "Context & Evidence" },
            { id: "INSIGHTS", label: `Insights (${insightsList.length})` },
            { id: "FORECASTS", label: `Predictive Forecasts (${forecastsList.length})` },
            { id: "INVESTIGATIONS", label: `Root Cause (${investigationsList.length})` },
            { id: "DECISIONS", label: `Governed Decisions (${proposalsList.length})` },
            { id: "OUTCOMES", label: `Outcome Feedback (${outcomesList.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`border-b-2 py-3 text-sm font-semibold transition-colors shrink-0 whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* TAB 1: OVERVIEW / CONTEXT & EVIDENCE */}
      {activeTab === "OVERVIEW" && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Unified Cross-Service Operational Context
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Tenant-isolated telemetry gathered across Workflows, Processes, Event Fabric, Data Products, and SRE Incidents.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <Lock className="h-3.5 w-3.5" />
                Sensitive Data Redaction Active
              </div>
            </div>

            {overview?.evidence && overview.evidence.length > 0 ? (
              <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                <div className="grid grid-cols-12 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500">
                  <div className="col-span-2">Source Service</div>
                  <div className="col-span-3">Resource</div>
                  <div className="col-span-3">Metric Name</div>
                  <div className="col-span-2">Value</div>
                  <div className="col-span-2">Observed Time</div>
                </div>
                {overview.evidence.map((ev: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-12 items-center px-4 py-3 text-xs text-slate-700 hover:bg-slate-50/50">
                    <div className="col-span-2 font-medium uppercase text-slate-600">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {ev.sourceService}
                      </span>
                    </div>
                    <div className="col-span-3 font-mono text-slate-800 truncate" title={ev.resourceId}>
                      {ev.resourceName || ev.resourceId}
                    </div>
                    <div className="col-span-3 font-mono text-slate-600 truncate">{ev.metricName}</div>
                    <div className="col-span-2 font-semibold text-slate-900 truncate">
                      {typeof ev.metricValue === "object" ? JSON.stringify(ev.metricValue) : String(ev.metricValue)}
                    </div>
                    <div className="col-span-2 text-slate-500">
                      {new Date(ev.observationTimestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                No active anomalies or errors observed in the current 24-hour observation window.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: INSIGHTS */}
      {activeTab === "INSIGHTS" && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <select
                value={insightSeverityFilter}
                onChange={(e) => setInsightSeverityFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
              >
                <option value="">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              <select
                value={insightCategoryFilter}
                onChange={(e) => setInsightCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
              >
                <option value="">All Categories</option>
                <option value="WORKFLOW_RELIABILITY_REGRESSION">Workflow Reliability Regression</option>
                <option value="PROCESS_BOTTLENECK">Process Bottleneck</option>
                <option value="SLA_BREACH_RISK">SLA Breach Risk</option>
                <option value="EVENT_DELIVERY_DEGRADATION">Event Delivery Degradation</option>
                <option value="DATA_QUALITY_DETERIORATION">Data Quality Deterioration</option>
                <option value="DATA_FRESHNESS_VIOLATION">Data Freshness Violation</option>
              </select>
            </div>

            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${analyzeMutation.isPending ? "animate-spin" : ""}`} />
              Re-run Analysis
            </button>
          </div>

          <div className="space-y-3">
            {insightsList.length > 0 ? (
              insightsList.map((insight: any) => (
                <div key={insight.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                            insight.severity === "CRITICAL"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : insight.severity === "HIGH"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {insight.severity}
                        </span>
                        <span className="text-xs font-medium text-slate-500 uppercase">{insight.category}</span>
                        <span className="text-xs font-medium text-slate-400">• Confidence: {(insight.confidence * 100).toFixed(0)}%</span>
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {insight.status}
                        </span>
                      </div>
                      <h4 className="mt-2 text-base font-semibold text-slate-900">{insight.title}</h4>
                      <p className="mt-1 text-sm text-slate-600">{insight.summary}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {insight.status === "OPEN" && (
                        <button
                          onClick={() => acknowledgeMutation.mutate(insight.id)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setPropRationale(insight.summary);
                          setPropBenefit("Remediates anomaly identified in insight: " + insight.title);
                          setCreateProposalOpen(true);
                        }}
                        className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        Create Decision Proposal
                      </button>
                    </div>
                  </div>

                  {insight.evidenceReferences && insight.evidenceReferences.length > 0 && (
                    <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 border border-slate-100">
                      <span className="font-semibold text-slate-700">Underlying Evidence: </span>
                      {insight.evidenceReferences.map((e: any, i: number) => (
                        <span key={i} className="mr-3 font-mono">
                          {e.metricName}: {String(e.metricValue)}
                        </span>
                      ))}
                      <div className="mt-1 text-[11px] text-slate-400">
                        Correlation Key: <code className="text-slate-600">{insight.correlationKey}</code>
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
                No active insights. Telemetry conforms to all reliability, process, SLA, and data quality targets.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PREDICTIVE FORECASTING */}
      {activeTab === "FORECASTS" && (
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Predictive Outcome Forecasting</h3>
              <p className="mt-1 text-sm text-slate-500">
                Statistical modeling (mean, standard deviation, P90 bootstrap) with minimum historical sample validation.
              </p>
            </div>
            <button
              onClick={() => setRunForecastOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <TrendingUp className="h-4 w-4" />
              Generate Forecast
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {forecastsList.map((fc: any) => (
              <div key={fc.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
                    {fc.targetMetric}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      fc.status === "COMPLETED"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {fc.status}
                  </span>
                </div>

                <div className="mt-4 flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-slate-900">
                    {fc.status === "COMPLETED" ? fc.predictedValue.toFixed(2) : "N/A"}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    predicted for next {fc.horizonHours}h
                  </span>
                </div>

                {fc.status === "COMPLETED" ? (
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <p>
                      Confidence Interval (95%):{" "}
                      <span className="font-semibold text-slate-800">
                        [{fc.confidenceIntervalLower?.toFixed(2)} — {fc.confidenceIntervalUpper?.toFixed(2)}]
                      </span>
                    </p>
                    <p>
                      Historical Sample Size:{" "}
                      <span className="font-semibold text-slate-800">{fc.sampleCount} executions</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Method: {fc.modelMethod} • Version: {fc.modelVersion}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    Insufficient historical sample data ({fc.sampleCount} runs). Minimum of 3 records required to prevent ungrounded predictions.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: INVESTIGATIONS */}
      {activeTab === "INVESTIGATIONS" && (
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Cross-System Root-Cause Investigations</h3>
              <p className="mt-1 text-sm text-slate-500">
                Correlates timeline events across workflows, event deliveries, business processes, and SRE incidents.
              </p>
            </div>
            <button
              onClick={() => setStartInvestigationOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <Search className="h-4 w-4" />
              New Investigation
            </button>
          </div>

          <div className="space-y-4">
            {investigationsList.map((inv: any) => (
              <div key={inv.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-slate-900">{inv.title}</h4>
                    <p className="mt-1 text-sm text-slate-600">{inv.issueDescription}</p>
                  </div>
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    {inv.status}
                  </span>
                </div>

                {/* Candidate Explanations */}
                <div className="mt-4">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Candidate Hypotheses
                  </h5>
                  <div className="mt-2 space-y-2">
                    {inv.candidateExplanations?.map((ce: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs border border-slate-100">
                        <span
                          className={`rounded px-1.5 py-0.5 font-bold ${
                            ce.likelihood === "HIGH"
                              ? "bg-rose-100 text-rose-800"
                              : ce.likelihood === "MEDIUM"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {ce.likelihood}
                        </span>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-800">{ce.hypothesis}</p>
                          {ce.evidenceRefs && ce.evidenceRefs.length > 0 && (
                            <p className="mt-1 text-slate-500">Evidence: {ce.evidenceRefs.join("; ")}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timeline */}
                {inv.timeline && inv.timeline.length > 0 && (
                  <div className="mt-4">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Correlated Event Timeline
                    </h5>
                    <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                      {inv.timeline.map((item: any, i: number) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="font-mono text-slate-400">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="font-semibold text-slate-700">[{item.service}]</span>
                          <span>{item.event}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: GOVERNED DECISIONS */}
      {activeTab === "DECISIONS" && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Governed Decision Automation Center</h3>
              <p className="mt-1 text-sm text-slate-500">
                AI may propose actions. Production execution is strictly allowlisted, precondition-checked, and role-authorized.
              </p>
            </div>
            <button
              onClick={() => setCreateProposalOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 shrink-0 self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              Propose Action
            </button>
          </div>

          <div className="space-y-4">
            {proposalsList.map((prop: any) => (
              <div key={prop.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 border border-indigo-200">
                        {prop.actionType}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                          prop.status === "SUCCEEDED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : prop.status === "APPROVED"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : prop.status === "PENDING_APPROVAL"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {prop.status}
                      </span>
                      <span className="text-xs font-medium text-slate-400">
                        Target: <code className="text-slate-600">{prop.targetResourceType}:{prop.targetResourceId}</code>
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{prop.rationale}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Expected Benefit: <span className="font-medium text-slate-700">{prop.expectedBenefit}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {prop.status === "PENDING_APPROVAL" && (
                      <button
                        onClick={() => setApproveProposalId(prop.id)}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
                      >
                        Approve Action
                      </button>
                    )}

                    {prop.status === "APPROVED" && (
                      <button
                        onClick={() => executeProposalMutation.mutate(prop.id)}
                        disabled={executeProposalMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Execute Now
                      </button>
                    )}

                    {prop.status === "SUCCEEDED" && (
                      <button
                        onClick={() => evaluateOutcomeMutation.mutate(prop.id)}
                        disabled={evaluateOutcomeMutation.isPending}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Evaluate Outcome
                      </button>
                    )}
                  </div>
                </div>

                {/* Preconditions check */}
                {prop.preconditions && prop.preconditions.length > 0 && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs border border-slate-100">
                    <span className="font-semibold text-slate-700">Preconditions Verified: </span>
                    {prop.preconditions.map((p: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 mr-3 text-emerald-700 font-medium">
                        <Check className="h-3 w-3" />
                        {p.condition || JSON.stringify(p)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Execution Result */}
                {prop.executionResult && (
                  <div className="mt-3 rounded-lg bg-emerald-50/50 p-3 text-xs border border-emerald-100">
                    <span className="font-semibold text-emerald-800">Deterministic Execution Output: </span>
                    <pre className="mt-1 font-mono text-[11px] text-slate-700 overflow-x-auto">
                      {JSON.stringify(prop.executionResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: OUTCOME EVALUATIONS */}
      {activeTab === "OUTCOMES" && (
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Post-Action Outcome Feedback Loop</h3>
              <p className="mt-1 text-sm text-slate-500">
                Measures pre-action baseline versus post-action metrics to evaluate whether action resolved operational regressions.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-12 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-500">
              <div className="col-span-3">Proposal ID / Action</div>
              <div className="col-span-2">Target Metric</div>
              <div className="col-span-2">Baseline Value</div>
              <div className="col-span-2">Post-Action Value</div>
              <div className="col-span-1">Delta</div>
              <div className="col-span-2">Verdict</div>
            </div>

            {outcomesList.map((oc: any) => (
              <div key={oc.id} className="grid grid-cols-12 items-center px-6 py-4 text-xs text-slate-700 hover:bg-slate-50/50">
                <div className="col-span-3 font-mono truncate text-slate-900" title={oc.proposalId}>
                  {oc.proposal?.actionType || oc.proposalId}
                </div>
                <div className="col-span-2 font-mono text-slate-600">{oc.targetMetric}</div>
                <div className="col-span-2 font-semibold text-slate-800">{oc.baselineValue}</div>
                <div className="col-span-2 font-semibold text-slate-800">{oc.postActionValue}</div>
                <div className="col-span-1 font-semibold text-slate-600">
                  {oc.postActionValue - oc.baselineValue}
                </div>
                <div className="col-span-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ${
                      oc.outcomeVerdict === "IMPROVED"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : oc.outcomeVerdict === "WORSENED"
                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {oc.outcomeVerdict}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Generate Forecast */}
      {runForecastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Generate Predictive Outcome Forecast</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase">Target Metric</label>
                <select
                  value={forecastMetric}
                  onChange={(e) => setForecastMetric(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="WORKFLOW_FAILURE_RISK">Workflow Failure Risk</option>
                  <option value="EXPECTED_COMPLETION_TIME_MS">Expected Completion Time (ms)</option>
                  <option value="PROCESS_SLA_BREACH_PROBABILITY">Process SLA Breach Probability</option>
                  <option value="EVENT_DELIVERY_DELAY_MS">Event Delivery Delay (ms)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase">Resource Type</label>
                <select
                  value={forecastResourceType}
                  onChange={(e) => setForecastResourceType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="WORKFLOW">Workflow</option>
                  <option value="PROCESS">Business Process</option>
                  <option value="EVENT">Event Subscription</option>
                  <option value="DATA_PRODUCT">Data Product</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase">Resource ID</label>
                <input
                  type="text"
                  placeholder="e.g. workflow-uuid-or-id"
                  value={forecastResourceId}
                  onChange={(e) => setForecastResourceId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase">Horizon (Hours)</label>
                <input
                  type="number"
                  value={forecastHorizon}
                  onChange={(e) => setForecastHorizon(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setRunForecastOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  runForecastMutation.mutate({
                    targetMetric: forecastMetric,
                    resourceType: forecastResourceType,
                    resourceId: forecastResourceId,
                    horizonHours: forecastHorizon,
                  })
                }
                disabled={!forecastResourceId || runForecastMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {runForecastMutation.isPending ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Approve Decision */}
      {approveProposalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Authorize Governed Action Execution</h3>
            <p className="mt-1 text-sm text-slate-500">
              Only workspace ADMIN or OWNER roles may authorize production actions.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase">Approval Notes</label>
                <textarea
                  rows={3}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Authorized after verification of downstream systems."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="execImm"
                  checked={executeImmediately}
                  onChange={(e) => setExecuteImmediately(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <label htmlFor="execImm" className="text-sm text-slate-700">
                  Execute immediately after approval
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setApproveProposalId(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  approveProposalMutation.mutate({
                    id: approveProposalId,
                    notes: approvalNotes,
                    execute: executeImmediately,
                  })
                }
                disabled={approveProposalMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {approveProposalMutation.isPending ? "Authorizing..." : "Authorize Execution"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Decision Proposal */}
      {createProposalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Create Governed Decision Proposal</h3>
            <p className="mt-1 text-sm text-slate-500">
              Propose an allowlisted FlowForge action for policy evaluation and authorization.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase">Allowlisted Action</label>
                <select
                  value={propActionType}
                  onChange={(e) => setPropActionType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="REPLAY_EVENT_DELIVERY">Replay Event Delivery</option>
                  <option value="RETRY_WORKFLOW_EXECUTION">Retry Workflow Execution</option>
                  <option value="REFRESH_DATA_PIPELINE">Refresh Data Pipeline</option>
                  <option value="CREATE_OPERATIONAL_INCIDENT">Create Operational Incident</option>
                  <option value="TRIGGER_PROCESS_REVIEW">Trigger Process Review</option>
                  <option value="RECOMMEND_CONFIGURATION_CHANGE">Recommend Configuration Change</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase">Target Resource ID</label>
                <input
                  type="text"
                  placeholder="Resource UUID"
                  value={propTargetId}
                  onChange={(e) => setPropTargetId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase">Rationale (min 10 chars)</label>
                <textarea
                  rows={2}
                  value={propRationale}
                  onChange={(e) => setPropRationale(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase">Expected Benefit (min 5 chars)</label>
                <input
                  type="text"
                  value={propBenefit}
                  onChange={(e) => setPropBenefit(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase">Estimated Risk</label>
                <select
                  value={propRisk}
                  onChange={(e) => setPropRisk(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setCreateProposalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createProposalMutation.mutate({
                    actionType: propActionType,
                    targetResourceType: propTargetType,
                    targetResourceId: propTargetId,
                    rationale: propRationale,
                    expectedBenefit: propBenefit,
                    estimatedRisk: propRisk,
                  })
                }
                disabled={!propTargetId || propRationale.length < 10 || propBenefit.length < 5 || createProposalMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {createProposalMutation.isPending ? "Creating..." : "Submit Proposal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
