# API Errors, Pagination & Rate Limiting

FlowForge standardizes error responses, cursor/offset pagination, and rate limit protections across all versioned public API endpoints.

---

## 1. Error Response Envelope

All API errors return RFC 7807-compatible structured JSON error bodies:

```json
{
  "error": "Forbidden",
  "message": "API key lacks required scope: workflows:write",
  "statusCode": 403,
  "code": "SCOPE_REQUIRED",
  "details": [
    {
      "path": "scopes",
      "message": "Required scope workflows:write missing from API key token"
    }
  ]
}
```

### Common HTTP Status Codes

| Status Code | Meaning | Typical Trigger |
|---|---|---|
| `200 OK` | Request succeeded | Successful GET, PUT, PATCH, or non-creation POST. |
| `201 Created` | Resource created | Workflow, API key, webhook, or custom integration successfully registered. |
| `400 Bad Request` | Validation failure | Malformed JSON, missing required fields, or Zod schema validation errors. |
| `401 Unauthorized` | Invalid authentication | Missing token, revoked API key, or expired session. |
| `403 Forbidden` | Permission or quota denied | Missing API key scope, plan limit reached, or attempt by API key to create child API keys. |
| `404 Not Found` | Resource not found | Resource does not exist or belongs to another workspace (tenant isolation). |
| `429 Too Many Requests`| Rate limit exceeded | Caller exceeded workspace request quota or server rate limit. |
| `500 Internal Error` | Server error | Unexpected unhandled exception logged to server telemetry. |

---

## 2. Pagination Standard

Endpoints returning collections (e.g. `GET /api/v1/workflows`, `GET /api/v1/executions`) support standard offset pagination query parameters:

### Request Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | 1-based page index. |
| `limit` | integer | `20` | Number of items per page (maximum `100`). |
| `search` | string | `""` | Optional text search filter across names and descriptions. |
| `status` | string | `ALL` | Status filter (`DRAFT`, `ACTIVE`, `PAUSED`, `SUCCESS`, `FAILED`). |

### Response Pagination Meta Envelope

```json
{
  "data": [ ... ],
  "pagination": {
    "total": 84,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

---

## 3. Rate Limiting

- **Standard Plan Limit**: 3,000 requests per minute per IP / token.
- **Header Telemetry**: FlowForge includes standard rate limiting headers:
  - `RateLimit-Limit`: Maximum requests per window.
  - `RateLimit-Remaining`: Remaining request quota.
  - `RateLimit-Reset`: Seconds remaining until quota reset.
