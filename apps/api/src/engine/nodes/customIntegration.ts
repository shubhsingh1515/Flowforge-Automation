import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { prisma } from "@flowforge/database";
import { customIntegrationService } from "../../services/customIntegrations.js";

export function createCustomIntegrationNodeHandler(customIntegrationKey: string): NodeHandler {
  return {
    type: "ACTION",
    validateConfig(config) {
      const errors: string[] = [];
      if (!config?.actionId) {
        errors.push(`Action requires an actionId for custom integration '${customIntegrationKey}'.`);
      }
      return { isValid: errors.length === 0, errors };
    },
    async execute(stepContext: StepExecutionContext): Promise<NodeExecutionResult> {
      try {
        const customIntegration = await prisma.customIntegration.findFirst({
          where: { key: customIntegrationKey },
          include: { versions: { orderBy: { version: "desc" }, take: 1 } },
        });

        if (!customIntegration) {
          return {
            status: "FAILED",
            errorCategory: "INVALID_CONFIG",
            errorMessage: `Custom integration '${customIntegrationKey}' not found.`,
          };
        }

        const actionId = stepContext.config?.actionId || "custom_request";
        const sampleInput = stepContext.inputs || stepContext.config?.inputs || {};

        const result = await customIntegrationService.testAction(
          customIntegration.id,
          customIntegration.workspaceId,
          { actionId, sampleInput }
        );

        if (!result.success) {
          return {
            status: "FAILED",
            errorCategory: "INTEGRATION_ERROR",
            errorMessage: result.errorMessage || `Custom action failed with status ${result.statusCode}`,
            outputData: result.responseData,
          };
        }

        return {
          status: "SUCCESS",
          outputData: result.responseData,
        };
      } catch (err: any) {
        return {
          status: "FAILED",
          errorCategory: "EXECUTION_ERROR",
          errorMessage: err.message || "Failed executing custom integration action",
        };
      }
    },
  };
}
