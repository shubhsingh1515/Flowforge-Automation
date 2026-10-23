# Zero-Downtime Rolling Deployments and Safe Database Migrations

## 1. Overview
FlowForge is designed to support zero-downtime rolling updates across API gateways and background worker clusters while maintaining backward compatibility across database schema updates.

---

## 2. Safe Database Migration Principles (Expand and Contract)

When modifying database models:
1. **Never Drop or Rename Columns in a Single Migration**:
   - Step 1 (Expand): Add nullable new columns. Deploy code that writes to both old and new columns, and reads from old.
   - Step 2 (Backfill): Backfill existing records with data in new columns.
   - Step 3 (Switch): Deploy code that reads and writes to new columns.
   - Step 4 (Contract): Remove old columns in a subsequent deployment.
2. **Backward-Compatible Prisma Migrations**:
   - In Phase 10, all added fields on `WorkflowExecution` (`traceparent`, `diagnostics`, `timeline`) are optional and nullable.
   - New models (`WorkspaceSsoProvider`, `SsoUserIdentity`, `SsoAuthorizationState`, `ScimProvisioningToken`, `ExecutionReconciliationLog`, `OperationalAlertRule`) do not lock existing tables or block writes during schema deployment.

---

## 3. Rolling Worker Deployments & Graceful Shutdown
Worker processes register graceful shutdown signal handlers:
```ts
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, closing BullMQ workers gracefully...");
  await worker.close(); // Finishes current active job without accepting new ones
  await prisma.$disconnect();
  process.exit(0);
});
```

### Deployment Sequence:
1. **Apply Migrations**: `npx prisma db push` or `prisma migrate deploy`.
2. **Deploy Workers**: New worker pods spin up and register with Redis. Old worker pods receive `SIGTERM`, complete in-flight workflow executions within their grace period (e.g. 30–60s), and terminate cleanly.
3. **Deploy API Gateways**: Kubernetes / ECS performs rolling replacement of API containers with zero dropped requests.
