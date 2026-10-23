# Marketplace Moderation & Developer Governance Runbook

## 1. Moderation Queue Management

Platform operators monitor pending marketplace submissions via `GET /api/v1/marketplace/listings?reviewStatus=IN_REVIEW`.

### Review Protocol
1. **Developer Identity Check**: Verify publisher name, author account age, and verified email domain.
2. **Endpoint Validation**:
   - Verify that all declared action endpoints point to official API documentation.
   - Inspect JSON body templates for unauthorized data exfiltration headers.
3. **SSRF Re-Check**: Ensure no redirection triggers or loopback routes exist.

---

## 2. Decision Outcomes

- **Approve**: Call `POST /api/v1/marketplace/listings/:id/review` with `{ "decision": "APPROVE" }`. Status becomes `PUBLISHED` and listing is featured if qualified.
- **Reject**: Call with `{ "decision": "REJECT", "reason": "Explicit justification for author remediation" }`. Status becomes `REJECTED`.
- **Deprecate**: Call `POST /api/v1/marketplace/listings/:id/deprecate` with migration guidance notice.
