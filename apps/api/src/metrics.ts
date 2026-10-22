import client from "prom-client";

// Initialize default node metrics
client.collectDefaultMetrics({ prefix: "flowforge_" });

export const httpRequestDuration = new client.Histogram({
  name: "flowforge_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestsTotal = new client.Counter({
  name: "flowforge_http_requests_total",
  help: "Total number of HTTP requests processed",
  labelNames: ["method", "route", "status_code"],
});

export const workflowExecutionsTotal = new client.Counter({
  name: "flowforge_workflow_executions_total",
  help: "Total number of workflow executions completed",
  labelNames: ["status", "error_category"],
});

export const workflowExecutionDuration = new client.Histogram({
  name: "flowforge_workflow_execution_duration_seconds",
  help: "Workflow execution duration in seconds",
  labelNames: ["status"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
});

export const registry = client.register;
