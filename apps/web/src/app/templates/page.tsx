"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  FolderGit2,
  Sparkles,
  ArrowRight,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  Globe,
  Webhook,
  Search,
  Filter,
  Eye,
  BookOpen,
  X,
  PlayCircle,
  Tag,
  Check,
} from "lucide-react";
import { cn } from "../../lib/utils";

export default function TemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("");
  const [activeModalTemplate, setActiveModalTemplate] = useState<any | null>(null);
  const [customWorkflowName, setCustomWorkflowName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["templates", search, selectedCategory, selectedDifficulty],
    queryFn: () =>
      api.templates.list({
        search: search || undefined,
        category: selectedCategory === "All" ? undefined : selectedCategory,
        difficulty: selectedDifficulty ? (selectedDifficulty as any) : undefined,
      }),
  });

  const instantiateMutation = useMutation({
    mutationFn: ({ templateId, name }: { templateId: string; name?: string }) =>
      api.templates.instantiate(templateId, name),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      setActiveModalTemplate(null);
      if (res?.workflow?.id) {
        router.push(`/workflows/${res.workflow.id}`);
      }
    },
  });

  const templates = data?.templates || [];

  const categories = [
    "All",
    "Notifications",
    "Data Sync",
    "Operations",
    "Productivity",
    "Developer",
  ];

  return (
    <AppShell
      title="Workflow Templates & Recipes"
      description="Jumpstart your automation pipelines with curated, ready-to-run automation recipes."
    >
      {/* Search and Filters Toolbar */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes by name, description or tags..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 shadow-2xs"
            />
          </div>

          {/* Difficulty Dropdown */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-500 font-medium">Complexity:</span>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-indigo-600 focus:outline-none shadow-2xs"
            >
              <option value="">All Complexities</option>
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "rounded-full px-3.5 py-1 text-xs font-medium transition-all shrink-0",
                selectedCategory === cat
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-xs text-slate-400">Loading automation recipes...</div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <FolderGit2 className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No matching templates found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search criteria or switch to another category.
          </p>
          <button
            onClick={() => {
              setSearch("");
              setSelectedCategory("All");
              setSelectedDifficulty("");
            }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl: any) => {
            const difficultyBadge =
              tpl.difficulty === "ADVANCED"
                ? "bg-purple-50 text-purple-700 border-purple-200/60"
                : tpl.difficulty === "INTERMEDIATE"
                ? "bg-amber-50 text-amber-700 border-amber-200/60"
                : "bg-emerald-50 text-emerald-700 border-emerald-200/60";

            return (
              <div
                key={tpl.id}
                data-testid={`template-card-${tpl.slug}`}
                className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                      {tpl.category}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                        difficultyBadge
                      )}
                    >
                      {tpl.difficulty}
                    </span>
                  </div>

                  <h3 className="mt-4 text-sm font-bold text-slate-900 line-clamp-1">{tpl.title}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">
                    {tpl.description}
                  </p>

                  {/* Flow summary pills */}
                  <div className="mt-4 flex items-center gap-2 text-[11px] font-medium text-slate-600 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    <span className="font-semibold text-slate-800">{tpl.triggerType}</span>
                    <span className="text-slate-400">&rarr;</span>
                    <span className="font-semibold text-indigo-600">{tpl.actionType}</span>
                    <span className="ml-auto text-[10px] text-slate-400 font-mono">
                      {tpl.nodeCount || tpl.nodes?.length || 0} nodes
                    </span>
                  </div>

                  {/* Required Integrations Tags */}
                  {tpl.requiredIntegrations && tpl.requiredIntegrations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tpl.requiredIntegrations.map((req: string) => (
                        <span
                          key={req}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 uppercase"
                        >
                          {req}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setActiveModalTemplate(tpl);
                      setCustomWorkflowName(tpl.title);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Details</span>
                  </button>

                  <button
                    onClick={() => {
                      instantiateMutation.mutate({ templateId: tpl.id });
                    }}
                    disabled={instantiateMutation.isPending}
                    data-testid={`use-template-${tpl.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-70 transition-colors"
                  >
                    <span>Use Template</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template Details & Instantiation Modal */}
      {activeModalTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{activeModalTemplate.title}</h3>
                  <p className="text-[11px] text-slate-500">
                    Category: {activeModalTemplate.category} &bull; Difficulty: {activeModalTemplate.difficulty}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModalTemplate(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Description</h4>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {activeModalTemplate.description}
                </p>
              </div>

              {/* Setup Guide */}
              {activeModalTemplate.setupGuide && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                  <div className="flex items-center gap-2 text-indigo-800 text-xs font-bold mb-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Setup & Configuration Guide</span>
                  </div>
                  <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {activeModalTemplate.setupGuide}
                  </pre>
                </div>
              )}

              {/* Graph Architecture Summary */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Pipeline Graph ({activeModalTemplate.nodes?.length || 0} Nodes)
                </h4>
                <div className="mt-2 space-y-2">
                  {activeModalTemplate.nodes?.map((node: any, idx: number) => (
                    <div
                      key={node.id}
                      className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-slate-800 block truncate">
                          {node.data?.label || node.id}
                        </span>
                        <span className="text-[10px] text-slate-500 block truncate">
                          Type: {node.data?.nodeType} {node.data?.integrationKey ? `(${node.data.integrationKey})` : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Workflow Name Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  New Workflow Title
                </label>
                <input
                  type="text"
                  value={customWorkflowName}
                  onChange={(e) => setCustomWorkflowName(e.target.value)}
                  placeholder="Enter a title for your workflow copy..."
                  className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3.5">
              <button
                onClick={() => setActiveModalTemplate(null)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  instantiateMutation.mutate({
                    templateId: activeModalTemplate.id,
                    name: customWorkflowName || undefined,
                  });
                }}
                disabled={instantiateMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {instantiateMutation.isPending ? "Creating Workflow..." : "Create Workflow from Recipe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
