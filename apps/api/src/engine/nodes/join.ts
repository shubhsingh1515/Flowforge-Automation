import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";

export interface JoinNodeConfig {
  joinPolicy?: "WAIT_ALL" | "WAIT_ANY";
  requiredBranches?: string[];
}

export const joinHandler: NodeHandler<JoinNodeConfig> = {
  type: "JOIN",
  validateConfig(_config) {
    return { isValid: true, errors: [] };
  },
  async execute(ctx: StepExecutionContext<JoinNodeConfig>): Promise<NodeExecutionResult> {
    const policy = ctx.config?.joinPolicy || "WAIT_ALL";

    // Collect all upstream step outputs from context
    const stepOutputs: Record<string, any> = {};
    for (const [nodeId, stepData] of Object.entries(ctx.context.steps || {})) {
      if (stepData?.output !== undefined) {
        stepOutputs[nodeId] = stepData.output;
      }
    }

    return {
      status: "SUCCESS",
      outputData: {
        policy,
        branches: stepOutputs,
        joinedAt: new Date().toISOString(),
        branchesJoined: Object.keys(stepOutputs).length,
      },
    };
  },
};
