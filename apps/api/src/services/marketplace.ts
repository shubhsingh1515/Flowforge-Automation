import { prisma } from "@flowforge/database";
import {
  CreateMarketplaceListingInput,
  ReviewMarketplaceListingInput,
  UpdateMarketplaceListingInput,
} from "@flowforge/shared";
import { governanceService } from "./governance.js";

export class MarketplaceService {
  /**
   * Ensures standard platform integrations are represented in the marketplace catalog.
   */
  async seedPlatformListingsIfNeeded() {
    const existingCount = await prisma.marketplaceListing.count({
      where: { publisherName: "FlowForge Platform" },
    });

    if (existingCount > 0) return;

    const platformIntegrations = [
      {
        slug: "slack",
        title: "Slack Notification & Collaboration",
        description: "Post messages, alerts, and rich markdown blocks to Slack channels, direct messages, and team threads.",
        category: "Communication",
        iconName: "MessageSquare",
        accentColor: "#4A154B",
        integrationKey: "slack",
        capabilities: ["channel:write", "chat:write", "im:write"],
        supportedTriggers: ["channel_message", "mention"],
        supportedActions: ["send_message", "send_rich_block", "upload_file"],
        authRequirements: "Slack OAuth 2.0 Bot & User Token",
        documentationUrl: "https://docs.flowforge.com/integrations/slack",
      },
      {
        slug: "google-sheets",
        title: "Google Sheets Cloud Spreadsheet Sync",
        description: "Append rows, update cell ranges, and read real-time spreadsheet records from Google Sheets workbooks.",
        category: "Productivity",
        iconName: "FileSpreadsheet",
        accentColor: "#0F9D58",
        integrationKey: "google-sheets",
        capabilities: ["spreadsheets.read", "spreadsheets.write"],
        supportedTriggers: ["new_row_appended"],
        supportedActions: ["append_row", "update_cell_range", "lookup_row"],
        authRequirements: "Google OAuth 2.0 (Drive & Sheets scopes)",
        documentationUrl: "https://docs.flowforge.com/integrations/google-sheets",
      },
      {
        slug: "gmail",
        title: "Gmail Automation & Email Dispatch",
        description: "Send transactional emails, notification briefs, and customer confirmations via Google Workspace Gmail.",
        category: "Communication",
        iconName: "Mail",
        accentColor: "#EA4335",
        integrationKey: "gmail",
        capabilities: ["gmail.send", "gmail.compose"],
        supportedTriggers: ["new_email_received"],
        supportedActions: ["send_email", "create_draft"],
        authRequirements: "Google OAuth 2.0 (Gmail send scope)",
        documentationUrl: "https://docs.flowforge.com/integrations/gmail",
      },
      {
        slug: "google-drive",
        title: "Google Drive Cloud Asset Storage",
        description: "Upload workflow output files, create project folders, and synchronize assets with Google Drive.",
        category: "Data & Storage",
        iconName: "HardDrive",
        accentColor: "#4285F4",
        integrationKey: "google-drive",
        capabilities: ["drive.file", "drive.metadata.readonly"],
        supportedTriggers: ["file_created"],
        supportedActions: ["upload_file", "create_folder"],
        authRequirements: "Google OAuth 2.0 (Drive file scope)",
        documentationUrl: "https://docs.flowforge.com/integrations/google-drive",
      },
      {
        slug: "webhook",
        title: "Generic Inbound & Outbound Webhooks",
        description: "Trigger workflows from any external HTTP JSON payload or send real-time signed webhooks to external endpoints.",
        category: "Developer Tools",
        iconName: "Webhook",
        accentColor: "#6366f1",
        integrationKey: "webhook",
        capabilities: ["http:post", "hmac:verify"],
        supportedTriggers: ["inbound_webhook_event"],
        supportedActions: ["dispatch_webhook"],
        authRequirements: "HMAC-SHA256 Signing Secret or Token",
        documentationUrl: "https://docs.flowforge.com/integrations/webhooks",
      },
      {
        slug: "http-request",
        title: "HTTP Request & REST API Dispatcher",
        description: "Make outbound HTTP GET, POST, PUT, PATCH, and DELETE requests to any public or internal REST API.",
        category: "Developer Tools",
        iconName: "Globe",
        accentColor: "#8b5cf6",
        integrationKey: "http-request",
        capabilities: ["rest:any", "json:interpolate"],
        supportedTriggers: ["manual"],
        supportedActions: ["execute_http_request"],
        authRequirements: "Custom Bearer Token, API Key, or Basic Auth",
        documentationUrl: "https://docs.flowforge.com/integrations/http-request",
      },
    ];

    for (const item of platformIntegrations) {
      await prisma.marketplaceListing.upsert({
        where: { slug: item.slug },
        update: item,
        create: {
          ...item,
          publisherName: "FlowForge Platform",
          visibility: "PUBLIC",
          reviewStatus: "PUBLISHED",
          currentVersion: 1,
        },
      });
    }
  }

