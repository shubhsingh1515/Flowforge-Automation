"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Check,
  X,
  Mail,
  Building,
  RefreshCw,
  Search,
  ExternalLink,
  Plus,
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  FileText,
  DollarSign,
  Target,
  HeartHandshake,
} from "lucide-react";

export default function CustomerOperationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"accounts" | "journeys" | "health" | "risks_tasks" | "playbooks_comms">("accounts");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showLinkIdentityModal, setShowLinkIdentityModal] = useState(false);
  const [showNewRiskModal, setShowNewRiskModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // New account form state
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountSlug, setNewAccountSlug] = useState("");
  const [newAccountDomain, setNewAccountDomain] = useState("");
  const [newAccountTier, setNewAccountTier] = useState("ENTERPRISE");

  // New contact form state
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] = useState("EXECUTIVE");
  const [contactConsent, setContactConsent] = useState<"OPTED_IN" | "OPTED_OUT">("OPTED_IN");

  // Link identity form state
  const [identitySystemType, setIdentitySystemType] = useState("CRM");
  const [identitySystem, setIdentitySystem] = useState("Salesforce");
  const [identityExternalId, setIdentityExternalId] = useState("");

  // New risk form state
  const [riskCategory, setRiskCategory] = useState("ADOPTION_DROP");
  const [riskSeverity, setRiskSeverity] = useState("HIGH");
  const [riskSummary, setRiskSummary] = useState("");
  const [riskMitigation, setRiskMitigation] = useState("");

  // Data Queries
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ["customers", "accounts", searchQuery],
    queryFn: () => api.customers.listAccounts({ search: searchQuery || undefined }),
  });

  const { data: profile360Data, isLoading: profileLoading } = useQuery({
    queryKey: ["customers", "360", selectedAccountId],
    queryFn: () => (selectedAccountId ? api.customers.get360Profile(selectedAccountId) : null),
    enabled: !!selectedAccountId,
  });

  const { data: accountContractsData } = useQuery({
    queryKey: ["revenue", "contracts", selectedAccountId],
    queryFn: () => (selectedAccountId ? api.revenue.listContracts({ customerAccountId: selectedAccountId }) : null),
    enabled: !!selectedAccountId,
  });

  const { data: accountObjectivesData } = useQuery({
    queryKey: ["accountPlanning", "objectives", selectedAccountId],
    queryFn: () => (selectedAccountId ? api.accountPlanning.listObjectives({ customerAccountId: selectedAccountId }) : null),
    enabled: !!selectedAccountId,
  });

  const { data: accountCoverageData } = useQuery({
    queryKey: ["accountPlanning", "coverage", selectedAccountId],
    queryFn: () => (selectedAccountId ? api.accountPlanning.getCoverage(selectedAccountId) : null),
    enabled: !!selectedAccountId,
  });

    const { data: accountFeedbackData } = useQuery({
    queryKey: ["customerExperience", "feedback", selectedAccountId],
    queryFn: () => (selectedAccountId ? api.customerExperience.listFeedback({ customerAccountId: selectedAccountId }) : null),
    enabled: !!selectedAccountId,
  });

  const { data: accountIssuesData } = useQuery({
    queryKey: ["customerExperience", "issues", selectedAccountId],
    queryFn: () => (selectedAccountId ? api.customerExperience.listIssues({ customerAccountId: selectedAccountId }) : null),
    enabled: !!selectedAccountId,
  });

  const { data: journeysData } = useQuery({
    queryKey: ["customers", "journeys"],
    queryFn: () => api.customers.listJourneys(),
  });

  const { data: journeyInstancesData } = useQuery({
    queryKey: ["customers", "journeyInstances"],
    queryFn: () => api.customers.listJourneyInstances(),
  });

  const { data: healthModelData } = useQuery({
    queryKey: ["customers", "healthModel"],
    queryFn: () => api.customers.getHealthModel(),
  });

  const { data: risksData } = useQuery({
    queryKey: ["customers", "risks"],
    queryFn: () => api.customers.listRisks(),
  });

  const { data: tasksData } = useQuery({
    queryKey: ["customers", "tasks"],
    queryFn: () => api.customers.listTasks(),
  });

  const { data: playbooksData } = useQuery({
    queryKey: ["customers", "playbooks"],
    queryFn: () => api.customers.listPlaybooks(),
  });

  const { data: playbookRunsData } = useQuery({
    queryKey: ["customers", "playbookRuns"],
    queryFn: () => api.customers.listPlaybookRuns(),
  });

  const { data: templatesData } = useQuery({
    queryKey: ["customers", "templates"],
    queryFn: () => api.customers.listTemplates(),
  });

  // Mutations
  const createAccountMutation = useMutation({
    mutationFn: (body: any) => api.customers.createAccount(body),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["customers", "accounts"] });
      setShowNewAccountModal(false);
      setNewAccountName("");
      setNewAccountSlug("");
      setNewAccountDomain("");
      if (res?.data?.id) setSelectedAccountId(res.data.id);
    },
  });

  const addContactMutation = useMutation({
    mutationFn: ({ accountId, body }: { accountId: string; body: any }) => api.customers.addContact(accountId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers", "360", selectedAccountId] });
      setShowAddContactModal(false);
      setContactName("");
      setContactEmail("");
    },
  });

  const linkIdentityMutation = useMutation({
    mutationFn: ({ accountId, body }: { accountId: string; body: any }) => api.customers.linkIdentity(accountId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers", "360", selectedAccountId] });
      setShowLinkIdentityModal(false);
      setIdentityExternalId("");
    },
  });

  const evaluateHealthMutation = useMutation({
    mutationFn: (accountId: string) => api.customers.evaluateHealth(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers", "accounts"] });
      if (selectedAccountId) queryClient.invalidateQueries({ queryKey: ["customers", "360", selectedAccountId] });
    },
  });

  const recordRiskMutation = useMutation({
    mutationFn: (body: any) => api.customers.recordRisk(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers", "risks"] });
      if (selectedAccountId) queryClient.invalidateQueries({ queryKey: ["customers", "360", selectedAccountId] });
      setShowNewRiskModal(false);
      setRiskSummary("");
      setRiskMitigation("");
    },
  });

  const resolveRiskMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => api.customers.resolveRisk(id, { status: "RESOLVED", notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers", "risks"] });
      if (selectedAccountId) queryClient.invalidateQueries({ queryKey: ["customers", "360", selectedAccountId] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.customers.updateTask(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers", "tasks"] });
      if (selectedAccountId) queryClient.invalidateQueries({ queryKey: ["customers", "360", selectedAccountId] });
    },
  });

  const triggerPlaybookMutation = useMutation({
    mutationFn: ({ definitionId, customerAccountId }: { definitionId: string; customerAccountId: string }) =>
      api.customers.triggerPlaybook(definitionId, { customerAccountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers", "playbookRuns"] });
      queryClient.invalidateQueries({ queryKey: ["customers", "tasks"] });
    },
  });

  const accounts: any[] = Array.isArray(accountsData?.data)
    ? accountsData.data
    : (accountsData?.data as any)?.accounts || [];
  const profile = profile360Data?.data;
  const journeys = Array.isArray(journeysData?.data) ? journeysData.data : [];
  const instances = Array.isArray(journeyInstancesData?.data) ? journeyInstancesData.data : [];
  const risks = Array.isArray(risksData?.data) ? risksData.data : [];
  const tasks = Array.isArray(tasksData?.data) ? tasksData.data : [];
  const playbooks = Array.isArray(playbooksData?.data) ? playbooksData.data : [];
  const playbookRuns = Array.isArray(playbookRunsData?.data) ? playbookRunsData.data : [];
  const templates = Array.isArray(templatesData?.data) ? templatesData.data : [];

  return (
    <AppShell>
      <div className="p-8 space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-md">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customer Operations & 360</h1>
                  <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-full">
                    Phase 25
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Tenant-isolated Customer 360 profiles, milestone journeys, explainable health scoring, and governed playbooks
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNewAccountModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#6558E8] hover:bg-[#5345D8] text-white font-semibold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Customer Account
            </button>
          </div>
        </div>

        {/* Top Operational Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Accounts</span>
              <Building className="w-4 h-4 text-[#6558E8]" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">{accounts.length}</div>
            <div className="mt-1 text-xs text-slate-500">Tenant-isolated accounts</div>
          </div>
          <div className="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Journeys</span>
              <Layers className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {instances.filter((i: any) => i.status === "IN_PROGRESS").length}
            </div>
            <div className="mt-1 text-xs text-emerald-600">Milestone tracked</div>
          </div>
          <div className="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Risks</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {risks.filter((r: any) => r.status === "DETECTED" || r.status === "CONFIRMED").length}
            </div>
            <div className="mt-1 text-xs text-amber-600">Retention & adoption flags</div>
          </div>
          <div className="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Success Tasks</span>
              <ShieldCheck className="w-4 h-4 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {tasks.filter((t: any) => t.status === "OPEN" || t.status === "IN_PROGRESS").length}
            </div>
            <div className="mt-1 text-xs text-purple-600">Assigned CSM actions</div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 space-x-8 overflow-x-auto">
          {[
            { id: "accounts", label: "Customer Accounts & 360", icon: Users },
            { id: "journeys", label: "Customer Journeys", icon: Layers },
            { id: "health", label: "Adoption & Health", icon: TrendingUp },
            { id: "risks_tasks", label: "Risks & Success Tasks", icon: AlertTriangle },
            { id: "playbooks_comms", label: "Playbooks & Communications", icon: ShieldCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-semibold text-xs transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? "border-[#6558E8] text-[#6558E8]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: CUSTOMER ACCOUNTS & 360 */}
        {activeTab === "accounts" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Account Directory */}
            <div className="lg:col-span-1 space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter accounts by name or slug..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {accountsLoading ? (
                <div className="p-8 text-center text-gray-500 text-sm">Loading customer directory...</div>
              ) : accounts.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm border rounded-xl bg-white dark:bg-gray-800">
                  No customer accounts found. Click "New Customer Account" to register one.
                </div>
              ) : (
                <div className="space-y-2">
                  {accounts.map((acc: any) => {
                    const isSelected = selectedAccountId === acc.id;
                    return (
                      <div
                        key={acc.id}
                        onClick={() => setSelectedAccountId(acc.id)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-indigo-50/50 border-indigo-500 dark:bg-indigo-950/30 dark:border-indigo-500 shadow-sm"
                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{acc.name}</h3>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-mono">
                            {acc.tier}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                          <span>{acc.domain || acc.slug}</span>
                          <span
                            className={`font-semibold ${
                              acc.healthStatus === "HEALTHY"
                                ? "text-emerald-600"
                                : acc.healthStatus === "AT_RISK"
                                ? "text-red-600"
                                : "text-amber-600"
                            }`}
                          >
                            {acc.healthStatus}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Customer 360 View */}
            <div className="lg:col-span-2">
              {!selectedAccountId ? (
                <div className="h-96 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
                  <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-600 dark:text-gray-400 font-medium">Select a customer account to inspect its 360 profile</p>
                  <p className="text-xs text-gray-400 mt-1">Contacts, external CRM/Billing identities, journey history, and health scoring</p>
                </div>
              ) : profileLoading ? (
                <div className="p-12 text-center text-gray-500">Loading Customer 360 profile...</div>
              ) : profile ? (
                <div className="space-y-6">
                  {/* Account Summary Banner */}
                  <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{profile.account.name}</h2>
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-medium">
                            {profile.account.lifecycleState}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-medium">
                            {profile.account.dataClassification}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Slug: <span className="font-mono text-gray-700 dark:text-gray-300">{profile.account.slug}</span>
                          {profile.account.domain && ` • Domain: ${profile.account.domain}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => evaluateHealthMutation.mutate(profile.account.id)}
                          disabled={evaluateHealthMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-medium rounded-lg transition-colors"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${evaluateHealthMutation.isPending ? "animate-spin" : ""}`} />
                          Evaluate Health
                        </button>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Health Score</div>
                          <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                            {profile.account.healthScore != null ? `${profile.account.healthScore}/100` : "N/A"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contacts & External Identities Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Contacts Card */}
                    <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                          <Users className="w-4 h-4 text-indigo-500" />
                          Authorized Contacts ({profile.contacts?.length || 0})
                        </h3>
                        <button
                          onClick={() => setShowAddContactModal(true)}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                          + Add Contact
                        </button>
                      </div>
                      <div className="space-y-2">
                        {profile.contacts?.length === 0 ? (
                          <div className="text-xs text-gray-400 py-3 text-center">No contacts on record.</div>
                        ) : (
                          profile.contacts.map((c: any) => (
                            <div key={c.id} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-gray-900 dark:text-white">{c.name}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                                    c.consentStatus === "OPTED_IN"
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                      : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                  }`}
                                >
                                  {c.consentStatus}
                                </span>
                              </div>
                              <div className="text-gray-500">{c.email}</div>
                              <div className="text-[11px] text-gray-400">{c.role} {c.isPrimary && "• Primary Contact"}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* External Identities Card */}
                    <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                          <Building className="w-4 h-4 text-purple-500" />
                          External Identities ({profile.externalIdentities?.length || 0})
                        </h3>
                        <button
                          onClick={() => setShowLinkIdentityModal(true)}
                          className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                        >
                          + Link Identity
                        </button>
                      </div>
                      <div className="space-y-2">
                        {profile.externalIdentities?.length === 0 ? (
                          <div className="text-xs text-gray-400 py-3 text-center">No external identities linked.</div>
                        ) : (
                          profile.externalIdentities.map((ei: any) => (
                            <div key={ei.id} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-gray-900 dark:text-white capitalize">{ei.externalSystem}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                  {ei.systemType}
                                </span>
                              </div>
                              <div className="font-mono text-gray-500">{ei.externalId}</div>
                              <div className="text-[10px] text-gray-400">Confidence: {(ei.confidence * 100).toFixed(0)}% • Verified</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Provenance & Security Traceability */}
                  <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Data Provenance & Isolation
                    </h3>
                    <p className="text-xs text-gray-500">
                      This customer profile is isolated to workspace <span className="font-mono">{profile.account.workspaceId}</span>.
                      External identity mapping links {profile.provenanceSummary?.externalSystemsLinked?.length || 0} upstream systems
                      with strict redaction applied to sensitive authorization credentials.
                    </p>
                  </div>

                                    {/* Customer Experience & VoC (Phase 28) */}
                  <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                        <HeartHandshake className="w-4 h-4 text-indigo-500" />
                        Customer Experience & VoC (Phase 28)
                      </h3>
                      <a
                        href="/customer-experience"
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                      >
                        VoC Console <ArrowRight className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800">
                        <span className="text-[11px] text-gray-400 uppercase font-semibold">Feedback Records</span>
                        <div className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                          {accountFeedbackData?.data?.records?.length ?? 0}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800">
                        <span className="text-[11px] text-gray-400 uppercase font-semibold">Open Experience Issues</span>
                        <div className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                          {accountIssuesData?.data?.filter((i: any) => i.status !== "CLOSED" && i.status !== "VERIFIED_RESOLVED")?.length ?? 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Strategic Account Planning & Business Objectives (Phase 27) */}
                  <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                        <Target className="w-4 h-4 text-indigo-500" />
                        Strategic Objectives & Coverage ({accountObjectivesData?.data?.length || 0})
                      </h3>
                      <a
                        href="/account-planning"
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                      >
                        Account Planning Console <ArrowRight className="w-3 h-3" />
                      </a>
                    </div>
                    {accountCoverageData?.data && (
                      <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 flex items-center justify-between text-xs">
                        <div className="text-indigo-900 dark:text-indigo-200">
                          Coverage: <strong>{accountCoverageData.data.coverageStatus.replace(/_/g, " ")}</strong>
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          {accountCoverageData.data.mappedRolesCount} Stakeholders Mapped
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {!accountObjectivesData?.data || accountObjectivesData.data.length === 0 ? (
                        <div className="text-xs text-gray-400 py-2 text-center">No strategic objectives defined for this account.</div>
                      ) : (
                        accountObjectivesData.data.map((obj: any) => (
                          <div key={obj.id} className="p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-gray-900 dark:text-white">{obj.title}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                {Math.round(obj.progressPercent ?? 0)}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${Math.min(100, obj.progressPercent ?? 0)}%` }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOMER JOURNEYS */}
        {activeTab === "journeys" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Journey Definitions */}
              <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-500" />
                    Journey Blueprints ({journeys.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {journeys.length === 0 ? (
                    <div className="text-sm text-gray-400 py-6 text-center">No journey blueprints defined.</div>
                  ) : (
                    journeys.map((j: any) => (
                      <div key={j.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-sm text-gray-900 dark:text-white">{j.name}</h3>
                          <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300 font-mono">
                            {j.journeyType}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{j.description}</p>
                        <div className="text-xs text-gray-400">
                          Versions: {j.versions?.length || 0} • Target: {j.targetSegment}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Live Journey Instances */}
              <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-500" />
                  Active Progressions ({instances.length})
                </h2>
                <div className="space-y-3">
                  {instances.length === 0 ? (
                    <div className="text-sm text-gray-400 py-6 text-center">No active journey instances.</div>
                  ) : (
                    instances.map((ins: any) => (
                      <div key={ins.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-gray-900 dark:text-white">
                            Account: {ins.customerAccount?.name || ins.customerAccountId.slice(0, 8)}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                            {ins.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          Current Stage: <span className="font-medium text-gray-700 dark:text-gray-300">{ins.currentMilestoneName || "Initial Stage"}</span>
                        </div>
                        <div className="text-xs text-gray-400">
                          Milestones Completed: {ins.milestoneHistory?.length || 0}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ADOPTION & HEALTH */}
        {activeTab === "health" && (
          <div className="space-y-6">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
                Active Health Scoring Model
              </h2>
              {healthModelData?.data ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-900 dark:text-white">{healthModelData.data.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-mono">
                      Version {healthModelData.data.version} • Active
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {healthModelData.data.dimensions?.map((dim: any, idx: number) => (
                      <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-xs space-y-2">
                        <div className="font-semibold text-gray-900 dark:text-white">{dim.name}</div>
                        <div className="text-gray-500">Weight: {(dim.weight * 100).toFixed(0)}%</div>
                        <div className="text-gray-400">Missing Data Behavior: {dim.missingDataBehavior}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400">Default multi-dimensional health model active.</div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: RISKS & SUCCESS TASKS */}
        {activeTab === "risks_tasks" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer Risks */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Customer Risk Assessments ({risks.length})
                </h2>
                {selectedAccountId && (
                  <button
                    onClick={() => setShowNewRiskModal(true)}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                  >
                    + Record Risk
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {risks.length === 0 ? (
                  <div className="text-sm text-gray-400 py-6 text-center">No active customer risks recorded.</div>
                ) : (
                  risks.map((r: any) => (
                    <div key={r.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{r.riskCategory}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-bold ${
                              r.severity === "CRITICAL"
                                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                : r.severity === "HIGH"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {r.severity}
                          </span>
                          <span className="text-xs text-gray-500 font-medium">{r.status}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300">{r.summary}</p>
                      {r.status !== "RESOLVED" && (
                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => resolveRiskMutation.mutate({ id: r.id, notes: "Resolved by CSM" })}
                            className="text-xs px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 rounded font-medium transition-colors"
                          >
                            Mark Resolved
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Success Tasks */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-500" />
                Customer Success Tasks ({tasks.length})
              </h2>
              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <div className="text-sm text-gray-400 py-6 text-center">No assigned success tasks.</div>
                ) : (
                  tasks.map((t: any) => (
                    <div key={t.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{t.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-medium">
                          {t.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{t.description}</p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-gray-400">Type: {t.taskType}</span>
                        {t.status !== "RESOLVED" && (
                          <button
                            onClick={() => updateTaskMutation.mutate({ id: t.id, status: "RESOLVED" })}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            Complete Task
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: PLAYBOOKS & COMMUNICATIONS */}
        {activeTab === "playbooks_comms" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Playbooks */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Play className="w-5 h-5 text-indigo-500" />
                Customer Success Playbooks ({playbooks.length})
              </h2>
              <div className="space-y-3">
                {playbooks.length === 0 ? (
                  <div className="text-sm text-gray-400 py-6 text-center">No playbooks configured.</div>
                ) : (
                  playbooks.map((pb: any) => (
                    <div key={pb.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{pb.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          {pb.triggerType}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{pb.description}</p>
                      {selectedAccountId && (
                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => triggerPlaybookMutation.mutate({ definitionId: pb.id, customerAccountId: selectedAccountId })}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded transition-colors"
                          >
                            <Play className="w-3 h-3" />
                            Trigger for Selected Account
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Communication Templates */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-purple-500" />
                Governed Communication Templates ({templates.length})
              </h2>
              <div className="space-y-3">
                {templates.length === 0 ? (
                  <div className="text-sm text-gray-400 py-6 text-center">No communication templates registered.</div>
                ) : (
                  templates.map((tpl: any) => (
                    <div key={tpl.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{tpl.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                          {tpl.category}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 font-medium">Subject: {tpl.subject}</div>
                      <div className="text-[11px] text-gray-400">Requires Approval: {tpl.requiresApproval ? "Yes" : "No"}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: New Customer Account */}
        {showNewAccountModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-white text-base">New Customer Account</h3>
                <button onClick={() => setShowNewAccountModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Company / Account Name</label>
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={(e) => {
                      setNewAccountName(e.target.value);
                      setNewAccountSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                    }}
                    placeholder="e.g. Globex Corporation"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Account Slug</label>
                  <input
                    type="text"
                    value={newAccountSlug}
                    onChange={(e) => setNewAccountSlug(e.target.value)}
                    placeholder="globex-corp"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Domain</label>
                  <input
                    type="text"
                    value={newAccountDomain}
                    onChange={(e) => setNewAccountDomain(e.target.value)}
                    placeholder="globex.com"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tier</label>
                  <select
                    value={newAccountTier}
                    onChange={(e) => setNewAccountTier(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    <option value="ENTERPRISE">ENTERPRISE</option>
                    <option value="GROWTH">GROWTH</option>
                    <option value="STANDARD">STANDARD</option>
                    <option value="FREE">FREE</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowNewAccountModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  disabled={!newAccountName || !newAccountSlug || createAccountMutation.isPending}
                  onClick={() =>
                    createAccountMutation.mutate({
                      name: newAccountName,
                      slug: newAccountSlug,
                      domain: newAccountDomain || undefined,
                      tier: newAccountTier,
                    })
                  }
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {createAccountMutation.isPending ? "Creating..." : "Create Account"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Add Contact */}
        {showAddContactModal && selectedAccountId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-white text-base">Add Authorized Contact</h3>
                <button onClick={() => setShowAddContactModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Hank Scorpio"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="scorpio@globex.com"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                  <input
                    type="text"
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    placeholder="Executive Sponsor"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Consent Status</label>
                  <select
                    value={contactConsent}
                    onChange={(e) => setContactConsent(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    <option value="OPTED_IN">OPTED_IN (Consent Granted)</option>
                    <option value="OPTED_OUT">OPTED_OUT (No Marketing/Outreach)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowAddContactModal(false)} className="px-4 py-2 text-sm text-gray-600">
                  Cancel
                </button>
                <button
                  disabled={!contactName || !contactEmail || addContactMutation.isPending}
                  onClick={() =>
                    addContactMutation.mutate({
                      accountId: selectedAccountId,
                      body: {
                        name: contactName,
                        email: contactEmail,
                        role: contactRole,
                        consentStatus: contactConsent,
                      },
                    })
                  }
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {addContactMutation.isPending ? "Adding..." : "Add Contact"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Link External Identity */}
        {showLinkIdentityModal && selectedAccountId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-white text-base">Link External Identity</h3>
                <button onClick={() => setShowLinkIdentityModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">System Type</label>
                  <select
                    value={identitySystemType}
                    onChange={(e) => setIdentitySystemType(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    <option value="CRM">CRM</option>
                    <option value="BILLING">BILLING</option>
                    <option value="SUPPORT">SUPPORT</option>
                    <option value="DATA_PLATFORM">DATA_PLATFORM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">External System</label>
                  <input
                    type="text"
                    value={identitySystem}
                    onChange={(e) => setIdentitySystem(e.target.value)}
                    placeholder="e.g. Salesforce or Stripe"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">External Record ID</label>
                  <input
                    type="text"
                    value={identityExternalId}
                    onChange={(e) => setIdentityExternalId(e.target.value)}
                    placeholder="e.g. sf_act_123 or cus_456"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowLinkIdentityModal(false)} className="px-4 py-2 text-sm text-gray-600">
                  Cancel
                </button>
                <button
                  disabled={!identityExternalId || linkIdentityMutation.isPending}
                  onClick={() =>
                    linkIdentityMutation.mutate({
                      accountId: selectedAccountId,
                      body: {
                        systemType: identitySystemType,
                        externalSystem: identitySystem,
                        externalId: identityExternalId,
                      },
                    })
                  }
                  className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {linkIdentityMutation.isPending ? "Linking..." : "Link Identity"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
