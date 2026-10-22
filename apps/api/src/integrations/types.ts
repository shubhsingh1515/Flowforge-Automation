import { StepExecutionContext, NodeExecutionResult, ExecutionErrorCategory } from "../engine/types.js";

export interface DecryptedCredentials {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  teamId?: string;
  teamName?: string;
  botUserId?: string;
  userEmail?: string;
  userName?: string;
  accountId?: string;
  expiresIn?: number;
  apiKey?: string;
  raw?: Record<string, any>;
}

export interface OperationParameter {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "json" | "select";
  required?: boolean;
  description?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  default?: any;
}

export interface OperationExecutionContext {
  workspaceId: string;
  connectedAccountId?: string;
  credentials?: DecryptedCredentials;
  parameters: Record<string, any>;
  stepContext: StepExecutionContext;
}

export interface IntegrationOperation {
  id: string; // e.g. "post_message", "append_row"
  name: string;
  description: string;
  type: "ACTION" | "TRIGGER";
  parameters: OperationParameter[];
  execute: (ctx: OperationExecutionContext) => Promise<NodeExecutionResult>;
}

export interface IntegrationProvider {
  key: string; // e.g. "slack", "google-sheets", "gmail", "google-drive"
  name: string;
  description: string;
  category: "COMMUNICATION" | "PRODUCTIVITY" | "STORAGE" | "DEVELOPER" | "CORE";
  iconName: string;
  authType: "OAUTH2" | "API_KEY" | "NONE";
  operations: IntegrationOperation[];
  getAuthorizationUrl?: (params: { state: string; redirectUri: string; codeChallenge?: string }) => string;
  exchangeCode?: (params: { code: string; redirectUri: string; codeVerifier?: string }) => Promise<{
    credentials: DecryptedCredentials;
    accountName: string;
    expiresAt?: Date;
    metadata?: Record<string, any>;
  }>;
  refreshToken?: (refreshToken: string) => Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }>;
}
