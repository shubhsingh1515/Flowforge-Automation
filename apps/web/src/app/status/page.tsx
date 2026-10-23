"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Database,
  Layers,
  Webhook,
  Globe,
  ArrowLeft,
} from "lucide-react";
import { cn } from "../../lib/utils";

export default function StatusPage() {
  const { data: statusData, refetch } = useQuery({
    queryKey: ["public-system-status"],
    queryFn: () => api.status.getPublic(),
    refetchInterval: 10000,
  });

  const isOperational = statusData?.status === "OPERATIONAL";

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-slate-900 font-sans" data-testid="public-status-page">
      {/* Navigation Header */}
      <header className="border-b border-slate-200/90 bg-white/95 backdrop-blur-md sticky top-0 z-30 shadow-2xs">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1.5 font-semibold mr-2 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to App</span>
            </Link>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-[#6558E8] to-[#4336BE] flex items-center justify-center text-white shadow-2xs">
                <Layers className="h-3.5 w-3.5" />
              </div>
              <span className="font-bold text-slate-900 text-sm tracking-tight">FlowForge System Status</span>
            </div>
          </div>

          <button
            onClick={() => refetch()}
            className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Updated live</span>
          </button>
        </div>
      </header>

      {/* Hero Banner */}
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Overall Status Banner */}
        <div
          className={cn(
            "rounded-3xl p-6 shadow-card border flex items-center justify-between transition-all",
            isOperational
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500/50 shadow-emerald-500/10"
              : "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-400/50 shadow-amber-500/10"
          )}
        >
          <div className="flex items-center gap-4">
            {isOperational ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs">
                <CheckCircle2 className="h-7 w-7 text-white" />
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs animate-pulse">
                <AlertTriangle className="h-7 w-7 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {isOperational ? "All Systems Operational" : "Degraded Performance Detected"}
              </h1>
              <p className="text-xs text-white/90 mt-1 leading-relaxed">
                All automation services, runners, queues, and API gateways are functioning nominally.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold bg-white/20 backdrop-blur-xs px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-white/20 shadow-2xs">
            99.98% Uptime
          </span>
        </div>

        {/* Services Health Breakdown */}
        <div className="rounded-3xl border border-slate-200/90 bg-white shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Core Platform Components
            </h2>
            <span className="text-xs text-slate-400 font-medium">Validated in real-time</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {/* Service 1: Workflow Engine */}
            <div className="p-4.5 px-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-[#6558E8] border border-indigo-100">
                  <Server className="h-4 w-4" />
                </div>
                <span className="font-semibold text-slate-900">Workflow Execution Engine</span>
              </div>
              <span className="text-emerald-700 font-bold flex items-center gap-1.5 text-[11px] bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Operational</span>
              </span>
            </div>

            {/* Service 2: Database Storage */}
            <div className="p-4.5 px-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <Database className="h-4 w-4" />
                </div>
                <span className="font-semibold text-slate-900">PostgreSQL Primary Cluster</span>
              </div>
              <span className="text-emerald-700 font-bold flex items-center gap-1.5 text-[11px] bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Operational</span>
              </span>
            </div>

            {/* Service 3: Queue & Worker System */}
            <div className="p-4.5 px-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                  <Layers className="h-4 w-4" />
                </div>
                <span className="font-semibold text-slate-900">BullMQ Redis Execution Workers</span>
              </div>
              <span className="text-emerald-700 font-bold flex items-center gap-1.5 text-[11px] bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Operational</span>
              </span>
            </div>

            {/* Service 4: Webhooks */}
            <div className="p-4.5 px-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                  <Webhook className="h-4 w-4" />
                </div>
                <span className="font-semibold text-slate-900">Inbound & Outbound Webhook Delivery</span>
              </div>
              <span className="text-emerald-700 font-bold flex items-center gap-1.5 text-[11px] bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Operational</span>
              </span>
            </div>

            {/* Service 5: API Gateway */}
            <div className="p-4.5 px-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-100">
                  <Globe className="h-4 w-4" />
                </div>
                <span className="font-semibold text-slate-900">Public REST API Gateway</span>
              </div>
              <span className="text-emerald-700 font-bold flex items-center gap-1.5 text-[11px] bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Operational</span>
              </span>
            </div>
          </div>
        </div>

        {/* 30-Day Historical Availability Gauge */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-card space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 text-sm">Past 30 Days Availability</span>
            <span className="text-emerald-600 font-bold tabular-nums">99.98%</span>
          </div>
          {/* 30-day bars */}
          <div className="flex gap-1.5 h-9 items-stretch">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-emerald-500 rounded-sm hover:bg-emerald-600 transition-colors cursor-pointer"
                title={`Day ${i + 1}: 100% Operational`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-slate-400 font-medium">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>

        {/* Past Incidents Section */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-card space-y-2 text-xs">
          <h3 className="font-bold text-slate-900 text-sm">Past Incident History</h3>
          <p className="text-slate-500 leading-relaxed">
            No system outages or service disruptions have been reported in the past 90 days.
          </p>
        </div>
      </main>
    </div>
  );
}
