import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { resolveDeep, resolveValue, interpolateString, getByPath } from "../mapping/resolver.js";

export type TransformMode = "TEMPLATE" | "FIELD_MAPPING" | "PIPELINE";

export interface TransformFieldRule {
  targetField: string;
  sourceExpression?: string;
  type?: "string" | "number" | "boolean" | "date" | "json";
  defaultValue?: any;
  mathOp?: "add" | "subtract" | "multiply" | "divide" | "modulo" | "round";
  mathOperand?: number;
  stringOp?: "uppercase" | "lowercase" | "trim" | "split" | "join";
  delimiter?: string;
}

export interface TransformPipelineStep {
  operation:
    | "SET_FIELD"
    | "RENAME_FIELDS"
    | "PICK_FIELDS"
    | "OMIT_FIELDS"
    | "CALCULATE"
    | "CONVERT_TYPE"
    | "STRING_OP"
    | "MERGE_OBJECT"
    | "ARRAY_MAP"
    | "ARRAY_FILTER";
  params: Record<string, any>;
}

export interface TransformNodeConfig {
  mode?: TransformMode;
  template?: any;
  mapping?: Record<string, string>;
  fieldRules?: TransformFieldRule[];
  pipeline?: TransformPipelineStep[];
}

/**
 * Safely casts a value to a supported primitive type without crashing.
 */
export function convertType(value: any, targetType: "string" | "number" | "boolean" | "date" | "json"): any {
  if (value === null || value === undefined) return value;

  switch (targetType) {
    case "string":
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);

    case "number": {
      const num = Number(value);
      return isNaN(num) ? 0 : num;
    }

    case "boolean": {
      if (typeof value === "boolean") return value;
      const str = String(value).toLowerCase().trim();
      return str === "true" || str === "1" || str === "yes";
    }

    case "date": {
      const d = new Date(value);
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }

    case "json": {
      if (typeof value === "object") return value;
      try {
        return JSON.parse(String(value));
      } catch {
        return value;
      }
    }

    default:
      return value;
  }
}

/**
 * Safely executes basic arithmetic calculations without eval.
 */
export function executeMath(
  val: any,
  op: "add" | "subtract" | "multiply" | "divide" | "modulo" | "round",
  operand?: number
): number {
  const a = Number(val) || 0;
  const b = operand !== undefined ? Number(operand) : 0;

  switch (op) {
    case "add":
      return a + b;
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "divide":
      return b !== 0 ? a / b : 0;
    case "modulo":
      return b !== 0 ? a % b : 0;
    case "round":
      return Math.round(a);
    default:
      return a;
  }
}

/**
 * Sets a deeply nested property in an object safely using dot-delimited path.
 * e.g. setDeepValue(obj, "user.address.city", "Berlin")
 */
export function setDeepValue(obj: any, path: string, value: any): void {
  if (!obj || !path) return;
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Executes a declarative data transformation on an input context.
 */
export function executeTransformation(config: TransformNodeConfig, context: any): any {
  // Mode 1: Field Rules (Structured builder)
  if (Array.isArray(config.fieldRules) && config.fieldRules.length > 0) {
    const output: Record<string, any> = {};

    for (const rule of config.fieldRules) {
      if (!rule.targetField) continue;

      let value: any = undefined;

      if (rule.sourceExpression) {
        // Resolve expression
        const exactMatch = rule.sourceExpression.trim().match(/^\{\{\s*([\w.-]+(?:\[[^\]]+\])?)\s*\}\}$/);
        if (exactMatch) {
          value = resolveValue(rule.sourceExpression, context);
        } else {
          value = interpolateString(rule.sourceExpression, context);
        }
      }

      // Default value fallback if resolved value is null/undefined/empty
      if ((value === undefined || value === null || value === "") && rule.defaultValue !== undefined) {
        value = rule.defaultValue;
      }

      // Type conversion
      if (rule.type) {
        value = convertType(value, rule.type);
      }

      // Math operation
      if (rule.mathOp) {
        value = executeMath(value, rule.mathOp, rule.mathOperand);
      }

      // String operation
      if (rule.stringOp && typeof value === "string") {
        if (rule.stringOp === "uppercase") value = value.toUpperCase();
        else if (rule.stringOp === "lowercase") value = value.toLowerCase();
        else if (rule.stringOp === "trim") value = value.trim();
        else if (rule.stringOp === "split") value = value.split(rule.delimiter || ",");
      }

      setDeepValue(output, rule.targetField, value);
    }

    return output;
  }

  // Mode 2: Sequential Pipeline
  if (Array.isArray(config.pipeline) && config.pipeline.length > 0) {
    let currentData = typeof config.template === "object" ? resolveDeep(config.template, context) : { ...context.trigger?.body, ...context.steps };

    for (const step of config.pipeline) {
      switch (step.operation) {
        case "SET_FIELD": {
          const val = resolveValue(step.params?.value, { ...context, current: currentData });
          setDeepValue(currentData, step.params?.field, val);
          break;
        }
        case "RENAME_FIELDS": {
          const mapping = step.params?.mapping || {};
          for (const [oldKey, newKey] of Object.entries(mapping)) {
            if (currentData[oldKey] !== undefined) {
              currentData[newKey as string] = currentData[oldKey];
              delete currentData[oldKey];
            }
          }
          break;
        }
        case "PICK_FIELDS": {
          const fields: string[] = step.params?.fields || [];
          const picked: Record<string, any> = {};
          for (const f of fields) {
            if (currentData[f] !== undefined) picked[f] = currentData[f];
          }
          currentData = picked;
          break;
        }
        case "OMIT_FIELDS": {
          const fields: string[] = step.params?.fields || [];
          for (const f of fields) {
            delete currentData[f];
          }
          break;
        }
        case "CALCULATE": {
          const a = resolveValue(step.params?.a, { ...context, current: currentData });
          const b = resolveValue(step.params?.b, { ...context, current: currentData });
          const op = step.params?.op || "add";
          const res = executeMath(a, op, b);
          setDeepValue(currentData, step.params?.targetField, res);
          break;
        }
        case "CONVERT_TYPE": {
          const field = step.params?.field;
          const targetType = step.params?.type;
          if (field && targetType) {
            const raw = getByPath(currentData, field);
            setDeepValue(currentData, field, convertType(raw, targetType));
          }
          break;
        }
        case "MERGE_OBJECT": {
          const extra = resolveDeep(step.params?.object || {}, { ...context, current: currentData });
          currentData = { ...currentData, ...extra };
          break;
        }
      }
    }

    return currentData;
  }

  // Mode 3: Direct Template Resolution (Default / Backward Compatible)
  const rawMapping = config.template || config.mapping || config.payload || config || {};
  return resolveDeep(rawMapping, context);
}

export const transformHandler: NodeHandler<TransformNodeConfig> = {
  type: "TRANSFORM",
  validateConfig(config) {
    return { isValid: true, errors: [] };
  },
  async execute(ctx: StepExecutionContext<TransformNodeConfig>): Promise<NodeExecutionResult> {
    try {
      const config = ctx.config || {};
      const outputData = executeTransformation(config, ctx.context);

      return {
        status: "SUCCESS",
        outputData,
      };
    } catch (err: any) {
      return {
        status: "FAILED",
        errorCategory: "INTERNAL_ERROR",
        errorMessage: `Transformation execution failed: ${err.message}`,
      };
    }
  },
};
