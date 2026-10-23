import { HttpError } from "./dataIntelligenceErrors.js";
import { prisma } from "@flowforge/database";
import { CreateDataSourceInput, DataSourceType } from "@flowforge/shared";
import { dataLineageService } from "./dataLineageService.js";

export class DataSourceAdapterService {
  /**
   * Registers a new authorized data source.
   */
  public async registerDataSource(workspaceId: string, input: CreateDataSourceInput) {
    const existing = await prisma.dataSourceRegistration.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new HttpError(409, `Data Source with slug '${input.slug}' already registered in workspace.`);
    }

    // Verify workspace regional compliance if allowedRegions provided
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { homeRegion: true, dataResidency: true },
    });

    if (input.allowedRegions && input.allowedRegions.length > 0 && workspace?.homeRegion) {
      if (!input.allowedRegions.includes(workspace.homeRegion) && !input.allowedRegions.includes("GLOBAL")) {
        throw new HttpError(
          400,
          `Data Source registration denied: Workspace region '${workspace.homeRegion}' is not permitted by source allowedRegions [${input.allowedRegions.join(", ")}].`
        );
      }
    }

    const source = await prisma.dataSourceRegistration.create({
      data: {
        workspaceId,
        slug: input.slug,
        name: input.name,
        description: input.description,
        sourceType: input.sourceType,
        resourceReference: input.resourceReference,
        schemaContract: input.schemaContract,
        dataClassification: input.dataClassification || "INTERNAL",
        allowedRegions: input.allowedRegions || ["GLOBAL"],
        refreshStrategy: input.refreshStrategy || "BATCH",
        status: "ACTIVE",
      },
    });

    // Register lineage node for source
    await dataLineageService.registerNode(workspaceId, {
      nodeKey: `source:${source.slug}`,
      nodeType:
        input.sourceType === "WORKFLOW_EXECUTION"
          ? "WORKFLOW"
          : input.sourceType === "PLATFORM_EVENT"
          ? "EVENT_SCHEMA"
          : input.sourceType === "PROCESS_INSTANCE"
          ? "PROCESS"
          : input.sourceType === "CONNECTOR_EXECUTION"
          ? "CONNECTOR"
          : "PIPELINE",
      name: source.name,
      metadata: {
        sourceType: source.sourceType,
        resourceReference: source.resourceReference,
        classification: source.dataClassification,
      },
    });

    return source;
  }

  /**
   * Lists data sources for a workspace.
   */
  public async listDataSources(workspaceId: string, sourceType?: DataSourceType) {
    const where: any = { workspaceId };
    if (sourceType) where.sourceType = sourceType;
    return prisma.dataSourceRegistration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { pipelines: true },
        },
      },
    });
  }

  /**
   * Retrieves a data source by ID or slug.
   */
  public async getDataSource(workspaceId: string, idOrSlug: string) {
    const source = await prisma.dataSourceRegistration.findFirst({
      where: {
        workspaceId,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
    });
    if (!source) throw new HttpError(404, `Data Source '${idOrSlug}' not found.`);
    return source;
  }

  /**
   * Pulls raw dataset records through authorized adapters (bounded to maxLimit, default 500).
   */
  public async fetchRecords(
    workspaceId: string,
    sourceId: string,
    options?: { limit?: number; watermark?: Record<string, any> }
  ): Promise<any[]> {
    const source = await this.getDataSource(workspaceId, sourceId);
    const limit = Math.min(options?.limit || 500, 5000);

    // Verify workspace regional compliance at extraction time
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { homeRegion: true },
    });

    const allowed = (source.allowedRegions as string[]) || ["GLOBAL"];
    if (workspace?.homeRegion && !allowed.includes("GLOBAL") && !allowed.includes(workspace.homeRegion)) {
      throw new Error(
        `Cross-region extraction prohibited: Source requires [${allowed.join(", ")}], workspace is in '${workspace.homeRegion}'.`
      );
    }

    switch (source.sourceType) {
      case "WORKFLOW_EXECUTION": {
        // Fetch executions for workflow
        const executions = await prisma.workflowExecution.findMany({
          where: {
            workflow: {
              workspaceId,
              id: source.resourceReference,
            },
          },
          take: limit,
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            workflowId: true,
            status: true,
            startedAt: true,
            durationMs: true,
            correlationId: true,
          },
        });

        return executions.map((e) => ({
          executionId: e.id,
          workflowId: e.workflowId,
          status: e.status,
          startedAt: e.startedAt?.toISOString(),
          durationMs: e.durationMs || 0,
          correlationId: e.correlationId || "",
        }));
      }

      case "PROCESS_INSTANCE": {
        // Fetch instances for process definition
        const instances = await prisma.businessProcessInstance.findMany({
          where: {
            workspaceId,
            processDefinitionId: source.resourceReference,
          },
          take: limit,
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            processDefinitionId: true,
            correlationKey: true,
            status: true,
            currentMilestoneName: true,
            startedAt: true,
            completedAt: true,
            terminalOutcome: true,
          },
        });

        return instances.map((p) => ({
          instanceId: p.id,
          processDefinitionId: p.processDefinitionId,
          correlationKey: p.correlationKey,
          status: p.status,
          currentStage: p.currentMilestoneName || "INIT",
          outcome: p.terminalOutcome || "PENDING",
          startedAt: p.startedAt?.toISOString(),
          completedAt: p.completedAt?.toISOString(),
        }));
      }

      case "PLATFORM_EVENT": {
        // Fetch events by eventType
        const events = await prisma.platformEvent.findMany({
          where: {
            workspaceId,
            eventType: source.resourceReference,
          },
          take: limit,
          orderBy: { recordedAt: "desc" },
          select: {
            id: true,
            eventId: true,
            eventType: true,
            source: true,
            data: true,
            correlationId: true,
            recordedAt: true,
          },
        });

        return events.map((ev) => ({
          eventId: ev.eventId,
          eventType: ev.eventType,
          source: ev.source,
          correlationId: ev.correlationId || "",
          recordedAt: ev.recordedAt.toISOString(),
          ...((ev.data as Record<string, any>) || {}),
        }));
      }

      case "CONNECTOR_EXECUTION": {
        const metrics = await prisma.connectorExecutionMetric.findMany({
          where: {
            workspaceId,
            connectorKey: source.resourceReference,
          },
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            connectorKey: true,
            actionId: true,
            durationMs: true,
            status: true,
            createdAt: true,
          },
        });

        return metrics.map((m) => ({
          metricId: m.id,
          connectorKey: m.connectorKey,
          actionId: m.actionId,
          durationMs: m.durationMs,
          success: m.status === "SUCCESS",
          timestamp: m.createdAt.toISOString(),
        }));
      }

      case "OPERATIONAL_METRICS": {
        const incidents = await prisma.operationalIncident.findMany({
          where: { workspaceId },
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            severity: true,
            category: true,
            status: true,
            createdAt: true,
          },
        });

        return incidents.map((i) => ({
          incidentId: i.id,
          title: i.title,
          severity: i.severity,
          category: i.category,
          status: i.status,
          timestamp: i.createdAt.toISOString(),
        }));
      }

      case "CUSTOM_ADAPTER":
      default: {
        try {
          const parsed = JSON.parse(source.resourceReference);
          if (Array.isArray(parsed)) return parsed.slice(0, limit);
        } catch {
          // Return default sample
        }
        return [
          { id: "sample-1", name: "Sample Record 1", value: 100, status: "ACTIVE" },
          { id: "sample-2", name: "Sample Record 2", value: 250, status: "COMPLETED" },
        ];
      }
    }
  }
}

export const dataSourceAdapterService = new DataSourceAdapterService();
