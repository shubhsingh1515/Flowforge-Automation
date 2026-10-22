import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";

export const workflowEndHandler: NodeHandler = {
  type: "WORKFLOW_END",
  validateConfig(_config) {
    return { isValid: true, errors: [] };
  },
  async execute(_ctx: StepExecutionContext): Promise<NodeExecutionResult> {
    return {
      status: "SUCCESS",
      outputData: {
        completed: true,
        finishedAt: new Date().toISOString(),
      },
    };
  },
};
