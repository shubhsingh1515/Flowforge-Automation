import { prisma } from "@flowforge/database";
import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { customIntegrationService } from "../../services/customIntegrations.js";
import { connectorPlatformService } from "../../services/connectorPlatformService.js";

export function createCustomIntegrationNodeHandler(customIntegrationKey: string): NodeHandler {
  return {
    type: "ACTION",
    validateConfig(config: any) {
      if (!config.actionId) {
        return { isValid: false, errors: ["actionId is required for custom integration"] };
      }
      return { isValid: true, errors: [] };
    },
    async execute(stepContext: StepExecutionContext): Promise<NodeExecutionResult> {
      const startTime = Date.now();
      const actionId = stepContext.config?.actionId || "custom_request";
      const workspaceId = stepContext.workspaceId || "unknown-workspace";

      try {
        // 1. Check if connector release artifact exists and its status
        const releaseArtifact = await prisma.connectorReleaseArtifact.findFirst({
          where: { connectorKey: customIntegrationKey },
          orderBy: { createdAt: "desc" },
        });

        if (releaseArtifact) {
          if (releaseArtifact.status === "REVOKED") {
            await connectorPlatformService.recordExecutionMetric({
              connectorKey: customIntegrationKey,
              version: releaseArtifact.version,
              workspaceId,
              actionId,
              status: "FAILED",
              durationMs: Date.now() - startTime,
              errorCategory: "CONNECTOR_REVOKED",
              artifactId: releaseArtifact.id,
            });

            return {
              status: "FAILED",
              errorCategory: "CONNECTOR_REVOKED",
              errorMessage: `Execution blocked: Connector '${customIntegrationKey}' has been REVOKED for security reasons.`,
            };
          }

          if (releaseArtifact.status === "SUSPENDED") {
            await connectorPlatformService.recordExecutionMetric({
              connectorKey: customIntegrationKey,
              version: releaseArtifact.version,
              workspaceId,
              actionId,
              status: "FAILED",
              durationMs: Date.now() - startTime,
              errorCategory: "CONNECTOR_SUSPENDED",
              artifactId: releaseArtifact.id,
            });

            return {
              status: "FAILED",
              errorCategory: "CONNECTOR_SUSPENDED",
              errorMessage: `Execution blocked: Connector '${customIntegrationKey}' is currently SUSPENDED (${releaseArtifact.suspensionReason || "Administrative suspension"}).`,
            };
          }
        }

        // 2. Fetch custom integration
        const customIntegration = await prisma.customIntegration.findFirst({
          where: { key: customIntegrationKey },
        });

        if (!customIntegration) {
          return {
            status: "FAILED",
            errorCategory: "INVALID_CONFIG",
            errorMessage: `Custom integration '${customIntegrationKey}' not found.`,
          };
        }

        if (customIntegration.status === "REVOKED") {
          return {
            status: "FAILED",
            errorCategory: "CONNECTOR_REVOKED",
            errorMessage: `Execution blocked: Custom integration '${customIntegrationKey}' has been REVOKED.`,
          };
        }

        if (customIntegration.status === "SUSPENDED") {
          return {
            status: "FAILED",
            errorCategory: "CONNECTOR_SUSPENDED",
            errorMessage: `Execution blocked: Custom integration '${customIntegrationKey}' is currently SUSPENDED.`,
          };
        }

        const sampleInput = (stepContext.config as any)?.inputs || stepContext.context?.trigger || {};

        const result = await customIntegrationService.testAction(
          customIntegration.id,
          customIntegration.workspaceId,
          { actionId, sampleInput }
        );

        const durationMs = Date.now() - startTime;

        if (!result.success) {
          await connectorPlatformService.recordExecutionMetric({
            connectorKey: customIntegrationKey,
            version: releaseArtifact?.version || "1.0.0",
            workspaceId,
            actionId,
            status: "FAILED",
            durationMs,
            errorCategory: "EXTERNAL_API_ERROR",
            artifactId: releaseArtifact?.id,
          });

          return {
            status: "FAILED",
            errorCategory: "EXTERNAL_API_ERROR",
            errorMessage: result.errorMessage || `Custom action failed with status ${result.statusCode}`,
            outputData: result.responseData,
          };
        }

        await connectorPlatformService.recordExecutionMetric({
          connectorKey: customIntegrationKey,
          version: releaseArtifact?.version || "1.0.0",
          workspaceId,
          actionId,
          status: "SUCCESS",
          durationMs,
          artifactId: releaseArtifact?.id,
        });

        return {
          status: "SUCCESS",
          outputData: result.responseData,
        };
      } catch (err: any) {
        return {
          status: "FAILED",
          errorCategory: "INTERNAL_ERROR",
          errorMessage: err.message || "Failed executing custom integration action",
        };
      }
    },
  };
}
