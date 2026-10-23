import { HttpError } from "./dataIntelligenceErrors.js";
import crypto from "crypto";
import { prisma } from "@flowforge/database";
import {
  CreateDataProductInput,
  UpdateDataProductInput,
  CreateDataProductVersionInput,
  PublishDataProductVersionInput,
  DataProductLifecycleStatus,
} from "@flowforge/shared";
import { dataQualityService } from "./dataQualityService.js";
import { dataLineageService } from "./dataLineageService.js";

export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalJsonStringify(item)).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((key) => JSON.stringify(key) + ":" + canonicalJsonStringify(obj[key]));
  return "{" + pairs.join(",") + "}";
}

export function computeSha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export interface SchemaDiffResult {
  isCompatible: boolean;
  isBreaking: boolean;
  addedFields: string[];
  removedFields: string[];
  typeChanges: { field: string; from: string; to: string }[];
  breakingReasons: string[];
}

export class DataProductRegistryService {
  /**
   * Generates a deterministic SHA-256 canonical hash of any schema object.
   */
  public generateSchemaHash(schema: Record<string, any>): string {
    const canonical = canonicalJsonStringify(schema);
    return computeSha256(canonical);
  }

  /**
   * Compares an existing schema and a candidate new schema, identifying added/removed fields and breaking changes.
   */
  public diffSchemas(oldSchema: Record<string, any>, newSchema: Record<string, any>): SchemaDiffResult {
    const oldProps = oldSchema?.properties || {};
    const newProps = newSchema?.properties || {};
    const oldRequired = new Set<string>(oldSchema?.required || []);
    const newRequired = new Set<string>(newSchema?.required || []);

    const addedFields: string[] = [];
    const removedFields: string[] = [];
    const typeChanges: { field: string; from: string; to: string }[] = [];
    const breakingReasons: string[] = [];

    // Check removed fields
    for (const key of Object.keys(oldProps)) {
      if (!newProps[key]) {
        removedFields.push(key);
        breakingReasons.push(`Field '${key}' was removed in new version`);
      }
    }

    // Check added fields and type changes
    for (const key of Object.keys(newProps)) {
      if (!oldProps[key]) {
        addedFields.push(key);
        // If an added field is required without a default, it breaks backward compatibility
        if (newRequired.has(key) && newProps[key].default === undefined) {
          breakingReasons.push(`Field '${key}' is newly required without a default`);
        }
      } else {
        const oldType = oldProps[key].type || "any";
        const newType = newProps[key].type || "any";
        if (oldType !== newType) {
          typeChanges.push({ field: key, from: oldType, to: newType });
          breakingReasons.push(`Field '${key}' changed type from '${oldType}' to '${newType}'`);
        }
      }
    }

    const isBreaking = breakingReasons.length > 0;
    return {
      isCompatible: !isBreaking,
      isBreaking,
      addedFields,
      removedFields,
      typeChanges,
      breakingReasons,
    };
  }

  /**
   * Creates a new Data Product definition in DRAFT state.
   */
  public async createProduct(
    workspaceId: string,
    input: CreateDataProductInput,
    creatorUserId?: string
  ) {
    const existing = await prisma.dataProductDefinition.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new HttpError(409, `Data Product with slug '${input.slug}' already exists in workspace.`);
    }

    const initialSchema = input.initialSchema || {
      type: "object",
      properties: {},
      required: [],
    };
    const schemaHash = this.generateSchemaHash(initialSchema);

    const product = await prisma.dataProductDefinition.create({
      data: {
        workspaceId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        businessDomain: input.businessDomain || "GENERAL",
        criticality: input.criticality || "MEDIUM",
        ownerUserId: input.ownerUserId || creatorUserId,
        owningTeamId: input.owningTeamId,
        stewardUserId: input.stewardUserId,
        dataClassification: input.dataClassification || "INTERNAL",
        currentVersion: 1,
        lifecycleStatus: "DRAFT",
        refreshStrategy: input.refreshStrategy || "ON_DEMAND",
        refreshIntervalMinutes: input.refreshIntervalMinutes,
        targetFreshnessMinutes: input.targetFreshnessMinutes,
        retentionDays: input.retentionDays,
        canonicalHash: schemaHash,
        qualityStatus: "INSUFFICIENT_DATA",
        versions: {
          create: {
            workspaceId,
            version: 1,
            status: "DRAFT",
            schemaDefinition: initialSchema,
            canonicalHash: schemaHash,
            changeSummary: "Initial version",
            isBreaking: false,
          },
        },
      },
      include: {
        versions: true,
      },
    });

    // Register initial lineage node
    await dataLineageService.registerNode(workspaceId, {
      nodeKey: `product:${product.slug}`,
      nodeType: "DATA_PRODUCT",
      name: product.name,
      version: "1",
      metadata: {
        domain: product.businessDomain,
        criticality: product.criticality,
        status: product.lifecycleStatus,
      },
    });

