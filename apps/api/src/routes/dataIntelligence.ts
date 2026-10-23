import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateDataProductSchema,
  UpdateDataProductSchema,
  CreateDataProductVersionSchema,
  PublishDataProductVersionSchema,
  CreateDataSourceSchema,
  CreateDataPipelineSchema,
  CreatePipelineVersionSchema,
  RunPipelineSchema,
  CreateDataQualityRuleSchema,
  QueryDataProductSchema,
  RegisterLineageNodeSchema,
  RegisterLineageEdgeSchema,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { dataProductRegistryService } from "../services/dataProductRegistryService.js";
import { dataSourceAdapterService } from "../services/dataSourceAdapterService.js";
import { dataPipelineService } from "../services/dataPipelineService.js";
import { dataQualityService } from "../services/dataQualityService.js";
import { dataLineageService } from "../services/dataLineageService.js";
import { dataQueryService } from "../services/dataQueryService.js";

export async function dataIntelligenceRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================
  // 1. DATA PRODUCT REGISTRY
  // ==========================================

  // Create Data Product
  app.post(
    "/data-products",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Create a new governed data product",
        body: CreateDataProductSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const product = await dataProductRegistryService.createProduct(workspaceId, request.body, userId);
      return reply.status(201).send({ data: product });
    }
  );

  // List Data Products
  app.get(
    "/data-products",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "List data products in the workspace",
        querystring: z.object({
          businessDomain: z.string().optional(),
          lifecycleStatus: z.string().optional(),
          criticality: z.string().optional(),
          search: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const products = await dataProductRegistryService.listProducts(workspaceId, request.query);
      return reply.send({ data: products });
    }
  );

  // Get Data Product
  app.get(
    "/data-products/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Get a data product by ID or slug",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const product = await dataProductRegistryService.getProduct(workspaceId, request.params.id);
      return reply.send({ data: product });
    }
  );

  // Update Data Product
  app.patch(
    "/data-products/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Update data product metadata",
        params: z.object({ id: z.string() }),
        body: UpdateDataProductSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const updated = await dataProductRegistryService.updateProduct(workspaceId, request.params.id, request.body);
      return reply.send({ data: updated });
    }
  );

  // Create Data Product Version
  app.post(
    "/data-products/:id/versions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Create a new schema version draft for a data product",
        params: z.object({ id: z.string() }),
        body: CreateDataProductVersionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const version = await dataProductRegistryService.createProductVersion(
        workspaceId,
        request.params.id,
        request.body,
        userId
      );
      return reply.status(201).send({ data: version });
    }
  );

  // Publish Data Product Version
  app.post(
    "/data-products/:id/versions/:version/publish",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Publish a specific version of a data product with quality gate checks",
        params: z.object({ id: z.string(), version: z.coerce.number().int() }),
        body: PublishDataProductVersionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const published = await dataProductRegistryService.publishProductVersion(
        workspaceId,
        request.params.id,
        request.params.version,
        request.body,
        userId
      );
      return reply.send({ data: published });
    }
  );

  // Deprecate Data Product
  app.post(
    "/data-products/:id/deprecate",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Deprecate an active data product",
        params: z.object({ id: z.string() }),
        body: z.object({ reason: z.string().optional() }).optional(),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await dataProductRegistryService.deprecateProduct(workspaceId, request.params.id, request.body?.reason);
      return reply.send({ data: result });
    }
  );

  // Retire Data Product
  app.post(
    "/data-products/:id/retire",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Retire a deprecated data product",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await dataProductRegistryService.retireProduct(workspaceId, request.params.id);
      return reply.send({ data: result });
    }
  );

  // Check Downstream Impact
  app.get(
    "/data-products/:id/impact",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Analyze downstream dependencies and consumer impact of a data product",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const impact = await dataProductRegistryService.checkDownstreamImpact(workspaceId, request.params.id);
      return reply.send({ data: impact });
    }
  );

  // Query Published Data Product
  app.post(
    "/data-products/:id/query",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Query records from the active materialized dataset of a published data product",
        params: z.object({ id: z.string() }),
        body: QueryDataProductSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const queryResult = await dataQueryService.queryProduct(workspaceId, request.params.id, request.body);
      return reply.send({ data: queryResult });
    }
  );

  // ==========================================
  // 2. DATA SOURCES
  // ==========================================

  // Register Data Source
  app.post(
    "/data-sources",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Register an authorized FlowForge resource as a data source",
        body: CreateDataSourceSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const source = await dataSourceAdapterService.registerDataSource(workspaceId, request.body);
      return reply.status(201).send({ data: source });
    }
  );

  // List Data Sources
  app.get(
    "/data-sources",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "List registered data sources in the workspace",
        querystring: z.object({
          sourceType: z.any().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const sources = await dataSourceAdapterService.listDataSources(workspaceId, request.query.sourceType);
      return reply.send({ data: sources });
    }
  );

  // Get Data Source
  app.get(
    "/data-sources/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Get a data source by ID or slug",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const source = await dataSourceAdapterService.getDataSource(workspaceId, request.params.id);
      return reply.send({ data: source });
    }
  );

  // ==========================================
  // 3. DATA PIPELINES
  // ==========================================

  // Create Pipeline
  app.post(
    "/data-pipelines",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Create a declarative data pipeline",
        body: CreateDataPipelineSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const pipeline = await dataPipelineService.createPipeline(workspaceId, request.body);
      return reply.status(201).send({ data: pipeline });
    }
  );

  // List Pipelines
  app.get(
    "/data-pipelines",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "List data pipelines",
        querystring: z.object({
          dataProductId: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const pipelines = await dataPipelineService.listPipelines(workspaceId, request.query.dataProductId);
      return reply.send({ data: pipelines });
    }
  );

  // Get Pipeline
  app.get(
    "/data-pipelines/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Get a data pipeline by ID or slug",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const pipeline = await dataPipelineService.getPipeline(workspaceId, request.params.id);
      return reply.send({ data: pipeline });
    }
  );

  // Create Pipeline Version
  app.post(
    "/data-pipelines/:id/versions",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Create a new version of pipeline operations",
        params: z.object({ id: z.string() }),
        body: CreatePipelineVersionSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const version = await dataPipelineService.createPipelineVersion(workspaceId, request.params.id, request.body);
      return reply.status(201).send({ data: version });
    }
  );

  // Run Pipeline
  app.post(
    "/data-pipelines/:id/run",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Execute or dry-run a data pipeline",
        params: z.object({ id: z.string() }),
        body: RunPipelineSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await dataPipelineService.executePipeline(workspaceId, request.params.id, request.body);
      return reply.send({ data: result });
    }
  );

  // Preview Pipeline Sample
  app.post(
    "/data-pipelines/:id/preview",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Dry-run and preview pipeline transformations on a small sample",
        params: z.object({ id: z.string() }),
        body: z.object({ sampleSize: z.number().int().min(1).max(100).default(10) }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await dataPipelineService.executePipeline(workspaceId, request.params.id, {
        runType: "DRY_RUN",
        sampleSize: request.body.sampleSize,
      });
      return reply.send({ data: result });
    }
  );

  // ==========================================
  // 4. DATA QUALITY RULES
  // ==========================================

  // Create Quality Rule
  app.post(
    "/data-products/:id/quality-rules",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Create a quality rule for a data product",
        params: z.object({ id: z.string() }),
        body: CreateDataQualityRuleSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const rule = await dataQualityService.createRule(workspaceId, request.params.id, request.body);
      return reply.status(201).send({ data: rule });
    }
  );

  // List Quality Rules
  app.get(
    "/data-products/:id/quality-rules",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "List quality rules for a data product",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const rules = await dataQualityService.listRules(workspaceId, request.params.id);
      return reply.send({ data: rules });
    }
  );

  // Get Quality Rule
  app.get(
    "/data-quality-rules/:ruleId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Get a quality rule with evaluation history",
        params: z.object({ ruleId: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const rule = await dataQualityService.getRule(workspaceId, request.params.ruleId);
      return reply.send({ data: rule });
    }
  );

  // Update Quality Rule
  app.patch(
    "/data-quality-rules/:ruleId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Update an existing quality rule",
        params: z.object({ ruleId: z.string() }),
        body: CreateDataQualityRuleSchema.partial(),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const updated = await dataQualityService.updateRule(workspaceId, request.params.ruleId, request.body);
      return reply.send({ data: updated });
    }
  );

  // Delete Quality Rule
  app.delete(
    "/data-quality-rules/:ruleId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Delete a quality rule",
        params: z.object({ ruleId: z.string() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const result = await dataQualityService.deleteRule(workspaceId, request.params.ruleId);
      return reply.send({ data: result });
    }
  );

  // ==========================================
  // 5. DATA LINEAGE
  // ==========================================

  // Get Lineage Graph
  app.get(
    "/data-lineage",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Retrieve the data lineage graph with optional root node and direction traversal",
        querystring: z.object({
          rootNodeKey: z.string().optional(),
          direction: z.enum(["UPSTREAM", "DOWNSTREAM", "BOTH"]).optional(),
          maxDepth: z.coerce.number().int().min(1).max(10).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const graph = await dataLineageService.getLineageGraph(workspaceId, request.query);
      return reply.send({ data: graph });
    }
  );

  // Register Lineage Node
  app.post(
    "/data-lineage/nodes",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Explicitly register or update a lineage node",
        body: RegisterLineageNodeSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const node = await dataLineageService.registerNode(workspaceId, request.body);
      return reply.status(201).send({ data: node });
    }
  );

  // Register Lineage Edge
  app.post(
    "/data-lineage/edges",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Data Intelligence"],
        summary: "Explicitly register a lineage relationship edge",
        body: RegisterLineageEdgeSchema,
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const edge = await dataLineageService.registerEdge(workspaceId, request.body);
      return reply.status(201).send({ data: edge });
    }
  );
}
