import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { resolveValue, getByPath } from "../mapping/resolver.js";
import {
  ConditionRule,
  ConditionRuleGroup,
  evaluateConditionRule,
  evaluateConditionGroup,
} from "./condition.js";

export interface FilterNodeConfig {
  inputArray?: string | any[];
  field?: string;
  operator?: string;
  value?: any;
  combinator?: "AND" | "OR";
  rules?: Array<ConditionRule | ConditionRuleGroup>;
  group?: ConditionRuleGroup;
}

export const filterHandler: NodeHandler<FilterNodeConfig> = {
  type: "FILTER",
  validateConfig(config) {
    const errors: string[] = [];
    if (!config || !config.inputArray) {
      errors.push("Filter node requires an 'inputArray' expression or array.");
    }
    return { isValid: errors.length === 0, errors };
  },

  async execute(ctx: StepExecutionContext<FilterNodeConfig>): Promise<NodeExecutionResult> {
    const config = ctx.config || {};
    const rawArray = resolveValue(config.inputArray as any, ctx.context);

    if (!Array.isArray(rawArray)) {
      return {
        status: "FAILED",
        errorCategory: "INVALID_INPUT",
        errorMessage: `Filter node expected array input but received type '${typeof rawArray}'.`,
      };
    }

    const matchingItems: any[] = [];
    const rejectedItems: any[] = [];

    const hasGroup = Boolean(config.group || (Array.isArray(config.rules) && config.rules.length > 0));
    const ruleGroup: ConditionRuleGroup = config.group || {
      combinator: config.combinator || "AND",
      rules: config.rules || [],
    };

    for (const item of rawArray) {
      // Create item evaluation scope
      const itemScope = {
        ...ctx.context,
        item,
        ...(typeof item === "object" && item !== null ? item : {}),
      };

      let isMatch = false;

      if (hasGroup) {
        isMatch = evaluateConditionGroup(ruleGroup, itemScope);
      } else {
        const field = config.field || "";
        const operator = config.operator || "equals";
        const expected = resolveValue(config.value, itemScope);

        let actual = getByPath(itemScope, field);
        if (actual === undefined && typeof item === "object" && item !== null) {
          actual = getByPath(item, field);
        }
        if (actual === undefined && (!field || field === "item")) {
          actual = item;
        }

        isMatch = evaluateConditionRule(actual, operator, expected);
      }

      if (isMatch) {
        matchingItems.push(item);
      } else {
        rejectedItems.push(item);
      }
    }

    return {
      status: "SUCCESS",
      outputData: {
        matchingItems,
        rejectedItems,
        filteredCount: matchingItems.length,
        totalCount: rawArray.length,
      },
    };
  },
};
