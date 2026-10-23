"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { APP_CONFIG } from "@flowforge/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  LayoutDashboard,
  Workflow,
  PlusCircle,
  Boxes,
  Link as LinkIcon,
  History,
  FolderGit2,
  Settings,
  Bell,
  LogOut,
  ChevronDown,
  Sparkles,
  Layers,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
  Store,
  Activity,
  BarChart3,
  GitBranch,
  CheckCircle2,
  Building2,
  Radio,
  Database,
  Brain,
  Users,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function AppShell({ children, title, description, action }: AppShellProps) {
  const { user, logout, isLoading } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const { data: pendingApprovalsData } = useQuery({
    queryKey: ["approvals-pending-count"],
    queryFn: () => api.approvals.list({ status: "PENDING", limit: 1 }),
    enabled: Boolean(user),
    refetchInterval: 10000,
  });

  const pendingCount = pendingApprovalsData?.meta?.total || 0;

  // Real In-App Notifications
  const { data: notifData, refetch: refetchNotifs } = useQuery({
    queryKey: ["workspace-notifications-header"],
    queryFn: () => api.notifications.list({ limit: 8 }),
    enabled: Boolean(user),
    refetchInterval: 10000,
  });

  const unreadNotifCount = notifData?.unreadCount || 0;
  const notificationsList = notifData?.notifications || [];

  const handleMarkAllRead = async () => {
    await api.notifications.markAllAsRead();
    refetchNotifs();
  };

  const handleMarkOneRead = async (id: string) => {
    await api.notifications.markAsRead(id);
    refetchNotifs();
  };

  const navGroups = [
    {
      title: "Core",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Workflows", href: "/workflows", icon: Workflow },
        { label: "AI Builder", href: "/workflows/ai-builder", icon: Sparkles, badge: "AI" },
        { label: "Create Workflow", href: "/workflows/new", icon: PlusCircle, highlight: true },
        {
          label: "Approvals",
          href: "/approvals",
          icon: ShieldCheck,
          badge: pendingCount > 0 ? pendingCount : undefined,
        },
        { label: "Execution History", href: "/executions", icon: History },
      ],
    },
    {
      title: "Integrations & Fabric",
      items: [
        { label: "Integrations", href: "/integrations", icon: Boxes },
        { label: "Connections", href: "/connections", icon: LinkIcon },
        { label: "Templates", href: "/templates", icon: FolderGit2 },
        { label: "Marketplace", href: "/marketplace", icon: Store },
        { label: "Event Fabric", href: "/events", icon: Radio },
      ],
    },
    {
      title: "Intelligence & Data",
      items: [
        { label: "Business Processes", href: "/processes", icon: Layers },
        { label: "Data Products", href: "/data-products", icon: Database },
        { label: "AI Intelligence", href: "/intelligence", icon: Brain, badge: "P24" },
        { label: "Customer Operations", href: "/customers", icon: Users, badge: "P25" },
        { label: "Analytics", href: "/analytics", icon: BarChart3 },
      ],
    },
    {
      title: "Platform & Governance",
      items: [
        { label: "Environments", href: "/environments", icon: GitBranch },
        { label: "Enterprise Governance", href: "/governance", icon: Building2 },
        { label: "Operations", href: "/operations", icon: Activity },
        { label: "System Status", href: "/status", icon: CheckCircle2 },
        { label: "Plans & Pricing", href: "/pricing", icon: Sparkles },
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F5F7FB]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-3 border-[#6558E8] border-t-transparent" />
          <p className="text-xs font-medium text-slate-500">Loading FlowForge Enterprise...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[#F5F7FB] text-slate-900 font-sans">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0B0F19]/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Midnight Navy Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#1E293B] bg-[#101522] text-slate-300 transition-transform duration-200 lg:static lg:translate-x-0 shadow-2xl lg:shadow-none",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-[#1E293B] px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#6558E8] to-[#4336BE] text-white shadow-md shadow-[#6558E8]/25 group-hover:scale-105 transition-transform">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-white">
                  {APP_CONFIG.shortName}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#22B8CF] bg-[#22B8CF]/10 border border-[#22B8CF]/20 px-1.5 py-0.2 rounded">
                  SaaS
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Enterprise Automation</span>
            </div>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-[#171F31] lg:hidden transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Workspace Pill */}
        <div className="px-3.5 py-3 border-b border-[#1E293B]/60">
          <div className="flex items-center justify-between rounded-xl bg-[#171F31] border border-[#24304A] px-3 py-2 shadow-2xs">
            <div className="flex items-center gap-2.5 truncate">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <div className="truncate text-left">
                <p className="text-xs font-semibold text-white truncate leading-tight">
                  {user.workspaceName}
                </p>
                <p className="text-[10px] text-slate-400 capitalize font-medium">
                  {user.role?.toLowerCase() || "Workspace"} Tier
                </p>
              </div>
            </div>
            <div className="h-5 px-1.5 flex items-center justify-center rounded bg-[#24304A] text-[9px] font-mono text-slate-300 font-semibold border border-white/5">
              PRO
            </div>
          </div>
        </div>

        {/* Grouped Navigation Items */}
        <nav className="flex-1 space-y-4 px-3 py-3 overflow-y-auto midnight-scrollbar">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="px-3 text-[10px] font-bold tracking-wider uppercase text-slate-500">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150",
                        isActive
                          ? "bg-[#171F31] text-white font-semibold shadow-xs border-l-2 border-[#6558E8] pl-2.5"
                          : "text-slate-400 hover:bg-[#171F31]/70 hover:text-slate-200",
                        item.highlight && !isActive && "text-indigo-400 hover:text-indigo-300 hover:bg-[#171F31]/80"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isActive
                              ? "text-[#6558E8]"
                              : item.highlight
                              ? "text-indigo-400"
                              : "text-slate-500 group-hover:text-slate-300"
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold shadow-2xs tabular-nums",
                            item.badge === "AI"
                              ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                              : item.badge === "P24" || item.badge === "P25"
                              ? "bg-[#22B8CF]/20 text-[#22B8CF] border border-[#22B8CF]/30"
                              : "bg-amber-500 text-white"
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Architecture Status Footer */}
        <div className="p-3.5 border-t border-[#1E293B]">
          <div className="rounded-xl bg-[#171F31]/90 p-3 border border-[#24304A] shadow-inner">
            <div className="flex items-center justify-between text-xs font-semibold text-white">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#6558E8]" />
                <span className="text-[11px]">FlowForge Core</span>
              </div>
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/20 px-1 rounded">
                v25.0
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
              Deterministic Twin, Event Fabric, Lineage & Journey Ops Active.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/90 bg-white/95 px-6 backdrop-blur-md shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden transition-colors"
              aria-label="Open Navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden sm:flex items-center text-xs text-slate-400 gap-2 font-medium">
              <span className="font-semibold text-slate-600">{APP_CONFIG.shortName}</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-800 capitalize font-medium">
                {pathname.replace("/", "").split("/")[0] || "Dashboard"}
              </span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2.5">
            {/* Notifications Menu */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                title="Notifications"
                data-testid="btn-notifications-menu"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifCount > 0 && (
                  <span
                    data-testid="notifications-badge"
                    className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white shadow-xs"
                  >
                    {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div
                  data-testid="notifications-dropdown"
                  className="absolute right-0 mt-2 w-96 rounded-2xl border border-slate-200/90 bg-white shadow-xl z-50 overflow-hidden animate-fade-in"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">Notifications</span>
                      {unreadNotifCount > 0 && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                          {unreadNotifCount} new
                        </span>
                      )}
                    </div>
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        data-testid="btn-mark-all-read"
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {notificationsList.length > 0 ? (
                      notificationsList.map((n: any) => (
                        <div
                          key={n.id}
                          className={cn(
                            "p-3.5 hover:bg-slate-50 transition space-y-1",
                            !n.read && "bg-indigo-50/30"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={cn(
                                "font-semibold text-slate-900 text-xs",
                                !n.read && "font-bold text-indigo-950"
                              )}
                            >
                              {n.title}
                            </span>
                            {!n.read && (
                              <button
                                onClick={() => handleMarkOneRead(n.id)}
                                className="text-[10px] text-indigo-600 hover:underline shrink-0"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">{n.message}</p>
                          <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                            <span>
                              {new Date(n.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {n.link && (
                              <Link
                                href={n.link}
                                onClick={() => {
                                  if (!n.read) handleMarkOneRead(n.id);
                                  setNotificationsOpen(false);
                                }}
                                className="text-indigo-600 hover:underline font-semibold"
                              >
                                View Details →
                              </Link>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-400">
                        <CheckCircle2 className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
                        <p className="font-semibold text-slate-700">All caught up!</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">No active alerts or notifications.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-[#6558E8] to-[#4336BE] text-white font-bold text-[11px] shadow-2xs">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="hidden md:inline font-semibold text-slate-800">{user.name}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-dropdown z-50 animate-fade-in">
                  <div className="border-b border-slate-100 px-3.5 py-2.5 text-xs">
                    <p className="font-semibold text-slate-900">{user.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5 text-slate-400" />
                      <span>Workspace Settings</span>
                    </Link>

                    <a
                      href="http://localhost:4000/api/v1/docs"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                      <span>OpenAPI Docs</span>
                    </a>
                  </div>

                  <div className="border-t border-slate-100 my-1" />

                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-5 sm:p-6 md:p-8">
          {(title || action) && (
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {title && (
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    {title}
                  </h1>
                )}
                {description && (
                  <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-relaxed">{description}</p>
                )}
              </div>
              {action && <div className="flex items-center gap-2.5 shrink-0">{action}</div>}
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
