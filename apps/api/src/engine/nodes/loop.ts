import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { resolveValue, resolveDeep } from "../mapping/resolver.js";
import { executeTransformation, TransformNodeConfig } from "./transform.js";
import { evaluateConditionGroup, ConditionRuleGroup } from "./condition.js";

export interface LoopNodeConfig {
  arrayExpression?: string;
  maxIterations?: number;
  errorPolicy?: "STOP_ON_ERROR" | "CONTINUE_AND_COLLECT";
  itemTransform?: TransformNodeConfig;
  itemFilter?: ConditionRuleGroup;
}

export const loopHandler: NodeHandler<LoopNodeConfig> = {
  type: "LOOP",
  validateConfig(config) {
    const errors: string[] = [];
    if (!config || !config.arrayExpression) {
      errors.push("For Each loop node requires an 'arrayExpression' e.g. {{trigger.body.items}}.");
    }
    return { isValid: errors.length === 0, errors };
  },

  async execute(ctx: StepExecutionContext<LoopNodeConfig>): Promise<NodeExecutionResult> {
    const config = ctx.config || {};
    const rawItems = resolveValue(config.arrayExpression || "", ctx.context);

    if (rawItems === null || rawItems === undefined) {
      return {
        status: "FAILED",
        errorCategory: "INVALID_INPUT",
        errorMessage: `For Each loop received null/undefined for array expression '${config.arrayExpression}'.`,
      };
    }

    if (!Array.isArray(rawItems)) {
      return {
        status: "FAILED",
        errorCategory: "INVALID_INPUT",
        errorMessage: `For Each loop requires an array, but received '${typeof rawItems}'.`,
      };
    }

    const maxLimit = Math.min(Math.max(config.maxIterations || 50, 1), 200);
    const errorPolicy = config.errorPolicy || "STOP_ON_ERROR";

    const totalCount = rawItems.length;
    const itemsToProcess = rawItems.slice(0, maxLimit);

    const iterationResults: any[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let index = 0; index < itemsToProcess.length; index++) {
      const item = itemsToProcess[index];

      // Build isolated loop context overlay
      const loopContext = {
        item,
        index,
        length: totalCount,
        isFirst: index === 0,
        isLast: index === totalCount - 1,
      };

      const iterationScope = {
        ...ctx.context,
        loop: loopContext,
      };

      try {
        // Optional item filter
        if (config.itemFilter) {
          const passes = evaluateConditionGroup(config.itemFilter, iterationScope);
          if (!passes) {
            continue;
          }
        }

        // Item transformation or direct pass-through
        let processedItem = item;
        if (config.itemTransform) {
          processedItem = executeTransformation(config.itemTransform, iterationScope);
        } else {
          processedItem = resolveDeep(item, iterationScope);
        }

        iterationResults.push(processedItem);
      } catch (err: any) {
        errors.push({ index, error: err.message || "Iteration execution error" });
        if (errorPolicy === "STOP_ON_ERROR") {
          return {
            status: "FAILED",
            errorCategory: "INTERNAL_ERROR",
            errorMessage: `Loop failed at iteration index ${index}: ${err.message}`,
            outputData: {
              totalItems: totalCount,
              processedCount: iterationResults.length,
              completedIterations: iterationResults,
              errors,
              failedAtIndex: index,
            },
          };
        }
      }
    }

    return {
      status: "SUCCESS",
      outputData: {
        totalItems: totalCount,
        processedCount: iterationResults.length,
        results: iterationResults,
        errors,
        hasErrors: errors.length > 0,
        truncated: totalCount > maxLimit,
      },
    };
  },
};