    return product;
  }

  /**
   * Lists data products for a workspace with optional filters.
   */
  public async listProducts(
    workspaceId: string,
    filters?: {
      businessDomain?: string;
      lifecycleStatus?: string;
      criticality?: string;
      search?: string;
    }
  ) {
    const where: any = { workspaceId };
    if (filters?.businessDomain) where.businessDomain = filters.businessDomain;
    if (filters?.lifecycleStatus) where.lifecycleStatus = filters.lifecycleStatus;
    if (filters?.criticality) where.criticality = filters.criticality;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { slug: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    return prisma.dataProductDefinition.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 3,
        },
        _count: {
          select: {
            snapshots: true,
            pipelines: true,
            qualityRules: true,
          },
        },
      },
    });
  }

  /**
   * Retrieves a data product by ID or slug.
   */
  public async getProduct(workspaceId: string, idOrSlug: string) {
    const product = await prisma.dataProductDefinition.findFirst({
      where: {
        workspaceId,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        versions: {
          orderBy: { version: "desc" },
        },
        pipelines: {
          include: {
            source: true,
          },
        },
        qualityRules: {
          include: {
            evaluations: {
              orderBy: { evaluatedAt: "desc" },
              take: 1,
            },
          },
        },
        snapshots: {
          orderBy: { materializedAt: "desc" },
          take: 5,
        },
        _count: {
          select: {
            snapshots: true,
            pipelines: true,
            qualityRules: true,
          },
        },
      },
    });

    if (!product) {
      throw new HttpError(404, `Data Product '${idOrSlug}' not found.`);
    }

    return product;
  }

  /**
   * Updates metadata of a data product.
   */
  public async updateProduct(
    workspaceId: string,
    productId: string,
    input: UpdateDataProductInput
  ) {
    const existing = await prisma.dataProductDefinition.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!existing) {
      throw new HttpError(404, `Data Product '${productId}' not found.`);
    }

    return prisma.dataProductDefinition.update({
      where: { id: productId },
      data: {
        name: input.name,
        description: input.description,
        businessDomain: input.businessDomain,
        criticality: input.criticality,
        ownerUserId: input.ownerUserId !== undefined ? input.ownerUserId : existing.ownerUserId,
        owningTeamId: input.owningTeamId !== undefined ? input.owningTeamId : existing.owningTeamId,
        stewardUserId: input.stewardUserId !== undefined ? input.stewardUserId : existing.stewardUserId,
        dataClassification: input.dataClassification,
        refreshStrategy: input.refreshStrategy,
        refreshIntervalMinutes: input.refreshIntervalMinutes,
        targetFreshnessMinutes: input.targetFreshnessMinutes,
        retentionDays: input.retentionDays,
      },
      include: {
        versions: { orderBy: { version: "desc" } },
      },
    });
  }

  /**
   * Creates a new version draft for an existing data product.
   */
  public async createProductVersion(
    workspaceId: string,
    productId: string,
    input: CreateDataProductVersionInput,
    userId?: string
  ) {
    const product = await prisma.dataProductDefinition.findFirst({
      where: { id: productId, workspaceId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    if (!product) {
      throw new Error(`Data Product '${productId}' not found.`);
    }

    const latest = product.versions[0];
    const newVersionNumber = latest ? latest.version + 1 : 1;
    const schemaHash = this.generateSchemaHash(input.schemaDefinition);

    // Compute diff against latest
    let isBreaking = input.isBreaking;
    if (latest && !isBreaking) {
      const diff = this.diffSchemas(latest.schemaDefinition as any, input.schemaDefinition);
      isBreaking = diff.isBreaking;
    }

    const version = await prisma.dataProductVersion.create({
      data: {
        workspaceId,
        dataProductId: productId,
        version: newVersionNumber,
        status: "DRAFT",
        schemaDefinition: input.schemaDefinition,
        canonicalHash: schemaHash,
        changeSummary: input.changeSummary,
        isBreaking,
        reviewNotes: input.reviewNotes,
      },
    });

    return version;
  }

  /**
   * Evaluates quality gates and publishes a specific version of a data product.
   */
  public async publishProductVersion(
    workspaceId: string,
    productId: string,
    versionNumber: number,
    input: PublishDataProductVersionInput,
    userId?: string
  ) {
    const product = await prisma.dataProductDefinition.findFirst({
      where: { id: productId, workspaceId },
      include: {
        versions: { where: { version: versionNumber } },
        qualityRules: { where: { enabled: true, isBlocking: true } },
      },
    });

    if (!product || product.versions.length === 0) {
      throw new HttpError(404, `Version ${versionNumber} of Data Product '${productId}' not found.`);
    }

    const targetVersion = product.versions[0];
    if (targetVersion.status === "PUBLISHED") {
      return targetVersion; // Already published
    }

    // Evaluate Quality Gate
    const latestSnapshot = await prisma.dataProductSnapshot.findFirst({
      where: { dataProductId: productId, workspaceId },
      orderBy: { materializedAt: "desc" },
    });

    let qualityGatePassed = true;
    const gateFailures: string[] = [];

    if (product.qualityRules.length > 0) {
      if (!latestSnapshot) {
        qualityGatePassed = false;
        gateFailures.push("No materialized snapshot found to evaluate quality gate rules");
      } else {
        const evalResults = await dataQualityService.evaluateRulesOnDataset(
          workspaceId,
          productId,
          latestSnapshot.records as any[],
          targetVersion.id
        );

        for (const res of evalResults) {
          if (res.status === "FAIL") {
            qualityGatePassed = false;
            gateFailures.push(`Quality rule '${res.ruleName}' failed: ${res.recordsFailed} rejected records`);
          }
        }
      }
    }

    if (!qualityGatePassed && !input.overrideQualityGate) {
      throw new HttpError(
        400,
        `Publication blocked by Data Quality Gate: ${gateFailures.join("; ")}. Provide 'overrideQualityGate: true' with an authorized justification to proceed.`
      );
    }

    const now = new Date();

    // Mark previous published versions as superseded
    await prisma.dataProductVersion.updateMany({
      where: {
        dataProductId: productId,
        status: "PUBLISHED",
      },
      data: {
        status: "DEPRECATED",
      },
    });

    // Publish target version
    const published = await prisma.dataProductVersion.update({
      where: { id: targetVersion.id },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        publishedById: userId,
        reviewNotes: input.overrideQualityGate
          ? `[OVERRIDE APPROVED] ${input.overrideReason || "Manual override"}`
          : targetVersion.reviewNotes,
      },
    });

    // Update product definition status and hash
    await prisma.dataProductDefinition.update({
      where: { id: productId },
      data: {
        currentVersion: versionNumber,
        lifecycleStatus: "PUBLISHED",
        canonicalHash: targetVersion.canonicalHash,
        qualityStatus: qualityGatePassed ? "PASS" : "WARN",
      },
    });

    // Update lineage graph node
    await dataLineageService.registerNode(workspaceId, {
      nodeKey: `product:${product.slug}`,
      nodeType: "DATA_PRODUCT",
      name: product.name,
      version: String(versionNumber),
      metadata: {
        status: "PUBLISHED",
        publishedAt: now.toISOString(),
        qualityStatus: qualityGatePassed ? "PASS" : "WARN",
      },
    });

    return published;
  }

  /**
   * Deprecates an active data product.
   */
  public async deprecateProduct(workspaceId: string, productId: string, reason?: string) {
    const product = await prisma.dataProductDefinition.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) throw new Error(`Data Product '${productId}' not found.`);

    await prisma.dataProductVersion.updateMany({
      where: { dataProductId: productId, status: "PUBLISHED" },
      data: { status: "DEPRECATED" },
    });

    return prisma.dataProductDefinition.update({
      where: { id: productId },
      data: { lifecycleStatus: "DEPRECATED" },
    });
  }

  /**
   * Retires a deprecated or draft data product.
   */
  public async retireProduct(workspaceId: string, productId: string) {
    const product = await prisma.dataProductDefinition.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) throw new Error(`Data Product '${productId}' not found.`);

    await prisma.dataProductVersion.updateMany({
      where: { dataProductId: productId },
      data: { status: "RETIRED" },
    });

    return prisma.dataProductDefinition.update({
      where: { id: productId },
      data: { lifecycleStatus: "RETIRED" },
    });
  }

  /**
   * Analyzes downstream dependencies and impact of modifying/deprecating a data product.
   */
  public async checkDownstreamImpact(workspaceId: string, productId: string) {
    const product = await prisma.dataProductDefinition.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) throw new Error(`Data Product '${productId}' not found.`);

    // Check lineage graph for downstream consumers
    const lineage = await dataLineageService.getLineageGraph(workspaceId, {
      rootNodeKey: `product:${product.slug}`,
      direction: "DOWNSTREAM",
      maxDepth: 3,
    });

    return {
      productId: product.id,
      productSlug: product.slug,
      currentVersion: product.currentVersion,
      lifecycleStatus: product.lifecycleStatus,
      downstreamNodeCount: lineage.nodes.length - 1, // minus root
      downstreamNodes: lineage.nodes.filter((n) => n.nodeKey !== `product:${product.slug}`),
    };
  }
}

export const dataProductRegistryService = new DataProductRegistryService();
