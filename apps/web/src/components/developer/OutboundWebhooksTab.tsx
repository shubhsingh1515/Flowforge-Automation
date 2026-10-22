"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  Webhook,
  Plus,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Send,
  Eye,
} from "lucide-react";
import { WEBHOOK_EVENTS } from "@flowforge/shared";

export function OutboundWebhooksTab() {
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "workflow.created",
    "execution.succeeded",
    "execution.failed",
  ]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Delivery logs modal state
  const [inspectWebhook, setInspectWebhook] = useState<any | null>(null);

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ["outbound-webhooks"],
    queryFn: () => api.webhooks.list(),
  });

  const { data: deliveries = [], refetch: refetchDeliveries } = useQuery({
    queryKey: ["webhook-deliveries", inspectWebhook?.id],
    queryFn: () => (inspectWebhook ? api.webhooks.getDeliveries(inspectWebhook.id) : Promise.resolve([])),
    enabled: Boolean(inspectWebhook),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; url: string; events: string[] }) =>
      api.webhooks.create(body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks"] });
      setCreatedSecret(data.secret);
      setWebhookName("");
      setWebhookUrl("");
      setShowCreateModal(false);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to register webhook");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.webhooks.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks"] });
      setSuccessMessage("Webhook endpoint deleted.");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to delete webhook");
    },
  });

  const pingMutation = useMutation({
    mutationFn: (id: string) => api.webhooks.sendTestPing(id),
    onSuccess: () => {
      setSuccessMessage("Test ping dispatched! Check deliveries history.");
      setTimeout(() => setSuccessMessage(null), 3000);
      if (inspectWebhook) refetchDeliveries();
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to dispatch test ping");
    },
  });

  const retryMutation = useMutation({
    mutationFn: (deliveryId: string) => api.webhooks.retryDelivery(deliveryId),
    onSuccess: () => {
      setSuccessMessage("Redelivery enqueued.");
      setTimeout(() => setSuccessMessage(null), 3000);
      refetchDeliveries();
    },
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const toggleEvent = (event: string) => {
    if (selectedEvents.includes(event)) {
      setSelectedEvents(selectedEvents.filter((e) => e !== event));
    } else {
      setSelectedEvents([...selectedEvents, event]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Webhook className="h-5 w-5 text-indigo-600" />
              <span>Outbound Event Webhooks</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Receive real-time signed HTTP POST webhooks whenever workflows are created, executions complete, or human approvals are requested.
            </p>
          </div>

          <button
            onClick={() => {
              setActionError(null);
              setShowCreateModal(true);
            }}
            data-testid="register-webhook-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>Register Webhook</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Secret One-Time Display Modal */}
      {createdSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-emerald-700 mb-3">
              <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Webhook Registered Successfully</h3>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Here is your HMAC-SHA256 signing secret. Store it securely to verify the <code>X-FlowForge-Signature</code> header.
            </p>

            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 mb-5 font-mono text-xs text-slate-800 break-all select-all">
              <span className="flex-1 font-semibold" data-testid="webhook-signing-secret">{createdSecret}</span>
              <button
                onClick={() => handleCopy(createdSecret)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-sans font-semibold transition"
              >
                {copiedSecret ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
                <span>{copiedSecret ? "Copied" : "Copy"}</span>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setCreatedSecret(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhooks Table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Configured Endpoints</h4>
          <span className="text-xs text-slate-400 font-medium">{webhooks.length} endpoints</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading webhooks...</div>
        ) : webhooks.length === 0 ? (
          <div className="p-8 text-center">
            <Webhook className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">No outbound webhooks configured</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Register a webhook URL to receive automated event payloads.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Name & URL</th>
                  <th className="py-3 px-4">Subscribed Events</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {webhooks.map((wh: any) => (
                  <tr key={wh.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{wh.name}</div>
                      <div className="font-mono text-[11px] text-slate-500 mt-0.5 truncate max-w-sm">{wh.url}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {wh.events.map((ev: string) => (
                          <span key={ev} className="rounded bg-indigo-50 text-indigo-700 px-1.5 py-0.5 text-[10px] font-mono">
                            {ev}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {wh.active ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => pingMutation.mutate(wh.id)}
                          disabled={pingMutation.isPending}
                          title="Send Test Ping"
                          className="p-1.5 rounded text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => setInspectWebhook(wh)}
                          data-testid={`view-deliveries-${wh.id}`}
                          title="View Deliveries"
                          className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            if (confirm(`Delete webhook endpoint '${wh.name}'?`)) {
                              deleteMutation.mutate(wh.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          title="Delete Endpoint"
                          className="p-1.5 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deliveries History Modal */}
      {inspectWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Recent Deliveries: {inspectWebhook.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono truncate max-w-md">{inspectWebhook.url}</p>
              </div>
              <button
                onClick={() => setInspectWebhook(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {deliveries.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-8">No delivery attempts recorded yet.</p>
              ) : (
                deliveries.map((del: any) => (
                  <div key={del.id} className="rounded-lg border border-slate-200 p-3 text-xs bg-slate-50/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{del.eventType}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({del.eventId})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {del.status === "SUCCESS" ? (
                          <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px] font-bold">
                            {del.statusCode || 200} OK
                          </span>
                        ) : (
                          <span className="rounded bg-rose-100 text-rose-800 px-1.5 py-0.5 text-[10px] font-bold">
                            {del.statusCode || "FAILED"}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">{del.durationMs ? `${del.durationMs}ms` : ""}</span>
                      </div>
                    </div>

                    {del.errorMessage && (
                      <p className="text-rose-600 text-[11px]">{del.errorMessage}</p>
                    )}

                    {del.responseBody && (
                      <div className="font-mono text-[10px] text-slate-500 bg-white p-2 rounded border border-slate-200 truncate">
                        {del.responseBody}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                      <span>Attempt #{del.attempt} • {new Date(del.createdAt).toLocaleTimeString()}</span>
                      {del.status !== "SUCCESS" && (
                        <button
                          onClick={() => retryMutation.mutate(del.id)}
                          disabled={retryMutation.isPending}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold"
                        >
                          Retry Delivery
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setInspectWebhook(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register Webhook Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900 mb-2">Register Outbound Webhook</h3>
            <p className="text-xs text-slate-500 mb-4">
              FlowForge will deliver signed JSON payloads to this destination endpoint whenever matching events occur.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  name: webhookName,
                  url: webhookUrl,
                  events: selectedEvents,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Webhook Name</label>
                <input
                  type="text"
                  required
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  placeholder="e.g. Production Data Lake Ingestion"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Destination URL (HTTPS)</label>
                <input
                  type="url"
                  required
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://api.yourcompany.com/webhooks/flowforge"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Triggering Events</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-lg border border-slate-200 bg-slate-50/50 text-xs">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <label key={ev} className="flex items-center gap-2 text-slate-700 hover:text-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(ev)}
                        onChange={() => toggleEvent(ev)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-mono text-[11px]">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !webhookName.trim() || !webhookUrl.trim() || selectedEvents.length === 0}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs"
                >
                  {createMutation.isPending ? "Registering..." : "Register Webhook"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
