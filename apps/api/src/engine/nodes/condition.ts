import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { getByPath, resolveValue } from "../mapping/resolver.js";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "is_empty"
  | "is_not_empty"
  | "is_null"
  | "is_not_null"
  | "exists"
  | "not_exists"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_true"
  | "is_false"
  | "matches_regex"
  | "in_list"
  | "not_in_list";

export interface ConditionRule {
  field: string;
  operator: ConditionOperator | string;
  value?: any;
}

export interface ConditionRuleGroup {
  combinator: "AND" | "OR";
  rules: Array<ConditionRule | ConditionRuleGroup>;
}

export interface ConditionNodeConfig {
  field?: string;
  operator?: ConditionOperator | string;
  value?: any;
  combinator?: "AND" | "OR";
  rules?: Array<ConditionRule | ConditionRuleGroup>;
  group?: ConditionRuleGroup;
}

/**
 * Evaluates an individual atomic rule with defined type-coercion semantics.
 */
export function evaluateConditionRule(
  actualValue: any,
  operator: string,
  expectedValue: any
): boolean {
  switch (operator) {
    case "equals": {
      if (actualValue === null || actualValue === undefined || expectedValue === null || expectedValue === undefined) {
        return actualValue === expectedValue;
      }
      // If both can be parsed as valid finite numbers, compare numerically
      if (
        typeof actualValue !== "object" &&
        typeof expectedValue !== "object" &&
        !isNaN(Number(actualValue)) &&
        !isNaN(Number(expectedValue)) &&
        String(actualValue).trim() !== "" &&
        String(expectedValue).trim() !== ""
      ) {
        return Number(actualValue) === Number(expectedValue);
      }
      if (typeof actualValue === "boolean" || typeof expectedValue === "boolean") {
        return Boolean(actualValue) === Boolean(expectedValue);
      }
      return String(actualValue) === String(expectedValue);
    }

    case "not_equals": {
      return !evaluateConditionRule(actualValue, "equals", expectedValue);
    }

    case "greater_than": {
      const a = Number(actualValue);
      const b = Number(expectedValue);
      if (isNaN(a) || isNaN(b)) return false;
      return a > b;
    }

    case "greater_than_or_equal": {
      const a = Number(actualValue);
      const b = Number(expectedValue);
      if (isNaN(a) || isNaN(b)) return false;
      return a >= b;
    }

    case "less_than": {
      const a = Number(actualValue);
      const b = Number(expectedValue);
      if (isNaN(a) || isNaN(b)) return false;
      return a < b;
    }

    case "less_than_or_equal": {
      const a = Number(actualValue);
      const b = Number(expectedValue);
      if (isNaN(a) || isNaN(b)) return false;
      return a <= b;
    }

    case "is_empty": {
      if (actualValue === null || actualValue === undefined || actualValue === "") return true;
      if (Array.isArray(actualValue)) return actualValue.length === 0;
      if (typeof actualValue === "object") return Object.keys(actualValue).length === 0;
      return false;
    }

    case "is_not_empty": {
      return !evaluateConditionRule(actualValue, "is_empty", expectedValue);
    }

    case "is_null": {
      return actualValue === null || actualValue === undefined;
    }

    case "is_not_null": {
      return actualValue !== null && actualValue !== undefined;
    }


    case "exists": {
      return actualValue !== undefined && actualValue !== null && actualValue !== "";
    }

    case "not_exists": {
      return actualValue === undefined || actualValue === null || actualValue === "";
    }

    case "contains": {
      if (actualValue === null || actualValue === undefined) return false;
      if (Array.isArray(actualValue)) {
        return actualValue.some((item) =>
          evaluateConditionRule(item, "equals", expectedValue)
        );
      }
      return String(actualValue).includes(String(expectedValue ?? ""));
    }

    case "not_contains": {
      return !evaluateConditionRule(actualValue, "contains", expectedValue);
    }

    case "starts_with": {
      if (actualValue === null || actualValue === undefined) return false;
      return String(actualValue).startsWith(String(expectedValue ?? ""));
    }

    case "ends_with": {
      if (actualValue === null || actualValue === undefined) return false;
      return String(actualValue).endsWith(String(expectedValue ?? ""));
    }

    case "is_true": {
      return (
        actualValue === true ||
        actualValue === "true" ||
        actualValue === 1 ||
        actualValue === "1"
      );
    }

    case "is_false": {
      return (
        actualValue === false ||
        actualValue === "false" ||
        actualValue === 0 ||
        actualValue === "0"
      );
    }

    case "matches_regex": {
      if (actualValue === null || actualValue === undefined) return false;
      const str = String(actualValue);
      const pattern = String(expectedValue ?? "");
      // ReDoS and payload size protections
      if (pattern.length > 200 || str.length > 10000) return false;
      try {
        const regex = new RegExp(pattern);
        return regex.test(str);
      } catch {
        return false;
      }
    }

    case "in_list": {
      if (actualValue === null || actualValue === undefined) return false;
      if (Array.isArray(expectedValue)) {
        return expectedValue.some((item) =>
          evaluateConditionRule(actualValue, "equals", item)
        );
      }
      if (typeof expectedValue === "string") {
        const items = expectedValue.split(",").map((s) => s.trim());
        return items.some((item) =>
          evaluateConditionRule(actualValue, "equals", item)
        );
      }
      return false;
    }

    case "not_in_list": {
      return !evaluateConditionRule(actualValue, "in_list", expectedValue);
    }

    default:
      return false;
  }
}

