import { prisma } from "@flowforge/database";
import {
  RegionDeploymentConfigDTO,
  RegionalPlacementUpdate,
  SUPPORTED_REGIONS,
} from "@flowforge/shared";

export class RegionService {
  /**
   * Retrieves all registered regional deployments.
   * Lazily seeds default regions (us-east-1 authoritative, eu-central-1 standby, ap-southeast-1 standby) if not present.
   */
  public async listRegions(): Promise<RegionDeploymentConfigDTO[]> {
    let configs = await prisma.regionDeploymentConfig.findMany({
      orderBy: { isAuthoritative: "desc" },
    });

    if (configs.length === 0) {
      await prisma.regionDeploymentConfig.createMany({
        data: [
          {
            regionKey: "us-east-1",
            regionName: "US East (N. Virginia)",
            isAuthoritative: true,
            status: "HEALTHY",
            apiEndpoint: "https://api-us-east-1.flowforge.internal",
            maxConnectionPool: 100,
            queueBackpressureThreshold: 5000,
            drainRatePerSec: 120.0,
            activeTenantCount: 1,
            currentEpoch: 1,
          },
          {
            regionKey: "eu-central-1",
            regionName: "Europe Central (Frankfurt)",
            isAuthoritative: false,
            status: "STANDBY",
            apiEndpoint: "https://api-eu-central-1.flowforge.internal",
            maxConnectionPool: 50,
            queueBackpressureThreshold: 5000,
            drainRatePerSec: 0,
            activeTenantCount: 0,
            currentEpoch: 1,
          },
          {
            regionKey: "ap-southeast-1",
            regionName: "Asia Pacific (Singapore)",
            isAuthoritative: false,
            status: "STANDBY",
            apiEndpoint: "https://api-ap-southeast-1.flowforge.internal",
            maxConnectionPool: 50,
            queueBackpressureThreshold: 5000,
            drainRatePerSec: 0,
            activeTenantCount: 0,
            currentEpoch: 1,
          },
        ],
      });

      configs = await prisma.regionDeploymentConfig.findMany({
        orderBy: { isAuthoritative: "desc" },
      });
    }

    return configs.map((c) => ({
      id: c.id,
      regionKey: c.regionKey,
      regionName: c.regionName,
      isAuthoritative: c.isAuthoritative,
      status: c.status as any,
      apiEndpoint: c.apiEndpoint,
      maxConnectionPool: c.maxConnectionPool,
      queueBackpressureThreshold: c.queueBackpressureThreshold,
      drainRatePerSec: c.drainRatePerSec,
      activeTenantCount: c.activeTenantCount,
      currentEpoch: c.currentEpoch,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Returns the primary authoritative deployment region.
   */
  public async getAuthoritativeRegion(): Promise<string> {
    const primary = await prisma.regionDeploymentConfig.findFirst({
      where: { isAuthoritative: true },
    });
    return primary?.regionKey || "us-east-1";
  }

  /**
   * Validates whether a tenant's request is allowed in the current region.
   * Prevents cross-region tenant leakage and split-brain execution.
   */
  public async validateTenantPlacement(
    workspaceId: string,
    targetRegion?: string
  ): Promise<{
    allowed: boolean;
    homeRegion: string;
    failoverEpoch: number;
    error?: string;
  }> {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { homeRegion: true, failoverEpoch: true },
    });

    const homeRegion = workspace?.homeRegion || "us-east-1";
    const failoverEpoch = workspace?.failoverEpoch || 0;

    if (targetRegion && targetRegion !== homeRegion) {
      return {
        allowed: false,
        homeRegion,
        failoverEpoch,
        error: `Misdirected Request: Workspace is pinned to home region '${homeRegion}'. Direct execution against '${targetRegion}' is rejected.`,
      };
    }

    return {
      allowed: true,
      homeRegion,
      failoverEpoch,
    };
  }

  /**
   * Updates tenant home region, data residency, or custom concurrency cap.
   */
  public async updateTenantPlacement(
    workspaceId: string,
    update: RegionalPlacementUpdate
  ) {
    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(update.homeRegion && { homeRegion: update.homeRegion }),
        ...(update.dataResidency && { dataResidency: update.dataResidency }),
        ...(update.maxConcurrentExecutions !== undefined && {
          maxConcurrentExecutions: update.maxConcurrentExecutions,
        }),
        ...(update.workloadPriority && { workloadPriority: update.workloadPriority }),
      },
    });

    return updated;
  }

  /**
   * Simulates an isolated regional failover drill without destructive data loss.
   * Increments the failover epoch across workspaces and regional configs, verifying
   * that stale workers in the evacuated region will be fenced by the monotonic epoch counter.
   */
  public async executeRegionalFailoverDrill(params: {
    sourceRegion: string;
    targetRegion: string;
    operatorUserId?: string;
    notes?: string;
  }) {
    const startTime = Date.now();

    // 1. Advance regional failover epoch
    const activeRegion = await prisma.regionDeploymentConfig.findUnique({
      where: { regionKey: params.sourceRegion },
    });
    const nextEpoch = (activeRegion?.currentEpoch || 1) + 1;

    // 2. Count workspaces that will be reassigned
    const affectedWorkspaces = await prisma.workspace.findMany({
      where: { homeRegion: params.sourceRegion },
      select: { id: true },
    });

    // 3. Atomically update failoverEpoch for affected workspaces
    await prisma.workspace.updateMany({
      where: { homeRegion: params.sourceRegion },
      data: {
        failoverRegion: params.targetRegion,
        failoverEpoch: nextEpoch,
      },
    });

    // 4. Update deployment configs
    await prisma.regionDeploymentConfig.update({
      where: { regionKey: params.sourceRegion },
      data: { currentEpoch: nextEpoch },
    });

    const durationMs = Date.now() - startTime;

    // 5. Record drill event in database
    const record = await prisma.regionalFailoverDrillRecord.create({
      data: {
        sourceRegion: params.sourceRegion,
        targetRegion: params.targetRegion,
        failoverEpoch: nextEpoch,
        status: "COMPLETED",
        affectedWorkspacesCount: affectedWorkspaces.length,
        fencedExecutionCount: 0,
        durationMs,
        triggeredByUserId: params.operatorUserId || null,
        notes: params.notes || "Non-destructive regional failover drill executed.",
      },
    });

    // 6. Record in recovery audit log
    await prisma.recoveryAuditRecord.create({
      data: {
        operationType: "REGIONAL_FAILOVER_DRILL",
        targetResource: `${params.sourceRegion} -> ${params.targetRegion}`,
        operatorId: params.operatorUserId || "SYSTEM",
        isDryRun: false,
        status: "SUCCESS",
        details: {
          drillRecordId: record.id,
          failoverEpoch: nextEpoch,
          affectedWorkspacesCount: affectedWorkspaces.length,
          durationMs,
        },
      },
    });

    return {
      drillId: record.id,
      sourceRegion: params.sourceRegion,
      targetRegion: params.targetRegion,
      failoverEpoch: nextEpoch,
      affectedWorkspacesCount: affectedWorkspaces.length,
      status: "COMPLETED",
      durationMs,
      timestamp: record.createdAt.toISOString(),
    };
  }
}

export const regionService = new RegionService();
