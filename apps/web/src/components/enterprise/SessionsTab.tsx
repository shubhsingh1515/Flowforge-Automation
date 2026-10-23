"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Shield,
  Laptop,
  Smartphone,
  Globe,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  LogOut,
} from "lucide-react";

export function SessionsTab() {
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch active sessions
  const { data: sessionData, isLoading } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: () => api.sessions.list(),
  });

  // Revoke single session
  const revokeSingleMutation = useMutation({
    mutationFn: (id: string) => api.sessions.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-sessions"] });
      setSuccessMsg("Session revoked successfully.");
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to revoke session.");
    },
  });

  // Revoke all other sessions
  const revokeAllOthersMutation = useMutation({
    mutationFn: () => api.sessions.revokeAllOthers(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["active-sessions"] });
      setSuccessMsg(`Successfully revoked ${res.revokedCount} other active sessions.`);
      setTimeout(() => setSuccessMsg(null), 3500);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || "Failed to revoke other sessions.");
    },
  });

  const getDeviceIcon = (userAgent?: string) => {
    if (!userAgent) return <Globe className="h-4 w-4 text-slate-400" />;
    const lower = userAgent.toLowerCase();
    if (lower.includes("mobile") || lower.includes("android") || lower.includes("iphone")) {
      return <Smartphone className="h-4 w-4 text-slate-400" />;
    }
    return <Laptop className="h-4 w-4 text-slate-400" />;
  };

  const formatUserAgent = (userAgent?: string) => {
    if (!userAgent) return "Unknown device";
    if (userAgent.length > 60) return userAgent.substring(0, 57) + "...";
    return userAgent;
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="sessions-tab">
      {/* Header */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">
                Active Sessions & Token Security
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Monitor active logins across your browsers and devices. You can terminate untrusted or stale sessions at any time.
            </p>
          </div>

          <button
            onClick={() => {
              if (confirm("Terminate all active sessions across other devices? You will remain signed in only on this device.")) {
                revokeAllOthersMutation.mutate();
              }
            }}
            disabled={revokeAllOthersMutation.isPending}
            data-testid="btn-revoke-all-other-sessions"
            className="px-3.5 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            {revokeAllOthersMutation.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            <span>Revoke All Other Sessions</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Active Sessions List */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Active Logged-in Devices ({sessionData?.sessions?.length || 0})
          </h4>
          <span className="text-xs text-slate-500">
            Validated against revocation list
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-400" />
            Loading active sessions...
          </div>
        ) : sessionData?.sessions && sessionData.sessions.length > 0 ? (
          <div className="divide-y divide-slate-100 text-xs">
            {sessionData.sessions.map((sess: any) => (
              <div
                key={sess.id}
                className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition"
                data-testid={`session-row-${sess.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                    {getDeviceIcon(sess.userAgent)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {formatUserAgent(sess.userAgent)}
                      </span>
                      {sess.isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                          Current Device
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 space-x-2">
                      <span>IP: <span className="font-mono">{sess.ipAddress || "Unknown IP"}</span></span>
                      <span>•</span>
                      <span>Started: {new Date(sess.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>Expires: {new Date(sess.expiresAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  {!sess.isCurrent ? (
                    <button
                      onClick={() => {
                        if (confirm("Revoke this session? The device will be signed out immediately.")) {
                          revokeSingleMutation.mutate(sess.id);
                        }
                      }}
                      disabled={revokeSingleMutation.isPending}
                      className="text-rose-600 hover:text-rose-800 text-xs font-semibold px-2 py-1"
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">Active Now</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400">
            No active sessions found.
          </div>
        )}
      </div>
    </div>
  );
}