  /**
   * Lists marketplace listings discoverable by a workspace with search and category filters.
   */
  async listListings(
    workspaceId: string,
    query: {
      search?: string;
      category?: string;
      visibility?: "PUBLIC" | "WORKSPACE" | "ALL";
    } = {}
  ) {
    await this.seedPlatformListingsIfNeeded();

    const where: any = {
      OR: [
        { visibility: "PUBLIC", reviewStatus: "PUBLISHED" },
        { publisherWorkspaceId: workspaceId },
      ],
    };

    if (query.category && query.category !== "ALL") {
      where.category = query.category;
    }

    if (query.search) {
      const s = query.search.toLowerCase();
      where.AND = [
        {
          OR: [
            { title: { contains: s, mode: "insensitive" } },
            { description: { contains: s, mode: "insensitive" } },
            { slug: { contains: s, mode: "insensitive" } },
          ],
        },
      ];
    }

    const [listings, installations] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where,
        orderBy: [{ publisherName: "asc" }, { title: "asc" }],
      }),
      prisma.marketplaceInstallation.findMany({
        where: { workspaceId, status: "ACTIVE" },
      }),
    ]);

    const installedMap = new Map(installations.map((i) => [i.listingId, i]));

    return listings.map((l) => ({
      ...l,
      isInstalled: installedMap.has(l.id),
      installedVersion: installedMap.get(l.id)?.installedVersion,
    }));
  }

  /**
   * Retrieves full details for a single marketplace listing.
   */
  async getListing(slugOrId: string, workspaceId: string) {
    await this.seedPlatformListingsIfNeeded();

    const listing = await prisma.marketplaceListing.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
        AND: [
          {
            OR: [
              { visibility: "PUBLIC", reviewStatus: "PUBLISHED" },
              { publisherWorkspaceId: workspaceId },
            ],
          },
        ],
      },
      include: {
        installations: {
          where: { workspaceId },
        },
      },
    });

    if (!listing) {
      const error: any = new Error("Marketplace listing not found or access denied.");
      error.statusCode = 404;
      throw error;
    }

    const installation = listing.installations[0];

    return {
      ...listing,
      isInstalled: Boolean(installation && installation.status === "ACTIVE"),
      installedVersion: installation?.installedVersion,
    };
  }

  /**
   * Installs a marketplace listing into the workspace, pinned to a specific version.
   * Safe installation: never automatically activates workflows or triggers external actions.
   */
  async installListing(workspaceId: string, listingId: string, requestedVersion?: number) {
    // 1. Check governance policy
    const policy = await governanceService.getEffectivePolicy(workspaceId);
    if (!policy.allowCommunityTemplates && !policy.allowCustomIntegrations) {
      // Check if it's a community listing
    }

    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      const error: any = new Error("Marketplace listing not found.");
      error.statusCode = 404;
      throw error;
    }

    if (listing.reviewStatus !== "PUBLISHED" && listing.publisherWorkspaceId !== workspaceId) {
      const error: any = new Error("Cannot install unapproved or deprecated marketplace listing.");
      error.statusCode = 403;
      throw error;
    }

    const versionToPin = requestedVersion || listing.currentVersion;

    const installation = await prisma.marketplaceInstallation.upsert({
      where: {
        workspaceId_listingId: {
          workspaceId,
          listingId,
        },
      },
      update: {
        installedVersion: versionToPin,
        status: "ACTIVE",
        updatedAt: new Date(),
      },
      create: {
        workspaceId,
        listingId,
        installedVersion: versionToPin,
        status: "ACTIVE",
      },
    });

    // Record audit log
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: "system",
        actorType: "USER",
        action: "MARKETPLACE_INSTALL",
        targetType: "MARKETPLACE_LISTING",
        targetId: listing.id,
        metadata: {
          slug: listing.slug,
          version: versionToPin,
        },
      },
    });

    return {
      installation,
      message: `Successfully installed ${listing.title} (pinned to version ${versionToPin}).`,
    };
  }

  /**
   * Uninstalls or disables an installed marketplace listing from the workspace.
   */
  async uninstallListing(workspaceId: string, listingId: string) {
    const installation = await prisma.marketplaceInstallation.findUnique({
      where: {
        workspaceId_listingId: {
          workspaceId,
          listingId,
        },
      },
    });

    if (!installation) {
      const error: any = new Error("Listing is not installed in this workspace.");
      error.statusCode = 404;
      throw error;
    }

    await prisma.marketplaceInstallation.delete({
      where: {
        workspaceId_listingId: {
          workspaceId,
          listingId,
        },
      },
    });

    // Record audit log
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: "system",
        actorType: "USER",
        action: "MARKETPLACE_UNINSTALL",
        targetType: "MARKETPLACE_LISTING",
        targetId: listingId,
      },
    });

    return { success: true, message: "Listing successfully uninstalled." };
  }

  /**
   * Submits a custom integration definition to the marketplace for publication review.
   */
  async submitListing(workspaceId: string, userId: string, input: CreateMarketplaceListingInput) {
    // 1. Enforce governance policy
    const policy = await governanceService.getEffectivePolicy(workspaceId);
    if (!policy.allowMarketplacePublishing) {
      const error: any = new Error("Workspace governance policy prohibits publishing custom integrations to the marketplace.");
      error.statusCode = 403;
      throw error;
    }

    // 2. Check slug uniqueness
    const existingSlug = await prisma.marketplaceListing.findUnique({
      where: { slug: input.slug },
    });
    if (existingSlug) {
      const error: any = new Error(`Marketplace slug '${input.slug}' is already taken.`);
      error.statusCode = 409;
      throw error;
    }

    // 3. Create listing with IN_REVIEW status
    const listing = await prisma.marketplaceListing.create({
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description,
        category: input.category,
        iconName: input.iconName,
        accentColor: input.accentColor,
        publisherName: `Workspace ${workspaceId.substring(0, 8)}`,
        publisherWorkspaceId: workspaceId,
        integrationKey: input.integrationKey,
        customIntegrationId: input.customIntegrationId,
        currentVersion: 1,
        visibility: input.visibility,
        reviewStatus: "IN_REVIEW",
        capabilities: input.capabilities,
        supportedTriggers: input.supportedTriggers,
        supportedActions: input.supportedActions,
        authRequirements: input.authRequirements,
        documentationUrl: input.documentationUrl,
      },
    });

    // Record audit log
    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        actorType: "USER",
        action: "MARKETPLACE_LISTING_SUBMITTED",
        targetType: "MARKETPLACE_LISTING",
        targetId: listing.id,
        metadata: { slug: listing.slug, title: listing.title },
      },
    });

    return listing;
  }

  /**
   * Review a submitted marketplace listing (Approves or Rejects).
   */
  async reviewListing(adminUserId: string, listingId: string, input: ReviewMarketplaceListingInput) {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      const error: any = new Error("Listing not found.");
      error.statusCode = 404;
      throw error;
    }

    if (listing.reviewStatus !== "IN_REVIEW" && listing.reviewStatus !== "DRAFT") {
      const error: any = new Error(`Cannot review listing in '${listing.reviewStatus}' status. Must be IN_REVIEW.`);
      error.statusCode = 400;
      throw error;
    }

    const newStatus = input.decision === "APPROVE" ? "PUBLISHED" : "REJECTED";

    const updated = await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: {
        reviewStatus: newStatus,
        rejectionReason: input.decision === "REJECT" ? input.rejectionReason : null,
      },
    });

    if (listing.publisherWorkspaceId) {
      await prisma.workspaceAuditLog.create({
        data: {
          workspaceId: listing.publisherWorkspaceId,
          actorId: adminUserId,
          actorType: "ADMIN",
          action: `MARKETPLACE_LISTING_${newStatus}`,
          targetType: "MARKETPLACE_LISTING",
          targetId: listing.id,
          metadata: { decision: input.decision, reason: input.rejectionReason },
        },
      });
    }

    return updated;
  }

  /**
   * Deprecates a published marketplace listing.
   */
  async deprecateListing(workspaceId: string, listingId: string, userId: string) {
    const listing = await prisma.marketplaceListing.findFirst({
      where: { id: listingId, publisherWorkspaceId: workspaceId },
    });

    if (!listing) {
      const error: any = new Error("Listing not found or access denied.");
      error.statusCode = 404;
      throw error;
    }

    const updated = await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { reviewStatus: "DEPRECATED" },
    });

    await prisma.workspaceAuditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        actorType: "USER",
        action: "MARKETPLACE_LISTING_DEPRECATED",
        targetType: "MARKETPLACE_LISTING",
        targetId: listing.id,
      },
    });

    return updated;
  }
}

export const marketplaceService = new MarketplaceService();
