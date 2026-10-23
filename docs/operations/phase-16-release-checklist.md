# FlowForge Operations — Phase 16 Release Checklist
## Verification, Scale Readiness, and Deployment Safety

### 1. Pre-Deployment Verification
- [x] Monorepo build passes without errors (`packages/shared`, `packages/sdk`, `apps/api`, `apps/web`).
- [x] Database migrations / schema push succeeded (`packages/database/prisma/schema.prisma`).
- [x] Backend Vitest suite: 295 / 295 passed across 16 test suites (including `phase16.test.ts`).
- [x] TypeScript SDK test suite: 16 / 16 passed (including `scale` and regional placement tests).
- [x] Playwright browser smoke suite: 82 / 82 tests passed across Desktop and Mobile Chrome (41 scenarios).
- [x] No lingering zombie worker or locked query engine processes.

---

### 2. Deployment Steps
1. **Apply Database Migrations**:
   ```bash
   npm --prefix packages/database run db:push
   ```
2. **Deploy API Replicas**:
   - Verify `/health/ready` returns 200 before routing live traffic.
   - Set `FLOWFORGE_REGION="us-east-1"`.
3. **Deploy Worker Replicas**:
   - Ensure workers have Redis and PostgreSQL credentials.
   - Sizing: `WORKER_CONCURRENCY=5`.
4. **Deploy Web Application**:
   - Build Next.js production bundle (`npm --prefix apps/web run build`).
   - Start Next.js server (`npm --prefix apps/web run start`).
5. **Verify Command Telemetry**:
   - Navigate to `/operations`.
   - Verify Capacity Management, Worker Saturation, Projected Drain Time, and Regional Clusters display correctly.
   - Execute non-destructive Regional Failover Drill.

---

### 3. Rollback Procedure
If unexpected errors occur:
1. Revert application container image to Phase 15 release.
2. The database schema additions (`RegionDeploymentConfig`, `CapacityMetricSample`, `RegionalFailoverDrillRecord`, and workspace region fields) are purely additive and backward compatible. No destructive schema rollbacks required.
