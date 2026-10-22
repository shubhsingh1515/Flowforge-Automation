import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { resolveDeep } from "../mapping/resolver.js";

export const transformHandler: NodeHandler = {
  type: "ACTION",
  validateConfig(_config) {
    return { isValid: true, errors: [] };
  },
  async execute(ctx: StepExecutionContext): Promise<NodeExecutionResult> {
    const rawMapping = ctx.config?.template || ctx.config?.mapping || ctx.config?.payload || ctx.config || {};
    const transformed = resolveDeep(rawMapping, ctx.context);

    return {
      status: "SUCCESS",
      outputData: transformed,
    };
  },
};
