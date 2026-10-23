"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  AlertCircle,
  ExternalLink,
  Eye,
  Check,
  X,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { cn, formatDate } from "../../lib/utils";

export default function ApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [selectedApproval, setSelectedApproval] = useState<any | null>(null);
  const [decisionModal, setDecisionModal] = useState<{
    id: string;
    title: string;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Fetch approvals
  const { data, isLoading } = useQuery({
    queryKey: ["approvals", statusFilter],
    queryFn: () =>
      api.approvals.list({
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
    refetchInterval: (query) => {
      const items = query.state.data?.data || [];
      const hasPending = items.some((a: any) => a.status === "PENDING");
      return hasPending ? 3000 : 10000;
    },
  });

  // Decision mutation
  const decideMutation = useMutation({
    mutationFn: ({
      id,
      decision,
      comment,
    }: {
      id: string;
      decision: "APPROVED" | "REJECTED";
      comment?: string;
    }) => api.approvals.decide(id, { decision, comment }),
    onSuccess: (res, vars) => {
      setNotice(
        `Approval successfully marked as ${vars.decision}! Execution workflow resumed.`
      );
      setDecisionModal(null);
      setDecisionComment("");
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["approvals-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["executions"] });
      setTimeout(() => setNotice(null), 4000);
    },
    onError: (err: any) => {
      alert(err?.message || "Failed to submit approval decision");
    },
  });

  const approvals = data?.data || [];

  return (
    <AppShell
      title="Approvals"
      description="Review workflow steps waiting for human sign-off, inspect payload context, and route decisions."
    >
      {/* Banner */}
      <div className="mb-6 rounded-2xl border border-indigo-100/80 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-white p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6558E8] text-white shadow-sm shadow-[#6558E8]/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">
                  Human-in-the-Loop Workflow Governance
                </span>
                <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-800">
                  Non-blocking Async
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600 leading-relaxed max-w-2xl">
                Workflows paused at an Approval node persist their state safely in PostgreSQL and yield worker resources. Once decided, the execution resumes automatically down the matching branch.
              </p>
            </div>
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["approvals"] })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 flex items-center justify-between shadow-2xs">
          <span className="font-medium">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-800 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white p-1 shadow-2xs">
          {["PENDING", "APPROVED", "REJECTED", "ALL"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                statusFilter === st
                  ? "bg-indigo-50 text-indigo-700 font-semibold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              {st === "ALL" ? "All" : st.charAt(0) + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Approvals Table */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading approvals...</div>
        ) : approvals.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 text-[#6558E8] mb-3 shadow-2xs">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">No approvals in this view</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Workflows configured with an Approval node will show up here when an execution reaches the approval step.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100 text-[11px]">
                <tr>
                  <th className="py-3 px-6">Approval Title</th>
                  <th className="py-3 px-6">Workflow</th>
                  <th className="py-3 px-6">Required Role</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Created At</th>
                  <th className="py-3 px-6">Expires</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {approvals.map((app: any) => (
                  <tr key={app.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-bold text-slate-900">{app.title}</div>
                      {app.description && (
                        <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{app.description}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-6 font-medium text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-slate-400" />
                        <span>{app.workflow?.name || "Workflow"}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-6">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {app.requiredRole || "MEMBER"}
                      </span>
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border",
                          app.status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                            : app.status === "REJECTED"
                            ? "bg-rose-50 text-rose-700 border-rose-200/60"
                            : app.status === "PENDING"
                            ? "bg-purple-50 text-purple-700 border-purple-200/60 animate-pulse"
                            : "bg-slate-100 text-slate-600 border-slate-200/60"
                        )}
                      >
                        {app.status === "APPROVED" ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        ) : app.status === "REJECTED" ? (
                          <XCircle className="h-3 w-3 text-rose-600" />
                        ) : app.status === "PENDING" ? (
                          <Clock className="h-3 w-3 text-purple-600" />
                        ) : (
                          <AlertCircle className="h-3 w-3 text-slate-500" />
                        )}
                        <span>{app.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-slate-500">{formatDate(app.createdAt)}</td>
                    <td className="py-3.5 px-6 text-slate-500">
                      {app.expiresAt ? formatDate(app.expiresAt) : "No expiry"}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Context inspect button */}
                        <button
                          onClick={() => setSelectedApproval(app)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-2xs cursor-pointer"
                          title="Inspect execution context"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Context</span>
                        </button>

                        {/* Approve & Reject buttons for PENDING */}
                        {app.status === "PENDING" && (
                          <>
                            <button
                              onClick={() =>
                                setDecisionModal({
                                  id: app.id,
                                  title: app.title,
                                  decision: "APPROVED",
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer"
                            >
                              <Check className="h-3 w-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() =>
                                setDecisionModal({
                                  id: app.id,
                                  title: app.title,
                                  decision: "REJECTED",
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 transition-colors shadow-2xs cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decision Modal */}
      {decisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {decisionModal.decision === "APPROVED" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-600" />
                )}
                <h3 className="text-sm font-bold text-slate-900">
                  {decisionModal.decision === "APPROVED" ? "Approve Execution" : "Reject Execution"}
                </h3>
              </div>
              <button
                onClick={() => setDecisionModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <p className="text-slate-600">
                You are about to submit a <strong className={decisionModal.decision === "APPROVED" ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>{decisionModal.decision}</strong> decision for:
              </p>
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 font-semibold text-slate-800">
                {decisionModal.title}
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Optional Comment / Reason
                </label>
                <textarea
                  rows={3}
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs focus:bg-white focus:border-[#6558E8] focus:outline-none focus:ring-2 focus:ring-[#6558E8]/20 transition-all"
                  placeholder="Provide any context or notes for the execution record..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDecisionModal(null)}
                className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  decideMutation.mutate({
                    id: decisionModal.id,
                    decision: decisionModal.decision,
                    comment: decisionComment.trim() || undefined,
                  })
                }
                disabled={decideMutation.isPending}
                className={cn(
                  "rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-2xs transition-colors cursor-pointer",
                  decisionModal.decision === "APPROVED"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                )}
              >
                {decideMutation.isPending ? "Submitting..." : `Confirm ${decisionModal.decision}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Inspection Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#6558E8]" />
                  <h3 className="text-sm font-bold text-slate-900">{selectedApproval.title}</h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Approval ID: {selectedApproval.id} • Execution ID: {selectedApproval.executionId}
                </p>
              </div>
              <button
                onClick={() => setSelectedApproval(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-slate-50 border border-slate-200/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">Status</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedApproval.status}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">Required Role</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedApproval.requiredRole}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/60 p-3">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">Created At</span>
                <p className="font-bold text-slate-800 mt-0.5">{formatDate(selectedApproval.createdAt)}</p>
              </div>
            </div>

            {selectedApproval.comment && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <span className="font-semibold text-slate-800 block mb-1">Decision Comment:</span>
                <p className="text-slate-600 italic">"{selectedApproval.comment}"</p>
              </div>
            )}

            {/* Execution Context JSON */}
            <div className="mt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Execution Snapshot Context (Variables & Payload)
              </h4>
              <pre className="rounded-xl bg-slate-950 p-3.5 font-mono text-[11px] text-slate-200 overflow-x-auto max-h-72 border border-slate-800">
                {JSON.stringify(selectedApproval.context || {}, null, 2)}
              </pre>
            </div>

            <div className="mt-6 flex justify-between items-center">
              <Link
                href="/executions"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6558E8] hover:text-[#5345D8]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>View Full Execution History</span>
              </Link>
              <button
                onClick={() => setSelectedApproval(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
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
