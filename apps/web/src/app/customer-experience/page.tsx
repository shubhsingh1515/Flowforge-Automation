"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  HeartHandshake,
  MessageSquare,
  FileCheck,
  AlertOctagon,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  Plus,
  RefreshCw,
  Send,
  Eye,
  Check,
  X,
  AlertTriangle,
  Layers,
  BarChart3,
  ThumbsUp,
  ThumbsDown,
  User,
  Building2,
  Tag,
  ArrowUpRight,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  Hash,
} from "lucide-react";

export default function CustomerExperiencePage() {
  const queryClient = useQueryClient();

  // Tab State
  const [activeTab, setActiveTab] = useState<
    "overview" | "feedback" | "surveys" | "themes" | "issues" | "actions" | "account360"
  >("overview");

  // Filter States
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [feedbackSearch, setFeedbackSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [sentimentFilter, setSentimentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Modals
  const [showLogFeedbackModal, setShowLogFeedbackModal] = useState(false);
  const [showNewSurveyModal, setShowNewSurveyModal] = useState(false);
  const [showDeliverSurveyModal, setShowDeliverSurveyModal] = useState(false);
  const [showNewIssueModal, setShowNewIssueModal] = useState(false);
  const [showNewActionPlanModal, setShowNewActionPlanModal] = useState<string | null>(null);
  const [showResolveFeedbackModal, setShowResolveFeedbackModal] = useState<any | null>(null);
  const [selectedFeedbackDrawer, setSelectedFeedbackDrawer] = useState<any | null>(null);
  const [selectedIssueDrawer, setSelectedIssueDrawer] = useState<any | null>(null);

  // Forms
  const [feedbackForm, setFeedbackForm] = useState({
    customerAccountId: "",
    contactId: "",
    channel: "DIRECT_OUTREACH",
    category: "PRODUCT",
    feedbackType: "UNSOLICITED",
    sentiment: "NEUTRAL",
    rating: 8,
    rawText: "",
    summary: "",
  });

  const [surveyForm, setSurveyForm] = useState({
    name: "Enterprise Quarterly NPS",
    slug: `nps-q${Math.floor((new Date().getMonth() + 3) / 3)}-${new Date().getFullYear()}`,
    surveyType: "NPS",
    description: "Standard quarterly net promoter score evaluation for enterprise workflows.",
    questionsJson: JSON.stringify(
      [
        {
          id: "q1",
          type: "NPS",
          prompt: "How likely are you to recommend FlowForge Automation to a colleague or peer?",
          required: true,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          id: "q2",
          type: "TEXT",
          prompt: "What is the primary reason for your score?",
          required: false,
        },
      ],
      null,
      2
    ),
  });

  const [deliveryForm, setDeliveryForm] = useState({
    surveyId: "",
    customerAccountId: "",
    contactId: "",
    deliveryChannel: "EMAIL",
    recipientEmail: "",
    recipientName: "",
  });

  const [issueForm, setIssueForm] = useState({
    customerAccountId: "",
    title: "",
    description: "",
    severity: "HIGH",
    category: "PLATFORM_RELIABILITY",
    hypothesis: "",
    assignedOwner: "",
  });

  const [actionPlanForm, setActionPlanForm] = useState({
    title: "",
    description: "",
    targetCompletionDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    assignedOwner: "",
    expectedOutcome: "",
    successCriteria: "",
  });

  const [resolveFeedbackForm, setResolveFeedbackForm] = useState({
    resolutionNotes: "",
    actionTaken: "",
  });

  // Queries
  const { data: accountsData } = useQuery({
    queryKey: ["customers", "accounts"],
    queryFn: () => api.customers.listAccounts(),
  });
  const accounts: any[] = Array.isArray(accountsData?.data)
    ? accountsData.data
    : (accountsData?.data as any)?.accounts || [];

  const { data: contactsData } = useQuery({
    queryKey: ["customers", "contacts", selectedAccountId || feedbackForm.customerAccountId],
    queryFn: () =>
      api.customers.listContacts(selectedAccountId || feedbackForm.customerAccountId),
    enabled: Boolean(selectedAccountId || feedbackForm.customerAccountId),
  });
  const contacts: any[] = Array.isArray(contactsData?.data) ? contactsData.data : [];

  const { data: overviewData, refetch: refetchOverview, isLoading: overviewLoading } = useQuery({
    queryKey: ["customerExperience", "overview", selectedAccountId],
    queryFn: () => api.customerExperience.getOverview(selectedAccountId || undefined),
  });
  const overview = overviewData?.data || {};

  const { data: feedbackData, refetch: refetchFeedback } = useQuery({
    queryKey: ["customerExperience", "feedback", selectedAccountId, channelFilter, sentimentFilter, statusFilter, categoryFilter],
    queryFn: () =>
      api.customerExperience.listFeedback({
        customerAccountId: selectedAccountId || undefined,
        channel: channelFilter !== "ALL" ? channelFilter : undefined,
        sentiment: sentimentFilter !== "ALL" ? sentimentFilter : undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        category: categoryFilter !== "ALL" ? categoryFilter : undefined,
      }),
  });
  const feedbackList: any[] = feedbackData?.data?.records || [];

  const { data: surveysData, refetch: refetchSurveys } = useQuery({
    queryKey: ["customerExperience", "surveys"],
    queryFn: () => api.customerExperience.listSurveys(),
  });
  const surveysList: any[] = surveysData?.data || [];

  const { data: responsesData, refetch: refetchResponses } = useQuery({
    queryKey: ["customerExperience", "surveyResponses", selectedAccountId],
    queryFn: () =>
      api.customerExperience.listSurveyResponses({
        customerAccountId: selectedAccountId || undefined,
      }),
  });
  const surveyResponses: any[] = responsesData?.data || [];

  const { data: themesData, refetch: refetchThemes } = useQuery({
    queryKey: ["customerExperience", "themes"],
    queryFn: () => api.customerExperience.listThemes(),
  });
  const themesList: any[] = themesData?.data || [];

  const { data: themeAnalyticsData } = useQuery({
    queryKey: ["customerExperience", "themeAnalytics"],
    queryFn: () => api.customerExperience.getThemeAnalytics(30),
  });
  const themeAnalytics = themeAnalyticsData?.data || {};

  const { data: issuesData, refetch: refetchIssues } = useQuery({
    queryKey: ["customerExperience", "issues", selectedAccountId],
    queryFn: () =>
      api.customerExperience.listIssues({
        customerAccountId: selectedAccountId || undefined,
      }),
  });
  const issuesList: any[] = issuesData?.data || [];

  // Mutations
  const createFeedbackMutation = useMutation({
    mutationFn: (body: any) => api.customerExperience.createFeedback(body),
    onSuccess: () => {
      setShowLogFeedbackModal(false);
      setFeedbackForm({
        customerAccountId: "",
        contactId: "",
        channel: "DIRECT_OUTREACH",
        category: "PRODUCT",
        feedbackType: "UNSOLICITED",
        sentiment: "NEUTRAL",
        rating: 8,
        rawText: "",
        summary: "",
      });
      queryClient.invalidateQueries({ queryKey: ["customerExperience"] });
    },
  });

  const updateFeedbackStatusMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      api.customerExperience.updateFeedbackStatus(id, { status, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customerExperience"] });
    },
  });

  const resolveFeedbackMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.customerExperience.resolveFeedback(id, body),
    onSuccess: () => {
      setShowResolveFeedbackModal(null);
      setResolveFeedbackForm({ resolutionNotes: "", actionTaken: "" });
      queryClient.invalidateQueries({ queryKey: ["customerExperience"] });
    },
  });

  const createSurveyMutation = useMutation({
    mutationFn: (body: any) => {
      let parsedQuestions = [];
      try {
        parsedQuestions = JSON.parse(body.questionsJson);
      } catch (e) {
        parsedQuestions = [];
      }
      return api.customerExperience.createSurvey({
        name: body.name,
        slug: body.slug,
        surveyType: body.surveyType,
        description: body.description,
        questions: parsedQuestions,
      });
    },
    onSuccess: () => {
      setShowNewSurveyModal(false);
      queryClient.invalidateQueries({ queryKey: ["customerExperience", "surveys"] });
    },
  });

  const deliverSurveyMutation = useMutation({
    mutationFn: (body: any) => api.customerExperience.deliverSurvey(body),
    onSuccess: () => {
      setShowDeliverSurveyModal(false);
      setDeliveryForm({
        surveyId: "",
        customerAccountId: "",
        contactId: "",
        deliveryChannel: "EMAIL",
        recipientEmail: "",
        recipientName: "",
      });
      queryClient.invalidateQueries({ queryKey: ["customerExperience"] });
    },
  });

  const publishSurveyVersionMutation = useMutation({
    mutationFn: ({ surveyId, versionNumber }: { surveyId: string; versionNumber: number }) =>
      api.customerExperience.publishSurveyVersion(surveyId, versionNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customerExperience", "surveys"] });
    },
  });

  const createIssueMutation = useMutation({
    mutationFn: (body: any) => api.customerExperience.createIssue(body),
    onSuccess: () => {
      setShowNewIssueModal(false);
      setIssueForm({
        customerAccountId: "",
        title: "",
        description: "",
        severity: "HIGH",
        category: "PLATFORM_RELIABILITY",
        hypothesis: "",
        assignedOwner: "",
      });
      queryClient.invalidateQueries({ queryKey: ["customerExperience", "issues"] });
    },
  });

  const updateIssueMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.customerExperience.updateIssue(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customerExperience", "issues"] });
    },
  });

  const createActionPlanMutation = useMutation({
    mutationFn: ({ issueId, body }: { issueId: string; body: any }) =>
      api.customerExperience.createActionPlan(issueId, body),
    onSuccess: () => {
      setShowNewActionPlanModal(null);
      setActionPlanForm({
        title: "",
        description: "",
        targetCompletionDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        assignedOwner: "",
        expectedOutcome: "",
        successCriteria: "",
      });
      queryClient.invalidateQueries({ queryKey: ["customerExperience", "issues"] });
    },
  });

  const reviewClassificationMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.customerExperience.reviewClassification(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customerExperience"] });
    },
  });

  // Filtered Feedback
  const filteredFeedback = feedbackList.filter((fb) => {
    if (!feedbackSearch) return true;
    const s = feedbackSearch.toLowerCase();
    return (
      (fb.customerAccount?.name || "").toLowerCase().includes(s) ||
      (fb.feedbackNumber || "").toLowerCase().includes(s) ||
      (fb.rawText || "").toLowerCase().includes(s) ||
      (fb.summary || "").toLowerCase().includes(s)
    );
  });

  // Flat Action Plans extracted from issues
  const allActionPlans = issuesList.flatMap((issue) =>
    (issue.actionPlans || []).map((ap: any) => ({
      ...ap,
      issueTitle: issue.title,
      issueNumber: issue.issueNumber,
      issueSeverity: issue.severity,
      issueAccountName: issue.customerAccount?.name || "Global",
    }))
  );

  return (
    <AppShell>
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                Phase 28
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                VoC & Closed Loop
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <HeartHandshake className="w-7 h-7 text-indigo-600" />
              Customer Experience Intelligence & VoC
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Multi-channel customer feedback, deterministic NPS/CSAT metrics, survey governance, and closed-loop corrective action management.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                refetchOverview();
                refetchFeedback();
                refetchSurveys();
                refetchResponses();
                refetchThemes();
                refetchIssues();
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={() => setShowLogFeedbackModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Feedback
            </button>
            <button
              onClick={() => setShowNewSurveyModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-colors"
            >
              <FileCheck className="w-3.5 h-3.5" />
              New Survey
            </button>
            <button
              onClick={() => setShowDeliverSurveyModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Deliver Survey
            </button>
            <button
              onClick={() => setShowNewIssueModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Report Issue
            </button>
          </div>
        </div>

        {/* Global Account Filter Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-gray-800/60 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Building2 className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">
              Scope by Account:
            </span>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
            >
              <option value="">All Customer Accounts (Portfolio View)</option>
              {accounts.map((acc: any) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.tier || acc.lifecycleState || "Account"})
                </option>
              ))}
            </select>
            {selectedAccountId && (
              <button
                onClick={() => setSelectedAccountId("")}
                className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5 ml-1"
              >
                Clear
              </button>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {selectedAccountId
              ? `Filtered to: ${accounts.find((a) => a.id === selectedAccountId)?.name || "Account"}`
              : "Showing cross-account VoC intelligence & aggregation"}
          </div>
        </div>

        {/* 6 Top KPI Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Card 1: Total Feedback */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Feedback</span>
              <MessageSquare className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {overview.totalFeedbackCount ?? feedbackList.length ?? 0}
            </div>
            <div className="text-[11px] text-gray-400">
              {overview.openFeedbackCount ?? 0} active / unreviewed
            </div>
          </div>

          {/* Card 2: NPS Metric */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Net Promoter (NPS)</span>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {overview.npsMetric?.status === "VALID" ? (
                <span className={overview.npsMetric.score >= 50 ? "text-emerald-600" : overview.npsMetric.score >= 0 ? "text-blue-600" : "text-rose-600"}>
                  {overview.npsMetric.score > 0 ? `+${overview.npsMetric.score}` : overview.npsMetric.score}
                </span>
              ) : (
                <span className="text-xs text-gray-400 font-medium">N/A (&lt; 5 responses)</span>
              )}
            </div>
            <div className="text-[11px] text-gray-400">
              {overview.npsMetric?.sampleSize ? `${overview.npsMetric.sampleSize} audited samples` : "Sample gate active"}
            </div>
          </div>

          {/* Card 3: CSAT */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Satisfaction (CSAT)</span>
              <ThumbsUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {overview.csatMetric?.status === "VALID" ? (
                <span className="text-emerald-600">{overview.csatMetric.score}%</span>
              ) : (
                <span className="text-xs text-gray-400 font-medium">N/A (&lt; 5 responses)</span>
              )}
            </div>
            <div className="text-[11px] text-gray-400">
              {overview.csatMetric?.breakdown?.satisfied ?? 0} satisfied ratings
            </div>
          </div>

          {/* Card 4: Effort Score (CES) */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Effort Score (CES)</span>
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {overview.cesMetric?.status === "VALID" ? (
                <span>{overview.cesMetric.score} / 7</span>
              ) : (
                <span className="text-xs text-gray-400 font-medium">N/A (&lt; 5 responses)</span>
              )}
            </div>
            <div className="text-[11px] text-gray-400">Ease of resolution</div>
          </div>

          {/* Card 5: VoC Themes */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Themes</span>
              <Tag className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {themesList.length}
            </div>
            <div className="text-[11px] text-gray-400">
              {overview.pendingClassificationReviews ?? 0} need human review
            </div>
          </div>

          {/* Card 6: Experience Issues */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-semibold uppercase tracking-wider">Open Issues</span>
              <AlertOctagon className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {issuesList.filter((i) => i.status !== "VERIFIED_RESOLVED" && i.status !== "CLOSED").length}
            </div>
            <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
              {issuesList.filter((i) => i.severity === "CRITICAL" && i.status !== "CLOSED").length} critical severity
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 flex overflow-x-auto gap-4">
          {[
            { id: "overview", label: "Overview & Analytics", icon: BarChart3 },
            { id: "feedback", label: `Feedback Inbox (${feedbackList.length})`, icon: MessageSquare },
            { id: "surveys", label: `Surveys & Responses (${surveysList.length})`, icon: FileCheck },
            { id: "themes", label: `VoC Themes (${themesList.length})`, icon: Tag },
            { id: "issues", label: `Experience Issues (${issuesList.length})`, icon: AlertTriangle },
            { id: "actions", label: `Closed-Loop Actions (${allActionPlans.length})`, icon: CheckCircle2 },
            { id: "account360", label: "Account Experience 360", icon: Building2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-semibold text-xs transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW & ANALYTICS */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* NPS & CSAT Breakdown Hero */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* NPS Card */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-indigo-600" />
                      Net Promoter Score (NPS) Evaluation
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Deterministic standard score (-100 to +100). Minimum sample requirement: 5 responses.
                    </p>
                  </div>
                  {overview.npsMetric?.status === "VALID" ? (
                    <span className="text-xl font-extrabold px-3 py-1 rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {overview.npsMetric.score > 0 ? `+${overview.npsMetric.score}` : overview.npsMetric.score}
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                      Insufficient Data (&lt; 5)
                    </span>
                  )}
                </div>

                {overview.npsMetric?.status === "VALID" ? (
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full flex overflow-hidden">
                      <div
                        style={{ width: `${overview.npsMetric.breakdown?.promoterPct || 0}%` }}
                        className="bg-emerald-500 h-full"
                        title={`Promoters: ${overview.npsMetric.breakdown?.promoterPct}%`}
                      />
                      <div
                        style={{ width: `${overview.npsMetric.breakdown?.passivePct || 0}%` }}
                        className="bg-amber-400 h-full"
                        title={`Passives: ${overview.npsMetric.breakdown?.passivePct}%`}
                      />
                      <div
                        style={{ width: `${overview.npsMetric.breakdown?.detractorPct || 0}%` }}
                        className="bg-rose-500 h-full"
                        title={`Detractors: ${overview.npsMetric.breakdown?.detractorPct}%`}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                        <div className="font-bold">{overview.npsMetric.breakdown?.promoterPct ?? 0}%</div>
                        <div className="text-[10px]">Promoters (9-10)</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                        <div className="font-bold">{overview.npsMetric.breakdown?.passivePct ?? 0}%</div>
                        <div className="text-[10px]">Passives (7-8)</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                        <div className="font-bold">{overview.npsMetric.breakdown?.detractorPct ?? 0}%</div>
                        <div className="text-[10px]">Detractors (0-6)</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-dashed border-gray-200 dark:border-gray-700">
                    <TrendingUp className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-500 font-medium">
                      FlowForge governance prevents statistical hallucination. At least 5 survey responses are required to publish an authoritative NPS score.
                    </p>
                    <button
                      onClick={() => setShowDeliverSurveyModal(true)}
                      className="mt-3 text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Deliver Survey to collect responses &rarr;
                    </button>
                  </div>
                )}
              </div>

              {/* CSAT Card */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <ThumbsUp className="w-5 h-5 text-emerald-600" />
                      Customer Satisfaction (CSAT) Evaluation
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Percentage of satisfied ratings (4 & 5 out of 5 scale).
                    </p>
                  </div>
                  {overview.csatMetric?.status === "VALID" ? (
                    <span className="text-xl font-extrabold px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {overview.csatMetric.score}%
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                      Insufficient Data (&lt; 5)
                    </span>
                  )}
                </div>

                {overview.csatMetric?.status === "VALID" ? (
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full flex overflow-hidden">
                      <div
                        style={{ width: `${overview.csatMetric.score}%` }}
                        className="bg-emerald-500 h-full"
                        title={`Satisfied: ${overview.csatMetric.score}%`}
                      />
                      <div
                        style={{ width: `${100 - overview.csatMetric.score}%` }}
                        className="bg-gray-300 dark:bg-gray-600 h-full"
                        title="Neutral or Dissatisfied"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                        <div className="font-bold text-base">{overview.csatMetric.breakdown?.satisfied ?? 0}</div>
                        <div className="text-[11px]">Satisfied (4-5 Stars)</div>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300">
                        <div className="font-bold text-base">{overview.csatMetric.breakdown?.neutralAndBelow ?? 0}</div>
                        <div className="text-[11px]">Neutral &amp; Dissatisfied (&le; 3 Stars)</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-dashed border-gray-200 dark:border-gray-700">
                    <ThumbsUp className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-500 font-medium">
                      A minimum of 5 customer responses is required to compute CSAT satisfaction rates deterministically.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Top Themes & Recent Feedback Feeds */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* VoC Themes Leaderboard */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Tag className="w-4 h-4 text-indigo-600" />
                    Top Voice of Customer Themes
                  </h3>
                  <button
                    onClick={() => setActiveTab("themes")}
                    className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    View All ({themesList.length}) <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {themesList.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400">
                    No VoC themes configured yet.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {themesList.slice(0, 5).map((theme: any) => (
                      <div
                        key={theme.id}
                        className="p-3 rounded-xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-700/20 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                            {theme.name}
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">{theme.category}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-bold">
                            {theme._count?.classifications ?? theme.classifications?.length ?? 0} mentions
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Feedback Stream */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    Recent Customer Feedback
                  </h3>
                  <button
                    onClick={() => setActiveTab("feedback")}
                    className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    View Inbox ({feedbackList.length}) <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {feedbackList.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400">
                    No customer feedback records found. Click &quot;Log Feedback&quot; to ingest feedback.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {feedbackList.slice(0, 5).map((fb: any) => (
                      <div
                        key={fb.id}
                        onClick={() => setSelectedFeedbackDrawer(fb)}
                        className="p-3 rounded-xl border border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-gray-900 dark:text-white">
                            {fb.customerAccount?.name || "Unassigned Account"}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
                              fb.sentiment === "POSITIVE"
                                ? "bg-emerald-100 text-emerald-700"
                                : fb.sentiment === "NEGATIVE"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {fb.sentiment}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                          {fb.redactedText || fb.rawText}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-gray-400 pt-0.5">
                          <span>{fb.channel} &bull; {fb.category}</span>
                          <span>{new Date(fb.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FEEDBACK INBOX */}
        {activeTab === "feedback" && (
          <div className="space-y-4">
            {/* Filters Bar */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search feedback text, summary, account or ID..."
                  value={feedbackSearch}
                  onChange={(e) => setFeedbackSearch(e.target.value)}
                  className="w-full text-xs bg-transparent border-none focus:outline-none text-gray-800 dark:text-gray-200"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value)}
                  className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5"
                >
                  <option value="ALL">All Channels</option>
                  <option value="IN_APP_SURVEY">In-App Survey</option>
                  <option value="EMAIL_SURVEY">Email Survey</option>
                  <option value="SUPPORT_TICKET">Support Ticket</option>
                  <option value="CSM_CONVERSATION">CSM Conversation</option>
                  <option value="EXECUTIVE_REVIEW">Executive Review</option>
                  <option value="DIRECT_OUTREACH">Direct Outreach</option>
                </select>

                <select
                  value={sentimentFilter}
                  onChange={(e) => setSentimentFilter(e.target.value)}
                  className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5"
                >
                  <option value="ALL">All Sentiments</option>
                  <option value="POSITIVE">Positive</option>
                  <option value="NEUTRAL">Neutral</option>
                  <option value="NEGATIVE">Negative</option>
                  <option value="MIXED">Mixed</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="RECEIVED">Received</option>
                  <option value="ACKNOWLEDGED">Acknowledged</option>
                  <option value="IN_REVIEW">In Review</option>
                  <option value="ACTIONED">Actioned</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 font-semibold border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="py-3 px-4">Feedback ID</th>
                      <th className="py-3 px-4">Account &amp; Contact</th>
                      <th className="py-3 px-4">Channel &amp; Type</th>
                      <th className="py-3 px-4">Sentiment &amp; Score</th>
                      <th className="py-3 px-4">Redacted Feedback Content</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 text-gray-700 dark:text-gray-300">
                    {filteredFeedback.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400">
                          No feedback entries match your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredFeedback.map((fb) => (
                        <tr
                          key={fb.id}
                          className="hover:bg-gray-50/60 dark:hover:bg-gray-700/30 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono font-medium text-gray-900 dark:text-white">
                            {fb.feedbackNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-gray-900 dark:text-white">
                              {fb.customerAccount?.name || "Global / Unassigned"}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {fb.customerContact ? fb.customerContact.email : "Anonymous / Direct"}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium">
                              {fb.channel}
                            </span>
                            <div className="text-[10px] text-gray-400 mt-0.5">{fb.category}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  fb.sentiment === "POSITIVE"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : fb.sentiment === "NEGATIVE"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {fb.sentiment}
                              </span>
                              {fb.normalizedScore !== null && fb.normalizedScore !== undefined && (
                                <span className="font-bold text-gray-900 dark:text-white">
                                  {fb.normalizedScore}/100
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <p className="truncate text-gray-800 dark:text-gray-200">
                              {fb.redactedText || fb.rawText}
                            </p>
                            {fb.hasPii && (
                              <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5 mt-0.5">
                                <ShieldAlert className="w-2.5 h-2.5" /> PII Redacted
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                fb.status === "RESOLVED"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : fb.status === "ACTIONED"
                                  ? "bg-indigo-100 text-indigo-700"
                                  : fb.status === "IN_REVIEW"
                                  ? "bg-blue-100 text-blue-700"
                                  : fb.status === "DISMISSED"
                                  ? "bg-gray-100 text-gray-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {fb.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5">
                            <button
                              onClick={() => setSelectedFeedbackDrawer(fb)}
                              className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Inspect
                            </button>
                            {fb.status !== "RESOLVED" && (
                              <button
                                onClick={() => setShowResolveFeedbackModal(fb)}
                                className="px-2 py-1 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                Resolve
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
          </div>
        )}

        {/* TAB 3: SURVEYS & RESPONSES */}
        {activeTab === "surveys" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column: Survey Definitions */}
              <div className="md:col-span-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Survey Blueprints</h3>
                  <button
                    onClick={() => setShowNewSurveyModal(true)}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" /> Blueprint
                  </button>
                </div>

                <div className="space-y-3">
                  {surveysList.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                      No surveys configured. Click &quot;New Survey&quot; to create one.
                    </div>
                  ) : (
                    surveysList.map((survey: any) => (
                      <div
                        key={survey.id}
                        className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-gray-900 dark:text-white">
                            {survey.name}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] rounded-full font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            {survey.surveyType}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 line-clamp-2">{survey.description}</p>
                        <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-700">
                          <span>Versions: {survey.versions?.length || 1}</span>
                          <span className="font-mono text-[10px]">
                            {survey.activeVersion ? `v${survey.activeVersion.versionNumber} published` : "Draft"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Responses Log */}
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    Survey Delivery &amp; Responses Log ({surveyResponses.length})
                  </h3>
                  <button
                    onClick={() => setShowDeliverSurveyModal(true)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold flex items-center gap-1 hover:bg-indigo-700 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" /> Deliver Survey
                  </button>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 font-semibold border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="py-3 px-4">Response ID</th>
                        <th className="py-3 px-4">Account / Contact</th>
                        <th className="py-3 px-4">Score / Value</th>
                        <th className="py-3 px-4">Sentiment</th>
                        <th className="py-3 px-4">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                      {surveyResponses.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-gray-400">
                            No survey responses recorded yet. Send a survey to an authorized contact.
                          </td>
                        </tr>
                      ) : (
                        surveyResponses.map((res: any) => (
                          <tr key={res.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                            <td className="py-3 px-4 font-mono font-medium">{res.id.slice(0, 8)}...</td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-gray-900 dark:text-white">
                                {res.customerAccount?.name || "Global Account"}
                              </div>
                              <div className="text-[11px] text-gray-400">
                                {res.customerContact?.email || "Anonymous"}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-bold">
                              {res.score !== null ? (
                                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                  {res.score}
                                </span>
                              ) : (
                                "Text"
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  res.sentiment === "POSITIVE"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : res.sentiment === "NEGATIVE"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {res.sentiment}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-gray-500">
                              {new Date(res.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: VOC THEMES & REVIEW QUEUE */}
        {activeTab === "themes" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* VoC Taxonomy Themes */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Tag className="w-4 h-4 text-indigo-600" />
                  Taxonomy &amp; Extracted Themes ({themesList.length})
                </h3>

                <div className="space-y-3">
                  {themesList.map((theme: any) => (
                    <div
                      key={theme.id}
                      className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-gray-900 dark:text-white">
                          {theme.name}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] rounded-full font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          {theme.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500">{theme.description}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(theme.keywords || []).map((kw: string, i: number) => (
                          <span
                            key={i}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-mono"
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Classification Human Review Queue */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Human Classification Review Queue
                  </h3>
                  <span className="text-xs text-gray-400">Deterministic Confidence Gating</span>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
                  <p className="text-xs text-gray-500">
                    High-stakes commercial or operational classifications require authorized human verification to ensure zero hallucination or incorrect risk categorization.
                  </p>

                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {feedbackList
                      .filter((fb) => (fb.classifications || []).some((c: any) => c.status === "PROPOSED"))
                      .slice(0, 5)
                      .map((fb) => {
                        const proposed = (fb.classifications || []).find((c: any) => c.status === "PROPOSED");
                        if (!proposed) return null;
                        return (
                          <div key={proposed.id} className="py-3 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-gray-900 dark:text-white">
                                {fb.customerAccount?.name || "Global Account"}
                              </span>
                              <span className="text-[10px] text-amber-600 font-bold px-2 py-0.5 rounded bg-amber-50">
                                Confidence: {Math.round((proposed.confidenceScore || 0.8) * 100)}%
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-300 italic">
                              &quot;{fb.redactedText || fb.rawText}&quot;
                            </p>
                            <div className="flex items-center justify-between text-xs pt-1">
                              <div className="text-[11px] text-gray-500">
                                Proposed Theme: <span className="font-bold text-indigo-600">{proposed.theme?.name || "Platform"}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() =>
                                    reviewClassificationMutation.mutate({
                                      id: proposed.id,
                                      body: { status: "CONFIRMED" },
                                    })
                                  }
                                  className="px-2.5 py-1 text-xs rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() =>
                                    reviewClassificationMutation.mutate({
                                      id: proposed.id,
                                      body: { status: "REJECTED" },
                                    })
                                  }
                                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 text-gray-700 dark:text-gray-300 transition-colors"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {feedbackList.every((fb) => !(fb.classifications || []).some((c: any) => c.status === "PROPOSED")) && (
                      <div className="py-8 text-center text-xs text-gray-400">
                        No classifications currently pending human review.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: EXPERIENCE ISSUES */}
        {activeTab === "issues" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Experience Issues &amp; Root Cause Tracking ({issuesList.length})
                </h3>
                <p className="text-xs text-gray-500">
                  Aggregated systemic customer experience friction, platform reliability defects, and workflow blockers.
                </p>
              </div>
              <button
                onClick={() => setShowNewIssueModal(true)}
                className="text-xs px-3 py-2 rounded-xl bg-amber-600 text-white font-semibold flex items-center gap-1.5 hover:bg-amber-700 shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Log Issue
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {issuesList.length === 0 ? (
                <div className="col-span-full py-16 text-center text-xs text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                  <AlertTriangle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  No experience issues recorded. Click &quot;Log Issue&quot; to register a systemic friction or root-cause blocker.
                </div>
              ) : (
                issuesList.map((issue: any) => (
                  <div
                    key={issue.id}
                    className="p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          {issue.issueNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
                            issue.severity === "CRITICAL"
                              ? "bg-rose-100 text-rose-700"
                              : issue.severity === "HIGH"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {issue.severity}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white line-clamp-2">
                        {issue.title}
                      </h4>
                      <p className="text-xs text-gray-500 line-clamp-3">{issue.description}</p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>Account: {issue.customerAccount?.name || "Global Portfolio"}</span>
                        <span>Plans: {(issue.actionPlans || []).length}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <select
                          value={issue.status}
                          onChange={(e) =>
                            updateIssueMutation.mutate({
                              id: issue.id,
                              body: { status: e.target.value },
                            })
                          }
                          className="text-[11px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                        >
                          <option value="OPEN">Open</option>
                          <option value="INVESTIGATING">Investigating</option>
                          <option value="ACTION_PLAN_COMMITTED">Plan Committed</option>
                          <option value="MITIGATING">Mitigating</option>
                          <option value="VERIFIED_RESOLVED">Verified Resolved</option>
                          <option value="CLOSED">Closed</option>
                        </select>

                        <button
                          onClick={() => setShowNewActionPlanModal(issue.id)}
                          className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center gap-0.5"
                        >
                          <Plus className="w-3 h-3" /> Action Plan
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 6: CLOSED-LOOP ACTION PLANS */}
        {activeTab === "actions" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Closed-Loop Action Plans ({allActionPlans.length})
              </h3>
              <p className="text-xs text-gray-500">
                Corrective operational commitments linked to issues and synchronized with Phase 25 Customer Success Tasks.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 font-semibold border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="py-3 px-4">Action Title</th>
                    <th className="py-3 px-4">Associated Issue</th>
                    <th className="py-3 px-4">Account</th>
                    <th className="py-3 px-4">Target Date</th>
                    <th className="py-3 px-4">Owner</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {allActionPlans.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-400">
                        No closed-loop action plans recorded yet. Create one from an Experience Issue.
                      </td>
                    </tr>
                  ) : (
                    allActionPlans.map((ap: any) => (
                      <tr key={ap.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                        <td className="py-3 px-4 font-bold text-gray-900 dark:text-white">
                          {ap.title}
                          <p className="text-[11px] text-gray-500 font-normal line-clamp-1">{ap.description}</p>
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-indigo-600">
                          {ap.issueNumber} ({ap.issueTitle})
                        </td>
                        <td className="py-3 px-4">{ap.issueAccountName}</td>
                        <td className="py-3 px-4 text-gray-500">
                          {ap.targetCompletionDate ? new Date(ap.targetCompletionDate).toLocaleDateString() : "TBD"}
                        </td>
                        <td className="py-3 px-4">{ap.assignedOwner || "Unassigned"}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ap.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-700"
                                : ap.status === "IN_PROGRESS"
                                ? "bg-indigo-100 text-indigo-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {ap.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {ap.status !== "COMPLETED" && (
                            <button
                              onClick={() =>
                                api.customerExperience
                                  .updateActionPlan(ap.id, {
                                    status: "COMPLETED",
                                    resolutionNotes: "Verified through customer follow-up audit.",
                                  })
                                  .then(() => queryClient.invalidateQueries({ queryKey: ["customerExperience"] }))
                              }
                              className="px-2 py-1 text-xs rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
                            >
                              Complete
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

        {/* TAB 7: ACCOUNT EXPERIENCE 360 */}
        {activeTab === "account360" && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                    Account Experience 360 Deep-Dive
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Select any enterprise account to inspect its complete satisfaction timeline, feedback sentiment, and open friction issues.
                  </p>
                </div>

                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-3 py-2 focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
                >
                  <option value="">Select Account...</option>
                  {accounts.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {!selectedAccountId ? (
                <div className="py-16 text-center text-xs text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                  Please select a customer account from the dropdown above to view its Experience 360 profile.
                </div>
              ) : (
                <div className="space-y-6 pt-4">
                  {/* Account Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700">
                      <div className="text-[11px] text-gray-400 uppercase font-semibold">Account</div>
                      <div className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                        {accounts.find((a) => a.id === selectedAccountId)?.name}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700">
                      <div className="text-[11px] text-gray-400 uppercase font-semibold">Total Feedback</div>
                      <div className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                        {feedbackList.filter((f) => f.customerAccountId === selectedAccountId).length}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700">
                      <div className="text-[11px] text-gray-400 uppercase font-semibold">Survey Responses</div>
                      <div className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                        {surveyResponses.filter((r) => r.customerAccountId === selectedAccountId).length}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700">
                      <div className="text-[11px] text-gray-400 uppercase font-semibold">Active Issues</div>
                      <div className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                        {issuesList.filter((i) => i.customerAccountId === selectedAccountId && i.status !== "CLOSED").length}
                      </div>
                    </div>
                  </div>

                  {/* Account Feedback Timeline */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Account Feedback Timeline
                    </h4>
                    <div className="space-y-2">
                      {feedbackList
                        .filter((f) => f.customerAccountId === selectedAccountId)
                        .map((fb) => (
                          <div
                            key={fb.id}
                            className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold">{fb.feedbackNumber}</span>
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                  {fb.channel}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700 dark:text-gray-300">{fb.redactedText || fb.rawText}</p>
                            </div>
                            <span
                              className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
                                fb.sentiment === "POSITIVE"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : fb.sentiment === "NEGATIVE"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {fb.sentiment}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL 1: LOG FEEDBACK */}
        {showLogFeedbackModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-600" />
                  Log Customer Feedback
                </h3>
                <button
                  onClick={() => setShowLogFeedbackModal(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Customer Account
                  </label>
                  <select
                    value={feedbackForm.customerAccountId}
                    onChange={(e) =>
                      setFeedbackForm({ ...feedbackForm, customerAccountId: e.target.value })
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  >
                    <option value="">Select Account...</option>
                    {accounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                      Channel
                    </label>
                    <select
                      value={feedbackForm.channel}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, channel: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                    >
                      <option value="DIRECT_OUTREACH">Direct Outreach</option>
                      <option value="CSM_CONVERSATION">CSM Conversation</option>
                      <option value="SUPPORT_TICKET">Support Ticket</option>
                      <option value="EXECUTIVE_REVIEW">Executive Review</option>
                      <option value="IN_APP_SURVEY">In-App Survey</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                      Category
                    </label>
                    <select
                      value={feedbackForm.category}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, category: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                    >
                      <option value="PRODUCT">Product</option>
                      <option value="INTEGRATIONS">Integrations</option>
                      <option value="SUPPORT">Support</option>
                      <option value="PLATFORM_RELIABILITY">Platform Reliability</option>
                      <option value="COMMERCIAL">Commercial</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                      Sentiment
                    </label>
                    <select
                      value={feedbackForm.sentiment}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, sentiment: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                    >
                      <option value="POSITIVE">Positive</option>
                      <option value="NEUTRAL">Neutral</option>
                      <option value="NEGATIVE">Negative</option>
                      <option value="MIXED">Mixed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                      Rating (0 - 10)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={feedbackForm.rating}
                      onChange={(e) =>
                        setFeedbackForm({ ...feedbackForm, rating: Number(e.target.value) })
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Raw Customer Feedback
                  </label>
                  <textarea
                    rows={4}
                    value={feedbackForm.rawText}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, rawText: e.target.value })}
                    placeholder="Enter customer feedback text (emails, phones, and card numbers are automatically redacted for privacy)..."
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowLogFeedbackModal(false)}
                  className="px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createFeedbackMutation.mutate(feedbackForm)}
                  disabled={!feedbackForm.customerAccountId || !feedbackForm.rawText}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                >
                  Submit &amp; Redact PII
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: NEW SURVEY */}
        {showNewSurveyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-indigo-600" />
                  Define Customer Survey Blueprint
                </h3>
                <button
                  onClick={() => setShowNewSurveyModal(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Survey Name
                  </label>
                  <input
                    type="text"
                    value={surveyForm.name}
                    onChange={(e) => setSurveyForm({ ...surveyForm, name: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                      Slug
                    </label>
                    <input
                      type="text"
                      value={surveyForm.slug}
                      onChange={(e) => setSurveyForm({ ...surveyForm, slug: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                      Survey Metric Type
                    </label>
                    <select
                      value={surveyForm.surveyType}
                      onChange={(e) => setSurveyForm({ ...surveyForm, surveyType: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                    >
                      <option value="NPS">Net Promoter Score (NPS)</option>
                      <option value="CSAT">Customer Satisfaction (CSAT)</option>
                      <option value="CES">Customer Effort Score (CES)</option>
                      <option value="ONBOARDING">Onboarding Milestone</option>
                      <option value="RENEWAL">Renewal Experience</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Description
                  </label>
                  <input
                    type="text"
                    value={surveyForm.description}
                    onChange={(e) => setSurveyForm({ ...surveyForm, description: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Questions Specification (JSON Schema)
                  </label>
                  <textarea
                    rows={6}
                    value={surveyForm.questionsJson}
                    onChange={(e) => setSurveyForm({ ...surveyForm, questionsJson: e.target.value })}
                    className="w-full font-mono rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowNewSurveyModal(false)}
                  className="px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createSurveyMutation.mutate(surveyForm)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                >
                  Create Blueprint &amp; Publish V1
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: DELIVER SURVEY */}
        {showDeliverSurveyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-indigo-600" />
                  Deliver Governed Survey Invitation
                </h3>
                <button
                  onClick={() => setShowDeliverSurveyModal(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Survey Template
                  </label>
                  <select
                    value={deliveryForm.surveyId}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, surveyId: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  >
                    <option value="">Select Survey...</option>
                    {surveysList.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.surveyType})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Recipient Account
                  </label>
                  <select
                    value={deliveryForm.customerAccountId}
                    onChange={(e) =>
                      setDeliveryForm({ ...deliveryForm, customerAccountId: e.target.value })
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  >
                    <option value="">Select Account...</option>
                    {accounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Authorized Contact Email
                  </label>
                  <input
                    type="email"
                    value={deliveryForm.recipientEmail}
                    onChange={(e) =>
                      setDeliveryForm({ ...deliveryForm, recipientEmail: e.target.value })
                    }
                    placeholder="contact@enterprise.com"
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    FlowForge enforces contact opt-in consent and 14-day anti-spam delivery cooldowns.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowDeliverSurveyModal(false)}
                  className="px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deliverSurveyMutation.mutate(deliveryForm)}
                  disabled={!deliveryForm.surveyId || !deliveryForm.customerAccountId || !deliveryForm.recipientEmail}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                >
                  Validate Cooldown &amp; Deliver
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 4: REPORT ISSUE */}
        {showNewIssueModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  Report Systemic Experience Issue
                </h3>
                <button
                  onClick={() => setShowNewIssueModal(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Impacted Customer Account
                  </label>
                  <select
                    value={issueForm.customerAccountId}
                    onChange={(e) => setIssueForm({ ...issueForm, customerAccountId: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  >
                    <option value="">Global / Cross-Account</option>
                    {accounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Issue Title
                  </label>
                  <input
                    type="text"
                    value={issueForm.title}
                    onChange={(e) => setIssueForm({ ...issueForm, title: e.target.value })}
                    placeholder="e.g. SFDC Connector OAuth Token Refresh Intermittent Failures"
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                      Severity
                    </label>
                    <select
                      value={issueForm.severity}
                      onChange={(e) => setIssueForm({ ...issueForm, severity: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                    >
                      <option value="CRITICAL">Critical (Blocks core workflow)</option>
                      <option value="HIGH">High (Degrades SLA)</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                      Category
                    </label>
                    <select
                      value={issueForm.category}
                      onChange={(e) => setIssueForm({ ...issueForm, category: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                    >
                      <option value="PLATFORM_RELIABILITY">Platform Reliability</option>
                      <option value="INTEGRATIONS">Integrations</option>
                      <option value="PRODUCT">Product</option>
                      <option value="SUPPORT">Support</option>
                      <option value="COMMERCIAL">Commercial</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Description &amp; Observed Friction
                  </label>
                  <textarea
                    rows={3}
                    value={issueForm.description}
                    onChange={(e) => setIssueForm({ ...issueForm, description: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Root Cause Hypothesis
                  </label>
                  <input
                    type="text"
                    value={issueForm.hypothesis}
                    onChange={(e) => setIssueForm({ ...issueForm, hypothesis: e.target.value })}
                    placeholder="e.g. Expired refresh tokens not handled gracefully during rate limit windows"
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowNewIssueModal(false)}
                  className="px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createIssueMutation.mutate(issueForm)}
                  disabled={!issueForm.title || !issueForm.description}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 text-white disabled:opacity-50 hover:bg-amber-700 transition-colors"
                >
                  Create Issue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 5: NEW ACTION PLAN */}
        {showNewActionPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                  Create Closed-Loop Action Plan
                </h3>
                <button
                  onClick={() => setShowNewActionPlanModal(null)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Action Plan Title
                  </label>
                  <input
                    type="text"
                    value={actionPlanForm.title}
                    onChange={(e) => setActionPlanForm({ ...actionPlanForm, title: e.target.value })}
                    placeholder="e.g. Deploy retry logic and contact impacted account leads"
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Description &amp; Action Steps
                  </label>
                  <textarea
                    rows={3}
                    value={actionPlanForm.description}
                    onChange={(e) => setActionPlanForm({ ...actionPlanForm, description: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                      Target Completion Date
                    </label>
                    <input
                      type="date"
                      value={actionPlanForm.targetCompletionDate}
                      onChange={(e) =>
                        setActionPlanForm({ ...actionPlanForm, targetCompletionDate: e.target.value })
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                      Assigned Owner
                    </label>
                    <input
                      type="text"
                      value={actionPlanForm.assignedOwner}
                      onChange={(e) => setActionPlanForm({ ...actionPlanForm, assignedOwner: e.target.value })}
                      placeholder="e.g. Lead SRE / CSM"
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowNewActionPlanModal(null)}
                  className="px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    createActionPlanMutation.mutate({
                      issueId: showNewActionPlanModal,
                      body: actionPlanForm,
                    })
                  }
                  disabled={!actionPlanForm.title || !actionPlanForm.description}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                >
                  Commit Action Plan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 6: RESOLVE FEEDBACK */}
        {showResolveFeedbackModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Resolve Feedback with Evidence
                </h3>
                <button
                  onClick={() => setShowResolveFeedbackModal(null)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-gray-500">
                  Resolving feedback requires documenting the corrective action taken and evidence shared with the customer.
                </p>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Action Taken
                  </label>
                  <input
                    type="text"
                    value={resolveFeedbackForm.actionTaken}
                    onChange={(e) =>
                      setResolveFeedbackForm({ ...resolveFeedbackForm, actionTaken: e.target.value })
                    }
                    placeholder="e.g. Shipped fix in release v2.4.1 and notified customer via Slack"
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Resolution Notes &amp; Verification Evidence
                  </label>
                  <textarea
                    rows={3}
                    value={resolveFeedbackForm.resolutionNotes}
                    onChange={(e) =>
                      setResolveFeedbackForm({ ...resolveFeedbackForm, resolutionNotes: e.target.value })
                    }
                    placeholder="Document evidence or confirmation from customer..."
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowResolveFeedbackModal(null)}
                  className="px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    resolveFeedbackMutation.mutate({
                      id: showResolveFeedbackModal.id,
                      body: resolveFeedbackForm,
                    })
                  }
                  disabled={!resolveFeedbackForm.resolutionNotes}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white disabled:opacity-50 hover:bg-emerald-700 transition-colors"
                >
                  Confirm Resolution
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DRAWER / INSPECT MODAL: FEEDBACK DETAILS */}
        {selectedFeedbackDrawer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-xl w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-indigo-600">
                    {selectedFeedbackDrawer.feedbackNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${
                      selectedFeedbackDrawer.status === "RESOLVED"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {selectedFeedbackDrawer.status}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedFeedbackDrawer(null)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <div className="text-[11px] font-semibold text-gray-400 uppercase">Redacted Feedback</div>
                  <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl text-gray-800 dark:text-gray-200">
                    {selectedFeedbackDrawer.redactedText || selectedFeedbackDrawer.rawText}
                  </div>
                  {selectedFeedbackDrawer.hasPii && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold mt-1">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Personal identifiable data (PII) automatically redacted by FlowForge privacy gateway.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] text-gray-400 uppercase font-semibold">Account</span>
                    <div className="font-bold text-gray-900 dark:text-white mt-0.5">
                      {selectedFeedbackDrawer.customerAccount?.name || "Global"}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] text-gray-400 uppercase font-semibold">Channel</span>
                    <div className="font-bold text-gray-900 dark:text-white mt-0.5">
                      {selectedFeedbackDrawer.channel}
                    </div>
                  </div>
                </div>

                {selectedFeedbackDrawer.classifications?.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold text-gray-400 uppercase mb-1">
                      VoC Classifications
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedFeedbackDrawer.classifications.map((c: any) => (
                        <span
                          key={c.id}
                          className="px-2.5 py-1 text-[10px] rounded-lg font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        >
                          {c.theme?.name || "Theme"} ({c.sentiment})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      updateFeedbackStatusMutation.mutate({
                        id: selectedFeedbackDrawer.id,
                        status: "ACKNOWLEDGED",
                      });
                      setSelectedFeedbackDrawer(null);
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50"
                  >
                    Acknowledge
                  </button>
                  <button
                    onClick={() => {
                      updateFeedbackStatusMutation.mutate({
                        id: selectedFeedbackDrawer.id,
                        status: "IN_REVIEW",
                      });
                      setSelectedFeedbackDrawer(null);
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50"
                  >
                    In Review
                  </button>
                </div>
                <button
                  onClick={() => setSelectedFeedbackDrawer(null)}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900"
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
