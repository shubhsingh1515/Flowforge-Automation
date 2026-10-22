import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";
import { validateUrlForSsrf, SsrkViolationError } from "../security/ssrf.js";
import { resolveDeep } from "../mapping/resolver.js";

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "token",
]);

function redactHeaders(headers: Record<string, any>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_KEYS.has(k.toLowerCase())) {
      clean[k] = "[REDACTED]";
    } else {
      clean[k] = String(v);
    }
  }
  return clean;
}

export const httpRequestHandler: NodeHandler = {
  type: "HTTP_REQUEST",
  validateConfig(config) {
    const errors: string[] = [];
    if (!config || !config.url) {
      errors.push("HTTP Request node requires a target 'url'.");
    }
    return { isValid: errors.length === 0, errors };
  },
  async execute(ctx: StepExecutionContext): Promise<NodeExecutionResult> {
    const rawUrl = ctx.config?.url;
    if (!rawUrl) {
      return {
        status: "FAILED",
        errorCategory: "INVALID_CONFIG",
        errorMessage: "Missing required 'url' in HTTP Request configuration.",
      };
    }

    // Resolve template expressions in URL, headers, and body
    const resolvedUrlString = resolveDeep(rawUrl, ctx.context);
    const method = (ctx.config?.method || "GET").toUpperCase();
    const rawHeaders = ctx.config?.headers || {};
    const resolvedHeaders = resolveDeep(rawHeaders, ctx.context);
    const rawBody = ctx.config?.body;
    const resolvedBody = rawBody !== undefined ? resolveDeep(rawBody, ctx.context) : undefined;
    const timeoutMs = parseInt(ctx.config?.timeoutMs || "15000", 10);

    // 1. SSRF Validation
    try {
      await validateUrlForSsrf(resolvedUrlString);
    } catch (err: any) {
      if (err instanceof SsrkViolationError) {
        return {
          status: "FAILED",
          errorCategory: "SSRF_VIOLATION",
          errorMessage: err.message,
        };
      }
      return {
        status: "FAILED",
        errorCategory: "INVALID_CONFIG",
        errorMessage: `URL validation error: ${err.message}`,
      };
    }

    // 2. Prepare HTTP fetch request
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const reqHeaders: Record<string, string> = {
      "User-Agent": "FlowForge-Automation-Runner/1.0",
      ...resolvedHeaders,
    };

    let reqBodyStr: string | undefined = undefined;
    if (method !== "GET" && method !== "HEAD" && resolvedBody !== undefined) {
      if (typeof resolvedBody === "object") {
        reqBodyStr = JSON.stringify(resolvedBody);
        if (!reqHeaders["Content-Type"]) {
          reqHeaders["Content-Type"] = "application/json";
        }
      } else {
        reqBodyStr = String(resolvedBody);
      }
    }

    try {
      const response = await fetch(resolvedUrlString, {
        method,
        headers: reqHeaders,
        body: reqBodyStr,
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timer);

      // Verify redirect target if URL changed
      if (response.url !== resolvedUrlString) {
        await validateUrlForSsrf(response.url);
      }

      // Parse response body
      const contentType = response.headers.get("content-type") || "";
      let responseBody: any;

      if (contentType.includes("application/json")) {
        try {
          responseBody = await response.json();
        } catch {
          responseBody = await response.text();
        }
      } else {
        responseBody = await response.text();
      }

      const resHeadersRecord: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        resHeadersRecord[k] = v;
      });

      const outputData = {
        statusCode: response.status,
        statusText: response.statusText,
        headers: redactHeaders(resHeadersRecord),
        body: responseBody,
        url: response.url,
      };

      if (response.ok) {
        return {
          status: "SUCCESS",
          outputData,
        };
      }

      return {
        status: "FAILED",
        errorCategory: response.status >= 500 ? "EXTERNAL_API_ERROR" : "INVALID_INPUT",
        errorMessage: `HTTP request failed with status code ${response.status} (${response.statusText})`,
        outputData,
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        return {
          status: "FAILED",
          errorCategory: "TIMEOUT",
          errorMessage: `HTTP request timed out after ${timeoutMs}ms.`,
        };
      }
      return {
        status: "FAILED",
        errorCategory: "NETWORK_ERROR",
        errorMessage: `Network error dispatching HTTP request: ${err.message}`,
      };
    }
  },
};
