import { HttpError } from "./dataIntelligenceErrors.js";
import crypto from "crypto";
import { prisma } from "@flowforge/database";
import {
  CreateDataPipelineInput,
  CreatePipelineVersionInput,
  RunPipelineInput,
  PipelineOperation,
} from "@flowforge/shared";
import { dataSourceAdapterService } from "./dataSourceAdapterService.js";
import { dataQualityService } from "./dataQualityService.js";
import { dataLineageService } from "./dataLineageService.js";
import { canonicalJsonStringify, computeSha256 } from "./dataProductRegistryService.js";

export class DataPipelineService {
  /**
   * Applies a single declarative operation cleanly to an in-memory array of records.
   */
  public applyOperation(records: any[], op: PipelineOperation): any[] {
    if (!Array.isArray(records) || records.length === 0) return [];

    switch (op.type) {
      case "select": {
        const fields = op.fields || [];
        return records.map((row) => {
          const selected: Record<string, any> = {};
          for (const f of fields) {
            if (row && row[f] !== undefined) {
              selected[f] = row[f];
            }
          }
          return selected;
        });
      }

      case "rename": {
        const mappings = op.mappings || {};
        return records.map((row) => {
          const mapped: Record<string, any> = { ...row };
          for (const [oldKey, newKey] of Object.entries(mappings)) {
            if (mapped[oldKey] !== undefined) {
              mapped[newKey] = mapped[oldKey];
              delete mapped[oldKey];
            }
          }
          return mapped;
        });
      }

      case "filter": {
        const { field, operator, value } = op.condition || {};
        return records.filter((row) => {
          const rowVal = row?.[field];
          switch (operator) {
            case "EQUALS":
              return rowVal === value;
            case "NOT_EQUALS":
              return rowVal !== value;
            case "GREATER_THAN":
              return Number(rowVal) > Number(value);
            case "LESS_THAN":
              return Number(rowVal) < Number(value);
            case "IN":
              return Array.isArray(value) && value.includes(rowVal);
            case "CONTAINS":
              return String(rowVal ?? "").includes(String(value ?? ""));
            case "EXISTS":
              return rowVal !== undefined && rowVal !== null;
            default:
              return true;
          }
        });
      }

      case "map": {
        const { field, transform, args } = op;
        return records.map((row) => {
          const copy = { ...row };
          const raw = copy[field];
          if (raw !== undefined && raw !== null) {
            switch (transform) {
              case "UPPERCASE":
                copy[field] = String(raw).toUpperCase();
                break;
              case "LOWERCASE":
                copy[field] = String(raw).toLowerCase();
                break;
              case "TRIM":
                copy[field] = String(raw).trim();
                break;
              case "TO_NUMBER":
                copy[field] = Number(raw);
                break;
              case "TO_BOOLEAN":
                copy[field] = Boolean(raw);
                break;
              case "TO_ISO_DATE":
                try {
                  copy[field] = new Date(raw).toISOString();
                } catch {
                  // Keep raw if invalid date
                }
                break;
              case "COALESCE":
                copy[field] = raw ?? args?.defaultValue;
                break;
            }
          } else if (transform === "COALESCE") {
            copy[field] = args?.defaultValue;
          }
          return copy;
        });
      }

      case "aggregate": {
        const { groupBy = [], aggregations = [] } = op;
        const groups = new Map<string, any[]>();

        for (const row of records) {
          const groupKey = groupBy.map((k) => String(row?.[k] ?? "")).join("::");
          if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
          }
          groups.get(groupKey)!.push(row);
        }

        const aggregated: any[] = [];
        for (const [key, rows] of groups.entries()) {
          const first = rows[0];
          const resultRow: Record<string, any> = {};
          for (const g of groupBy) {
            resultRow[g] = first?.[g];
          }

          for (const agg of aggregations) {
            const { field, function: fn, as } = agg;
            const values = rows.map((r) => Number(r?.[field])).filter((n) => !isNaN(n));
            switch (fn) {
              case "COUNT":
                resultRow[as] = rows.length;
                break;
              case "SUM":
                resultRow[as] = values.reduce((acc, v) => acc + v, 0);
                break;
              case "AVG":
                resultRow[as] = values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : 0;
                break;
              case "MIN":
                resultRow[as] = values.length > 0 ? Math.min(...values) : 0;
                break;
              case "MAX":
                resultRow[as] = values.length > 0 ? Math.max(...values) : 0;
                break;
            }
          }
          aggregated.push(resultRow);
        }
        return aggregated;
      }

      case "deduplicate": {
        const keys = op.keys || [];
        const seen = new Set<string>();
        return records.filter((row) => {
          const signature = keys.length > 0 ? keys.map((k) => String(row?.[k] ?? "")).join("::") : JSON.stringify(row);
          if (seen.has(signature)) return false;
          seen.add(signature);
          return true;
        });
      }

      case "redact": {
        const { fields = [], maskStrategy } = op;
        return records.map((row) => {
          const copy = { ...row };
          for (const f of fields) {
            if (copy[f] !== undefined) {
              if (maskStrategy === "HASH") {
                copy[f] = crypto.createHash("sha256").update(String(copy[f])).digest("hex").slice(0, 16);
              } else if (maskStrategy === "PARTIAL_EMAIL") {
                const parts = String(copy[f]).split("@");
                copy[f] = parts.length === 2 ? parts[0].slice(0, 2) + "***@" + parts[1] : "***";
              } else {
                copy[f] = "******";
              }
            }
          }
          return copy;
        });
      }

      case "validate":
      default:
        return records;
    }
  }

  /**
   * Creates a new Data Pipeline definition.
   */
  public async createPipeline(
    workspaceId: string,
    input: CreateDataPipelineInput
  ) {
    const existing = await prisma.dataPipelineDefinition.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new HttpError(409, `Pipeline with slug '${input.slug}' already exists in workspace.`);
    }

    const initialOperations = input.initialOperations || [];
    const canonicalHash = computeSha256(canonicalJsonStringify(initialOperations));

    const pipeline = await prisma.dataPipelineDefinition.create({
      data: {
        workspaceId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        dataProductId: input.dataProductId,
        sourceId: input.sourceId,
        refreshMode: input.refreshMode || "FULL_REFRESH",
        scheduleCron: input.scheduleCron,
        timeoutSeconds: input.timeoutSeconds || 300,
        maxRecordLimit: input.maxRecordLimit || 50000,
        currentVersion: 1,
        versions: {
          create: {
            workspaceId,
            version: 1,
            status: "ACTIVE",
            operations: initialOperations,
            outputSchema: input.outputSchema || {},
            canonicalHash,
          },
        },
      },
      include: {
        versions: true,
        dataProduct: true,
        source: true,
      },
    });

    // Register lineage node and edges
    await dataLineageService.registerNode(workspaceId, {
      nodeKey: `pipeline:${pipeline.slug}`,
      nodeType: "PIPELINE",
      name: pipeline.name,
      version: "1",
      metadata: {
        refreshMode: pipeline.refreshMode,
        maxLimit: pipeline.maxRecordLimit,
      },
    });

    if (pipeline.source) {
      await dataLineageService.registerEdge(workspaceId, {
        sourceNodeKey: `source:${pipeline.source.slug}`,
        targetNodeKey: `pipeline:${pipeline.slug}`,
        relationType: "TRANSFORMS",
      });
    }

    await dataLineageService.registerEdge(workspaceId, {
      sourceNodeKey: `pipeline:${pipeline.slug}`,
      targetNodeKey: `product:${pipeline.dataProduct.slug}`,
      relationType: "MATERIALIZES",
    });

    return pipeline;
  }

  /**
   * Lists pipelines for a workspace.
   */
  public async listPipelines(workspaceId: string, dataProductId?: string) {
    const where: any = { workspaceId };
    if (dataProductId) where.dataProductId = dataProductId;

    return prisma.dataPipelineDefinition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        dataProduct: { select: { id: true, name: true, slug: true, currentVersion: true } },
        source: { select: { id: true, name: true, slug: true, sourceType: true } },
        runs: {
          orderBy: { startedAt: "desc" },
          take: 3,
        },
      },
    });
  }

  /**
   * Retrieves a pipeline with its versions and run history.
   */
  public async getPipeline(workspaceId: string, idOrSlug: string) {
    const pipeline = await prisma.dataPipelineDefinition.findFirst({
      where: {
        workspaceId,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        versions: { orderBy: { version: "desc" } },
        dataProduct: true,
        source: true,
        runs: {
          orderBy: { startedAt: "desc" },
          take: 10,
        },
      },
    });

    if (!pipeline) throw new HttpError(404, `Pipeline '${idOrSlug}' not found.`);
    return pipeline;
  }

  /**
   * Creates a new version of pipeline operations.
   */
  public async createPipelineVersion(
    workspaceId: string,
    pipelineId: string,
    input: CreatePipelineVersionInput
  ) {
    const pipeline = await prisma.dataPipelineDefinition.findFirst({
      where: { id: pipelineId, workspaceId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!pipeline) throw new HttpError(404, `Pipeline '${pipelineId}' not found.`);

    const nextVer = (pipeline.versions[0]?.version || 0) + 1;
    const canonicalHash = computeSha256(canonicalJsonStringify(input.operations));

    const version = await prisma.dataPipelineVersion.create({
      data: {
        workspaceId,
        pipelineId,
        version: nextVer,
        status: "ACTIVE",
        operations: input.operations,
        outputSchema: input.outputSchema || {},
        canonicalHash,
      },
    });

    await prisma.dataPipelineDefinition.update({
      where: { id: pipelineId },
      data: { currentVersion: nextVer },
    });

    return version;
  }

  /**
   * Executes a pipeline transformation end-to-end, evaluating quality rules and materializing snapshots.
   */
  public async executePipeline(
    workspaceId: string,
    pipelineId: string,
    options?: RunPipelineInput
  ) {
    const pipeline = await prisma.dataPipelineDefinition.findFirst({
      where: { id: pipelineId, workspaceId },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
        dataProduct: true,
        source: true,
      },
    });

    if (!pipeline) throw new HttpError(404, `Pipeline '${pipelineId}' not found.`);
    if (!pipeline.sourceId) throw new HttpError(400, `Pipeline '${pipelineId}' has no registered data source.`);

    const activeVersion = pipeline.versions[0];
    if (!activeVersion) throw new HttpError(400, `Pipeline '${pipelineId}' has no active version.`);

    const runType = options?.runType || "MANUAL";
    const startTime = Date.now();
    const isDryRun = runType === "DRY_RUN";

    // 1. Create DataPipelineRun record
    const run = await prisma.dataPipelineRun.create({
      data: {
        workspaceId,
        pipelineId,
        versionId: activeVersion.id,
        status: "RUNNING",
        runType,
        watermark: options?.watermark,
      },
    });

    const executionLogs: string[] = [];
    executionLogs.push(`Pipeline execution started in mode: ${runType}`);

    try {
      // 2. Fetch records from authorized source adapter
      const rawRecords = await dataSourceAdapterService.fetchRecords(workspaceId, pipeline.sourceId, {
        limit: options?.sampleSize || pipeline.maxRecordLimit,
        watermark: options?.watermark,
      });

      executionLogs.push(`Fetched ${rawRecords.length} records from source '${pipeline.source?.name}'`);

      // 3. Sequentially apply declarative operations
      let transformed = [...rawRecords];
      const operations = (activeVersion.operations as unknown as PipelineOperation[]) || [];

      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const beforeCount = transformed.length;
        transformed = this.applyOperation(transformed, op);
        executionLogs.push(`Applied operation [${i + 1}/${operations.length}] ${op.type} (records: ${beforeCount} -> ${transformed.length})`);
      }

      // Bound results to limit
      if (transformed.length > pipeline.maxRecordLimit) {
        transformed = transformed.slice(0, pipeline.maxRecordLimit);
        executionLogs.push(`Bounded records to max limit: ${pipeline.maxRecordLimit}`);
      }

      const durationMs = Date.now() - startTime;
      const byteSize = Buffer.byteLength(JSON.stringify(transformed), "utf8");

      if (isDryRun) {
        // Return preview results without snapshot commit
        await prisma.dataPipelineRun.update({
          where: { id: run.id },
          data: {
            status: "SUCCESS",
            recordsRead: rawRecords.length,
            recordsWritten: transformed.length,
            durationMs,
            completedAt: new Date(),
            executionLogs,
          },
        });

        return {
          runId: run.id,
          status: "SUCCESS",
          isDryRun: true,
          recordsRead: rawRecords.length,
          recordsWritten: transformed.length,
          durationMs,
          previewRecords: transformed.slice(0, 20),
          executionLogs,
        };
      }

      // 4. Materialize DataProductSnapshot in PostgreSQL
      const productVersion = await prisma.dataProductVersion.findFirst({
        where: { dataProductId: pipeline.dataProductId, workspaceId },
        orderBy: { version: "desc" },
      });
      if (!productVersion) {
        throw new HttpError(404, `Data Product '${pipeline.dataProductId}' has no valid version.`);
      }

      const snapshot = await prisma.dataProductSnapshot.create({
        data: {
          workspaceId,
          dataProductId: pipeline.dataProductId,
          versionId: productVersion.id,
          pipelineRunId: run.id,
          recordCount: transformed.length,
          byteSize,
          records: transformed,
          schemaVersion: pipeline.dataProduct.currentVersion,
          status: "MATERIALIZED",
          materializedAt: new Date(),
        },
      });

      // 5. Evaluate Data Quality Rules on the materialized dataset
      const qualityEvaluations = await dataQualityService.evaluateRulesOnDataset(
        workspaceId,
        pipeline.dataProductId,
        transformed,
        productVersion.id,
        run.id
      );

      executionLogs.push(`Evaluated ${qualityEvaluations.length} data quality rules on materialized snapshot`);

      // 6. Update Product metadata
      await prisma.dataProductDefinition.update({
        where: { id: pipeline.dataProductId },
        data: {
          lastMaterializedAt: new Date(),
        },
      });

      // 7. Complete Pipeline Run
      await prisma.dataPipelineRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          recordsRead: rawRecords.length,
          recordsWritten: transformed.length,
          durationMs,
          completedAt: new Date(),
          executionLogs,
        },
      });

      return {
        runId: run.id,
        snapshotId: snapshot.id,
        status: "SUCCESS",
        recordsRead: rawRecords.length,
        recordsWritten: transformed.length,
        durationMs,
        qualityEvaluations,
        executionLogs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      executionLogs.push(`Error during pipeline execution: ${err.message}`);

      await prisma.dataPipelineRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          errorMessage: err.message,
          durationMs,
          completedAt: new Date(),
          executionLogs,
        },
      });

      throw err;
    }
  }
}

export const dataPipelineService = new DataPipelineService();
