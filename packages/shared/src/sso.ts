import { z } from "zod";

// ==========================================
// OIDC SSO CONFIGURATION & AUTH
// ==========================================

export const ConfigureSsoSchema = z.object({
  name: z.string().min(2).max(100).default("Enterprise OIDC"),
  issuerUrl: z.string().url(),
  authorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  userinfoEndpoint: z.string().url().optional().or(z.literal("")),
  clientId: z.string().min(1).max(255),
  clientSecret: z.string().min(1).max(500).optional(),
  scopes: z.string().default("openid email profile"),
  enforceSso: z.boolean().default(false),
  allowPasswordFallbackForAdmins: z.boolean().default(true),
});

export type ConfigureSsoInput = z.infer<typeof ConfigureSsoSchema>;

export const TestSsoSchema = z.object({
  issuerUrl: z.string().url(),
  authorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1).optional(),
});

export type TestSsoInput = z.infer<typeof TestSsoSchema>;

export interface WorkspaceSsoConfigDto {
  id: string;
  workspaceId: string;
  name: string;
  issuerUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string | null;
  clientId: string;
  scopes: string;
  enforceSso: boolean;
  allowPasswordFallbackForAdmins: boolean;
  hasClientSecret: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// SCIM 2.0 PROTOCOL SCHEMAS & TYPES
// ==========================================

export const ScimUserSchema = z.object({
  schemas: z.array(z.string()).default(["urn:ietf:params:scim:schemas:core:2.0:User"]),
  userName: z.string().email(),
  name: z
    .object({
      formatted: z.string().optional(),
      familyName: z.string().optional(),
      givenName: z.string().optional(),
    })
    .optional(),
  displayName: z.string().optional(),
  active: z.boolean().default(true),
  emails: z
    .array(
      z.object({
        value: z.string().email(),
        primary: z.boolean().optional(),
        type: z.string().optional(),
      })
    )
    .optional(),
});

export type ScimUserInput = z.infer<typeof ScimUserSchema>;

export interface ScimUserResource {
  schemas: string[];
  id: string;
  userName: string;
  name: {
    formatted: string;
    familyName?: string;
    givenName?: string;
  };
  displayName: string;
  active: boolean;
  emails: Array<{
    value: string;
    primary: boolean;
    type: string;
  }>;
  roles: Array<{
    value: string;
    primary: boolean;
  }>;
  meta: {
    resourceType: "User";
    created: string;
    lastModified: string;
    location: string;
  };
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface ScimErrorResponse {
  schemas: string[];
  status: string;
  scimType?: string;
  detail: string;
}
