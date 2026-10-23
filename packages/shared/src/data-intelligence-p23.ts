import { z } from "zod";

// ==========================================
// 1. DATA PRODUCT ENUMS & TYPES
// ==========================================

export type DataProductLifecycleStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "DEPRECATED" | "RETIRED";
export type DataClassificationLevel = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
export type DataProductCriticality = "LOW" | "MEDIUM" | "HIGH" | "MISSION_CRITICAL";
export type DataQualityStatus = "PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA";
export type QualityRuleSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL";

export type DataSourceType =
  | "WORKFLOW_EXECUTION"
  | "PROCESS_INSTANCE"
  | "PLATFORM_EVENT"
  | "CONNECTOR_EXECUTION"
  | "OPERATIONAL_METRICS"
  | "CUSTOM_ADAPTER";

export type PipelineRefreshMode = "FULL_REFRESH" | "INCREMENTAL";
export type PipelineRunStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
export type PipelineRunType = "MANUAL" | "SCHEDULED" | "EVENT_TRIGGERED" | "DRY_RUN";

export type LineageNodeType = "WORKFLOW" | "EVENT_SCHEMA" | "PROCESS" | "CONNECTOR" | "PIPELINE" | "DATA_PRODUCT";
export type LineageRelationType = "PRODUCES" | "TRANSFORMS" | "MATERIALIZES" | "CONSUMES" | "DEPENDS_ON";

export type DataQualityRuleType =
  | "REQUIRED_FIELD"
  | "NULL_RATE"
  | "SCHEMA_VALIDATION"
  | "ALLOWED_VALUES"
  | "NUMERIC_RANGE"
  | "STRING_LENGTH"
  | "REGEX_FORMAT"
  | "UNIQUENESS"
  | "FRESHNESS"
  | "MIN_RECORD_COUNT"
  | "MAX_REJECTED_PERCENT";

// ==========================================
// 2. DECLARATIVE PIPELINE OPERATIONS
// ==========================================

export type PipelineFilterOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "IN"
  | "CONTAINS"
  | "EXISTS";

export type PipelineMapTransform =
  | "UPPERCASE"
  | "LOWERCASE"
  | "TRIM"
  | "TO_NUMBER"
  | "TO_BOOLEAN"
  | "TO_ISO_DATE"
  | "COALESCE";

export type PipelineAggregateFunction = "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";

export interface PipelineOperationSelect {
  type: "select";
  fields: string[];
}

export interface PipelineOperationRename {
  type: "rename";
  mappings: Record<string, string>;
}

export interface PipelineOperationFilter {
  type: "filter";
  condition: {
    field: string;
    operator: PipelineFilterOperator;
    value?: any;
  };
}

export interface PipelineOperationMap {
  type: "map";
  field: string;
  transform: PipelineMapTransform;
  args?: any;
}

export interface PipelineOperationJoin {
  type: "join";
  rightSourceId: string;
  leftKey: string;
  rightKey: string;
  joinType?: "INNER" | "LEFT";
}

export interface PipelineOperationAggregate {
  type: "aggregate";
  groupBy: string[];
  aggregations: {
    field: string;
    function: PipelineAggregateFunction;
    as: string;
  }[];
}

export interface PipelineOperationDeduplicate {
  type: "deduplicate";
  keys: string[];
}

export interface PipelineOperationRedact {
  type: "redact";
  fields: string[];
  maskStrategy: "HASH" | "MASK_ALL" | "PARTIAL_EMAIL";
}

export interface PipelineOperationValidate {
  type: "validate";
  schema: Record<string, any>;
}

export type PipelineOperation =
  | PipelineOperationSelect
  | PipelineOperationRename
  | PipelineOperationFilter
  | PipelineOperationMap
  | PipelineOperationJoin
  | PipelineOperationAggregate
  | PipelineOperationDeduplicate
  | PipelineOperationRedact
  | PipelineOperationValidate;

// ==========================================
// 3. ZOD INPUT SCHEMAS
// ==========================================

export const CreateDataProductSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9_-]+$/, "Slug must contain only lowercase alphanumeric, dashes, and underscores"),
  name: z.string().min(2).max(150),
  description: z.string().max(1000).optional(),
  businessDomain: z.string().min(2).max(60).default("GENERAL"),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "MISSION_CRITICAL"]).default("MEDIUM"),
  ownerUserId: z.string().optional(),
  owningTeamId: z.string().optional(),
  stewardUserId: z.string().optional(),
  dataClassification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).default("INTERNAL"),
  refreshStrategy: z.enum(["ON_DEMAND", "SCHEDULED", "EVENT_TRIGGERED"]).default("ON_DEMAND"),
  refreshIntervalMinutes: z.number().int().min(1).max(10080).optional(),
  targetFreshnessMinutes: z.number().int().min(5).max(43200).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  initialSchema: z.record(z.any()).optional(),
});

