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
  const [activeTab, setActiveTab] = useState<"integrations" | "templates">("integrations");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [inspectListing, setInspectListing] = useState<any | null>(null);
  const [inspectTemplate, setInspectTemplate] = useState<any | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

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

  return (
    <AppShell
      title="Integration Marketplace"
      description="Discover certified integrations, custom API packages, and reusable automation recipes."
      action={
        <div className="flex items-center gap-2">
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

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 text-xs">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                data-testid={`category-filter-${cat.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors",
                  selectedCategory === cat
                    ? "bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 1. Integrations Catalog Tab */}
        {activeTab === "integrations" && (
          <div>
            {listingsLoading ? (
              <div className="p-12 text-center text-xs text-slate-400 font-medium">Loading marketplace integrations...</div>
            ) : listings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <Store className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-800">No integrations found</h4>
                <p className="text-xs text-slate-500 mt-1">Try modifying your search query or selecting a different category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {listings.map((item: any) => {
                  const isPlatform = item.publisherName === "FlowForge Platform";

                  return (
                    <div
                      key={item.id}
                      data-testid={`marketplace-card-${item.slug}`}
                      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-white text-base shadow-xs"
                              style={{ backgroundColor: item.accentColor || "#6366f1" }}
                            >
                              {item.title.charAt(0)}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{item.title}</h4>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-slate-400 font-mono">v{item.currentVersion}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-[10px] font-semibold text-slate-500">{item.category}</span>
                              </div>
                            </div>
                          </div>

                          {isPlatform ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-[10px] font-bold text-indigo-700">
                              <ShieldCheck className="h-3 w-3" />
                              Platform
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
                              Community
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{item.description}</p>

                        {/* Supported Action Badges */}
                        {item.supportedActions && item.supportedActions.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {item.supportedActions.slice(0, 3).map((act: string) => (
                              <span key={act} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                                {act}
                              </span>
                            ))}
                            {item.supportedActions.length > 3 && (
                              <span className="text-[10px] text-slate-400 self-center">+{item.supportedActions.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="pt-5 mt-4 border-t border-slate-100 flex items-center justify-between">
                        <button
                          onClick={() => setInspectListing(item)}
                          data-testid={`inspect-listing-btn-${item.slug}`}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                        >
                          View Details
                        </button>

                        {item.isInstalled ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Installed (v{item.installedVersion || item.currentVersion})
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => installMutation.mutate({ id: item.id, version: item.currentVersion })}
                            disabled={installMutation.isPending}
                            data-testid={`install-btn-${item.slug}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-2xs"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Install</span>
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

        {/* 2. Automation Recipes Tab */}
        {activeTab === "templates" && (
          <div>
            {templatesLoading ? (
              <div className="p-12 text-center text-xs text-slate-400 font-medium">Loading automation recipes...</div>
            ) : (templatesData?.templates || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <Sparkles className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-800">No automation recipes found</h4>
                <p className="text-xs text-slate-500 mt-1">Check back soon for community and platform workflow recipes.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {(templatesData?.templates || []).map((tpl: any) => (
                  <div
                    key={tpl.id}
                    data-testid={`recipe-card-${tpl.slug}`}
                    className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                          {tpl.category}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          {tpl.difficulty}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-slate-900">{tpl.title}</h4>
                      <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{tpl.description}</p>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {tpl.requiredIntegrations?.map((req: string) => (
                          <span key={req} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                            {req}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-5 mt-4 border-t border-slate-100 flex items-center justify-between">
                      <button
                        onClick={() => setInspectTemplate(tpl)}
                        data-testid={`preview-recipe-btn-${tpl.slug}`}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                      >
                        Inspect Recipe
                      </button>

                      <button
                        onClick={() => instantiateTemplateMutation.mutate(tpl.id)}
                        disabled={instantiateTemplateMutation.isPending}
                        data-testid={`use-recipe-btn-${tpl.slug}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition shadow-2xs"
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
                  <span className="text-slate-600">{inspectListing.authRequirements}</span>
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

              {inspectListing.supportedActions && inspectListing.supportedActions.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-slate-800 block mb-1.5">Supported Actions & Endpoints</span>
                  <div className="flex flex-wrap gap-1.5">
                    {inspectListing.supportedActions.map((act: string) => (
                      <span key={act} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700">
                        {act}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  {inspectListing.isInstalled && (
                    <button
                      onClick={() => uninstallMutation.mutate(inspectListing.id)}
                      disabled={uninstallMutation.isPending}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Uninstall Integration</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInspectListing(null)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                  >
                    Close
                  </button>

                  {!inspectListing.isInstalled && (
                    <button
                      onClick={() =>
                        installMutation.mutate({
                          id: inspectListing.id,
                          version: inspectListing.currentVersion,
                        })
                      }
                      disabled={installMutation.isPending}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs"
                    >
                      Install Version {inspectListing.currentVersion}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recipe Preview Modal */}
        {inspectTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{inspectTemplate.title}</h3>
                  <p className="text-xs text-slate-500">Category: {inspectTemplate.category} • Difficulty: {inspectTemplate.difficulty}</p>
                </div>
                <button onClick={() => setInspectTemplate(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-slate-700">{inspectTemplate.description}</p>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span>Workflow Graph Summary</span>
                  <span>{inspectTemplate.nodes?.length || 0} nodes, {inspectTemplate.edges?.length || 0} edges</span>
                </div>
                <p className="text-slate-500 text-[11px]">
                  Safe recipe installation generates fresh, unique node IDs and creates a new workflow in DRAFT status. Credentials are never bundled in recipes.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => setInspectTemplate(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => instantiateTemplateMutation.mutate(inspectTemplate.id)}
                  disabled={instantiateTemplateMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs"
                >
                  Instantiate Recipe
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
