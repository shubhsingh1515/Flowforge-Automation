"use client";

import React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Workflow,
  CheckCircle2,
  XCircle,
  PlayCircle,
  PlusCircle,
  ArrowRight,
  FolderGit2,
  ChevronRight,
  Sparkles,
  Check,
  Circle,
  X,
  TrendingUp,
} from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";

export default function DashboardPage() {
  const queryClient = useQueryClient();

  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => api.dashboard.getMetrics(),
  });

  const { data: activityData, isLoading: loadingActivity } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => api.dashboard.getActivity(),
  });

  const { data: onboarding } = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api.onboarding.get(),
  });

  const dismissMutation = useMutation({
    mutationFn: (dismissed: boolean) => api.onboarding.update({ dismissed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

  const workflows = activityData?.activity || [];
  const onboardingSteps = onboarding?.steps || [];
  const isDismissed = onboarding?.dismissed ?? false;
  const completionPercentage = onboarding?.completionPercentage ?? 0;

  return (
    <AppShell
      title="Dashboard"
      description="Real-time operational overview of active automations, workflow telemetry, and system execution health."
      action={
        <div className="flex items-center gap-2.5">
          <Link
            href="/templates"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-all duration-150"
          >
            <FolderGit2 className="h-3.5 w-3.5 text-[#6558E8]" />
            <span>Templates</span>
          </Link>
          <Link
            href="/workflows/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#6558E8] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#5345D8] transition-all duration-150"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Create Workflow</span>
          </Link>
        </div>
      }
    >
      {/* 1. Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {/* Total Workflows */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Workflows</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-[#6558E8]">
              <Workflow className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
              {loadingMetrics ? "..." : metrics?.totalWorkflows ?? 0}
            </span>
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              Configured
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">All authored automation flows</p>
        </div>

        {/* Active Workflows */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Workflows</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600">
              <PlayCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 tabular-nums">
              {loadingMetrics ? "..." : metrics?.activeWorkflows ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">Ready to execute events</p>
        </div>

        {/* Successful Runs */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Successful Runs</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 border border-blue-100 text-blue-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
              {loadingMetrics ? "..." : metrics?.successfulRuns ?? 0}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              <TrendingUp className="h-3 w-3" />
              99.8%
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">Verified executions</p>
        </div>

        {/* Failed Runs */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Failed Runs</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 border border-rose-100 text-rose-600">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
              {loadingMetrics ? "..." : metrics?.failedRuns ?? 0}
            </span>
            {(metrics?.failedRuns ?? 0) === 0 ? (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                Optimal
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                Action req.
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">Errors requiring review</p>
        </div>
      </div>

      {/* 2. Persistent Onboarding Checklist Widget */}
      {!isDismissed && (
        <div
          data-testid="onboarding-checklist-card"
          className="mb-8 rounded-2xl border border-indigo-100/80 bg-gradient-to-r from-indigo-50/70 via-indigo-50/30 to-white p-6 shadow-card"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#6558E8] text-white shadow-sm shadow-[#6558E8]/30">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Workspace Onboarding Checklist</h3>
                <p className="text-xs text-slate-500">
                  {onboarding?.completedSteps || 0} of {onboarding?.totalSteps || 6} milestones completed ({completionPercentage}%)
                </p>
              </div>
            </div>

            <button
              onClick={() => dismissMutation.mutate(true)}
              className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1 transition-colors"
              title="Dismiss guide"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">Dismiss</span>
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="h-full bg-gradient-to-r from-[#6558E8] to-[#22B8CF] transition-all duration-500 rounded-full"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>

          {/* Checklist Milestones Grid */}
          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {onboardingSteps.map((step: any) => (
              <Link
                key={step.id}
                href={step.href}
                data-testid={`onboarding-step-${step.id}`}
                className={cn(
                  "flex items-center justify-between rounded-xl border p-3 text-xs transition-all duration-150",
                  step.completed
                    ? "border-emerald-200/80 bg-emerald-50/50 text-emerald-900"
                    : "border-slate-200/80 bg-white text-slate-700 hover:border-[#6558E8]/50 hover:shadow-2xs"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {step.completed ? (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xs">
                      <Check className="h-3 w-3" />
                    </div>
                  ) : (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400">
                      <Circle className="h-2.5 w-2.5 fill-current" />
                    </div>
                  )}
                  <span className={cn("font-medium truncate", step.completed && "line-through text-slate-400")}>
                    {step.title}
                  </span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 ml-2" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 3. Recent Workflows Activity Section */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/40">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Workflow Activity</h3>
            <p className="text-xs text-slate-500">Live workflows authored and executing in this workspace</p>
          </div>
          <Link
            href="/workflows"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#6558E8] hover:text-[#5345D8] transition-colors"
          >
            <span>View All</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loadingActivity ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading activity...</div>
        ) : workflows.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 text-[#6558E8] mb-3 shadow-2xs">
              <Workflow className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">No workflows authored yet</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              You haven't created any workflows in this workspace. Start with a blank canvas or pick a pre-made template.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/workflows/new"
                className="inline-flex items-center gap-2 rounded-xl bg-[#6558E8] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#5345D8] transition-colors"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Create First Workflow</span>
              </Link>
              <Link
                href="/templates"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span>Browse Templates</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100 text-[11px]">
                <tr>
                  <th className="py-3 px-6">Workflow</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Trigger</th>
                  <th className="py-3 px-6">Last Execution</th>
                  <th className="py-3 px-6">Updated</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {workflows.map((wf: any) => (
                  <tr key={wf.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-6">
                      <Link
                        href={`/workflows/${wf.id}`}
                        className="font-bold text-slate-900 hover:text-[#6558E8] transition-colors"
                      >
                        {wf.name}
                      </Link>
                      {wf.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{wf.description}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-semibold border",
                          wf.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                            : wf.status === "PAUSED"
                            ? "bg-amber-50 text-amber-700 border-amber-200/60"
                            : "bg-slate-100 text-slate-600 border-slate-200/60"
                        )}
                      >
                        {wf.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 font-mono text-[11px] text-slate-600">{wf.triggerType}</td>
                    <td className="py-3.5 px-6">
                      {wf.lastExecution ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold tabular-nums border",
                            wf.lastExecution.status === "SUCCESS"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                              : wf.lastExecution.status === "FAILED"
                              ? "bg-rose-50 text-rose-700 border-rose-200/60"
                              : "bg-slate-100 text-slate-600 border-slate-200/60"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              wf.lastExecution.status === "SUCCESS" ? "bg-emerald-500" : "bg-rose-500"
                            )}
                          />
                          {wf.lastExecution.status} ({wf.lastExecution.durationMs ?? 0}ms)
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">No runs yet</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-slate-400">{formatRelativeTime(wf.updatedAt)}</td>
                    <td className="py-3.5 px-6 text-right">
                      <Link
                        href={`/workflows/${wf.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#6558E8] hover:text-[#5345D8] transition-colors"
                      >
                        <span>Open Canvas</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
