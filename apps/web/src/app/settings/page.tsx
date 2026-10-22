"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import { useAuth } from "../../context/AuthContext";
import {
  User,
  Building,
  Shield,
  CreditCard,
  Boxes,
  CheckCircle2,
  Lock,
  Sparkles,
} from "lucide-react";
import { cn } from "../../lib/utils";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"profile" | "workspace" | "security" | "billing">("profile");

  const [name, setName] = useState(user?.name || "");
  const [workspaceName, setWorkspaceName] = useState(user?.workspaceName || "");
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const { data: wsData } = useQuery({
    queryKey: ["current-workspace"],
    queryFn: () => api.workspace.getCurrent(),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: { name: string }) => api.workspace.updateProfile(data),
    onSuccess: async () => {
      await refreshUser();
      setSaveSuccess("Profile updated successfully!");
      setTimeout(() => setSaveSuccess(null), 3000);
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: (newName: string) => api.workspace.updateName(newName),
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["current-workspace"] });
      setSaveSuccess("Workspace name updated successfully!");
      setTimeout(() => setSaveSuccess(null), 3000);
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({ name });
  };

  const handleWorkspaceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateWorkspaceMutation.mutate(workspaceName);
  };

  return (
    <AppShell
      title="Settings"
      description="Manage your user profile, active workspace parameters, and security policies."
    >
      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-slate-200 mb-6 space-x-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("profile")}
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors",
            activeTab === "profile"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <User className="h-4 w-4" />
          <span>Profile</span>
        </button>

        <button
          onClick={() => setActiveTab("workspace")}
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors",
            activeTab === "workspace"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Building className="h-4 w-4" />
          <span>Workspace</span>
        </button>

        <button
          onClick={() => setActiveTab("security")}
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors",
            activeTab === "security"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Shield className="h-4 w-4" />
          <span>Security & Sessions</span>
        </button>

        <button
          onClick={() => setActiveTab("billing")}
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors",
            activeTab === "billing"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <CreditCard className="h-4 w-4" />
          <span>Billing & Usage</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <div className="max-w-xl rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Personal Details</h3>
          <p className="text-xs text-slate-500 mb-6">Manage how you are identified across FlowForge.</p>

          <form onSubmit={handleProfileSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700">Email Address</label>
              <input
                type="email"
                disabled
                value={user?.email || ""}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Email address is your primary login identifier.
              </span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={updateProfileMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-70 transition-colors"
              >
                {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Workspace Tab */}
      {activeTab === "workspace" && (
        <div className="max-w-xl rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Workspace Organization</h3>
          <p className="text-xs text-slate-500 mb-6">Configure tenant boundaries and organization name.</p>

          <form onSubmit={handleWorkspaceSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700">Workspace Name</label>
              <input
                type="text"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700">Workspace Slug</label>
              <input
                type="text"
                disabled
                value={wsData?.workspace?.slug || "personal-workspace"}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 font-mono cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700">Your Membership Role</label>
              <span className="mt-1 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                {user?.role || "OWNER"}
              </span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={updateWorkspaceMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-70 transition-colors"
              >
                {updateWorkspaceMutation.isPending ? "Updating..." : "Update Workspace Name"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === "security" && (
        <div className="max-w-xl rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Session & Authentication</h3>
            <p className="text-xs text-slate-500">
              Current session authenticated via secure HttpOnly JWT credentials.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Active Authentication Token</span>
              <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">
                Valid & Verified
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Sessions are cryptographically signed using HMAC SHA-256 and expire in 7 days.
            </p>
          </div>
        </div>
      )}

      {/* Billing Tab (Clearly Labeled Placeholder as required by spec) */}
      {activeTab === "billing" && (
        <div className="max-w-xl rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Subscription & Usage Limits</h3>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-5 mt-4 text-xs">
            <span className="rounded-full bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 text-[10px] uppercase">
              Phase 3 Feature
            </span>
            <h4 className="mt-2 font-bold text-slate-900">Commercial Billing Deferred</h4>
            <p className="mt-1 text-slate-600 leading-relaxed text-[11px]">
              Payment gateway integration, Stripe checkout webhooks, tiered execution quotas, and team invoicing will be introduced in Phase 3. Phase 1 provides unrestricted local development capabilities.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
