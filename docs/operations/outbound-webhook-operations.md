# Outbound Webhook Infrastructure & Operations Guide

This guide details the operational procedures, metrics, queue architectures, and disaster recovery policies governing FlowForge's Outbound Webhooks delivery infrastructure.

---

## 1. System Topology

```
+-------------------------------------------------------------+
|                     FlowForge API Cluster                   |
|                                                             |
|  [Workflow Engine]     [Approvals Engine]    [Manual Test]  |
|          |                     |                   |        |
|          +---------------------+-------------------+        |
|                                |                            |
|             outboundWebhookService.emitEvent()              |
|                                |                            |
|                   +------------v------------+               |
|                   |  DB WebhookDelivery     |               |
|                   |  status: PENDING        |               |
|                   +------------+------------+               |
+--------------------------------|----------------------------+
                                 | Enqueue Job
                                 v
+-------------------------------------------------------------+
|                      Redis Queue Cluster                    |
|             Queue Name: "outbound-webhooks"                 |
+-------------------------------------------------------------+
                                 | Dequeue Job
                                 v
+-------------------------------------------------------------+
|                 Outbound Webhook Worker Pool                |
|                                                             |
|  1. DNS Resolution & SSRF Validator (validateUrlForSsrf)    |
|  2. HMAC-SHA256 Signer (whsec_...)                          |
|  3. HTTP POST Dispatcher (5s timeout, AbortController)      |
|  4. Status Updater: DB record -> SUCCESS / FAILED           |
|  5. Exponential Backoff Scheduler (10s, 30s, 60s)           |
+-------------------------------------------------------------+
```

---

## 2. Queue Configuration & Scaling Parameters

| Parameter | Default Value | Environment Override | Purpose |
|---|---|---|---|
| Worker Concurrency | `5` | `OUTBOUND_WEBHOOK_CONCURRENCY` | Maximum concurrent HTTP delivery dispatches per worker process |
| Max Attempts | `3` | `OUTBOUND_WEBHOOK_MAX_ATTEMPTS` | Retries before marking delivery permanently `FAILED` |
| HTTP Request Timeout| `5,000ms` | `OUTBOUND_WEBHOOK_TIMEOUT_MS` | Max time allowed for remote destination HTTP response |
| Max Response Truncation| `1,024 bytes` | Hardcoded | Bounds response body storage in `WebhookDelivery` table |
| Backoff Initial Delay| `10,000ms` | Fixed | Delay before 1st retry attempt |

---

## 3. Operational Troubleshooting

### High Failure Rates / Dead Letter Queue
If delivery alerts fire indicating high failure rates for specific customer endpoints:
1. Query failed deliveries via API:
   ```http
   GET /api/v1/outbound-webhooks/:id/deliveries?limit=50
   ```
2. Inspect the `errorMessage` and `statusCode` fields:
   - `401 Unauthorized / 403 Forbidden`: Destination secret has rotated or endpoint configuration changed. Direct user to rotate secret in Settings.
   - `ECONNREFUSED / ETIMEDOUT`: Target server down or firewall blocking traffic.
   - `SSRF_VIOLATION`: Destination resolved to a private/loopback/metadata IP. Delivery aborted by security boundary.

### Manual Redelivery
If an external partner service had an outage and requests historical events:
```http
POST /api/v1/outbound-webhooks/deliveries/:deliveryId/retry
Authorization: Bearer <user_jwt_or_api_key>
```
The delivery is re-enqueued to the BullMQ worker for immediate re-attempt.
