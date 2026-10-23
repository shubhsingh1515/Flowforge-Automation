import { z } from "zod";

export const MARKETPLACE_CATEGORIES = [
  "Communication",
  "Productivity",
  "Data & Storage",
  "Developer Tools",
  "CRM & Sales",
  "Operations & Monitoring",
  "Custom APIs",
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

export const REVIEW_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "PUBLISHED",
  "REJECTED",
  "DEPRECATED",
  "UNPUBLISHED",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const CreateMarketplaceListingSchema = z.object({
  title: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().min(10).max(1000),
  category: z.enum(MARKETPLACE_CATEGORIES).default("Productivity"),
  iconName: z.string().default("Puzzle"),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).default("#6366f1"),
  integrationKey: z.string().optional(),
  customIntegrationId: z.string().optional(),
  visibility: z.enum(["PUBLIC", "WORKSPACE", "PRIVATE"]).default("WORKSPACE"),
  capabilities: z.array(z.string()).default([]),
  supportedTriggers: z.array(z.string()).default([]),
  supportedActions: z.array(z.string()).default([]),
  authRequirements: z.string().default("OAuth 2.0 or API Key"),
  documentationUrl: z.string().url().optional(),
});

export type CreateMarketplaceListingInput = z.infer<typeof CreateMarketplaceListingSchema>;

export const UpdateMarketplaceListingSchema = z.object({
  title: z.string().min(2).max(100).optional(),
  description: z.string().min(10).max(1000).optional(),
  category: z.enum(MARKETPLACE_CATEGORIES).optional(),
  iconName: z.string().optional(),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
  capabilities: z.array(z.string()).optional(),
  supportedTriggers: z.array(z.string()).optional(),
  supportedActions: z.array(z.string()).optional(),
  authRequirements: z.string().optional(),
  documentationUrl: z.string().url().optional(),
});

export type UpdateMarketplaceListingInput = z.infer<typeof UpdateMarketplaceListingSchema>;

export const ReviewMarketplaceListingSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  rejectionReason: z.string().max(500).optional(),
});

export type ReviewMarketplaceListingInput = z.infer<typeof ReviewMarketplaceListingSchema>;

export const InstallMarketplaceListingSchema = z.object({
  version: z.number().int().min(1).optional(),
});

export type InstallMarketplaceListingInput = z.infer<typeof InstallMarketplaceListingSchema>;
