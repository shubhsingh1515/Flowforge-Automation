"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  FileText,
  Filter,
  User,
  Shield,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export function AuditLogTab() {
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, selectedAction],
    queryFn: () =>
      api.governance.getAuditLogs({
        page,
        limit: 15,
        action: selectedAction || undefined,
      }),
  });

  const auditEvents = data?.data || [];
  const pagination = data?.pagination || { total: 0, totalPages: 1 };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              <span>Workspace Audit Trail & Event History</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Inspect immutable audit records of all administrative actions, policy adjustments, and integration lifecycle events.
            </p>
          </div>

          {/* Action Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              data-testid="audit-action-filter"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none"
            >
              <option value="">All Audit Events</option>
              <option value="GOVERNANCE_POLICY_UPDATED">Policy Updates</option>
              <option value="RETENTION_POLICY_UPDATED">Retention Updates</option>
              <option value="MARKETPLACE_INSTALL">Marketplace Installs</option>
              <option value="MARKETPLACE_UNINSTALL">Marketplace Uninstalls</option>
              <option value="DATA_EXPORT_REQUESTED">Data Exports</option>
              <option value="WORKSPACE_DELETION_REQUESTED">Deletion Requests</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Events Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400 font-medium">Loading audit trail records...</div>
        ) : auditEvents.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No audit events found</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Events matching this filter will be recorded here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target Resource</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditEvents.map((evt: any) => (
                  <tr key={evt.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>{new Date(evt.createdAt).toLocaleString()}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 border border-slate-200">
                        {evt.action}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        {evt.actorType === "ADMIN" ? (
                          <Shield className="h-3.5 w-3.5 text-indigo-600" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <span className="font-mono text-[11px]">{evt.actorId.substring(0, 10)}...</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {evt.targetType}: {evt.targetId.substring(0, 8)}...
                    </td>

                    <td className="py-3 px-4 max-w-xs truncate text-[11px] text-slate-500 font-mono">
                      {evt.metadata ? JSON.stringify(evt.metadata) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} events)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
