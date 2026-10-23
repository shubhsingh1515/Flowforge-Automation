# Customer Support & Self-Service Diagnostics

Comprehensive documentation for FlowForge's self-service diagnostics bundle generation, privacy controls, secret scrubbing, and feedback collection.

---

## 1. Overview

To expedite technical troubleshooting between enterprise customers and FlowForge platform engineers without compromising credentials or sensitive payload data, FlowForge implements an automated, self-service diagnostics engine:
1. **Export Sanitized Support Diagnostics Bundle** (`POST /api/v1/support/bundle`)
2. **Download Encrypted Support Package** (`GET /api/v1/support/bundle/:id/download`)
3. **Submit Product Feedback or Bug Reports** (`POST /api/v1/support/feedback`)

---

## 2. Guaranteed Privacy & Secret Scrubbing Engine

Diagnostic packages must never leak security keys, environment secrets, authentication credentials, or private tokens.

### Redaction Rules (`redactSensitiveData`)
Before any object is serialized into the support diagnostic bundle, the recursive redaction algorithm inspects every key in the graph against a blacklist of sensitive identifiers:
- `*key*` (e.g. `apiKey`, `key`, `publicKey`, `privateKey`, `signingKey`)
- `*secret*` (e.g. `clientSecret`, `webhookSecret`, `secret`)
- `*token*` (e.g. `accessToken`, `refreshToken`, `token`)
- `*password*` / `*passwd*` / `*credential*` / `*auth*` / `*bearer*`

Any matching field value is replaced with the string `[REDACTED]`.

### Bundle Structure (`SupportBundlePayloadDto`)
A generated bundle package includes:
```json
{
  "bundleId": "cly9...104",
  "workspaceId": "cly0...912",
  "generatedAt": "2026-10-23T04:00:00.000Z",
  "notes": "Investigating intermittent webhook failures",
  "workspace": {
    "id": "cly0...912",
    "name": "Acme Corp Automation",
    "createdAt": "2026-10-20T10:00:00.000Z",
    "currentPlan": "PRO"
  },
  "workflows": [
    {
      "id": "wfl_101",
      "name": "Stripe to Slack Sync",
      "status": "ACTIVE",
      "nodeCount": 4,
      "edgeCount": 3,
      "nodeTypes": ["WEBHOOK", "HTTP_REQUEST", "SLACK_MESSAGE"],
      "lastRunAt": "2026-10-23T03:45:00.000Z"
    }
  ],
  "recentErrors": [
    {
      "executionId": "exec_918",
      "workflowId": "wfl_101",
      "failedAt": "2026-10-23T03:45:10.000Z",
      "errorCategory": "RATE_LIMIT",
      "errorMessage": "Slack API 429: Rate limit exceeded"
    }
  ],
  "connections": [
    {
      "provider": "SLACK",
      "status": "CONNECTED",
      "lastRefreshedAt": "2026-10-23T01:00:00.000Z"
    }
  ],
  "systemTelemetry": {
    "engineVersion": "1.0.0",
    "nodeVersion": "v22.23.3",
    "databaseStatus": "OPERATIONAL",
    "queueStatus": "OPERATIONAL"
  }
}
```

---

## 3. Customer Feedback Engine

Users can submit structured feedback directly from **Settings > Support & Diagnostics**:
- **Category**: `GENERAL`, `BUG`, `FEATURE_REQUEST`, `USABILITY`
- **Satisfaction Rating**: 1 to 5 stars
- **Comment**: Detailed reproduction steps or suggestions
- **Contact Email**: Optional email for support follow-up

### Protection & Abuse Prevention
- Submissions are rate-limited to 5 feedback reports per workspace per hour.
- Audited with `CUSTOMER_FEEDBACK_SUBMITTED` events.
