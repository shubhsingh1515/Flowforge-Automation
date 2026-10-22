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

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB safety limit

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

    // 1. Initial SSRF Validation
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
      let currentUrl = resolvedUrlString;
      let redirectCount = 0;
      let response: Response;

      // Safe redirect evaluation loop with manual redirection to prevent SSRF bypass
      while (true) {
        response = await fetch(currentUrl, {
          method,
          headers: reqHeaders,
          body: reqBodyStr,
          signal: controller.signal,
          redirect: "manual",
        });

        // Handle HTTP Redirects
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          redirectCount++;
          if (redirectCount > MAX_REDIRECTS) {
            clearTimeout(timer);
            return {
              status: "FAILED",
              errorCategory: "NETWORK_ERROR",
              errorMessage: `Exceeded maximum redirect limit of ${MAX_REDIRECTS} hops.`,
            };
          }

          const locationHeader = response.headers.get("location");
          if (!locationHeader) {
            break;
          }

          let nextUrl: string;
          try {
            nextUrl = new URL(locationHeader, currentUrl).toString();
          } catch {
            clearTimeout(timer);
            return {
              status: "FAILED",
              errorCategory: "INVALID_CONFIG",
              errorMessage: `Invalid redirect location header: "${locationHeader}"`,
            };
          }

          // Strict SSRF validation on the redirect target BEFORE dispatching next request
          try {
            await validateUrlForSsrf(nextUrl);
          } catch (err: any) {
            clearTimeout(timer);
            return {
              status: "FAILED",
              errorCategory: "SSRF_VIOLATION",
              errorMessage: `SSRF Violation on redirect destination: ${err.message}`,
            };
          }

          currentUrl = nextUrl;
          if (response.status === 303) {
            reqBodyStr = undefined;
          }
          continue;
        }

        break;
      }

      clearTimeout(timer);

      // Check Content-Length limit
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
        return {
          status: "FAILED",
          errorCategory: "INVALID_INPUT",
          errorMessage: `HTTP response payload exceeds maximum allowed size of ${MAX_RESPONSE_BYTES / (1024 * 1024)}MB.`,
        };
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
        url: currentUrl,
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
