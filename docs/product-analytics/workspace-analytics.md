# FlowForge Product Analytics & Telemetry Architecture

Comprehensive documentation for workspace telemetry aggregation, duration percentiles, volume trends, and failure intelligence.

---

## 1. Architectural Principles

1. **Strict Multi-Tenant Isolation**: All queries enforce `workspaceId` equality constraints in Prisma queries and PostgreSQL execution plans. No cross-tenant leakage is mathematically possible.
2. **Deterministic Percentile Computation**: Duration percentiles (`p50`, `p90`, `p99`) are computed via nearest-rank interpolation over ordered duration arrays of actual completed execution records.
3. **No Fabricated Data**: Metrics are strictly computed from real database records in the `WorkflowExecution` table. When no records exist in the requested interval, zero values (`0`, `0.00%`, `0ms`) are reported without interpolation or synthetic placeholders.
4. **Failure Intelligence Classification**: Unhandled exceptions and error strings are parsed and grouped into canonical error categories (`TIMEOUT`, `RATE_LIMIT`, `AUTH_ERROR`, `NETWORK_ERROR`, `SCHEMA_VALIDATION`, `CUSTOM_ERROR`) with contextual troubleshooting remediation steps.

---

## 2. API Contract: `GET /api/v1/analytics/overview`

### Query Parameters
- `timeRange`: Enum (`24h`, `7d`, `30d`, `90d`, `custom`) - default `7d`
- `from`: ISO 8601 string (optional, used when `timeRange=custom`)
- `to`: ISO 8601 string (optional, used when `timeRange=custom`)
- `workflowId`: string (optional, filters telemetry to a single workflow)
- `status`: Enum (`ALL`, `SUCCESS`, `FAILED`, `CANCELLED`, `RUNNING`) - default `ALL`

### Response Payload Structure
```json
{
  "summary": {
    "totalExecutions": 1420,
    "successCount": 1391,
    "failureCount": 29,
    "successRate": 97.96,
    "avgDurationMs": 412,
    "durationPercentiles": {
      "p50": 340,
      "p90": 820,
      "p99": 1450
    },
    "planMonthlyQuota": 10000,
    "planMonthlyUsage": 1420,
    "quotaPercentUsed": 14.2
  },
  "volumeOverTime": [
    {
      "timestamp": "2026-10-22T00:00:00.000Z",
      "dateLabel": "Oct 22",
      "total": 312,
      "success": 308,
      "failed": 4
    }
  ],
  "topErrors": [
    {
      "category": "RATE_LIMIT",
      "count": 18,
      "percentage": 62.07,
      "sampleMessage": "Slack API 429: Too Many Requests",
      "remediation": "Configure exponential backoff retry in node settings or increase external API rate limits."
    }
  ],
  "mostExecutedWorkflows": [
    {
      "workflowId": "wfl_1082",
      "workflowName": "Customer Onboarding Sync",
      "executionCount": 850,
      "successRate": 99.1,
      "avgDurationMs": 280,
      "lastExecutedAt": "2026-10-23T03:15:00.000Z"
    }
  ],
  "repeatedFailures": [
    {
      "workflowId": "wfl_9401",
      "workflowName": "HubSpot Deals Webhook",
      "consecutiveFailures": 5,
      "lastFailedAt": "2026-10-23T02:50:00.000Z",
      "lastError": "OAuth token expired: invalid_grant"
    }
  ]
}
```

---

## 3. UI Dashboard Features (`/analytics`)

- **Interactive Time-Range Selector**: Real-time filtering across 24 hours, 7 days, 30 days, or 90 days.
- **Workflow & Status Filtering**: Narrow analysis to specific critical business flows or only failed runs.
- **Top-Level KPI Cards**: Total volume, success rate % (with positive/negative trend indicator), median duration (p50), and tail latency (p99).
- **Monthly Execution Quota Progress**: Visual comparison between current monthly consumption and plan entitlement limit.
- **Daily Execution Volume Trend**: Bar visualization mapping daily successful vs failed runs.
- **Failure Intelligence**: Grouped breakdown of root failure reasons with actionable troubleshooting tips.
- **Drill-down Links**: Direct deep links from workflow execution rows into individual execution inspection logs.
