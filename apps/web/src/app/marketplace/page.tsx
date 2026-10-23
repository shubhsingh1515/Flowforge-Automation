"use client";

import React, { useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Store,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  X,
  Sparkles,
  ShieldCheck,
  Layers,
  ArrowRight,
  Download,
  Trash2,
  Clock,
  Workflow,
  HelpCircle,
  Code2,
  Lock,
  RefreshCw,
  FileCheck,
  AlertTriangle,
  Activity,
  History,
} from "lucide-react";
import { cn } from "../../lib/utils";

const CATEGORIES = [
  "All",
  "Communication",
  "Productivity",
  "Data & Storage",
  "Developer Tools",
  "CRM & Sales",
  "Operations & Monitoring",
];

export default function MarketplacePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"integrations" | "templates" | "connectors">("integrations");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [inspectListing, setInspectListing] = useState<any | null>(null);
  const [inspectTemplate, setInspectTemplate] = useState<any | null>(null);
  const [inspectArtifact, setInspectArtifact] = useState<any | null>(null);
  const [inspectDiff, setInspectDiff] = useState<any | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showConnectorModal, setShowConnectorModal] = useState(false);

  // Manifest form state
  const [manifestJson, setManifestJson] = useState(
    JSON.stringify(
      {
        id: "acme-crm",
        name: "Acme CRM Enterprise",
        version: "1.0.0",
        description: "Official CRM connector for customer sync and record management.",
        category: "CRM & Sales",
        author: {
          name: "Acme Platforms",
          email: "devs@acme.com",
        },
        icon: "Puzzle",
        auth: {
          type: "API_KEY",
          fields: [
            {
              name: "apiKey",
              label: "API Key",
              type: "password",
              required: true,
            },
          ],
        },
        actions: [
          {
            id: "get-contact",
            name: "Get Contact",
            description: "Retrieves contact details by record ID",
            inputSchema: {
              contactId: { type: "string", required: true },
            },
            outputSchema: {
              id: { type: "string" },
              email: { type: "string" },
            },
            httpConfig: {
              method: "GET",
              urlTemplate: "https://api.acme.com/v1/contacts/{contactId}",
              timeoutMs: 5000,
            },
          },
        ],
        triggers: [],
        permissions: ["network:egress"],
        residencyConstraint: "GLOBAL",
      },
      null,
      2
    )
  );
  const [validationResult, setValidationResult] = useState<any | null>(null);

  // Queries
  const { data: listings = [], isLoading: listingsLoading } = useQuery({
    queryKey: ["marketplace-listings", selectedCategory, searchQuery],
    queryFn: () =>
      api.marketplace.list({
        category: selectedCategory === "All" ? undefined : selectedCategory,
        search: searchQuery.trim() || undefined,
      }),
  });

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["marketplace-templates", selectedCategory, searchQuery],
    queryFn: () =>
      api.templates.list({
        category: selectedCategory === "All" ? undefined : selectedCategory,
        search: searchQuery.trim() || undefined,
      }),
  });

  const { data: connectorsList = [], isLoading: connectorsLoading } = useQuery({
    queryKey: ["connectors-artifacts"],
    queryFn: () => api.connectors.list({ scope: "all" }),
  });

  // Mutations
  const installMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version?: number }) =>
      api.marketplace.install(id, version),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-listings"] });
      setActionSuccess(data.message || "Installed successfully!");
      if (inspectListing) {
        setInspectListing({ ...inspectListing, isInstalled: true });
      }
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to install listing");
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: (id: string) => api.marketplace.uninstall(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-listings"] });
      setActionSuccess(data.message || "Uninstalled successfully");
      if (inspectListing) {
        setInspectListing({ ...inspectListing, isInstalled: false });
      }
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to uninstall listing");
    },
  });

  const instantiateTemplateMutation = useMutation({
    mutationFn: (id: string) => api.templates.instantiate(id),
    onSuccess: (data) => {
      setActionSuccess(`Recipe instantiated as draft: "${data.workflow?.name || "New Workflow"}".`);
      setInspectTemplate(null);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to instantiate recipe");
    },
  });

  // Phase 19: Certify Connector Mutation
  const certifyMutation = useMutation({
    mutationFn: (id: string) => api.connectors.certify(id),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ["connectors-artifacts"] });
      setActionSuccess(`Automated certification completed with result: ${record.overallResult}`);
      setInspectArtifact(null);
    },
    onError: (err: any) => {
      setActionError(err.message || "Certification failed");
    },
  });

  // Phase 19: Publish Connector Mutation
  const publishMutation = useMutation({
    mutationFn: ({ id, hash }: { id: string; hash?: string }) =>
      api.connectors.publish(id, { expectedArtifactHashSha256: hash }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectors-artifacts"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-listings"] });
      setActionSuccess("Connector published to marketplace with immutable SHA-256 verification!");
      setInspectArtifact(null);
    },
    onError: (err: any) => {
      setActionError(err.message || "Publishing failed");
    },
  });

  // Validate manifest JSON
  const handleValidateManifest = async () => {
    try {
      const parsed = JSON.parse(manifestJson);
      const res = await api.connectors.validateManifest(parsed);
      setValidationResult(res);
    } catch (err: any) {
      setValidationResult({ valid: false, errors: [err.message || "Invalid JSON syntax"] });
    }
  };

  // Register draft connector
  const handleCreateDraft = async () => {
    try {
      const parsed = JSON.parse(manifestJson);
      const res = await api.connectors.createDraft(parsed);
      queryClient.invalidateQueries({ queryKey: ["connectors-artifacts"] });
      setShowConnectorModal(false);
      setActionSuccess(`Connector release artifact '${res.connectorKey}@${res.version}' created as DRAFT!`);
    } catch (err: any) {
      setActionError(err.message || "Failed to create draft connector");
    }
  };

  return (
    <AppShell
      title="Integration Marketplace & Connector Platform"
      description="Discover certified integrations, automation recipes, and developer connector release artifacts."
      action={
        <div className="flex items-center gap-2">
          {activeTab === "connectors" ? (
            <button
              onClick={() => {
                setActionError(null);
                setValidationResult(null);
                setShowConnectorModal(true);
              }}
              data-testid="new-connector-draft-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>New Connector Manifest</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setActionError(null);
                setShowSubmitModal(true);
              }}
              data-testid="submit-package-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>Submit Integration</span>
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Status Alerts */}
        {actionSuccess && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {actionError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="text-rose-600 hover:text-rose-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Search, Filter & Tabs Bar */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Catalog Sub-Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 self-start">
              <button
                onClick={() => setActiveTab("integrations")}
                data-testid="tab-marketplace-integrations"
                className={cn(
                  "px-4 py-2 text-xs font-bold rounded-lg transition-all",
                  activeTab === "integrations"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Integrations Catalog
              </button>
              <button
                onClick={() => setActiveTab("templates")}
                data-testid="tab-marketplace-recipes"
                className={cn(
                  "px-4 py-2 text-xs font-bold rounded-lg transition-all",
                  activeTab === "templates"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Automation Recipes
              </button>
              <button
                onClick={() => setActiveTab("connectors")}
                data-testid="tab-marketplace-connectors"
                className={cn(
                  "px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5",
                  activeTab === "connectors"
                    ? "bg-white text-indigo-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>Connector Studio</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, action, or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="marketplace-search-input"
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </div>
          </div>

          {/* Category Filter Pills (for Integrations and Recipes) */}
          {activeTab !== "connectors" && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 text-xs">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  data-testid={`category-filter-${cat.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  className={cn(
                    "px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors",
                    selectedCategory === cat
                      ? "bg-slate-900 text-white font-semibold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tab 1: Integrations Catalog */}
        {activeTab === "integrations" && (
          <div>
            {listingsLoading ? (
              <div className="text-center py-12 text-xs text-slate-400">Loading catalog integrations...</div>
            ) : listings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
                <Store className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No Integrations Found</p>
                <p className="text-xs text-slate-400 mt-1">Try another category or search keyword.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="marketplace-listings-grid">
                {listings.map((item: any) => (
                  <div
                    key={item.id}
                    data-testid={`marketplace-card-${item.slug}`}
                    className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-white text-base shadow-xs"
                            style={{ backgroundColor: item.accentColor || "#6366f1" }}
                          >
                            {item.title.charAt(0)}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {item.title}
                            </h3>
                            <span className="text-xs font-medium text-slate-500">{item.category}</span>
                          </div>
                        </div>
                        {item.reviewStatus === "PUBLISHED" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            <ShieldCheck className="h-3 w-3" />
                            <span>Verified</span>
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">{item.description}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <button
                        onClick={() => setInspectListing(item)}
                        data-testid={`inspect-listing-btn-${item.slug}`}
                        className="text-slate-600 hover:text-slate-900 font-semibold"
                      >
                        Inspect Details
                      </button>

                      {item.isInstalled ? (
                        <button
                          onClick={() => uninstallMutation.mutate(item.id)}
                          disabled={uninstallMutation.isPending}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold transition"
                        >
                          Uninstall
                        </button>
                      ) : (
                        <button
                          onClick={() => installMutation.mutate({ id: item.id })}
                          disabled={installMutation.isPending}
                          data-testid={`install-btn-${item.slug}`}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 font-semibold transition flex items-center gap-1"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Install</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Automation Recipes */}
        {activeTab === "templates" && (
          <div>
            {templatesLoading ? (
              <div className="text-center py-12 text-xs text-slate-400">Loading automation recipes...</div>
            ) : !templatesData?.templates || templatesData.templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
                <Workflow className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No Recipes Found</p>
                <p className="text-xs text-slate-400 mt-1">Try another category or search keyword.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="marketplace-recipes-grid">
                {templatesData.templates.map((tpl: any) => (
                  <div
                    key={tpl.id}
                    data-testid={`recipe-card-${tpl.slug}`}
                    className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                          {tpl.category}
                        </span>
                        <span className="text-xs text-slate-400">{tpl.nodesCount || 3} steps</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors mb-1.5">
                        {tpl.name}
                      </h3>
                      <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">{tpl.description}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <button
                        onClick={() => setInspectTemplate(tpl)}
                        className="text-slate-600 hover:text-slate-900 font-semibold"
                      >
                        Inspect Recipe
                      </button>
                      <button
                        onClick={() => instantiateTemplateMutation.mutate(tpl.id)}
                        disabled={instantiateTemplateMutation.isPending}
                        data-testid={`use-recipe-btn-${tpl.slug}`}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-semibold transition flex items-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Use Recipe</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Connector Studio & Certification Console (Phase 19) */}
        {activeTab === "connectors" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Developer Connectors & Release Artifacts</h2>
                <p className="text-xs text-slate-500">
                  Author, validate, certify, and govern versioned connector artifacts with immutable SHA-256 integrity.
                </p>
              </div>
            </div>

            {connectorsLoading ? (
              <div className="text-center py-12 text-xs text-slate-400">Loading connector artifacts...</div>
            ) : connectorsList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
                <Code2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No Connector Artifacts Registered</p>
                <p className="text-xs text-slate-400 mt-1">
                  Create a new connector manifest draft using the button above to begin certification.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="connectors-grid">
                {connectorsList.map((item: any) => {
                  const manifest = item.manifest || {};
                  const latestCert = item.certifications?.[0];
                  return (
                    <div
                      key={item.id}
                      data-testid={`connector-card-${item.connectorKey}`}
                      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group space-y-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900">{manifest.name || item.connectorKey}</h3>
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-700">
                                v{item.version}
                              </span>
                            </div>
                            <span className="text-xs text-slate-400 font-mono">{item.connectorKey}</span>
                          </div>

                          {/* Status Badge */}
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold",
                              item.status === "PUBLISHED" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                              item.status === "CERTIFIED" && "bg-indigo-50 text-indigo-700 border border-indigo-200",
                              item.status === "DRAFT" && "bg-amber-50 text-amber-700 border border-amber-200",
                              item.status === "CERTIFYING" && "bg-blue-50 text-blue-700 border border-blue-200 animate-pulse",
                              item.status === "SUSPENDED" && "bg-orange-50 text-orange-700 border border-orange-200",
                              item.status === "REVOKED" && "bg-rose-50 text-rose-700 border border-rose-200"
                            )}
                          >
                            {item.status}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-2 mb-3 leading-relaxed">
                          {manifest.description || "No description provided."}
                        </p>

                        {/* Artifact SHA-256 Provenance Preview */}
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1">
                          <div className="flex items-center justify-between text-slate-500 font-mono text-2xs">
                            <span className="font-semibold">SHA-256 PROVENANCE:</span>
                            <span className="text-emerald-700 font-bold">IMMUTABLE</span>
                          </div>
                          <p className="font-mono text-2xs text-slate-700 truncate" title={item.artifactHashSha256}>
                            {item.artifactHashSha256}
                          </p>
                        </div>

                        {/* Certification Summary */}
                        <div className="mt-2.5 flex items-center justify-between text-xs">
                          <span className="text-slate-500">Certification Status:</span>
                          <span
                            className={cn(
                              "font-bold",
                              item.certificationStatus === "PASSED" && "text-emerald-600",
                              item.certificationStatus === "FAILED" && "text-rose-600",
                              item.certificationStatus === "PENDING" && "text-amber-600"
                            )}
                          >
                            {item.certificationStatus}
                          </span>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2 text-xs">
                        <button
                          onClick={() => setInspectArtifact(item)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold"
                        >
                          View Details
                        </button>

                        {item.status === "DRAFT" && (
                          <button
                            onClick={() => certifyMutation.mutate(item.id)}
                            disabled={certifyMutation.isPending}
                            data-testid={`certify-btn-${item.connectorKey}`}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-semibold flex items-center gap-1"
                          >
                            <FileCheck className="h-3.5 w-3.5" />
                            <span>Certify</span>
                          </button>
                        )}

                        {item.status === "CERTIFIED" && (
                          <button
                            onClick={() =>
                              publishMutation.mutate({
                                id: item.id,
                                hash: item.artifactHashSha256,
                              })
                            }
                            disabled={publishMutation.isPending}
                            data-testid={`publish-btn-${item.connectorKey}`}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-semibold flex items-center gap-1"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>Publish</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal: New Connector Manifest Draft (Phase 19) */}
        {showConnectorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Register Connector Release Manifest</h3>
                  <p className="text-xs text-slate-500">
                    Define schema, actions, auth credentials, and egress policies.
                  </p>
                </div>
                <button onClick={() => setShowConnectorModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                <label className="text-xs font-bold text-slate-700 block">Manifest JSON Contract:</label>
                <textarea
                  value={manifestJson}
                  onChange={(e) => setManifestJson(e.target.value)}
                  data-testid="connector-manifest-textarea"
                  rows={14}
                  className="w-full font-mono text-xs rounded-xl border border-slate-200 p-3 text-slate-800 bg-slate-50 focus:bg-white focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                />

                {validationResult && (
                  <div
                    className={cn(
                      "p-3 rounded-xl border text-xs space-y-1",
                      validationResult.valid
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-rose-50 border-rose-200 text-rose-800"
                    )}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      {validationResult.valid ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span>Manifest Contract Valid</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-rose-600" />
                          <span>Validation Issues Detected</span>
                        </>
                      )}
                    </div>
                    {validationResult.hash && (
                      <p className="font-mono text-2xs truncate">
                        Computed SHA-256: {validationResult.hash}
                      </p>
                    )}
                    {validationResult.errors && (
                      <ul className="list-disc pl-5 text-2xs space-y-0.5">
                        {validationResult.errors.map((err: string, i: number) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={handleValidateManifest}
                  data-testid="validate-manifest-btn"
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs"
                >
                  Validate Manifest
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowConnectorModal(false)}
                    className="px-4 py-2 rounded-lg text-slate-500 hover:text-slate-700 font-semibold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateDraft}
                    data-testid="submit-draft-btn"
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-semibold text-xs shadow-xs"
                  >
                    Create Draft Release
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Connector Artifact Details & Certification Record */}
        {inspectArtifact && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {inspectArtifact.manifest?.name || inspectArtifact.connectorKey}
                    </h3>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-700">
                      v{inspectArtifact.version}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">{inspectArtifact.artifactHashSha256}</p>
                </div>
                <button onClick={() => setInspectArtifact(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 text-xs">
                {/* 6 Automated Certification Checks */}
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">Automated Certification Pipeline (6 Checks)</h4>
                  {inspectArtifact.certifications?.[0]?.checks?.length > 0 ? (
                    <div className="space-y-2">
                      {inspectArtifact.certifications[0].checks.map((chk: any) => (
                        <div
                          key={chk.id}
                          className={cn(
                            "p-3 rounded-xl border flex items-start justify-between gap-3",
                            chk.status === "PASSED" && "bg-emerald-50/50 border-emerald-200",
                            chk.status === "FAILED" && "bg-rose-50/50 border-rose-200",
                            chk.status === "WARNING" && "bg-amber-50/50 border-amber-200"
                          )}
                        >
                          <div>
                            <span className="font-bold text-slate-800 block">{chk.checkName}</span>
                            <span className="text-slate-600 block mt-0.5">{chk.message}</span>
                          </div>
                          <span
                            className={cn(
                              "font-bold text-2xs uppercase px-2 py-0.5 rounded",
                              chk.status === "PASSED" && "bg-emerald-100 text-emerald-800",
                              chk.status === "FAILED" && "bg-rose-100 text-rose-800",
                              chk.status === "WARNING" && "bg-amber-100 text-amber-800"
                            )}
                          >
                            {chk.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">No automated certification runs recorded yet.</p>
                  )}
                </div>

                {/* Actions Defined */}
                <div>
                  <h4 className="font-bold text-slate-800 mb-1.5">Actions Defined</h4>
                  <div className="space-y-1.5">
                    {(inspectArtifact.manifest?.actions || []).map((act: any) => (
                      <div key={act.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">{act.name}</span>
                          <span className="font-mono text-2xs text-slate-500">{act.id}</span>
                        </div>
                        <p className="text-slate-600 text-2xs mt-0.5">{act.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  onClick={() => setInspectArtifact(null)}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Integration Details Modal */}
        {inspectListing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-white text-base shadow-xs"
                    style={{ backgroundColor: inspectListing.accentColor || "#6366f1" }}
                  >
                    {inspectListing.title.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{inspectListing.title}</h3>
                    <p className="text-xs text-slate-500">
                      Publisher: {inspectListing.publisherName} • Version {inspectListing.currentVersion}
                    </p>
                  </div>
                </div>
                <button onClick={() => setInspectListing(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed">{inspectListing.description}</p>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="font-bold text-slate-700 block mb-1">Authentication Method</span>
                  <span className="text-slate-600">{inspectListing.authRequirements || "OAuth 2.0 or API Key"}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-700 block mb-1">Documentation</span>
                  {inspectListing.documentationUrl ? (
                    <a
                      href={inspectListing.documentationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      <span>Read Documentation</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-slate-400">Available in in-app config</span>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  onClick={() => setInspectListing(null)}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Template Flow Preview Modal */}
        {inspectTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{inspectTemplate.name}</h3>
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {inspectTemplate.category}
                  </span>
                </div>
                <button onClick={() => setInspectTemplate(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed">{inspectTemplate.description}</p>

              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-1">Workflow Graph Summary</h4>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600">
                  <span>Contains {inspectTemplate.nodesCount || 3} pre-configured automation nodes.</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => setInspectTemplate(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => instantiateTemplateMutation.mutate(inspectTemplate.id)}
                  disabled={instantiateTemplateMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Instantiate Recipe</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Submit Integration Modal */}
        {showSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Submit Integration for Marketplace</h3>
                <button onClick={() => setShowSubmitModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Publish a custom integration package to the global or workspace catalog. Submissions undergo automated validation and tenant isolation verification.
              </p>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold text-xs"
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
