import { z } from "zod";

// ==========================================
// 1. CANONICAL BUSINESS EVENT ENVELOPE
// ==========================================

export type EventDataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export interface PlatformEventDto {
  id: string;
  workspaceId: string;
  schemaDefinitionId?: string | null;
  eventId: string;
  eventType: string;
  schemaVersion: number;
  source: string;
  correlationId?: string | null;
  causationId?: string | null;
  traceparent?: string | null;
  subject?: string | null;
  data: Record<string, any>;
  metadata: Record<string, any>;
  classification: EventDataClassification;
  deliveryKey?: string | null;
  occurredAt: string;
  recordedAt: string;
}

export const IngestEventSchema = z.object({
  eventId: z.string().min(1).max(128).optional(),
  eventType: z
    .string()
    .min(1)
    .max(120)
    .regex(
      /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/,
      "eventType must be a namespaced string (e.g. 'order.placed', 'invoice.paid')"
    ),
  schemaVersion: z.number().int().min(1).default(1),
  source: z.string().min(1).max(200).default("flowforge.api"),
  correlationId: z.string().max(150).optional(),
  causationId: z.string().max(150).optional(),
  traceparent: z.string().max(100).optional(),
  subject: z.string().max(200).optional(),
  data: z.record(z.any()),
  metadata: z.record(z.any()).default({}),
  classification: z
    .enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"])
    .default("INTERNAL"),
  deliveryKey: z.string().max(150).optional(),
  occurredAt: z.string().datetime().optional(),
});

export type IngestEventInput = z.infer<typeof IngestEventSchema>;

export const BatchIngestEventsSchema = z.object({
  events: z.array(IngestEventSchema).min(1).max(100),
});

export type BatchIngestEventsInput = z.infer<typeof BatchIngestEventsSchema>;

export interface IngestEventResult {
  eventId: string;
  eventType: string;
  status: "ACCEPTED" | "DUPLICATE" | "REJECTED";
  deliveryKey?: string;
  correlationId?: string;
  recordedAt: string;
  validationErrors?: string[];
  dispatchedDeliveriesCount?: number;
}

export interface BatchIngestResult {
  total: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  results: IngestEventResult[];
}

// ==========================================
// 2. SCHEMA REGISTRY & GOVERNANCE
// ==========================================

export type EventSchemaCompatibilityMode = "BACKWARD" | "FORWARD" | "FULL" | "NONE";
export type EventSchemaStatus = "ACTIVE" | "DEPRECATED" | "RETIRED";
export type EventSchemaVersionStatus = "DRAFT" | "PUBLISHED" | "DEPRECATED";

export const CreateEventSchemaDefinitionSchema = z.object({
  eventType: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/),
  description: z.string().max(500).optional(),
  businessDomain: z
    .enum(["OPERATIONS", "FINANCE", "SALES", "CUSTOMER_SUCCESS", "ENGINEERING", "HR", "SECURITY"])
    .default("OPERATIONS"),
  dataClassification: z
    .enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"])
    .default("INTERNAL"),
  compatibilityMode: z
    .enum(["BACKWARD", "FORWARD", "FULL", "NONE"])
    .default("BACKWARD"),
  jsonSchema: z.record(z.any()),
  samplePayload: z.record(z.any()).optional(),
});

export type CreateEventSchemaDefinitionInput = z.infer<typeof CreateEventSchemaDefinitionSchema>;

export const CreateEventSchemaVersionSchema = z.object({
  jsonSchema: z.record(z.any()),
  samplePayload: z.record(z.any()).optional(),
  changeSummary: z.string().max(500).optional(),
  isBreaking: z.boolean().default(false),
});

export type CreateEventSchemaVersionInput = z.infer<typeof CreateEventSchemaVersionSchema>;

// ==========================================
// 3. SUBSCRIPTIONS & DECLARATIVE FILTERS
// ==========================================

export type EventSubscriptionDestinationType =
  | "WORKFLOW_TRIGGER"
  | "PROCESS_MILESTONE"
  | "OUTBOUND_WEBHOOK"
  | "CONNECTOR_ACTION"
  | "INTERNAL";

export type EventSubscriptionStatus = "ACTIVE" | "PAUSED" | "DISABLED";

export type FilterOperator =
  | "AND"
  | "OR"
  | "EQUALS"
  | "NOT_EQUALS"
  | "IN"
  | "CONTAINS"
  | "EXISTS"
  | "GREATER_THAN"
  | "LESS_THAN";

export interface DeclarativeFilterRule {
  field?: string; // e.g. "data.status", "data.totalAmount", "source", "classification"
  operator: FilterOperator;
  value?: any;
  conditions?: DeclarativeFilterRule[];
}

export const CreateEventSubscriptionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  eventTypes: z.array(z.string().min(1)).min(1),
  filterExpression: z.record(z.any()).default({}),
  destinationType: z.enum([
    "WORKFLOW_TRIGGER",
    "PROCESS_MILESTONE",
    "OUTBOUND_WEBHOOK",
    "CONNECTOR_ACTION",
    "INTERNAL",
  ]),
  destinationConfig: z.record(z.any()),
  maxAttempts: z.number().int().min(1).max(20).default(5),
  backoffMs: z.number().int().min(100).max(60000).default(2000),
  timeoutMs: z.number().int().min(1000).max(60000).default(10000),
  concurrencyLimit: z.number().int().min(1).max(100).default(10),
  signingSecret: z.string().max(250).optional(),
});

export type CreateEventSubscriptionInput = z.infer<typeof CreateEventSubscriptionSchema>;

export const UpdateEventSubscriptionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  eventTypes: z.array(z.string().min(1)).optional(),
  filterExpression: z.record(z.any()).optional(),
  destinationType: z
    .enum(["WORKFLOW_TRIGGER", "PROCESS_MILESTONE", "OUTBOUND_WEBHOOK", "CONNECTOR_ACTION", "INTERNAL"])
    .optional(),
  destinationConfig: z.record(z.any()).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "DISABLED"]).optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  backoffMs: z.number().int().min(100).max(60000).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
  concurrencyLimit: z.number().int().min(1).max(100).optional(),
  signingSecret: z.string().max(250).optional(),
});

export type UpdateEventSubscriptionInput = z.infer<typeof UpdateEventSubscriptionSchema>;

// ==========================================
// 4. EVENT DELIVERIES, DEAD-LETTER & REPLAY
// ==========================================

export type EventDeliveryStatus =
  | "PENDING"
  | "PROCESSING"
  | "DELIVERED"
  | "RETRY_SCHEDULED"
  | "DEAD_LETTER"
  | "CANCELLED";

export type EventDeliveryAttemptStatus =
  | "SUCCESS"
  | "FAILED"
  | "TIMEOUT"
  | "SSRF_BLOCKED"
  | "RATE_LIMITED";

export const CreateEventReplayJobSchema = z.object({
  name: z.string().min(1).max(120),
  subscriptionId: z.string().uuid().optional(),
  eventType: z.string().optional(),
  status: z.enum(["DEAD_LETTER", "FAILED", "ALL"]).default("DEAD_LETTER"),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  isDryRun: z.boolean().default(false),
});

export type CreateEventReplayJobInput = z.infer<typeof CreateEventReplayJobSchema>;

// ==========================================
// 5. OBSERVABILITY & METRICS
// ==========================================

export interface EventMetricsSummaryDto {
  ingestedCount: number;
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  deliveredCount: number;
  retriedCount: number;
  deadLetterCount: number;
  activeSubscriptions: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  timeRangeHours: number;
}
