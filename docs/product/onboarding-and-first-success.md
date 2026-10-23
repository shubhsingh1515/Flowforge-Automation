# Customer Onboarding, First Success & Troubleshooting Guidance

This document describes the customer onboarding pathway, empty-state guidance, and failure intelligence built into FlowForge Automation.

---

## 1. Onboarding Principles: The "Time to First Success" (TTFS) Objective

FlowForge is engineered to minimize Time to First Success:
1. **Zero-Configuration Sandbox**: New workspaces are provisioned with immediate execution capacity (Free Tier entitlement).
2. **Instant Pre-built Recipes**: The template marketplace allows one-click instantiation of verified end-to-end workflows (e.g. "Webhook to Slack Notification", "GitHub Issue Sync", "HTTP Poller").
3. **Interactive Visual Canvas**: Visual cues, color-coded node categories, and guided parameter forms make node configuration intuitive without reading external API specs.
4. **Immediate In-Canvas Test Runs**: The "Test Run" button executes workflows directly from the canvas against live sandboxes, rendering live node badges and step logs without leaving the editor.

---

## 2. Empty-State UX Guidance

When workspaces, workflows, or integrations are newly created and contain zero records:
- **Dashboard**: Prompts the user with an "Onboarding Checklist" tracking:
  - Create first workflow
  - Test run an execution
  - Connect a third-party account (OAuth or API key)
  - Configure a webhook or schedule trigger
- **Analytics Dashboard (`/analytics`)**: Rather than displaying blank graphs or generic errors, the interface displays informative placeholder states explaining that execution metrics, duration percentiles, and error intelligence will automatically populate upon first run.
- **Human Approvals (`/approvals`)**: Explains how Human-in-the-Loop approval nodes pause automated execution until authorized by an administrator.

---

## 3. Failure Intelligence & Contextual Troubleshooting

When execution runs fail, FlowForge categorizes errors into canonical failure modes and pairs them with contextual troubleshooting steps:

| Failure Category | Common Causes | Contextual Troubleshooting Guidance |
|---|---|---|
| `TIMEOUT` | Slow external APIs, large payloads, tight SLA timeouts | "Increase the node request timeout limit in advanced node settings, or verify external service responsiveness." |
| `RATE_LIMIT` | External provider 429 status codes | "Enable automatic exponential backoff in node retry policies, or upgrade external service tier quotas." |
| `AUTH_ERROR` | Expired OAuth refresh token, revoked API key | "Re-authenticate the connection in Connections settings, or verify that the API token has required scopes." |
| `NETWORK_ERROR` | DNS resolution failure, connection drop, SSL errors | "Verify destination endpoint hostname, SSL certificates, and network firewall rules." |
| `SCHEMA_VALIDATION` | Inbound payload missing required keys | "Inspect incoming trigger payload in Execution Logs to align expected JSON path expressions." |
| `CUSTOM_ERROR` | JavaScript transform exception, unhandled node return | "Inspect custom script sandbox logs in node inspector and verify syntax and edge cases." |

---

## 4. Repeated Failure Alerts

Workflows experiencing repeated consecutive failures (e.g., 3+ consecutive failed runs) are highlighted in the Analytics Failure Intelligence panel:
- Flags the workflow with an amber warning badge.
- Displays consecutive failure count and timestamp of the most recent breakdown.
- Provides a direct link to the specific execution run logs for rapid root-cause diagnosis.
