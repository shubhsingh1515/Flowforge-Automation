"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { APP_CONFIG } from "@flowforge/shared";
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
  Search,
  LogOut,
  User as UserIcon,
  ChevronDown,
  Sparkles,
  Layers,
  Menu,
  X,
  ExternalLink,
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

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Workflows", href: "/workflows", icon: Workflow },
    { label: "Create Workflow", href: "/workflows/new", icon: PlusCircle, highlight: true },
    { label: "Integrations", href: "/integrations", icon: Boxes },
    { label: "Connections", href: "/connections", icon: LinkIcon },
    { label: "Execution History", href: "/executions", icon: History },
    { label: "Templates", href: "/templates", icon: FolderGit2 },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-3 border-indigo-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">Loading FlowForge...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/80 bg-white transition-transform duration-200 lg:static lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-6">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-200">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-slate-900">
                {APP_CONFIG.shortName}
              </span>
              <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                Automation
              </span>
            </div>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="rounded p-1 text-slate-400 hover:text-slate-600 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Workspace pill */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200/60 px-3 py-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
            <div className="truncate text-xs">
              <p className="font-semibold text-slate-800 truncate">{user.workspaceName}</p>
              <p className="text-[11px] text-slate-500 capitalize">{user.role?.toLowerCase() || "Workspace"}</p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
          {navItems.map((item) => {
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
                  "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 shadow-xs font-semibold"
                    : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
                  item.highlight && !isActive && "text-indigo-600 hover:bg-indigo-50/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      isActive ? "text-indigo-600" : "text-slate-400"
                    )}
                  />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Phase 1 Badge Footer */}
        <div className="p-4 border-t border-slate-100">
          <div className="rounded-xl bg-gradient-to-br from-indigo-50/60 to-slate-50 p-3 border border-indigo-100/50">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              <span>Phase 1 Architecture</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Foundation, UI, database models & React Flow canvas active. Execution engine in Phase 2.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 px-6 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden sm:flex items-center text-xs text-slate-400 gap-1.5 font-medium">
              <span>{APP_CONFIG.shortName}</span>
              <span>/</span>
              <span className="text-slate-700 capitalize">
                {pathname.replace("/", "").split("/")[0] || "Dashboard"}
              </span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            {/* Notifications Menu */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg z-50">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-semibold text-slate-900">Notifications</span>
                    <span className="text-[10px] text-slate-400">Phase 1</span>
                  </div>
                  <div className="py-6 text-center text-xs text-slate-500">
                    <p className="font-medium">No new notifications</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Live execution alerts and status reports will appear here in Phase 2.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px]">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="hidden md:inline font-semibold">{user.name}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-50">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs">
                    <p className="font-semibold text-slate-900">{user.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                  </div>

                  <Link
                    href="/settings"
                    onClick={() => setUserDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Settings className="h-3.5 w-3.5 text-slate-400" />
                    <span>Workspace Settings</span>
                  </Link>

                  <a
                    href="http://localhost:4000/api/v1/docs"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    <span>OpenAPI Docs</span>
                  </a>

                  <div className="border-t border-slate-100 my-1" />

                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50"
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
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {(title || action) && (
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {title && (
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    {title}
                  </h1>
                )}
                {description && (
                  <p className="mt-1 text-sm text-slate-500">{description}</p>
                )}
              </div>
              {action && <div className="flex items-center gap-3">{action}</div>}
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
