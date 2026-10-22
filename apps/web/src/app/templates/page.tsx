"use client";

import React from "react";
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
} from "lucide-react";
import { cn } from "../../lib/utils";

export default function TemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.templates.list(),
  });

  const instantiateMutation = useMutation({
    mutationFn: (templateId: string) => api.templates.instantiate(templateId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      if (res?.workflow?.id) {
        router.push(`/workflows/${res.workflow.id}`);
      }
    },
  });

  const templates = data?.templates || [];

  return (
    <AppShell
      title="Workflow Templates"
      description="Jumpstart your automation pipelines with curated, ready-to-customize graphs."
    >
      {/* Templates Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-xs text-slate-400">Loading template gallery...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl: any) => {
            const isAvailable = tpl.status === "AVAILABLE";

            return (
              <div
                key={tpl.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                      {tpl.category}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isAvailable
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50"
                          : "bg-amber-50 text-amber-700 border border-amber-200/50"
                      )}
                    >
                      {isAvailable ? "Ready to Use" : "Requires Phase 2 Setup"}
                    </span>
                  </div>

                  <h3 className="mt-4 text-sm font-bold text-slate-900">{tpl.title}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    {tpl.description}
                  </p>

                  {/* Flow summary pills */}
                  <div className="mt-4 flex items-center gap-2 text-[11px] font-medium text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100">
                    <span className="font-semibold text-slate-800">{tpl.triggerType}</span>
                    <span className="text-slate-400">&rarr;</span>
                    <span className="font-semibold text-indigo-600">{tpl.actionType}</span>
                    <span className="ml-auto text-[10px] text-slate-400">
                      {tpl.nodes.length} nodes
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Pre-built DAG</span>
                  <button
                    onClick={() => instantiateMutation.mutate(tpl.id)}
                    disabled={instantiateMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-70 transition-colors"
                  >
                    <span>{instantiateMutation.isPending ? "Instantiating..." : "Use Template"}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
