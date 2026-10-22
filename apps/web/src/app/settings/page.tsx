"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import { useAuth } from "../../context/AuthContext";
import {
  User,
  Building,
  Shield,
  CreditCard,
  Users,
  CheckCircle2,
  AlertCircle,
  Zap,
  ArrowUpRight,
  ExternalLink,
  Trash2,
  Mail,
  RefreshCw,
  Plus,
  Key,
  Webhook,
  Code2,
} from "lucide-react";
import { ApiKeysTab } from "../../components/developer/ApiKeysTab";
import { OutboundWebhooksTab } from "../../components/developer/OutboundWebhooksTab";
import { CustomIntegrationsTab } from "../../components/developer/CustomIntegrationsTab";
import { cn } from "../../lib/utils";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"profile" | "workspace" | "members" | "billing" | "security" | "api-keys" | "webhooks" | "custom-integrations">("profile");

  const [name, setName] = useState(user?.name || "");
  const [workspaceName, setWorkspaceName] = useState(user?.workspaceName || "");
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Invite member form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Queries
  const { data: wsData } = useQuery({
    queryKey: ["current-workspace"],
    queryFn: () => api.workspace.getCurrent(),
  });

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ["workspace-subscription"],
    queryFn: () => api.billing.getSubscription(),
  });

  const { data: usageData } = useQuery({
    queryKey: ["workspace-usage"],
    queryFn: () => api.billing.getUsage(),
  });

  const { data: inviteData } = useQuery({
    queryKey: ["workspace-invitations"],
    queryFn: () => api.members.listInvitations(),
  });

  // Mutations
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

  const inviteMemberMutation = useMutation({
    mutationFn: (data: { email: string; role: string }) => api.members.invite(data.email, data.role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-invitations"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-subscription"] });
      setShowInviteModal(false);
      setInviteEmail("");
      setSaveSuccess("Invitation sent successfully!");
      setTimeout(() => setSaveSuccess(null), 3000);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to invite member.");
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => api.members.revokeInvitation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-invitations"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-subscription"] });
      setSaveSuccess("Invitation revoked.");
      setTimeout(() => setSaveSuccess(null), 3000);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.members.removeMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-workspace"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-subscription"] });
      setSaveSuccess("Member removed from workspace.");
      setTimeout(() => setSaveSuccess(null), 3000);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to remove member.");
    },
  });

  const portalMutation = useMutation({
    mutationFn: () => api.billing.createPortal(),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to open customer portal.");
    },
  });

  const cancelSubMutation = useMutation({
    mutationFn: () => api.billing.cancelSubscription(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-subscription"] });
      setSaveSuccess("Subscription cancellation scheduled for period end.");
      setTimeout(() => setSaveSuccess(null), 3000);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to cancel subscription.");
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

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    inviteMemberMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const plan = subData?.plan;
  const quotas = subData?.quotas;
  const isOwner = user?.role === "OWNER";
  const isAdmin = user?.role === "OWNER" || user?.role === "ADMIN";

  return (
    <AppShell
      title="Settings & Workspace Governance"
      description="Manage your profile, team members, subscription billing, and execution quotas."
    >
      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-slate-200 mb-6 space-x-6 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => { setActiveTab("profile"); setActionError(null); }}
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === "profile"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <User className="h-4 w-4" />
          <span>Profile</span>
        </button>

        <button
          onClick={() => { setActiveTab("workspace"); setActionError(null); }}
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === "workspace"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Building className="h-4 w-4" />
          <span>Workspace</span>
        </button>

        <button
          onClick={() => { setActiveTab("members"); setActionError(null); }}
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === "members"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Users className="h-4 w-4" />
          <span>Team & Members</span>
        </button>

        <button
          onClick={() => { setActiveTab("billing"); setActionError(null); }}
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === "billing"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <CreditCard className="h-4 w-4" />
          <span>Billing & Usage</span>
        </button>

        <button
          onClick={() => { setActiveTab("security"); setActionError(null); }}
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === "security"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Shield className="h-4 w-4" />
          <span>Security & Sessions</span>
        </button>

        <button
          onClick={() => { setActiveTab("api-keys"); setActionError(null); }}
          data-testid="tab-api-keys"
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === "api-keys"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Key className="h-4 w-4" />
          <span>API Keys</span>
        </button>

        <button
          onClick={() => { setActiveTab("webhooks"); setActionError(null); }}
          data-testid="tab-webhooks"
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === "webhooks"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Webhook className="h-4 w-4" />
          <span>Webhooks</span>
        </button>

        <button
          onClick={() => { setActiveTab("custom-integrations"); setActionError(null); }}
          data-testid="tab-custom-integrations"
          className={cn(
            "pb-3 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === "custom-integrations"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Code2 className="h-4 w-4" />
          <span>Custom Integrations</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="mb-6 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* 1. Profile Tab */}
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

      {/* 2. Workspace Organization Tab */}
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

      {/* 3. Team & Members Tab */}
      {activeTab === "members" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Workspace Members & Access</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage roles and invite collaborators. Current member limit:{" "}
                <span className="font-semibold text-slate-800">{quotas?.members.current} / {quotas?.members.limit}</span>
              </p>
            </div>

            {isAdmin && (
              <button
                onClick={() => { setShowInviteModal(true); setActionError(null); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition"
              >
                <Plus className="h-4 w-4" />
                <span>Invite Member</span>
              </button>
            )}
          </div>

          {/* Active Members Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Active Members</h4>
              <span className="text-xs text-slate-500">{wsData?.workspace?.members?.length || 1} members</span>
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                  <th className="py-2.5 px-5">Name & Email</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {wsData?.workspace?.members?.map((m: any) => (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-5">
                      <p className="font-semibold text-slate-900">{m.name}</p>
                      <p className="text-slate-500 text-[11px]">{m.email}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        m.role === "OWNER"
                          ? "bg-purple-100 text-purple-700"
                          : m.role === "ADMIN"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-slate-100 text-slate-700"
                      }`}>
                        {m.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isOwner && m.role !== "OWNER" && (
                        <button
                          onClick={() => removeMemberMutation.mutate(m.id)}
                          disabled={removeMemberMutation.isPending}
                          className="text-slate-400 hover:text-rose-600 transition p-1"
                          title="Remove Member"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pending Invitations Table */}
          {inviteData?.invitations && inviteData.invitations.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Pending Invitations</h4>
                <span className="text-xs text-slate-500">{inviteData.invitations.length} pending</span>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                    <th className="py-2.5 px-5">Invited Email</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Expires In</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inviteData.invitations.map((inv: any) => (
                    <tr key={inv.id}>
                      <td className="py-3 px-5 font-medium text-slate-800">{inv.email}</td>
                      <td className="py-3 px-4">
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                          {inv.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isAdmin && (
                          <button
                            onClick={() => revokeInviteMutation.mutate(inv.id)}
                            className="text-rose-600 hover:text-rose-700 text-xs font-semibold"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Invite Modal */}
          {showInviteModal && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Invite Team Member</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Send a secure 7-day invitation link to collaborate in this workspace.
                </p>

                <form onSubmit={handleInviteSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="colleague@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Access Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-600 focus:outline-none"
                    >
                      <option value="MEMBER">Member (Can edit and run workflows)</option>
                      <option value="ADMIN">Admin (Can manage team & billing)</option>
                    </select>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviteMemberMutation.isPending}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {inviteMemberMutation.isPending ? "Sending..." : "Send Invitation"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Billing & Usage Tab */}
      {activeTab === "billing" && (
        <div className="space-y-8 max-w-4xl">
          {/* Subscription Banner */}
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/50 via-white to-purple-50/30 p-6 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Current Plan</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    plan?.tier === "BUSINESS"
                      ? "bg-purple-600 text-white"
                      : plan?.tier === "PRO"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-200 text-slate-800"
                  }`}>
                    {plan?.name || "Free"}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    subData?.subscription?.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}>
                    {subData?.subscription?.status || "ACTIVE"}
                  </span>
                </div>

                <p className="text-xl font-extrabold text-slate-900 mt-2">
                  ${(plan?.priceMonthlyCents || 0) / 100} / month
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {subData?.subscription?.currentPeriodEnd
                    ? `Renews on ${new Date(subData.subscription.currentPeriodEnd).toLocaleDateString()}`
                    : "Standard monthly billing cycle"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition shadow-xs"
                >
                  <Zap className="h-4 w-4" />
                  <span>Change Plan</span>
                </Link>

                {isAdmin && (
                  <button
                    onClick={() => portalMutation.mutate()}
                    disabled={portalMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition shadow-2xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    <span>Manage Portal</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Usage Gauges Grid */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
              Monthly Quotas & Consumption
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Executions Gauge */}
              <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
                  <span className="font-semibold text-slate-700">Workflow Runs</span>
                  <span>{quotas?.executions ? Math.round((quotas.executions.current / quotas.executions.limit) * 100) : 0}%</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {quotas?.executions?.current || 0}{" "}
                  <span className="text-xs font-normal text-slate-400">/ {quotas?.executions?.limit.toLocaleString()}</span>
                </p>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      quotas?.executions && quotas.executions.current >= quotas.executions.limit
                        ? "bg-rose-500"
                        : "bg-indigo-600"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        quotas?.executions ? (quotas.executions.current / quotas.executions.limit) * 100 : 0
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Active Workflows Gauge */}
              <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
                  <span className="font-semibold text-slate-700">Active Workflows</span>
                  <span>{quotas?.activeWorkflows ? Math.round((quotas.activeWorkflows.current / quotas.activeWorkflows.limit) * 100) : 0}%</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {quotas?.activeWorkflows?.current || 0}{" "}
                  <span className="text-xs font-normal text-slate-400">/ {quotas?.activeWorkflows?.limit}</span>
                </p>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-purple-600 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        quotas?.activeWorkflows ? (quotas.activeWorkflows.current / quotas.activeWorkflows.limit) * 100 : 0
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Members Gauge */}
              <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
                  <span className="font-semibold text-slate-700">Team Members</span>
                  <span>{quotas?.members ? Math.round((quotas.members.current / quotas.members.limit) * 100) : 0}%</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {quotas?.members?.current || 0}{" "}
                  <span className="text-xs font-normal text-slate-400">/ {quotas?.members?.limit}</span>
                </p>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-emerald-600 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        quotas?.members ? (quotas.members.current / quotas.members.limit) * 100 : 0
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Connected Accounts Gauge */}
              <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
                <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
                  <span className="font-semibold text-slate-700">Integrations</span>
                  <span>{quotas?.connectedAccounts ? Math.round((quotas.connectedAccounts.current / quotas.connectedAccounts.limit) * 100) : 0}%</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {quotas?.connectedAccounts?.current || 0}{" "}
                  <span className="text-xs font-normal text-slate-400">/ {quotas?.connectedAccounts?.limit}</span>
                </p>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-blue-600 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        quotas?.connectedAccounts ? (quotas.connectedAccounts.current / quotas.connectedAccounts.limit) * 100 : 0
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Recent Usage Ledger */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
              Recent Audited Metering Events
            </h4>

            {usageData?.history && usageData.history.length > 0 ? (
              <div className="divide-y divide-slate-100 text-xs">
                {usageData.history.slice(0, 5).map((evt: any) => (
                  <div key={evt.id} className="py-2.5 flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-slate-800">{evt.metricType}</p>
                      <p className="text-[11px] text-slate-400 font-mono">Exec ID: {evt.executionId || "manual"}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-900">+{evt.quantity} run</span>
                      <p className="text-[11px] text-slate-400">{new Date(evt.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No usage recorded in the current billing cycle.</p>
            )}
          </div>

          {/* Cancellation section */}
          {isOwner && plan?.tier !== "FREE" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-6 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-rose-900">Cancel Subscription</h4>
                <p className="text-xs text-rose-700 mt-0.5">
                  Your workspace will remain on the {plan?.name} plan until the end of your billing cycle.
                </p>
              </div>

              <button
                onClick={() => {
                  if (confirm("Are you sure you want to cancel your subscription?")) {
                    cancelSubMutation.mutate();
                  }
                }}
                disabled={cancelSubMutation.isPending}
                className="px-4 py-2 rounded-lg border border-rose-300 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition"
              >
                {cancelSubMutation.isPending ? "Cancelling..." : "Cancel Subscription"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. Security Tab */}
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

      {/* 6. Developer Platform: API Keys Tab */}
      {activeTab === "api-keys" && <ApiKeysTab />}

      {/* 7. Developer Platform: Outbound Webhooks Tab */}
      {activeTab === "webhooks" && <OutboundWebhooksTab />}

      {/* 8. Developer Platform: Custom Integrations Tab */}
      {activeTab === "custom-integrations" && <CustomIntegrationsTab />}
    </AppShell>
  );
}
