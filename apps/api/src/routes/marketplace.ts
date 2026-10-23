import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateMarketplaceListingSchema,
  InstallMarketplaceListingSchema,
  ReviewMarketplaceListingSchema,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { marketplaceService } from "../services/marketplace.js";

export async function marketplaceRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // List marketplace catalog
  app.get(
    "/marketplace",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Integration Marketplace"],
        summary: "Discover integrations and published packages with search and category filters",
        querystring: z.object({
          search: z.string().optional(),
          category: z.string().optional(),
          visibility: z.enum(["PUBLIC", "WORKSPACE", "ALL"]).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const listings = await marketplaceService.listListings(workspaceId, request.query);
      return reply.send(listings);
    }
  );

  // Get marketplace listing details
  app.get(
    "/marketplace/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Integration Marketplace"],
        summary: "Get detailed information, supported actions, triggers, and compatibility for an integration listing",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const listing = await marketplaceService.getListing(request.params.id, workspaceId);
      return reply.send(listing);
    }
  );

  // Install marketplace listing into workspace
  app.post(
    "/marketplace/:id/install",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Integration Marketplace"],
        summary: "Install a published integration listing pinned to a specific version (safe: no auto-activation)",
        params: z.object({ id: z.string() }),
        body: InstallMarketplaceListingSchema.optional(),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await marketplaceService.installListing(
        workspaceId,
        request.params.id,
        request.body?.version
      );
      return reply.status(200).send(result);
    }
  );

  // Uninstall marketplace listing from workspace
  app.delete(
    "/marketplace/:id/install",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Integration Marketplace"],
        summary: "Uninstall an integration listing from the workspace",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await marketplaceService.uninstallListing(workspaceId, request.params.id);
      return reply.send(result);
    }
  );

  // Submit integration listing for marketplace review
  app.post(
    "/marketplace",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Integration Marketplace"],
        summary: "Submit a custom integration definition to the marketplace for publication review",
        body: CreateMarketplaceListingSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const listing = await marketplaceService.submitListing(workspaceId, userId, request.body);
      return reply.status(201).send(listing);
    }
  );

  // Review submitted listing (admin decision: APPROVE or REJECT)
  app.post(
    "/marketplace/:id/review",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Integration Marketplace"],
        summary: "Approve or reject a marketplace submission",
        params: z.object({ id: z.string() }),
        body: ReviewMarketplaceListingSchema,
      },
    },
    async (request, reply) => {
      const { id: userId, workspaceRole } = request.authUser!;
      if (workspaceRole !== "ADMIN" && workspaceRole !== "OWNER") {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Only administrators can review marketplace listings.",
          statusCode: 403,
        });
      }

      const updated = await marketplaceService.reviewListing(userId, request.params.id, request.body);
      return reply.send(updated);
    }
  );

  // Deprecate a published listing
  app.post(
    "/marketplace/:id/deprecate",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Integration Marketplace"],
        summary: "Deprecate an active marketplace listing",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const result = await marketplaceService.deprecateListing(workspaceId, request.params.id, userId);
      return reply.send(result);
    }
  );
}
