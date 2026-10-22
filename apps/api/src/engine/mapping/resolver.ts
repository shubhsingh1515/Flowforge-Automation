/**
 * Safe Data Expression and JSON Path Resolver
 * Evaluates template expressions (e.g. {{trigger.body.userId}} or trigger.body.id)
 * without using eval, new Function, or executing arbitrary code.
 */

export interface ExecutionContext {
  trigger: any;
  steps: Record<string, { input?: any; output?: any; status?: string }>;
  env?: Record<string, string>;
}

/**
 * Retrieves a nested value from an object given a dot-delimited path.
 * Supports: "trigger.body.customer.email", "steps.node_1.output.id", "trigger.headers['content-type']"
 */
export function getByPath(obj: any, path: string): any {
  if (obj == null || !path) return undefined;

  // Clean path: handle brackets like steps["node-1"] or [0]
  const normalizedPath = path
    .trim()
    .replace(/\[['"]?([^'"\]]+)['"]?\]/g, ".$1")
    .replace(/^\./, "");

  const parts = normalizedPath.split(".");
  let current = obj;

  for (const part of parts) {
    if (current == null) return undefined;
    if (typeof current !== "object") return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Resolves a single path expression against the execution context.
 */
export function resolveValue(expression: string, context: ExecutionContext): any {
  if (typeof expression !== "string") return expression;

  const trimmed = expression.trim();

  // If wrapped in {{ ... }}
  const mustacheMatch = trimmed.match(/^\{\{\s*([\w.-]+(?:\[[^\]]+\])?)\s*\}\}$/);
  if (mustacheMatch) {
    return getByPath(context, mustacheMatch[1]);
  }

  // If it's a direct reference starting with trigger, steps, or env
  if (trimmed.startsWith("trigger.") || trimmed.startsWith("steps.") || trimmed.startsWith("env.")) {
    return getByPath(context, trimmed);
  }

  return expression;
}

/**
 * Interpolates string templates with {{path}} placeholders.
 * Example: "https://api.example.com/users/{{trigger.body.userId}}"
 */
export function interpolateString(template: string, context: ExecutionContext): string {
  if (typeof template !== "string") return String(template ?? "");

  return template.replace(/\{\{\s*([\w.-]+(?:\[[^\]]+\])?)\s*\}\}/g, (_, path) => {
    const val = getByPath(context, path);
    if (val === undefined || val === null) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  });
}

/**
 * Recursively resolves expressions inside an object or array.
 */
export function resolveDeep(value: any, context: ExecutionContext): any {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    // If the whole string is just a single token {{path}}, preserve its native type (number, boolean, object)
    const exactMatch = value.trim().match(/^\{\{\s*([\w.-]+(?:\[[^\]]+\])?)\s*\}\}$/);
    if (exactMatch) {
      const resolved = getByPath(context, exactMatch[1]);
      return resolved !== undefined ? resolved : value;
    }
    // Otherwise interpolate strings
    return interpolateString(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveDeep(item, context));
  }

  if (typeof value === "object") {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveDeep(v, context);
    }
    return result;
  }

  return value;
}

// Aliases for convenience
export const getNestedValue = getByPath;
export const resolveExpressions = resolveDeep;
