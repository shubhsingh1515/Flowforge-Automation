import { z } from "zod";

export const API_KEY_SCOPES = [
  "workflows:read",
  "workflows:write",
  "executions:read",
  "executions:run",
  "executions:cancel",
  "templates:read",
  "connections:read",
  "webhooks:manage",
  "integrations:read",
  "integrations:manage",
  "environments:read",
  "environments:write",
  "releases:read",
  "releases:create",
  "deployments:promote",
  "deployments:approve",
  "deployments:rollback",
  "tests:run",
  "ai:generate",
  "ai:analyze",
  "ai:optimize",
  "org:admin",
  "governance:read",
  "governance:write",
  "reviews:write",
  "slo:manage",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const CreateApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, "At least one scope must be selected"),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;

export const WEBHOOK_EVENTS = [
  "workflow.created",
  "workflow.updated",
  "workflow.activated",
  "workflow.deactivated",
  "execution.started",
  "execution.succeeded",
  "execution.failed",
  "execution.cancelled",
  "approval.requested",
  "approval.decided",
  "deployment.promoted",
  "deployment.approved",
  "deployment.failed",
  "deployment.rolled_back",
  "review.submitted",
  "review.approved",
  "review.rejected",
  "slo.breached",
  "policy.violated",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const CreateOutboundWebhookSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  url: z.string().url("Must be a valid URL"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "At least one event must be selected"),
});

export type CreateOutboundWebhookInput = z.infer<typeof CreateOutboundWebhookSchema>;

export const UpdateOutboundWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
  active: z.boolean().optional(),
});

export type UpdateOutboundWebhookInput = z.infer<typeof UpdateOutboundWebhookSchema>;

export const CustomIntegrationActionSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_-]+$/i, "Action ID must be alphanumeric"),
  name: z.string().min(1),
  description: z.string().optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().min(1, "URL template required"),
  headers: z.record(z.string()).default({}),
  bodyTemplate: z.string().optional(),
  inputSchema: z.record(z.any()).default({}),
  outputMapping: z.record(z.any()).optional(),
});

export type CustomIntegrationAction = z.infer<typeof CustomIntegrationActionSchema>;

export const CustomIntegrationDefinitionSchema = z.object({
  actions: z.array(CustomIntegrationActionSchema).min(1, "At least one action is required"),
  documentationUrl: z.string().url().optional(),
  authConfig: z
    .object({
      type: z.enum(["NONE", "API_KEY", "BEARER_TOKEN"]),
      headerName: z.string().optional(),
      tokenPrefix: z.string().optional(),
    })
    .optional(),
});

export type CustomIntegrationDefinition = z.infer<typeof CustomIntegrationDefinitionSchema>;

export const CreateCustomIntegrationSchema = z.object({
  key: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/, "Key must be lowercase alphanumeric and hyphens"),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.string().default("Custom"),
  definition: CustomIntegrationDefinitionSchema.optional(),
});

export type CreateCustomIntegrationInput = z.infer<typeof CreateCustomIntegrationSchema>;