export type CreateDataProductInput = z.infer<typeof CreateDataProductSchema>;

export const UpdateDataProductSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().max(1000).optional(),
  businessDomain: z.string().min(2).max(60).optional(),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "MISSION_CRITICAL"]).optional(),
  ownerUserId: z.string().nullable().optional(),
  owningTeamId: z.string().nullable().optional(),
  stewardUserId: z.string().nullable().optional(),
  dataClassification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).optional(),
  refreshStrategy: z.enum(["ON_DEMAND", "SCHEDULED", "EVENT_TRIGGERED"]).optional(),
  refreshIntervalMinutes: z.number().int().min(1).max(10080).nullable().optional(),
  targetFreshnessMinutes: z.number().int().min(5).max(43200).nullable().optional(),
  retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
});

export type UpdateDataProductInput = z.infer<typeof UpdateDataProductSchema>;

export const CreateDataProductVersionSchema = z.object({
  schemaDefinition: z.record(z.any()),
  changeSummary: z.string().max(500).optional(),
  isBreaking: z.boolean().default(false),
  reviewNotes: z.string().max(1000).optional(),
});

export type CreateDataProductVersionInput = z.infer<typeof CreateDataProductVersionSchema>;

export const PublishDataProductVersionSchema = z.object({
  overrideQualityGate: z.boolean().default(false),
  overrideReason: z.string().max(500).optional(),
});

export type PublishDataProductVersionInput = z.infer<typeof PublishDataProductVersionSchema>;

export const CreateDataSourceSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9_-]+$/, "Slug must contain only lowercase alphanumeric, dashes, and underscores"),
  name: z.string().min(2).max(150),
  description: z.string().max(1000).optional(),
  sourceType: z.enum([
    "WORKFLOW_EXECUTION",
    "PROCESS_INSTANCE",
    "PLATFORM_EVENT",
    "CONNECTOR_EXECUTION",
    "OPERATIONAL_METRICS",
    "CUSTOM_ADAPTER",
  ]),
  resourceReference: z.string().min(1).max(200),
  schemaContract: z.record(z.any()).optional(),
  dataClassification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).default("INTERNAL"),
  allowedRegions: z.array(z.string()).optional(),
  refreshStrategy: z.string().max(50).default("BATCH"),
});

export type CreateDataSourceInput = z.infer<typeof CreateDataSourceSchema>;

export const CreateDataPipelineSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9_-]+$/, "Slug must contain only lowercase alphanumeric, dashes, and underscores"),
  name: z.string().min(2).max(150),
  description: z.string().max(1000).optional(),
  dataProductId: z.string().uuid(),
  sourceId: z.string().uuid().optional(),
  refreshMode: z.enum(["FULL_REFRESH", "INCREMENTAL"]).default("FULL_REFRESH"),
  scheduleCron: z.string().max(100).optional(),
  timeoutSeconds: z.number().int().min(10).max(3600).default(300),
  maxRecordLimit: z.number().int().min(10).max(100000).default(50000),
  initialOperations: z.array(z.any()).default([]),
  outputSchema: z.record(z.any()).optional(),
});

export type CreateDataPipelineInput = z.infer<typeof CreateDataPipelineSchema>;

export const CreatePipelineVersionSchema = z.object({
  operations: z.array(z.any()),
  outputSchema: z.record(z.any()).optional(),
});

export type CreatePipelineVersionInput = z.infer<typeof CreatePipelineVersionSchema>;

export const RunPipelineSchema = z.object({
  runType: z.enum(["MANUAL", "SCHEDULED", "EVENT_TRIGGERED", "DRY_RUN"]).default("MANUAL"),
  watermark: z.record(z.any()).optional(),
  sampleSize: z.number().int().min(1).max(500).optional(), // For dry-run/preview
});

export type RunPipelineInput = z.infer<typeof RunPipelineSchema>;

