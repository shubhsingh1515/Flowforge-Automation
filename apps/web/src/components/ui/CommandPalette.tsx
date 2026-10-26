"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Workflow,
  PlusCircle,
  Boxes,
  Link as LinkIcon,
  History,
  FolderGit2,
  Settings,
  ShieldCheck,
  Store,
  Activity,
  BarChart3,
  GitBranch,
  Radio,
  Database,
  Brain,
  Users,
  DollarSign,
  Target,
  Layers,
  Sparkles,
  ArrowRight,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface CommandItem {
  id: string;
  title: string;
  category: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  keywords?: string[];
}

const COMMAND_ITEMS: CommandItem[] = [
  // Workspace & Core
  { id: "dash", title: "Dashboard Overview", category: "Workspace", href: "/dashboard", icon: LayoutDashboard, keywords: ["home", "metrics"] },
  { id: "wf-list", title: "All Workflows", category: "Workspace", href: "/workflows", icon: Workflow, keywords: ["automations", "flows"] },
  { id: "wf-new", title: "Create New Workflow", category: "Workspace", href: "/workflows/new", icon: PlusCircle, badge: "Action", keywords: ["add", "build"] },
  { id: "wf-ai", title: "AI Workflow Builder", category: "Workspace", href: "/workflows/ai-builder", icon: Sparkles, badge: "AI", keywords: ["generate", "prompt"] },
  { id: "execs", title: "Execution History", category: "Workspace", href: "/executions", icon: History, keywords: ["runs", "logs", "failures"] },
  { id: "approvals", title: "Pending Approvals", category: "Workspace", href: "/approvals", icon: ShieldCheck, keywords: ["gates", "review"] },
  { id: "templates", title: "Workflow Templates", category: "Workspace", href: "/templates", icon: FolderGit2, keywords: ["starters", "library"] },

  // Integrations & Fabric
  { id: "integrations", title: "Integrations Catalog", category: "Integrations & Fabric", href: "/integrations", icon: Boxes, keywords: ["slack", "github", "connectors"] },
  { id: "connections", title: "Active Connections & OAuth", category: "Integrations & Fabric", href: "/connections", icon: LinkIcon, keywords: ["credentials", "auth"] },
  { id: "events", title: "Event Fabric & Streams", category: "Integrations & Fabric", href: "/events", icon: Radio, keywords: ["webhooks", "topics", "dlq"] },
  { id: "marketplace", title: "Marketplace & Extensions", category: "Integrations & Fabric", href: "/marketplace", icon: Store, keywords: ["community", "plugins"] },

  // Intelligence & Data
  { id: "analytics", title: "Analytics & Telemetry", category: "Intelligence & Data", href: "/analytics", icon: BarChart3, keywords: ["charts", "kpi", "performance"] },
  { id: "intelligence", title: "AI Intelligence & Proposals", category: "Intelligence & Data", href: "/intelligence", icon: Brain, badge: "P24", keywords: ["recommendations", "decisions"] },
  { id: "processes", title: "Business Process Mining", category: "Intelligence & Data", href: "/processes", icon: Layers, keywords: ["orchestration", "bottlenecks"] },
  { id: "data-products", title: "Governed Data Products", category: "Intelligence & Data", href: "/data-products", icon: Database, keywords: ["lineage", "pipelines"] },
  { id: "customers", title: "Customer Operations & 360", category: "Intelligence & Data", href: "/customers", icon: Users, badge: "P25", keywords: ["accounts", "health", "journey"] },
  { id: "revenue", title: "Revenue Intelligence & Retention", category: "Intelligence & Data", href: "/revenue", icon: DollarSign, badge: "P26", keywords: ["contracts", "renewals", "expansion", "arr", "risk"] },
  { id: "account-planning", title: "Strategic Account Planning & Portfolio", category: "Intelligence & Data", href: "/account-planning", icon: Target, badge: "P27", keywords: ["strategic", "portfolio", "objectives", "stakeholders", "ebr", "qbr", "plan"] },

  // Operations & Governance
  { id: "environments", title: "Environments & Digital Twin", category: "Platform & Reliability", href: "/environments", icon: GitBranch, keywords: ["simulation", "chaos", "staging"] },
  { id: "operations", title: "Operations & Incident Center", category: "Platform & Reliability", href: "/operations", icon: Activity, keywords: ["health", "remediations", "slo"] },
  { id: "status", title: "Public System Status", category: "Platform & Reliability", href: "/status", icon: Activity, keywords: ["uptime", "incidents"] },
  { id: "governance", title: "Enterprise Governance & Audit", category: "Governance & Settings", href: "/governance", icon: ShieldCheck, keywords: ["compliance", "logs", "security"] },
  { id: "settings", title: "Workspace Settings", category: "Governance & Settings", href: "/settings", icon: Settings, keywords: ["team", "billing", "api keys", "sso"] },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredItems = COMMAND_ITEMS.filter((item) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const titleMatch = item.title.toLowerCase().includes(q);
    const catMatch = item.category.toLowerCase().includes(q);
    const keywordMatch = item.keywords?.some((k) => k.toLowerCase().includes(q));
    return titleMatch || catMatch || keywordMatch;
  });

  const handleSelect = (item: CommandItem) => {
    onClose();
    router.push(item.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(filteredItems[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 bg-[#0B0F19]/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="w-full max-w-xl rounded-2xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 bg-slate-50/60">
          <Search className="h-4 w-4 text-[#6558E8] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search platform (e.g. Workflows, Events, AI)..."
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-slate-400 hover:text-slate-600 rounded p-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-slate-500 shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredItems.length > 0 ? (
            <div className="space-y-1">
              {filteredItems.map((item, index) => {
                const Icon = item.icon;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs text-left transition-colors",
                      isSelected
                        ? "bg-indigo-50/80 text-[#6558E8] font-semibold"
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                          isSelected
                            ? "bg-white border-indigo-200 text-[#6558E8] shadow-2xs"
                            : "bg-slate-100 border-slate-200/60 text-slate-500"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="truncate">
                        <p className="truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 font-normal">{item.category}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.badge && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.2 text-[9px] font-bold uppercase",
                            item.badge === "AI"
                              ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                              : item.badge === "Action"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-[#22B8CF]/15 text-[#22B8CF]"
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                      {isSelected && <ArrowRight className="h-3.5 w-3.5 text-[#6558E8]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              <Search className="h-6 w-6 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">No matching commands found</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Try searching for &quot;workflow&quot;, &quot;events&quot;, or &quot;settings&quot;</p>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[9px]">↑</kbd>
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[9px]">↓</kbd>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[9px]">↵</kbd>
              <span>to select</span>
            </span>
          </div>
          <span>FlowForge Command Center</span>
        </div>
      </div>
    </div>
  );
}
