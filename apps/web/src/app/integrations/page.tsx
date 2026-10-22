"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Boxes,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  X,
  Lock,
  Zap,
  Info,
  ShieldAlert,
  Webhook,
  Globe,
  Mail,
  MessageSquare,
  FileSpreadsheet,
  HardDrive,
  Inbox,
  Gamepad2,
  Send,
} from "lucide-react";
import { cn } from "../../lib/utils";

const ICON_MAP: Record<string, any> = {
  Webhook,
  Globe,
  Clock,
  Mail,
  MessageSquare,
  FileSpreadsheet,
  HardDrive,
  Inbox,
  Gamepad2,
  Send,
};

export default function IntegrationsPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [activeIntegration, setActiveIntegration] = useState<any | null>(null);

  const { data: categoriesData } = useQuery({
    queryKey: ["integration-categories"],
    queryFn: () => api.integrations.getCategories(),
  });

  const { data: integrationsData, isLoading } = useQuery({
    queryKey: ["integrations", search, selectedCategory],
    queryFn: () =>
      api.integrations.list({
        search: search || undefined,
        category: selectedCategory,
      }),
  });

  const integrations = integrationsData?.data || [];
  const categories = categoriesData?.categories || [];

  return (
    <AppShell
      title="Integrations Catalog"
      description="Connect cloud services, external APIs, and built-in automation primitives."
    >
      {/* Category Pills & Search Toolbar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations by name or description..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </div>

        {/* Categories */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1">
          {categories.map((cat: any) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                selectedCategory === cat.key
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Integrations Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-xs text-slate-400">Loading catalog...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((item: any) => {
            const Icon = ICON_MAP[item.iconName] || Boxes;
            const isAvailable = item.status === "AVAILABLE";

            return (
              <div
                key={item.key}
                onClick={() => setActiveIntegration(item)}
                className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-xs"
                      style={{ backgroundColor: item.accentColor }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {item.isBuiltin ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          Built-in Primitive
                        </span>
                      ) : (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-100">
                          External Service
                        </span>
                      )}

                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          isAvailable
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50"
                            : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {isAvailable ? "Available" : "Planned (Phase 2)"}
                      </span>
                    </div>
                  </div>

                  <h3 className="mt-4 text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {item.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">
                    {item.description}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                  <span className="capitalize">{item.category.toLowerCase()}</span>
                  <span className="font-semibold text-indigo-600 group-hover:underline">
                    View Details &rarr;
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Integration Details Modal */}
      {activeIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-xs"
                  style={{ backgroundColor: activeIntegration.accentColor }}
                >
                  {React.createElement(
                    ICON_MAP[activeIntegration.iconName] || Boxes,
                    { className: "h-6 w-6" }
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {activeIntegration.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {activeIntegration.category}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        activeIntegration.status === "AVAILABLE"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {activeIntegration.status === "AVAILABLE"
                        ? "Available in Canvas"
                        : "Planned for Phase 2 Engine"}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setActiveIntegration(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-4 text-xs text-slate-600 leading-relaxed">
              {activeIntegration.description}
            </p>

            {/* Triggers and Actions */}
            <div className="mt-5 space-y-4">
              {activeIntegration.metadata?.triggers?.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Available Triggers
                  </h4>
                  <div className="space-y-1.5">
                    {activeIntegration.metadata.triggers.map((t: any) => (
                      <div
                        key={t.name}
                        className="rounded-lg bg-slate-50 border border-slate-200/60 p-2.5 text-xs"
                      >
                        <p className="font-semibold text-slate-900">{t.name}</p>
                        <p className="text-[11px] text-slate-500">{t.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeIntegration.metadata?.actions?.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Available Actions
                  </h4>
                  <div className="space-y-1.5">
                    {activeIntegration.metadata.actions.map((a: any) => (
                      <div
                        key={a.name}
                        className="rounded-lg bg-slate-50 border border-slate-200/60 p-2.5 text-xs"
                      >
                        <p className="font-semibold text-slate-900">{a.name}</p>
                        <p className="text-[11px] text-slate-500">{a.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Authentication Requirements */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 mb-1">
                  <Lock className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Authentication Setup & Credentials</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {activeIntegration.metadata?.authRequirements?.instructions ||
                    "This connector does not require persistent external credentials."}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setActiveIntegration(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
