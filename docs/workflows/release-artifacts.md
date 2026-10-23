# Immutable Workflow Release Artifacts

Technical specification for FlowForge's immutable workflow release artifact format, canonical serialization, and SHA-256 integrity verification.

---

## 1. Release Artifact Specification

A `WorkflowReleaseArtifact` represents an immutable, validated snapshot of a workflow definition ready for promotion across environments:

```json
{
  "formatVersion": "flowforge.release/v1",
  "workflowName": "Order Processing Pipeline",
  "description": "Validates inbound checkout events, processes Stripe payment, and posts Slack alert",
  "triggerType": "WEBHOOK",
  "versionNumber": 2,
  "requiredVariables": [
    "API_BASE_URL",
    "ORDER_SIGNING_SECRET"
  ],
  "requiredIntegrations": [
    "slack"
  ],
  "nodes": [
    {
      "id": "node_1",
      "type": "webhookTrigger",
      "data": { "label": "Inbound Order Webhook" }
    },
    {
      "id": "node_2",
      "type": "slackMessage",
      "data": {
        "label": "Notify Team",
        "integrationKey": "slack",
        "config": {
          "channel": "#orders",
          "apiUrl": "{{env.API_BASE_URL}}"
        }
      }
    }
  ],
  "edges": [
    { "id": "e1-2", "source": "node_1", "target": "node_2" }
  ]
}
```

---

## 2. Canonical Serialization & Content Hashing

To guarantee reproducibility and tamper detection, artifact definitions are serialized using **canonical JSON key ordering** before hashing:

1. **Key Sorting**: Object keys at all nested levels are sorted alphabetically.
2. **Secret Scrubbing**: All connection IDs, OAuth tokens, API keys, and webhook secrets are removed before canonicalization.
3. **SHA-256 Hash**:
   $$\text{contentHash} = \text{SHA256}(\text{JSON.stringify}(\text{canonicalDefinition}))$$
4. **Tamper Detection**:
   Whenever a release is retrieved or promoted, the system recalculates the SHA-256 hash of `canonicalDefinition` and verifies equality with `contentHash`. If mismatched, deployment is immediately blocked.

---

## 3. Immutability Guarantees

- **No In-Place Modifications**: A release artifact record is write-once upon creation.
- **Stable Identity**: Subsequent edits to the workflow draft canvas do not mutate the release artifact.
- **Traceable Versioning**: Each artifact tracks its parent `workflowVersionId` and assigns an incrementing `releaseNumber` (e.g. Release #1, Release #2).
