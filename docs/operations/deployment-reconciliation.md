# Deployment Reconciliation and Engine Synchronization

This operational document describes how the FlowForge engine reconciles active release artifacts with running worker queues, scheduled triggers, and incoming webhook routes.

---

## 1. Engine Execution Resolution Order

When a workflow execution is triggered (via Webhook, Cron Schedule, or Manual invocation):
1. **Target Environment Identification**:
   - The engine checks if the request targets a specific environment (e.g. `X-FlowForge-Environment: staging` or environment-specific webhook URL).
   - If unspecified, the engine defaults to the active release artifact in `Production`.
2. **Active Release Lookup**:
   - The engine retrieves `WorkflowEnvironment.activeReleaseArtifactId`.
   - If an active release artifact exists, the canonical sanitized definition (`canonicalDefinition.nodes`, `edges`) is loaded.
   - If no release artifact is active (e.g. in local development mode), the engine falls back to the current draft/version definition.
3. **Variable and Credential Hydration**:
   - Variables are loaded from `EnvironmentVariable` for the active environment. Secret values are decrypted in memory using AES-256-GCM.
   - Required integrations are resolved through `EnvironmentCredentialBinding` records targeting active `ConnectedAccount` entries in that environment.
4. **Deterministic Execution**:
   - The execution runs using the hydrated environment configuration while tracking the `releaseArtifactId` and `environmentId` in `WorkflowExecution` records for full traceability.

---

## 2. Dynamic Route Synchronization

- Inbound Webhook routes dynamically bind to active releases per environment.
- Scheduled BullMQ cron triggers are synchronized whenever an environment release is activated or rolled back.
- If an environment release is rolled back, the scheduler immediately unschedules old cron tasks and reschedules based on the newly active release's trigger specifications.

---

## 3. Disaster Recovery and Re-Sync Procedure

In the event of an abnormal database recovery or worker redis crash:
1. Trigger operational reconciliation via `GET /api/v1/health/ready`.
2. Run trigger synchronization:
   ```bash
   POST /api/v1/admin/triggers/sync
   ```
3. Verify environment pointers:
   ```bash
   GET /api/v1/environments
   ```
   Confirm all environments report valid `activeReleaseArtifactId` values matching expected SHA-256 content hashes.
