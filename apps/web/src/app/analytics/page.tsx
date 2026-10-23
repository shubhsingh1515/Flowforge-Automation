"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Zap,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Boxes,
} from "lucide-react";
import { cn } from "../../lib/utils";

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d" | "90d">("7d");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Fetch workflows for filter dropdown
  const { data: workflowsData } = useQuery({
    queryKey: ["workflows-list-dropdown"],
    queryFn: () => api.workflows.list({ limit: 100 }),
  });

  // Fetch analytics overview
  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ["analytics-overview", timeRange, selectedWorkflowId, selectedStatus],
    queryFn: () =>
      api.analytics.getOverview({
        timeRange,
        workflowId: selectedWorkflowId || undefined,
        status: selectedStatus !== "ALL" ? selectedStatus : undefined,
      }),
    refetchInterval: 15000,
  });

  const workflows = workflowsData?.data || [];

  return (
    <AppShell
      title="Product Analytics & Insights"
      description="Real-time execution telemetry, duration percentiles, volume trends, and failure intelligence."
      action={
        <button
          onClick={() => refetch()}
          data-testid="btn-refresh-analytics"
          className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Analytics</span>
        </button>
      }
    >
      <div className="space-y-6" data-testid="analytics-page">
        {/* Filters Bar */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card flex flex-wrap items-center justify-between gap-3">
          {/* Time Range Pills */}
          <div className="flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl shadow-2xs">
            {(["24h", "7d", "30d", "90d"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                data-testid={`btn-timerange-${range}`}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  timeRange === range
                    ? "bg-white text-[#6558E8] shadow-2xs border border-slate-200/60"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                )}
              >
                {range === "24h"
                  ? "Last 24 Hours"
                  : range === "7d"
                  ? "Last 7 Days"
                  : range === "30d"
                  ? "Last 30 Days"
                  : "Last 90 Days"}
              </button>
            ))}
          </div>

          {/* Workflow & Status Filters */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedWorkflowId}
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
                data-testid="select-workflow-filter"
                className="rounded-xl border border-slate-200/90 px-3 py-1.5 text-xs text-slate-700 bg-white focus:border-[#6558E8] focus:outline-none shadow-2xs"
              >
                <option value="">All Workflows</option>
                {workflows.map((wf: any) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              data-testid="select-status-filter"
              className="rounded-xl border border-slate-200/90 px-3 py-1.5 text-xs text-slate-700 bg-white focus:border-[#6558E8] focus:outline-none shadow-2xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">Success Only</option>
              <option value="FAILED">Failed Only</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Top KPI Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Executions */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-[#6558E8]" />
                Total Executions
              </span>
              {overview?.trendVsPreviousPeriod?.executionsChangePercent !== undefined && (
                <span
                  className={cn(
                    "flex items-center text-[11px] font-bold",
                    overview.trendVsPreviousPeriod.executionsChangePercent >= 0
                      ? "text-emerald-600"
                      : "text-slate-500"
                  )}
                >
                  {overview.trendVsPreviousPeriod.executionsChangePercent >= 0 ? (
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-0.5" />
                  )}
                  {overview.trendVsPreviousPeriod.executionsChangePercent >= 0 ? "+" : ""}
                  {overview.trendVsPreviousPeriod.executionsChangePercent}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {overview?.totalExecutions ?? 0}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {overview?.runningExecutions ?? 0} running • {overview?.cancelledExecutions ?? 0} cancelled
            </p>
          </div>

          {/* Card 2: Success Rate */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Success Rate
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                {overview?.successRatePercent ?? 100}%
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {overview?.successfulExecutions ?? 0}
              <span className="text-xs font-normal text-slate-400"> succeeded</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              vs prior period: {overview?.trendVsPreviousPeriod?.successRateChangePercent >= 0 ? "+" : ""}
              {overview?.trendVsPreviousPeriod?.successRateChangePercent ?? 0}%
            </p>
          </div>

          {/* Card 3: Failure Rate */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                Failure Rate
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full font-bold text-[10px]",
                  (overview?.failureRatePercent ?? 0) > 0
                    ? "bg-rose-50 text-rose-700"
                    : "bg-slate-50 text-slate-600"
                )}
              >
                {overview?.failureRatePercent ?? 0}%
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {overview?.failedExecutions ?? 0}
              <span className="text-xs font-normal text-slate-400"> failed runs</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Across {overview?.topErrorCategories?.length ?? 0} error categories
            </p>
          </div>

          {/* Card 4: Duration Percentiles */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#6558E8]" />
                Latency Percentiles
              </span>
              <span className="font-mono text-[10px] text-slate-400">Duration</span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <div>
                <p className="text-lg font-bold text-slate-900 font-mono">
                  {overview?.durationPercentiles?.p50 ?? 0}
                  <span className="text-[10px] font-normal text-slate-400">ms</span>
                </p>
                <p className="text-[10px] text-slate-400">p50 (Median)</p>
              </div>
              <div className="border-l border-slate-200 pl-3">
                <p className="text-lg font-bold text-slate-900 font-mono">
                  {overview?.durationPercentiles?.p90 ?? 0}
                  <span className="text-[10px] font-normal text-slate-400">ms</span>
                </p>
                <p className="text-[10px] text-slate-400">p90</p>
              </div>
              <div className="border-l border-slate-200 pl-3">
                <p className="text-lg font-bold text-slate-900 font-mono">
                  {overview?.durationPercentiles?.p99 ?? 0}
                  <span className="text-[10px] font-normal text-slate-400">ms</span>
                </p>
                <p className="text-[10px] text-slate-400">p99</p>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Monthly Usage Gauge */}
        {overview?.currentCycleUsage && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-500" />
                Current Monthly Plan Allowance Consumption
              </span>
              <span className="font-bold text-slate-700">
                {overview.currentCycleUsage.consumed} / {overview.currentCycleUsage.allowance} runs ({overview.currentCycleUsage.percentUsed}%)
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={cn(
                  "h-2.5 rounded-full transition-all",
                  overview.currentCycleUsage.percentUsed >= 90
                    ? "bg-rose-600"
                    : overview.currentCycleUsage.percentUsed >= 80
                    ? "bg-amber-500"
                    : "bg-indigo-600"
                )}
                style={{ width: `${Math.min(100, overview.currentCycleUsage.percentUsed)}%` }}
              />
            </div>
          </div>
        )}

        {/* 2-Column Section: Volume Over Time & Top Error Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Volume Over Time */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Execution Volume Over Time</h3>
                <p className="text-xs text-slate-500 mt-0.5">Chronological execution counts by time bucket.</p>
              </div>
            </div>

            {overview?.volumeOverTime && overview.volumeOverTime.length > 0 ? (
              <div className="space-y-2 text-xs">
                {overview.volumeOverTime.slice(-10).map((pt: any) => (
                  <div key={pt.bucket} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                    <span className="font-mono text-[11px] text-slate-600">{pt.bucket}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-emerald-600 font-semibold">{pt.success} ok</span>
                      {pt.failed > 0 && (
                        <span className="font-mono text-[11px] text-rose-600 font-semibold">{pt.failed} failed</span>
                      )}
                      <span className="font-mono text-[11px] font-bold text-slate-800 w-12 text-right">
                        {pt.total} runs
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-8">
                No execution volume recorded in the selected time window.
              </p>
            )}
          </div>

          {/* Top Error Categories */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Top Failure Root Causes</h3>
                <p className="text-xs text-slate-500 mt-0.5">Breakdown of failure categories across automations.</p>
              </div>
            </div>

            {overview?.topErrorCategories && overview.topErrorCategories.length > 0 ? (
              <div className="space-y-3 text-xs">
                {overview.topErrorCategories.map((cat: any) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between font-medium">
                      <span className="font-mono text-[11px] text-slate-800">{cat.category}</span>
                      <span className="text-slate-500 text-[11px]">
                        {cat.count} runs ({cat.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-rose-500"
                        style={{ width: `${Math.min(100, cat.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-8">
                Zero execution failures in the selected time window!
              </p>
            )}
          </div>
        </div>

        {/* Most Executed Workflows Table */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Most Frequently Executed Workflows</h3>
              <p className="text-xs text-slate-500 mt-0.5">Top automations by execution volume.</p>
            </div>
            <Link
              href="/workflows"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              <span>Manage Workflows</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {overview?.mostExecutedWorkflows && overview.mostExecutedWorkflows.length > 0 ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                  <th className="py-2.5 px-6">Workflow</th>
                  <th className="py-2.5 px-4">Total Runs</th>
                  <th className="py-2.5 px-4">Success Rate</th>
                  <th className="py-2.5 px-6 text-right">Drill-Down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.mostExecutedWorkflows.map((wf: any) => (
                  <tr key={wf.workflowId} className="hover:bg-slate-50/50">
                    <td className="py-3 px-6 font-semibold text-slate-800">{wf.workflowName}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-700">{wf.count}</td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full font-bold text-[10px]",
                          wf.successRate >= 95
                            ? "bg-emerald-50 text-emerald-700"
                            : wf.successRate >= 80
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700"
                        )}
                      >
                        {wf.successRate}%
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <Link
                        href={`/executions?workflowId=${wf.workflowId}`}
                        className="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
                      >
                        <span>View Runs</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              No workflow execution records found in this time range.
            </div>
          )}
        </div>

        {/* Workflows with Repeated Failures (Needs Attention) */}
        {overview?.repeatedFailureWorkflows && overview.repeatedFailureWorkflows.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-6 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              <h3 className="text-sm font-bold text-rose-900">Workflows with Repeated Failures</h3>
            </div>
            <p className="text-xs text-rose-700">
              The following automations experienced multiple failures in the selected window. Inspect connection credentials, webhook payloads, or logic steps.
            </p>

            <div className="divide-y divide-rose-100 border border-rose-200/60 rounded-lg bg-white overflow-hidden text-xs">
              {overview.repeatedFailureWorkflows.map((rf: any) => (
                <div key={rf.workflowId} className="p-3.5 flex items-center justify-between hover:bg-rose-50/20">
                  <div>
                    <p className="font-semibold text-slate-900">{rf.workflowName}</p>
                    <p className="text-[11px] text-rose-600 font-mono mt-0.5">
                      {rf.failureCount} failed runs • Category: {rf.lastErrorCategory}
                    </p>
                  </div>
                  <Link
                    href={`/executions?workflowId=${rf.workflowId}`}
                    className="px-3 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-semibold"
                  >
                    Diagnose
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
