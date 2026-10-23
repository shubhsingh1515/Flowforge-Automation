import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "@flowforge/database";
import {
  CreateConnectorDraftSchema,
  ReviewCertificationSchema,
  PublishReleaseSchema,
  SuspendConnectorSchema,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { connectorPlatformService } from "../services/connectorPlatformService.js";

export async function connectorRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. Validate manifest contract and calculate canonical hash
  app.post(
    "/connectors/validate-manifest",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Validate a connector manifest against specification without persisting",
        body: z.object({
          manifest: z.any(),
        }),
      },
    },
    async (request, reply) => {
      const result = connectorPlatformService.validateManifest(request.body.manifest);
      return reply.send(result);
    }
  );

  // 2. List connector release artifacts
  app.get(
    "/connectors",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "List connector release artifacts in current workspace or published registry",
        querystring: z.object({
          connectorKey: z.string().optional(),
          status: z.string().optional(),
          scope: z.enum(["workspace", "published", "all"]).default("all"),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { connectorKey, status, scope } = request.query;

      const where: any = {};
      if (connectorKey) where.connectorKey = connectorKey;
      if (status) where.status = status;

      if (scope === "workspace") {
        where.publisherWorkspaceId = workspaceId;
      } else if (scope === "published") {
        where.status = "PUBLISHED";
      } else {
        where.OR = [
          { publisherWorkspaceId: workspaceId },
          { status: "PUBLISHED" },
        ];
      }

      const artifacts = await prisma.connectorReleaseArtifact.findMany({
        where,
        include: {
          certifications: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { checks: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return reply.send(artifacts);
    }
  );

  // 3. Create draft connector release artifact
  app.post(
    "/connectors/drafts",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Register a new draft connector release artifact",
        body: CreateConnectorDraftSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const artifact = await connectorPlatformService.createDraft(
        workspaceId,
        userId,
        request.body.manifest
      );
      return reply.status(201).send(artifact);
    }
  );

  // 4. Get connector artifact by ID
  app.get(
    "/connectors/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Get connector release artifact details with certification history",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const artifact = await prisma.connectorReleaseArtifact.findUnique({
        where: { id: request.params.id },
        include: {
          certifications: {
            orderBy: { createdAt: "desc" },
            include: { checks: true },
          },
        },
      });

      if (!artifact) {
        return reply.status(404).send({ error: "Connector artifact not found" });
      }

      return reply.send(artifact);
    }
  );

  // 5. Submit release artifact to automated certification pipeline
  app.post(
    "/connectors/:id/certify",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Run automated 6-check certification pipeline on connector release artifact",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await connectorPlatformService.submitForCertification(
        request.params.id,
        workspaceId
      );
      return reply.send(result);
    }
  );

  // 6. Review connector certification (Human reviewer approval/rejection)
  app.post(
    "/connectors/:id/reviews",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Submit security review decision for a connector release artifact",
        params: z.object({ id: z.string() }),
        body: ReviewCertificationSchema,
      },
    },
    async (request, reply) => {
      const { id: userId } = request.authUser!;
      const result = await connectorPlatformService.reviewCertification(
        request.params.id,
        userId,
        request.body.decision,
        request.body.reviewNotes
      );
      return reply.send(result);
    }
  );

  // 7. Publish certified release artifact
  app.post(
    "/connectors/:id/publish",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Publish certified connector release artifact to marketplace",
        params: z.object({ id: z.string() }),
        body: PublishReleaseSchema.optional(),
      },
    },
    async (request, reply) => {
      const { id: userId } = request.authUser!;
      const published = await connectorPlatformService.publishRelease(
        request.params.id,
        userId,
        request.body?.expectedArtifactHashSha256
      );
      return reply.send(published);
    }
  );

  // 8. Suspend or revoke connector artifact
  app.post(
    "/connectors/:id/suspend",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Emergency suspension or revocation of a connector release artifact",
        params: z.object({ id: z.string() }),
        body: SuspendConnectorSchema,
      },
    },
    async (request, reply) => {
      const suspended = await connectorPlatformService.suspendConnector(
        request.params.id,
        request.body.reason,
        request.body.isPermanentRevocation
      );
      return reply.send(suspended);
    }
  );

  // 9. Install published connector
  app.post(
    "/connectors/:id/install",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Install a published connector release artifact into current workspace",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const result = await connectorPlatformService.installConnector(
        workspaceId,
        request.params.id,
        userId
      );
      return reply.send(result);
    }
  );

  // 10. Upgrade preflight compatibility diff
  app.post(
    "/connectors/:id/upgrade-preflight",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Compute preflight compatibility diff between current artifact and target version",
        params: z.object({ id: z.string() }),
        body: z.object({
          targetArtifactId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const diff = await connectorPlatformService.upgradePreflight(
        workspaceId,
        request.params.id,
        request.body.targetArtifactId
      );
      return reply.send(diff);
    }
  );

  // 11. Upgrade connector installation
  app.post(
    "/connectors/installations/:installationId/upgrade",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Upgrade workspace installation to target artifact with preflight breaking-change guard",
        params: z.object({ installationId: z.string() }),
        body: z.object({
          targetArtifactId: z.string(),
          acknowledgeBreakingChanges: z.boolean().default(false),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await connectorPlatformService.upgradeConnector(
        workspaceId,
        request.params.installationId,
        request.body.targetArtifactId,
        request.body.acknowledgeBreakingChanges
      );
      return reply.send(result);
    }
  );

  // 12. Rollback connector installation
  app.post(
    "/connectors/installations/:installationId/rollback",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Roll back a connector installation to previous version",
        params: z.object({ installationId: z.string() }),
        body: z.object({
          targetArtifactId: z.string().optional(),
          reason: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await connectorPlatformService.rollbackConnector(
        workspaceId,
        request.params.installationId,
        request.body.targetArtifactId,
        request.body.reason
      );
      return reply.send(result);
    }
  );

  // 13. Telemetry and operational analytics
  app.get(
    "/connectors/:key/analytics",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Connectors"],
        summary: "Query operational execution metrics and health telemetry for a connector",
        params: z.object({ key: z.string() }),
      },
    },
    async (request, reply) => {
      const metrics = await connectorPlatformService.getConnectorMetrics(request.params.key);
      return reply.send(metrics);
    }
  );
}