export const CreateDataQualityRuleSchema = z.object({
  name: z.string().min(2).max(150),
  description: z.string().max(500).optional(),
  ruleType: z.enum([
    "REQUIRED_FIELD",
    "NULL_RATE",
    "SCHEMA_VALIDATION",
    "ALLOWED_VALUES",
    "NUMERIC_RANGE",
    "STRING_LENGTH",
    "REGEX_FORMAT",
    "UNIQUENESS",
    "FRESHNESS",
    "MIN_RECORD_COUNT",
    "MAX_REJECTED_PERCENT",
  ]),
  configuration: z.record(z.any()),
  severity: z.enum(["INFO", "WARN", "ERROR", "CRITICAL"]).default("ERROR"),
  isBlocking: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export type CreateDataQualityRuleInput = z.infer<typeof CreateDataQualityRuleSchema>;

export const QueryDataProductSchema = z.object({
  fields: z.array(z.string()).optional(),
  filter: z
    .object({
      field: z.string(),
      operator: z.enum(["EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN", "CONTAINS", "IN"]),
      value: z.any(),
    })
    .optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.coerce.number().int().min(0).default(0),
});

export type QueryDataProductInput = z.infer<typeof QueryDataProductSchema>;

export const RegisterLineageNodeSchema = z.object({
  nodeKey: z.string().min(1).max(200),
  nodeType: z.enum(["WORKFLOW", "EVENT_SCHEMA", "PROCESS", "CONNECTOR", "PIPELINE", "DATA_PRODUCT"]),
  name: z.string().min(1).max(150),
  version: z.string().max(50).optional(),
  metadata: z.record(z.any()).optional(),
});

export type RegisterLineageNodeInput = z.infer<typeof RegisterLineageNodeSchema>;

export const RegisterLineageEdgeSchema = z.object({
  sourceNodeKey: z.string().min(1).max(200),
  targetNodeKey: z.string().min(1).max(200),
  relationType: z.enum(["PRODUCES", "TRANSFORMS", "MATERIALIZES", "CONSUMES", "DEPENDS_ON"]),
  metadata: z.record(z.any()).optional(),
});

export type RegisterLineageEdgeInput = z.infer<typeof RegisterLineageEdgeSchema>;

// ==========================================
// 4. DTOs
// ==========================================

export interface DataProductDto {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description?: string | null;
  businessDomain: string;
  criticality: DataProductCriticality;
  ownerUserId?: string | null;
  owningTeamId?: string | null;
  stewardUserId?: string | null;
  lifecycleStatus: DataProductLifecycleStatus;
  dataClassification: DataClassificationLevel;
  currentVersion: number;
  refreshStrategy: string;
  refreshIntervalMinutes?: number | null;
  targetFreshnessMinutes?: number | null;
  qualityStatus: DataQualityStatus;
  lastEvaluatedAt?: string | null;
  lastMaterializedAt?: string | null;
  retentionDays?: number | null;
  canonicalHash?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataProductVersionDto {
  id: string;
  workspaceId: string;
  dataProductId: string;
  version: number;
  status: DataProductLifecycleStatus;
  schemaDefinition: Record<string, any>;
  canonicalHash: string;
  changeSummary?: string | null;
  isBreaking: boolean;
  publishedAt?: string | null;
  publishedById?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataProductSnapshotDto {
  id: string;
  workspaceId: string;
  dataProductId: string;
  versionId: string;
  pipelineRunId?: string | null;
  recordCount: number;
  byteSize: number;
  records: any[];
  schemaVersion: number;
  watermark?: Record<string, any> | null;
  status: string;
  materializedAt: string;
  expiresAt?: string | null;
}

export interface DataSourceDto {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description?: string | null;
  sourceType: DataSourceType;
  resourceReference: string;
  schemaContract?: Record<string, any> | null;
  dataClassification: DataClassificationLevel;
  allowedRegions?: string[] | null;
  refreshStrategy: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataPipelineDto {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description?: string | null;
  dataProductId: string;
  sourceId?: string | null;
  status: string;
  currentVersion: number;
  refreshMode: PipelineRefreshMode;
  scheduleCron?: string | null;
  timeoutSeconds: number;
  maxRecordLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface DataQualityRuleDto {
  id: string;
  workspaceId: string;
  dataProductId: string;
  name: string;
  description?: string | null;
  ruleType: DataQualityRuleType;
  configuration: Record<string, any>;
  severity: QualityRuleSeverity;
  isBlocking: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DataQualityEvaluationDto {
  id: string;
  workspaceId: string;
  ruleId: string;
  dataProductId: string;
  versionId?: string | null;
  pipelineRunId?: string | null;
  status: DataQualityStatus;
  recordsEvaluated: number;
  recordsPassed: number;
  recordsFailed: number;
  failureSamples?: any[] | null;
  evaluationDurationMs?: number | null;
  errorMessage?: string | null;
  evaluatedAt: string;
}

export interface DataLineageGraphDto {
  nodes: {
    nodeKey: string;
    nodeType: LineageNodeType;
    name: string;
    version?: string | null;
    metadata?: Record<string, any> | null;
  }[];
  edges: {
    sourceNodeKey: string;
    targetNodeKey: string;
    relationType: LineageRelationType;
    metadata?: Record<string, any> | null;
  }[];
}
