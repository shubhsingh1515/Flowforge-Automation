import { z } from "zod";

export const UpdateGovernancePolicySchema = z.object({
  allowCustomIntegrations: z.boolean().optional(),
  allowMarketplacePublishing: z.boolean().optional(),
  allowCommunityTemplates: z.boolean().optional(),
  requireHttpsWebhooks: z.boolean().optional(),
  maxApiKeyLifetimeDays: z.number().int().min(1).max(365).nullable().optional(),
  restrictIntegrationsToAdmin: z.boolean().optional(),
});

export type UpdateGovernancePolicyInput = z.infer<typeof UpdateGovernancePolicySchema>;

export const UpdateRetentionPolicySchema = z.object({
  executionRetentionDays: z.number().int().min(1).max(365).optional(),
  webhookDeliveryRetentionDays: z.number().int().min(1).max(365).optional(),
  auditLogRetentionDays: z.number().int().min(1).max(365).optional(),
});

export type UpdateRetentionPolicyInput = z.infer<typeof UpdateRetentionPolicySchema>;

export const RequestDataExportSchema = z.object({
  includeExecutions: z.boolean().optional().default(true),
  includeDeliveries: z.boolean().optional().default(true),
});

export type RequestDataExportInput = z.infer<typeof RequestDataExportSchema>;

export const RequestWorkspaceDeletionSchema = z.object({
  reason: z.string().min(3).max(500),
  confirmationPhrase: z.string().min(1),
});

export type RequestWorkspaceDeletionInput = z.infer<typeof RequestWorkspaceDeletionSchema>;
