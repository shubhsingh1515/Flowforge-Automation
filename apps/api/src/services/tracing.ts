import * as crypto from "node:crypto";

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceparent: string;
}

export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: "SERVER" | "CLIENT" | "INTERNAL" | "PRODUCER" | "CONSUMER";
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: "OK" | "ERROR";
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, any> }>;
}

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "apikey",
  "api_key",
  "password",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "secret",
  "clientsecret",
  "client_secret",
  "privatekey",
  "private_key",
  "webhooksecret",
  "webhook_secret",
]);

/**
 * Safely sanitizes arbitrary objects by masking sensitive credentials and tokens.
 */
export function redactSensitiveData(obj: any, depth = 0): any {
  if (depth > 6 || obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    // Basic heuristics for bearer tokens or long hashes in strings
    if (obj.startsWith("Bearer ") && obj.length > 20) {
      return "Bearer [REDACTED]";
    }
    if (obj.startsWith("ffk_") && obj.length > 15) {
      return `${obj.substring(0, 8)}...[REDACTED]`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.slice(0, 100).map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof obj === "object") {
    const redacted: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase().replace(/[-_]/g, "");
      if (SENSITIVE_KEYS.has(lowerKey)) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactSensitiveData(value, depth + 1);
      }
    }
    return redacted;
  }

  return obj;
}

class TracingService {
  private activeSpans = new Map<string, SpanRecord>();
  private completedSpans: SpanRecord[] = [];
  private maxCompletedSpans = 1000;

  /**
   * Generates or derives a W3C traceparent (version 00).
   * Format: 00-${traceId(32 hex)}-${spanId(16 hex)}-01
   */
  public generateTraceContext(incomingTraceparent?: string): TraceContext {
    let traceId: string;
    let parentSpanId: string | undefined;

    if (incomingTraceparent && /^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/.test(incomingTraceparent)) {
      const parts = incomingTraceparent.split("-");
      traceId = parts[1];
      parentSpanId = parts[2];
    } else {
      traceId = crypto.randomBytes(16).toString("hex");
    }

    const spanId = crypto.randomBytes(8).toString("hex");
    const traceparent = `00-${traceId}-${spanId}-01`;

    return {
      traceId,
      spanId,
      parentSpanId,
      traceparent,
    };
  }

  /**
   * Starts a new logical trace span.
   */
  public startSpan(
    name: string,
    context?: TraceContext,
    kind: SpanRecord["kind"] = "INTERNAL",
    attributes: Record<string, string | number | boolean> = {}
  ): { spanId: string; traceparent: string } {
    const ctx = context || this.generateTraceContext();
    const span: SpanRecord = {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      parentSpanId: ctx.parentSpanId,
      name,
      kind,
      startTime: Date.now(),
      status: "OK",
      attributes: { ...attributes },
      events: [],
    };

    this.activeSpans.set(ctx.spanId, span);
    return { spanId: ctx.spanId, traceparent: ctx.traceparent };
  }

  /**
   * Adds an annotated event to an active span.
   */
  public addSpanEvent(spanId: string, eventName: string, attributes?: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.events.push({
        name: eventName,
        timestamp: Date.now(),
        attributes: attributes ? redactSensitiveData(attributes) : undefined,
      });
    }
  }

  /**
   * Ends an active span and records duration.
   */
  public endSpan(spanId: string, status: "OK" | "ERROR" = "OK", errorMsg?: string): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;
    if (errorMsg) {
      span.attributes["error.message"] = errorMsg.substring(0, 255);
    }

    this.activeSpans.delete(spanId);
    this.completedSpans.push(span);
    if (this.completedSpans.length > this.maxCompletedSpans) {
      this.completedSpans.shift();
    }
  }

  /**
   * Retrieves recent spans for diagnostics.
   */
  public getRecentSpans(limit = 100): SpanRecord[] {
    return this.completedSpans.slice(-limit);
  }
}

export const tracingService = new TracingService();
