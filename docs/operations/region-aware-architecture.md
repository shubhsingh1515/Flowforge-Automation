# FlowForge Operations — Region-Aware Architecture
## Authoritative Home-Region Routing and Data Residency

### 1. Architectural Tenet
FlowForge implements **Tier B (Region-Aware Foundation with Authoritative Home-Region Routing)**:
- Tenancy metadata explicitly records `homeRegion` and `dataResidency`.
- Workspaces default to `homeRegion: "us-east-1"`.
- Requests directed to a non-authoritative regional endpoint fail closed with `Misdirected Execution` / `Misdirected Request`.
- This foundation enables regional readiness without falsely claiming active-active multi-region database replication before the physical infrastructure exists.

---

### 2. Supported Regions
Centrally registered regions in `RegionDeploymentConfig`:
1. `us-east-1` (US East - N. Virginia): Primary authoritative region.
2. `eu-central-1` (Europe Central - Frankfurt): Standby region.
3. `ap-southeast-1` (Asia Pacific - Singapore): Standby region.

---

### 3. Tenant Placement & Data Residency
Workspaces specify:
- `homeRegion`: Execution region (`us-east-1`, `eu-central-1`, `ap-southeast-1`).
- `dataResidency`: Residency boundary (`US`, `EU`, `APAC`, `GLOBAL`).
- `workloadPriority`: Execution priority (`BATCH`, `STANDARD`, `HIGH_PRIORITY`).

Administrators can update placement via `PATCH /api/v1/operations/regions/placement`.
Execution runners check `FLOWFORGE_REGION`:
```typescript
const currentRegion = process.env.FLOWFORGE_REGION || "us-east-1";
if (workflow.workspace.homeRegion !== currentRegion) {
  // Fail closed to prevent cross-region split-brain
  throw new Error(`Misdirected Execution: Workspace pinned to ${workflow.workspace.homeRegion}`);
}
```
