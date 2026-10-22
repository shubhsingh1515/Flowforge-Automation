import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { getByPath, resolveValue } from "../mapping/resolver.js";

export function evaluateConditionRule(
  actualValue: any,
  operator: string,
  expectedValue: any
): boolean {
  switch (operator) {
    case "equals":
      return String(actualValue ?? "") === String(expectedValue ?? "");

    case "not_equals":
      return String(actualValue ?? "") !== String(expectedValue ?? "");

    case "greater_than":
      return Number(actualValue) > Number(expectedValue);

    case "greater_than_or_equal":
      return Number(actualValue) >= Number(expectedValue);

    case "less_than":
      return Number(actualValue) < Number(expectedValue);

    case "less_than_or_equal":
      return Number(actualValue) <= Number(expectedValue);

    case "contains":
      if (Array.isArray(actualValue)) {
        return actualValue.some((item) => String(item) === String(expectedValue));
      }
      return String(actualValue ?? "").includes(String(expectedValue ?? ""));

    case "not_contains":
      return !String(actualValue ?? "").includes(String(expectedValue ?? ""));

    case "exists":
      return actualValue !== undefined && actualValue !== null && actualValue !== "";

    case "is_null":
      return actualValue === null || actualValue === undefined;

    case "is_not_null":
      return actualValue !== null && actualValue !== undefined;

    case "is_empty":
      if (actualValue === null || actualValue === undefined || actualValue === "") return true;
      if (Array.isArray(actualValue) && actualValue.length === 0) return true;
      if (typeof actualValue === "object" && Object.keys(actualValue).length === 0) return true;
      return false;

    default:
      return false;
  }
}

export const conditionHandler: NodeHandler = {
  type: "CONDITION",
  validateConfig(config) {
    const errors: string[] = [];
    if (!config || !config.field) {
      errors.push("Condition node requires a target 'field' or variable path.");
    }
    return { isValid: errors.length === 0, errors };
  },
  async execute(ctx: StepExecutionContext): Promise<NodeExecutionResult> {
    const fieldPath = ctx.config?.field || "";
    const operator = ctx.config?.operator || "equals";
    const rawExpectedValue = ctx.config?.value;

    // Resolve the actual value from context
    const actualValue = resolveValue(fieldPath, ctx.context);
    const expectedValue = resolveValue(rawExpectedValue, ctx.context);

    const isMet = evaluateConditionRule(actualValue, operator, expectedValue);
    const selectedBranch = isMet ? "true" : "false";

    return {
      status: "SUCCESS",
      selectedBranch,
      outputData: {
        conditionMet: isMet,
        selectedBranch,
        fieldPath,
        actualValue,
        operator,
        expectedValue,
      },
    };
  },
};
