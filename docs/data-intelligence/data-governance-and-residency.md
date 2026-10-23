# FlowForge Data Intelligence — Privacy, Classification & Residency

## 1. Data Classification Levels

- **`PUBLIC`**: Unrestricted business metadata.
- **`INTERNAL`**: Standard organization-level data.
- **`CONFIDENTIAL`**: Sensitive operational metrics and customer records.
- **`RESTRICTED`**: Highly confidential or regulated information requiring strict access grants.

---

## 2. Phase 17 Data Residency Integration

- **Regional Enforcement**: Data sources declare `allowedRegions` (e.g. `["us-east-1"]` or `["GLOBAL"]`).
- When a workspace in `eu-west-1` attempts to register or extract from a US-only source, the operation is blocked (`HTTP 400`).
- Materialized snapshots remain bound to the workspace's authoritative data residency jurisdiction.
