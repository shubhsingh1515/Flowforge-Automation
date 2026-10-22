"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Workflow,
  CheckCircle2,
  XCircle,
  PlayCircle,
  PlusCircle,
  ArrowRight,
  Boxes,
  FolderGit2,
  Clock,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";

export default function DashboardPage() {
  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => api.dashboard.getMetrics(),
  });

  const { data: activityData, isLoading: loadingActivity } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => api.dashboard.getActivity(),
  });

  const workflows = activityData?.activity || [];

  return (
    <AppShell
      title="Dashboard"
      description="Overview of your automation workspace, active flows, and recent activity."
      action={
        <Link
          href="/workflows/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Create Workflow</span>
        </Link>
      }
    >
      {/* 1. Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {/* Total Workflows */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Workflows</span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <Workflow className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {loadingMetrics ? "..." : metrics?.totalWorkflows ?? 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">All authored automation flows</p>
        </div>

        {/* Active Workflows */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Active Workflows</span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <PlayCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-600">
              {loadingMetrics ? "..." : metrics?.activeWorkflows ?? 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Ready to execute events</p>
        </div>

        {/* Successful Runs */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Successful Runs</span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {loadingMetrics ? "..." : metrics?.successfulRuns ?? 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Verified executions</p>
        </div>

        {/* Failed Runs */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Failed Runs</span>
            <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {loadingMetrics ? "..." : metrics?.failedRuns ?? 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Errors requiring review</p>
        </div>
      </div>

      {/* 2. Onboarding Guide & Quick Actions Banner */}
      <div className="mb-8 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-indigo-50/30 to-white p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100/80 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-800">
              <Sparkles className="h-3 w-3" />
              <span>Getting Started with FlowForge</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Build your first automation pipeline in 3 simple steps
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              1. Choose a trigger (Webhook or Schedule) &bull; 2. Add filters or conditions &bull; 3. Dispatch HTTP calls or actions. Save and manage your graph visually in the canvas editor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/workflows/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
            >
              <span>Open Visual Canvas</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/templates"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FolderGit2 className="h-3.5 w-3.5 text-slate-400" />
              <span>Explore Templates</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 3. Recent Workflows Activity Section */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Workflow Activity</h3>
            <p className="text-xs text-slate-500">Live workflows authored in this workspace</p>
          </div>
          <Link
            href="/workflows"
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <span>View All</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loadingActivity ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading activity...</div>
        ) : workflows.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <Workflow className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">No workflows authored yet</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              You haven't created any workflows in this workspace. Start with a blank canvas or pick a pre-made template.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/workflows/new"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Create First Workflow</span>
              </Link>
              <Link
                href="/templates"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <span>Browse Templates</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-6">Workflow</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Trigger Type</th>
                  <th className="py-3 px-6">Last Updated</th>
                  <th className="py-3 px-6">Last Execution</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {workflows.map((wf: any) => (
                  <tr key={wf.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-6">
                      <Link
                        href={`/workflows/${wf.id}`}
                        className="font-semibold text-slate-900 hover:text-indigo-600"
                      >
                        {wf.name}
                      </Link>
                      {wf.description && (
                        <p className="text-[11px] text-slate-400 truncate max-w-xs">{wf.description}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          wf.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50"
                            : wf.status === "PAUSED"
                            ? "bg-amber-50 text-amber-700 border border-amber-200/50"
                            : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {wf.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-slate-600">{wf.triggerType}</td>
                    <td className="py-3.5 px-6 text-slate-500">{formatRelativeTime(wf.updatedAt)}</td>
                    <td className="py-3.5 px-6">
                      {wf.lastExecution ? (
                        <span className="text-[11px] font-medium text-slate-600">
                          {formatRelativeTime(wf.lastExecution.startedAt)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Never executed</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <Link
                        href={`/workflows/${wf.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        <span>Edit Canvas</span>
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

      {/* 4. Quick Actions Grid */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/workflows/new"
          className="group rounded-xl border border-slate-200/80 bg-white p-5 hover:border-indigo-300 transition-all shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                Create New Workflow
              </h4>
              <p className="text-[11px] text-slate-500">Author custom triggers and actions</p>
            </div>
          </div>
        </Link>

        <Link
          href="/integrations"
          className="group rounded-xl border border-slate-200/80 bg-white p-5 hover:border-indigo-300 transition-all shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                Browse Integrations
              </h4>
              <p className="text-[11px] text-slate-500">Explore built-in & planned connectors</p>
            </div>
          </div>
        </Link>

        <Link
          href="/templates"
          className="group rounded-xl border border-slate-200/80 bg-white p-5 hover:border-indigo-300 transition-all shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                Explore Templates
              </h4>
              <p className="text-[11px] text-slate-500">Clone pre-configured automation graphs</p>
            </div>
          </div>
        </Link>
      </div>
    </AppShell>
  );
}
