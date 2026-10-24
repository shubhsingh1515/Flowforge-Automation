"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AppShell } from "../../components/layout/AppShell";
import {
  Radio,
  Activity,
  Layers,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RotateCw,
  Plus,
  Send,
  Pause,
  Play,
  RotateCcw,
  Search,
  Filter,
  FileCode,
  Shield,
  ArrowRight,
  ExternalLink,
  Workflow,
  Sparkles,
} from "lucide-react";

export default function EventFabricPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"CATALOG" | "EVENTS" | "SUBSCRIPTIONS" | "DELIVERIES" | "HEALTH">("CATALOG");
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Modals
  const [ingestModalOpen, setIngestModalOpen] = useState(false);
  const [createSubModalOpen, setCreateSubModalOpen] = useState(false);
  const [createSchemaModalOpen, setCreateSchemaModalOpen] = useState(false);
  const [replayModalOpen, setReplayModalOpen] = useState(false);

  // Ingest form state
  const [ingestEventType, setIngestEventType] = useState("order.placed");
  const [ingestSource, setIngestSource] = useState("com.flowforge.billing");
  const [ingestCorrelationId, setIngestCorrelationId] = useState("ord_1001");
  const [ingestDataJson, setIngestDataJson] = useState('{\n  "orderId": "1001",\n  "amount": 250,\n  "customerEmail": "alex@example.com"\n}');

  // Subscription form state
  const [subName, setSubName] = useState("");
  const [subEventTypes, setSubEventTypes] = useState("order.*");
  const [subDestType, setSubDestType] = useState<"WORKFLOW_TRIGGER" | "PROCESS_MILESTONE" | "OUTBOUND_WEBHOOK" | "INTERNAL">("INTERNAL");
  const [subWorkflowId, setSubWorkflowId] = useState("");
  const [subWebhookUrl, setSubWebhookUrl] = useState("https://api.partner.com/events");
  const [subFilterJson, setSubFilterJson] = useState('{\n  "data.amount": 250\n}');

  // Schema form state
  const [schemaEventType, setSchemaEventType] = useState("");
  const [schemaDomain, setSchemaDomain] = useState("OPERATIONS");
  const [schemaJson, setSchemaJson] = useState('{\n  "type": "object",\n  "required": ["orderId"],\n  "properties": {\n    "orderId": { "type": "string" },\n    "amount": { "type": "number" }\n  }\n}');

  // Replay job state
  const [replaySubId, setReplaySubId] = useState("");
  const [replayDryRun, setReplayDryRun] = useState(false);

  // Feedback notifications
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Queries
  const { data: metricsData, refetch: refetchMetrics } = useQuery({
    queryKey: ["event-metrics"],
    queryFn: () => api.events.getMetrics(24),
  });
  const metrics = metricsData?.data;

  const { data: schemasData, refetch: refetchSchemas } = useQuery({
    queryKey: ["event-schemas"],
    queryFn: () => api.events.listSchemas(),
  });
  const schemas = schemasData?.data || [];

  const { data: eventsData, refetch: refetchEvents } = useQuery({
    queryKey: ["platform-events"],
    queryFn: () => api.events.list({ limit: 25 }),
  });
  const events = eventsData?.data?.items || [];

  const { data: subsData, refetch: refetchSubs } = useQuery({
    queryKey: ["event-subscriptions"],
    queryFn: () => api.events.listSubscriptions(),
  });
  const subscriptions = subsData?.data || [];

  const { data: deliveriesData, refetch: refetchDeliveries } = useQuery({
    queryKey: ["event-deliveries"],
    queryFn: () => api.events.listDeliveries({ limit: 25 }),
  });
  const deliveries = deliveriesData?.data?.items || [];

  const { data: workflowsData } = useQuery({
    queryKey: ["workflows-list"],
    queryFn: () => api.workflows.list({ limit: 50 }),
  });
  const workflows = (workflowsData as any)?.data || (workflowsData as any)?.workflows || [];

  // Mutations
  const ingestMutation = useMutation({
    mutationFn: async () => {
      let parsedData = {};
      try {
        parsedData = JSON.parse(ingestDataJson);
      } catch (_e) {
        throw new Error("Payload data must be valid JSON.");
      }

      return api.events.ingest({
        eventType: ingestEventType,
        source: ingestSource,
        correlationId: ingestCorrelationId || undefined,
        data: parsedData,
      });
    },
    onSuccess: (res: any) => {
      setActionSuccess(`Event ingested successfully! ID: ${res.data.eventId} (${res.data.status})`);
      setIngestModalOpen(false);
      refetchEvents();
      refetchDeliveries();
      refetchMetrics();
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to ingest event.");
    },
  });

  const createSubMutation = useMutation({
    mutationFn: async () => {
      let filterExp = {};
      try {
        if (subFilterJson.trim()) filterExp = JSON.parse(subFilterJson);
      } catch (_e) {
        throw new Error("Filter expression must be valid JSON.");
      }

      const destConfig: any = {};
      if (subDestType === "WORKFLOW_TRIGGER") destConfig.workflowId = subWorkflowId;
      if (subDestType === "OUTBOUND_WEBHOOK") destConfig.webhookUrl = subWebhookUrl;

      return api.events.createSubscription({
        name: subName,
        eventTypes: subEventTypes.split(",").map((s) => s.trim()),
        destinationType: subDestType,
        destinationConfig: destConfig,
        filterExpression: filterExp,
      });
    },
    onSuccess: () => {
      setActionSuccess("Event subscription created successfully!");
      setCreateSubModalOpen(false);
      refetchSubs();
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to create subscription.");
    },
  });

  const createSchemaMutation = useMutation({
    mutationFn: async () => {
      let parsedSchema = {};
      try {
        parsedSchema = JSON.parse(schemaJson);
      } catch (_e) {
        throw new Error("JSON Schema must be valid JSON.");
      }

      return api.events.createSchema({
        eventType: schemaEventType,
        businessDomain: schemaDomain,
        jsonSchema: parsedSchema,
      });
    },
    onSuccess: () => {
      setActionSuccess(`Event schema '${schemaEventType}' registered and published!`);
      setCreateSchemaModalOpen(false);
      refetchSchemas();
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to register schema.");
    },
  });

  const replayDeliveryMutation = useMutation({
    mutationFn: (deliveryId: string) => api.events.replayDelivery(deliveryId),
    onSuccess: () => {
      setActionSuccess("Delivery replay initiated successfully.");
      refetchDeliveries();
      refetchMetrics();
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to replay delivery.");
    },
  });

  const toggleSubMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (status === "ACTIVE") return api.events.pauseSubscription(id);
      return api.events.resumeSubscription(id);
    },
    onSuccess: () => {
      setActionSuccess("Subscription status updated.");
      refetchSubs();
    },
    onError: (err: any) => {
      setActionError(err.message || "Failed to update subscription status.");
    },
  });

  const selectedEvent = events.find((e: any) => e.id === selectedEventId);

  return (
    <AppShell
      title="Event-Driven Integration Fabric"
      description="Real-time business event ingestion, schema governance, declarative routing, and reliable delivery."
      action={
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              refetchMetrics();
              refetchSchemas();
              refetchEvents();
              refetchSubs();
              refetchDeliveries();
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            data-testid="btn-open-ingest-modal"
            onClick={() => {
              setActionError(null);
              setActionSuccess(null);
              setIngestModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-[#6558E8] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#5345D8] transition-colors cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            Ingest Event
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Notice Alerts */}
        {actionSuccess && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {actionError && (
          <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="text-rose-600 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Pipeline Summary Counters */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
            <span className="text-xs text-slate-400 font-medium">Total Ingested (24h)</span>
            <p className="mt-1 text-xl font-bold text-slate-900 font-mono tracking-tight">{metrics?.ingestedCount || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
            <span className="text-xs text-slate-400 font-medium">Delivered Outcomes</span>
            <p className="mt-1 text-xl font-bold text-emerald-600 font-mono tracking-tight">{metrics?.deliveredCount || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
            <span className="text-xs text-slate-400 font-medium">Active Subscriptions</span>
            <p className="mt-1 text-xl font-bold text-[#6558E8] font-mono tracking-tight">{subscriptions.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
            <span className="text-xs text-slate-400 font-medium">Dead-Letter Queue</span>
            <p className={`mt-1 text-xl font-bold font-mono tracking-tight ${(metrics?.deadLetterCount || 0) > 0 ? "text-rose-600" : "text-slate-900"}`}>
              {metrics?.deadLetterCount || 0}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-card-hover transition-all">
            <span className="text-xs text-slate-400 font-medium">Median Delivery Latency</span>
            <p className="mt-1 text-xl font-bold text-slate-900 font-mono tracking-tight">
              {metrics?.medianLatencyMs ? `${metrics.medianLatencyMs}ms` : "<10ms"}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 text-sm overflow-x-auto min-w-0">
          <button
            data-testid="tab-catalog"
            onClick={() => setActiveTab("CATALOG")}
            className={`border-b-2 px-4 py-2 font-medium transition-colors shrink-0 whitespace-nowrap ${
              activeTab === "CATALOG"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Event Catalog & Schemas ({schemas.length})
          </button>
          <button
            data-testid="tab-events"
            onClick={() => setActiveTab("EVENTS")}
            className={`border-b-2 px-4 py-2 font-medium transition-colors shrink-0 whitespace-nowrap ${
              activeTab === "EVENTS"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Live Events & History ({events.length})
          </button>
          <button
            data-testid="tab-subscriptions"
            onClick={() => setActiveTab("SUBSCRIPTIONS")}
            className={`border-b-2 px-4 py-2 font-medium transition-colors shrink-0 whitespace-nowrap ${
              activeTab === "SUBSCRIPTIONS"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Subscriptions & Routing ({subscriptions.length})
          </button>
          <button
            data-testid="tab-deliveries"
            onClick={() => setActiveTab("DELIVERIES")}
            className={`border-b-2 px-4 py-2 font-medium transition-colors shrink-0 whitespace-nowrap ${
              activeTab === "DELIVERIES"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Deliveries & Dead-Letter ({deliveries.length})
          </button>
          <button
            data-testid="tab-health"
            onClick={() => setActiveTab("HEALTH")}
            className={`border-b-2 px-4 py-2 font-medium transition-colors shrink-0 whitespace-nowrap ${
              activeTab === "HEALTH"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Observability & Health
          </button>
        </div>

        {/* TAB 1: CATALOG & SCHEMAS */}
        {activeTab === "CATALOG" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800">Tenant Event Schema Catalog</h3>
              <button
                data-testid="btn-register-schema"
                onClick={() => {
                  setActionError(null);
                  setActionSuccess(null);
                  setCreateSchemaModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 shrink-0 self-start sm:self-auto"
              >
                <Plus className="h-3.5 w-3.5" />
                Register Event Schema
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="p-3 font-medium">Event Type</th>
                    <th className="p-3 font-medium">Domain</th>
                    <th className="p-3 font-medium">Classification</th>
                    <th className="p-3 font-medium">Compatibility</th>
                    <th className="p-3 font-medium">Active Version</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Total Events</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schemas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        No event schemas registered. Register a schema to govern payload validation and breaking changes.
                      </td>
                    </tr>
                  ) : (
                    schemas.map((s: any) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-indigo-600">{s.eventType}</td>
                        <td className="p-3">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                            {s.businessDomain}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
                            {s.dataClassification}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-600">{s.compatibilityMode}</td>
                        <td className="p-3 font-semibold text-slate-800">v{s.activeVersionNumber || 1}</td>
                        <td className="p-3">
                          <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                            {s.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600">{s.eventCount || 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE EVENTS & HISTORY */}
        {activeTab === "EVENTS" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Recent Platform Events Stream</h3>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="p-3 font-medium">Event ID</th>
                    <th className="p-3 font-medium">Event Type</th>
                    <th className="p-3 font-medium">Source</th>
                    <th className="p-3 font-medium">Correlation ID</th>
                    <th className="p-3 font-medium">Recorded At</th>
                    <th className="p-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        No events ingested yet. Click &quot;Ingest Event&quot; above to publish your first business event.
                      </td>
                    </tr>
                  ) : (
                    events.map((ev: any) => (
                      <tr key={ev.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-medium text-slate-900">{ev.eventId}</td>
                        <td className="p-3 font-mono font-semibold text-indigo-600">{ev.eventType}</td>
                        <td className="p-3 text-slate-600">{ev.source}</td>
                        <td className="p-3 font-mono text-slate-500">{ev.correlationId || "-"}</td>
                        <td className="p-3 text-slate-500">{new Date(ev.recordedAt).toLocaleTimeString()}</td>
                        <td className="p-3">
                          <button
                            onClick={() => setSelectedEventId(ev.id)}
                            className="font-semibold text-indigo-600 hover:underline"
                          >
                            Inspect Payload
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Event Payload Drawer */}
            {selectedEvent && (
              <div className="rounded-xl border border-indigo-200 bg-white p-5 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="font-bold text-slate-900">Event Envelope: {selectedEvent.eventId}</h4>
                    <span className="font-mono text-xs text-indigo-600">{selectedEvent.eventType}</span>
                  </div>
                  <button onClick={() => setSelectedEventId(null)} className="text-xs text-slate-400 hover:underline">
                    Close
                  </button>
                </div>
                <div className="mt-3">
                  <span className="text-xs font-semibold text-slate-700">Validated Event Data:</span>
                  <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-emerald-400">
                    {JSON.stringify(selectedEvent.data, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SUBSCRIPTIONS & ROUTING */}
        {activeTab === "SUBSCRIPTIONS" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Event Subscriptions & Declarative Routing</h3>
              <button
                data-testid="btn-create-subscription"
                onClick={() => {
                  setActionError(null);
                  setActionSuccess(null);
                  setCreateSubModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Subscription
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="p-3 font-medium">Subscription Name</th>
                    <th className="p-3 font-medium">Subscribed Event Types</th>
                    <th className="p-3 font-medium">Destination Type</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Deliveries Dispatched</th>
                    <th className="p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        No subscriptions found. Create a subscription to route events to workflows or webhooks.
                      </td>
                    </tr>
                  ) : (
                    subscriptions.map((sub: any) => (
                      <tr key={sub.id} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-900">{sub.name}</td>
                        <td className="p-3 font-mono text-indigo-600">{sub.eventTypes?.join(", ")}</td>
                        <td className="p-3">
                          <span className="rounded bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                            {sub.destinationType}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`rounded px-2 py-0.5 font-semibold ${
                              sub.status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {sub.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600">{sub.deliveriesCount || 0}</td>
                        <td className="p-3">
                          <button
                            onClick={() => toggleSubMutation.mutate({ id: sub.id, status: sub.status })}
                            className="font-semibold text-slate-600 hover:text-indigo-600"
                          >
                            {sub.status === "ACTIVE" ? (
                              <span className="flex items-center gap-1">
                                <Pause className="h-3.5 w-3.5 text-amber-600" /> Pause
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Play className="h-3.5 w-3.5 text-emerald-600" /> Resume
                              </span>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: DELIVERIES & DEAD-LETTER */}
        {activeTab === "DELIVERIES" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Event Deliveries & Dead-Letter Replay</h3>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="p-3 font-medium">Event Type</th>
                    <th className="p-3 font-medium">Subscription</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Attempts</th>
                    <th className="p-3 font-medium">Last Error</th>
                    <th className="p-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        No delivery attempts logged yet.
                      </td>
                    </tr>
                  ) : (
                    deliveries.map((d: any) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-medium text-slate-900">{d.event?.eventType}</td>
                        <td className="p-3 text-slate-700">{d.subscription?.name}</td>
                        <td className="p-3">
                          <span
                            className={`rounded px-2 py-0.5 font-semibold ${
                              d.status === "DELIVERED"
                                ? "bg-emerald-100 text-emerald-700"
                                : d.status === "DEAD_LETTER"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600">{d.attemptCount} / {d.maxAttempts}</td>
                        <td className="p-3 max-w-xs truncate text-rose-600">{d.lastError || "-"}</td>
                        <td className="p-3">
                          {d.status === "DEAD_LETTER" && (
                            <button
                              onClick={() => replayDeliveryMutation.mutate(d.id)}
                              className="flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
                            >
                              <RotateCcw className="h-3 w-3" /> Replay
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: HEALTH & OBSERVABILITY */}
        {activeTab === "HEALTH" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">Event Fabric Operational Health</h3>
              <p className="mt-1 text-xs text-slate-500">
                Continuous delivery tracking, deduplicated incident alarms, and SSRF security enforcement.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-4">
                  <span className="text-xs text-slate-400">Delivery Success Rate</span>
                  <p className="mt-1 text-2xl font-bold text-emerald-600">
                    {metrics && metrics.deliveredCount + metrics.deadLetterCount > 0
                      ? `${((metrics.deliveredCount / (metrics.deliveredCount + metrics.deadLetterCount)) * 100).toFixed(1)}%`
                      : "100%"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <span className="text-xs text-slate-400">P95 Delivery Latency</span>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {metrics?.p95LatencyMs ? `${metrics.p95LatencyMs}ms` : "<20ms"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <span className="text-xs text-slate-400">Loop Protection Gate</span>
                  <p className="mt-1 text-2xl font-bold text-indigo-600">Max Depth 5</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: INGEST EVENT */}
      {ingestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Ingest Real-Time Business Event</h3>
            <p className="text-xs text-slate-500">Publishes a canonical event envelope into the integration fabric.</p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Event Type (Namespaced)</label>
                <input
                  data-testid="input-ingest-event-type"
                  type="text"
                  value={ingestEventType}
                  onChange={(e) => setIngestEventType(e.target.value)}
                  placeholder="e.g. order.placed"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Originating Source</label>
                <input
                  type="text"
                  value={ingestSource}
                  onChange={(e) => setIngestSource(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Correlation ID</label>
                <input
                  type="text"
                  value={ingestCorrelationId}
                  onChange={(e) => setIngestCorrelationId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Payload Data (JSON)</label>
                <textarea
                  data-testid="input-ingest-data"
                  rows={5}
                  value={ingestDataJson}
                  onChange={(e) => setIngestDataJson(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setIngestModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                data-testid="btn-submit-ingest"
                onClick={() => ingestMutation.mutate()}
                disabled={ingestMutation.isPending || !ingestEventType}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {ingestMutation.isPending ? "Ingesting..." : "Ingest Event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE SUBSCRIPTION */}
      {createSubModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Create Event Subscription</h3>
            <p className="text-xs text-slate-500">Route matching events to workflows, webhooks, or process milestones.</p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Subscription Name</label>
                <input
                  data-testid="input-sub-name"
                  type="text"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="e.g. Order Fulfillment Dispatcher"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Subscribed Event Types (Comma-separated)</label>
                <input
                  data-testid="input-sub-events"
                  type="text"
                  value={subEventTypes}
                  onChange={(e) => setSubEventTypes(e.target.value)}
                  placeholder="e.g. order.*, payment.charged"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Destination Type</label>
                <select
                  value={subDestType}
                  onChange={(e) => setSubDestType(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                >
                  <option value="INTERNAL">Internal Consumer</option>
                  <option value="WORKFLOW_TRIGGER">Workflow Trigger</option>
                  <option value="OUTBOUND_WEBHOOK">Outbound Webhook</option>
                </select>
              </div>

              {subDestType === "WORKFLOW_TRIGGER" && (
                <div>
                  <label className="font-semibold text-slate-700">Target Workflow</label>
                  <select
                    value={subWorkflowId}
                    onChange={(e) => setSubWorkflowId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                  >
                    <option value="">-- Select Workflow --</option>
                    {workflows.map((wf: any) => (
                      <option key={wf.id} value={wf.id}>
                        {wf.name} ({wf.id.substring(0, 8)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {subDestType === "OUTBOUND_WEBHOOK" && (
                <div>
                  <label className="font-semibold text-slate-700">Destination Webhook URL (SSRF Protected)</label>
                  <input
                    type="url"
                    value={subWebhookUrl}
                    onChange={(e) => setSubWebhookUrl(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs"
                  />
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700">Filter Expression (JSON AST)</label>
                <textarea
                  rows={3}
                  value={subFilterJson}
                  onChange={(e) => setSubFilterJson(e.target.value)}
                  placeholder='{ "data.amount": 250 }'
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setCreateSubModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                data-testid="btn-submit-sub"
                onClick={() => createSubMutation.mutate()}
                disabled={createSubMutation.isPending || !subName}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {createSubMutation.isPending ? "Creating..." : "Create Subscription"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REGISTER SCHEMA */}
      {createSchemaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Register Event Schema</h3>
            <p className="text-xs text-slate-500">Defines contract rules and breaking-change governance.</p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Event Type</label>
                <input
                  data-testid="input-schema-event-type"
                  type="text"
                  value={schemaEventType}
                  onChange={(e) => setSchemaEventType(e.target.value)}
                  placeholder="e.g. order.placed"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Business Domain</label>
                <select
                  value={schemaDomain}
                  onChange={(e) => setSchemaDomain(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                >
                  {["OPERATIONS", "FINANCE", "SALES", "CUSTOMER_SUCCESS", "ENGINEERING", "HR", "SECURITY"].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700">JSON Schema Definition</label>
                <textarea
                  data-testid="input-schema-json"
                  rows={5}
                  value={schemaJson}
                  onChange={(e) => setSchemaJson(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setCreateSchemaModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                data-testid="btn-submit-schema"
                onClick={() => createSchemaMutation.mutate()}
                disabled={createSchemaMutation.isPending || !schemaEventType}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {createSchemaMutation.isPending ? "Registering..." : "Register Schema"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
