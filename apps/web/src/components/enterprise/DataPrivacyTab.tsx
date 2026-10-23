"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Database,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Save,
  Clock,
  ShieldAlert,
} from "lucide-react";

export function DataPrivacyTab() {
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Retention State
  const [executionDays, setExecutionDays] = useState(30);
  const [deliveryDays, setDeliveryDays] = useState(14);
  const [auditDays, setAuditDays] = useState(90);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Deletion Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");

  const { data: currentWorkspace } = useQuery({
    queryKey: ["current-workspace"],
    queryFn: () => api.workspace.getCurrent(),
  });

  const { data: policy, isLoading } = useQuery({
    queryKey: ["retention-policy"],
    queryFn: () => api.dataRetention.getPolicy(),
  });

  React.useEffect(() => {
    if (policy && !hasInitialized) {
      setExecutionDays(policy.executionRetentionDays);
      setDeliveryDays(policy.webhookDeliveryRetentionDays);
      setAuditDays(policy.auditLogRetentionDays);
      setHasInitialized(true);
    }
  }, [policy, hasInitialized]);

  const updateRetentionMutation = useMutation({
    mutationFn: (body: any) => api.dataRetention.updatePolicy(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["retention-policy"] });
      setSuccessMessage("Retention policies successfully saved.");
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to update retention policy");
    },
  });

  const requestExportMutation = useMutation({
    mutationFn: () => api.dataRetention.requestExport(),
    onSuccess: (data) => {
      setSuccessMessage(`Data export completed! ${data.recordCount} records generated (${(data.fileSizeBytes / 1024).toFixed(1)} KB).`);
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to request data export");
    },
  });

  const requestDeletionMutation = useMutation({
    mutationFn: (body: { reason: string; confirmationPhrase: string }) =>
      api.dataRetention.requestDeletion(body),
    onSuccess: (data) => {
      setSuccessMessage(data.message);
      setShowDeleteModal(false);
      setDeletionReason("");
      setConfirmationPhrase("");
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Deletion request failed");
    },
  });

  const handleSaveRetention = () => {
    updateRetentionMutation.mutate({
      executionRetentionDays: executionDays,
      webhookDeliveryRetentionDays: deliveryDays,
      auditLogRetentionDays: auditDays,
    });
  };

  const handleConfirmDeletion = (e: React.FormEvent) => {
    e.preventDefault();
    requestDeletionMutation.mutate({
      reason: deletionReason,
      confirmationPhrase,
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-slate-400 font-medium">Loading data privacy settings...</div>;
  }

  const workspaceName = currentWorkspace?.workspace?.name || "Workspace";

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Database className="h-5 w-5 text-indigo-600" />
          <span>Customer Data Rights, Retention & Privacy</span>
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xl">
          Configure automated data retention windows, trigger portable tenant exports, and manage workspace deprovisioning in compliance with GDPR and CCPA.
        </p>
      </div>

      {successMessage && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 1. Retention Windows Config */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-600" />
              <span>Automated Record Retention Windows</span>
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Historical execution traces, outbound webhook logs, and audit entries exceeding these limits are automatically purged.
            </p>
          </div>
          <button
            onClick={handleSaveRetention}
            disabled={updateRetentionMutation.isPending}
            data-testid="save-retention-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save Retention</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Workflow Execution History ({executionDays} days)
            </label>
            <input
              type="range"
              min={7}
              max={180}
              step={7}
              value={executionDays}
              onChange={(e) => setExecutionDays(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">Active workflow definitions are never deleted.</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Outbound Webhook Deliveries ({deliveryDays} days)
            </label>
            <input
              type="range"
              min={3}
              max={60}
              step={1}
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">Retains delivery logs and payload receipts.</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Audit Log Trail ({auditDays} days)
            </label>
            <input
              type="range"
              min={7}
              max={365}
              step={7}
              value={auditDays}
              onChange={(e) => setAuditDays(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">Plan limit applies (Upgrade to Business for 365d).</span>
          </div>
        </div>
      </div>

      {/* 2. Portable Data Export */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Download className="h-4 w-4 text-indigo-600" />
              <span>Export Workspace Data (GDPR / CCPA)</span>
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Generate a portable, machine-readable JSON bundle containing workflows, connected accounts metadata, and audit records. Passwords, private keys, and OAuth access tokens are strictly excluded.
            </p>
          </div>

          <button
            onClick={() => requestExportMutation.mutate()}
            disabled={requestExportMutation.isPending}
            data-testid="request-export-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition shadow-2xs self-start sm:self-auto"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span>{requestExportMutation.isPending ? "Generating Export..." : "Request Data Export"}</span>
          </button>
        </div>
      </div>

      {/* 3. Dangerous Zone: Workspace Deletion */}
      <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-rose-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>Deprovision & Delete Workspace</span>
            </h4>
            <p className="text-xs text-rose-700 mt-1 max-w-xl">
              Permanently schedule this workspace and all associated automations for removal. Includes a 14-day grace period during which cancellation is permitted.
            </p>
          </div>

          <button
            onClick={() => setShowDeleteModal(true)}
            data-testid="delete-workspace-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition shadow-2xs self-start sm:self-auto"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Workspace</span>
          </button>
        </div>
      </div>

      {/* Deletion Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
              <ShieldAlert className="h-5 w-5" />
              <span>Confirm Workspace Deletion</span>
            </div>

            <p className="text-xs text-slate-600">
              This action initiates permanent deprovisioning of all workflows, webhooks, and execution history. To confirm, type the workspace name <span className="font-bold text-slate-900">"{workspaceName}"</span> below.
            </p>

            <form onSubmit={handleConfirmDeletion} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Leaving</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Migrating to private VPC"
                  value={deletionReason}
                  onChange={(e) => setDeletionReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirmation Phrase</label>
                <input
                  type="text"
                  required
                  placeholder={workspaceName}
                  value={confirmationPhrase}
                  onChange={(e) => setConfirmationPhrase(e.target.value)}
                  data-testid="delete-confirmation-input"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requestDeletionMutation.isPending}
                  data-testid="confirm-delete-workspace-btn"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition"
                >
                  {requestDeletionMutation.isPending ? "Scheduling..." : "Confirm Deletion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
