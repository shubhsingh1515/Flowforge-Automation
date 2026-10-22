import { z } from "zod";

export const IntegrationCategoryEnum = z.enum([
  "CORE",
  "COMMUNICATION",
  "PRODUCTIVITY",
  "DEVELOPER",
  "STORAGE",
]);

export type IntegrationCategory = z.infer<typeof IntegrationCategoryEnum>;

export const IntegrationStatusEnum = z.enum(["AVAILABLE", "PLANNED", "BETA"]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusEnum>;

export const AuthTypeEnum = z.enum(["NONE", "API_KEY", "OAUTH2", "BEARER_TOKEN"]);
export type AuthType = z.infer<typeof AuthTypeEnum>;

export interface IntegrationCapability {
  name: string;
  type: "TRIGGER" | "ACTION";
  description: string;
  parameters: Array<{
    name: string;
    label: string;
    type: "string" | "number" | "boolean" | "json";
    required: boolean;
    description?: string;
  }>;
}

export interface IntegrationDefinition {
  key: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  authType: AuthType;
  isBuiltin: boolean;
  iconName: string;
  accentColor: string;
  documentationUrl?: string;
  triggers: IntegrationCapability[];
  actions: IntegrationCapability[];
  authRequirements: {
    instructions: string;
    fields: Array<{
      name: string;
      label: string;
      placeholder?: string;
      type: "text" | "password";
      required: boolean;
    }>;
  };
}

export const ConnectAccountSchema = z.object({
  integrationKey: z.string(),
  name: z.string().min(2, "Connection name is required").max(100),
  credentials: z.record(z.string()).default({}),
});

export type ConnectAccountInput = z.infer<typeof ConnectAccountSchema>;

export const ConnectedAccountResponseSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  integrationKey: z.string(),
  name: z.string(),
  status: z.enum(["ACTIVE", "ERROR", "EXPIRED"]),
  lastVerifiedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ConnectedAccountResponse = z.infer<typeof ConnectedAccountResponseSchema>;
