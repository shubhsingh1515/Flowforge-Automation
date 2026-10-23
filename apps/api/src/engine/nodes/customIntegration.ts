import { prisma } from "@flowforge/database";
import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { customIntegrationService } from "../../services/customIntegrations.js";

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
      try {
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

        const actionId = stepContext.config?.actionId || "custom_request";
        const sampleInput = (stepContext.config as any)?.inputs || stepContext.context?.trigger || {};

        const result = await customIntegrationService.testAction(
          customIntegration.id,
          customIntegration.workspaceId,
          { actionId, sampleInput }
        );

        if (!result.success) {
          return {
            status: "FAILED",
            errorCategory: "EXTERNAL_API_ERROR",
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
          errorCategory: "INTERNAL_ERROR",
          errorMessage: err.message || "Failed executing custom integration action",
        };
      }
    },
  };
}
