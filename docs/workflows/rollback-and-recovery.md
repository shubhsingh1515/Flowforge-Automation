# Workflow Rollback and Safe Recovery Guide

FlowForge Automation SaaS provides atomic, immutable rollback mechanisms to safely recover from broken or misbehaving workflow releases in any workspace environment (`Development`, `Staging`, or `Production`).

---

## 1. Architectural Principles of Rollback

1. **Immutable Artifact Restoration**:
   - Releases are never "edited" in place or mutated.
   - Rollback operates by creating a new `WorkflowDeployment` record that points to a previously certified `WorkflowReleaseArtifact`.
   - The SHA-256 `contentHash` of the target historical release is strictly verified prior to deployment activation.

2. **Pre-Flight Configuration Validation**:
   - Before rollback can execute, pre-flight validation inspects the target environment's active configuration.
   - It guarantees all `requiredVariables` and `requiredIntegrations` defined in the target historical artifact are present and bound.
   - If a necessary variable or credential was deleted after the original release was active, pre-flight validation fails with a descriptive error to prevent runtime failures.

3. **Self-Contained Audit Trail**:
   - Every rollback logs the target release artifact ID, initiating user, target environment, execution reason, and timestamp to the workspace audit log.

---

## 2. Performing a Rollback

### Via Web UI
1. Navigate to **Environments & Release Promotion** (`/environments`).
2. Select the target environment card (`Staging` or `Production`).
3. Click the **Rollback** button in the environment details pane.
4. Select the target prior release candidate from the dropdown list. The interface presents the release number, version number, content hash prefix, and original creation timestamp.
5. Review the validation status indicator.
6. Confirm the rollback. The engine atomically updates the environment pointer, deactivates the current release, and publishes an outbound webhook event.

### Via REST API / CI/CD
```bash
POST /api/v1/deployments/rollback
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "environmentId": "env_prod_01",
  "targetReleaseArtifactId": "rel_art_009",
  "reason": "Degraded third-party API response rates observed post-deployment"
}
```

### Via TypeScript SDK
```typescript
import { FlowForgeClient } from "@flowforge/sdk";

const client = new FlowForgeClient({ apiKey: process.env.FLOWFORGE_API_KEY });

const result = await client.deployments.rollback({
  environmentId: "env_prod_01",
  targetReleaseArtifactId: "rel_art_009",
  reason: "Automated alert recovery trigger",
});

console.log(`Rollback deployment status: ${result.data.status}`);
```

---

## 3. Post-Rollback State Reconciliation

When a rollback completes:
- The `WorkflowEnvironment.activeReleaseArtifactId` is updated to the historical release.
- Webhook routes and scheduled triggers adapt immediately to the restored topology.
- Real-time event notifications (`deployment.rolled_back`) are broadcast to registered webhooks and audit streams.
