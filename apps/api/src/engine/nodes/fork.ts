import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";

export interface ForkNodeConfig {
  branches?: string[];
}

export const forkHandler: NodeHandler<ForkNodeConfig> = {
  type: "FORK",
  validateConfig(_config) {
    return { isValid: true, errors: [] };
  },
  async execute(_ctx: StepExecutionContext<ForkNodeConfig>): Promise<NodeExecutionResult> {
    return {
      status: "SUCCESS",
      outputData: {
        forkedAt: new Date().toISOString(),
      },
    };
  },
};
