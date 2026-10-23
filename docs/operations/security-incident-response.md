# Security Incident Response Plan

## 1. Incident Classification

- **Severity 1 (Critical)**: Active credential leakage, arbitrary code execution, or tenant isolation breach.
- **Severity 2 (High)**: Malicious marketplace listing discovered, SSRF bypass, or localized denial of service.
- **Severity 3 (Medium)**: Non-exploitable vulnerability or abnormal rate limit tripping.

---

## 2. Emergency Containment Actions

### 2.1 Malicious Marketplace Listing Discovered
1. Instantly revoke the listing via administrative API:
   ```http
   POST /api/v1/marketplace/listings/:id/review
   { "decision": "REJECT", "reason": "Revoked due to security violation" }
   ```
2. The listing is immediately removed from the catalog.
3. Query all affected installations:
   ```sql
   SELECT workspace_id FROM marketplace_installations WHERE listing_id = 'malicious_id';
   ```
4. Revoke or deactivate workflows containing nodes from this integration.

### 2.2 Compromised Connected Account or Secret
1. Rotate master encryption key (`ENCRYPTION_KEY`) if key material is suspect.
2. Expire affected user sessions (`DELETE FROM sessions WHERE user_id = 'user_id'`).
3. Revoke all API keys belonging to the tenant.