/**
 * Evaluates a rule or nested group recursively against an execution context or object.
 */
export function evaluateConditionGroup(
  group: ConditionRuleGroup,
  contextOrObj: any
): boolean {
  const combinator = group.combinator || "AND";
  const rules = group.rules || [];

  if (rules.length === 0) {
    return combinator === "AND";
  }

  if (combinator === "AND") {
    return rules.every((rule) => {
      if ("combinator" in rule && Array.isArray((rule as ConditionRuleGroup).rules)) {
        return evaluateConditionGroup(rule as ConditionRuleGroup, contextOrObj);
      }
      const single = rule as ConditionRule;
      const actual = resolveValue(single.field, contextOrObj);
      const expected = resolveValue(single.value, contextOrObj);
      return evaluateConditionRule(actual, single.operator, expected);
    });
  } else {
    // "OR"
    return rules.some((rule) => {
      if ("combinator" in rule && Array.isArray((rule as ConditionRuleGroup).rules)) {
        return evaluateConditionGroup(rule as ConditionRuleGroup, contextOrObj);
      }
      const single = rule as ConditionRule;
      const actual = resolveValue(single.field, contextOrObj);
      const expected = resolveValue(single.value, contextOrObj);
      return evaluateConditionRule(actual, single.operator, expected);
    });
  }
}

export const conditionHandler: NodeHandler<ConditionNodeConfig> = {
  type: "CONDITION",
  validateConfig(config) {
    const errors: string[] = [];
    if (!config) {
      errors.push("Condition node requires configuration.");
      return { isValid: false, errors };
    }

    if (config.group) {
      if (!Array.isArray(config.group.rules) || config.group.rules.length === 0) {
        errors.push("Condition rule group requires at least one rule.");
      }
    } else if (Array.isArray(config.rules) && config.rules.length > 0) {
      // Valid list of rules
    } else if (!config.field) {
      errors.push("Condition node requires a target 'field' or rule group.");
    }

    return { isValid: errors.length === 0, errors };
  },

  async execute(ctx: StepExecutionContext<ConditionNodeConfig>): Promise<NodeExecutionResult> {
    const config = ctx.config || {};
    let isMet = false;

    if (config.group) {
      isMet = evaluateConditionGroup(config.group, ctx.context);
    } else if (Array.isArray(config.rules) && config.rules.length > 0) {
      isMet = evaluateConditionGroup(
        { combinator: config.combinator || "AND", rules: config.rules },
        ctx.context
      );
    } else {
      // Legacy single rule mode
      const fieldPath = config.field || "";
      const operator = config.operator || "equals";
      const rawExpected = config.value;

      const actualValue = resolveValue(fieldPath, ctx.context);
      const expectedValue = resolveValue(rawExpected, ctx.context);
      isMet = evaluateConditionRule(actualValue, operator, expectedValue);
    }

    const selectedBranch = isMet ? "true" : "false";

    return {
      status: "SUCCESS",
      selectedBranch,
      outputData: {
        conditionMet: isMet,
        selectedBranch,
        evaluatedAt: new Date().toISOString(),
      },
    };
  },
};
