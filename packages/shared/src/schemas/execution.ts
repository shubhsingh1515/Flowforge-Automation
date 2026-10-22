import { z } from "zod";

export const ExecutionStatusEnum = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusEnum>;

export const ExecutionStepSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  nodeName: z.string(),
  nodeType: z.string(),
  status: ExecutionStatusEnum,
  startedAt: z.string().or(z.date()),
  finishedAt: z.string().or(z.date()).nullable().optional(),
  durationMs: z.number().nullable().optional(),
  inputData: z.any().optional(),
  outputData: z.any().optional(),
  errorMessage: z.string().nullable().optional(),
});

export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

export const ExecutionSummarySchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowName: z.string(),
  status: ExecutionStatusEnum,
  startedAt: z.string().or(z.date()),
  finishedAt: z.string().or(z.date()).nullable().optional(),
  durationMs: z.number().nullable().optional(),
  totalSteps: z.number().default(0),
  errorSummary: z.string().nullable().optional(),
  triggerEvent: z.string().nullable().optional(),
  steps: z.array(ExecutionStepSchema).optional(),
});

export type ExecutionSummary = z.infer<typeof ExecutionSummarySchema>;

export const DashboardMetricsSchema = z.object({
  totalWorkflows: z.number(),
  activeWorkflows: z.number(),
  successfulRuns: z.number(),
  failedRuns: z.number(),
  recentWorkflowsCount: z.number(),
});

export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  triggerType: z.string(),
  actionType: z.string(),
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  status: z.enum(["AVAILABLE", "REQUIRES_SETUP", "PLANNED"]).default("AVAILABLE"),
});

export type WorkflowTemplate = z.infer<typeof TemplateSchema>;
