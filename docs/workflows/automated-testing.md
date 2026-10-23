# Automated Workflow Testing and Pre-Deployment Validation

FlowForge Automation SaaS includes a native fixture-based testing framework that allows workflow authors and release managers to validate automation logic before promoting releases across environments.

---

## 1. Test Architecture

### Non-Destructive Safe Execution Modes
To protect external systems and internal database states during testing:
- **`DRY_RUN` Mode**: Workflows execute up to trigger evaluation and data transformation nodes. External action nodes (e.g. Stripe charges, Slack messages, external webhook dispatches) evaluate their inputs and templated expressions, but external network requests are short-circuited and simulated with deterministic mock outputs.
- **`MOCKED` Mode**: Both triggers and external actions receive predefined test fixture payloads. No side effects occur.
- **`LIVE` Mode**: Real side effects occur. Typically restricted to sandbox environments (`Development`).

### Assertion Operators
Each test case defines one or more assertions against workflow execution outputs:
- `EQUALS`: Target JSON path matches expected value exactly.
- `CONTAINS`: Target string or array contains expected substring or item.
- `EXISTS`: Target JSON path exists and is neither `undefined` nor `null`.
- `GREATER_THAN`: Target numeric value exceeds expected threshold.
- `NOT_EMPTY`: Target string, array, or object is not empty.

---

## 2. Test Center Interface

The **Automated Test Center** under `/environments` allows users to:
1. View all configured test cases for the selected workflow.
2. Inspect test input fixtures and assertion rules.
3. Trigger test runs on demand in `DRY_RUN` mode.
4. Inspect real-time execution results, including:
   - Overall status (`PASSED`, `FAILED`, `ERROR`).
   - Assertion pass/fail count and details.
   - Exact release hash tested (`releaseHashChecked`).
   - Execution duration and step-by-step logs.

---

## 3. Automated Test Gates for Production Promotion

Workspace deployment policies can enforce that **all pre-deployment test cases must pass against the release artifact's exact SHA-256 hash** before promotion to `Production` is allowed:
- During pre-flight validation (`POST /api/v1/deployments/validate`), the engine verifies whether test cases exist and if the latest test runs against the release candidate's `contentHash` succeeded.
- If unrun or failing test cases exist, promotion is blocked or flagged with high-severity warnings.

---

## 4. REST API Example

### Creating a Workflow Test Case
```bash
POST /api/v1/tests
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "workflowId": "wf_123",
  "name": "Order Ingestion Dry-Run",
  "description": "Verifies tax calculation and line-item formatting without sending confirmation emails",
  "mockPayload": {
    "orderId": "ORD-9921",
    "subtotal": 100.0,
    "taxRate": 0.08
  },
  "assertions": [
    { "target": "total", "operator": "EQUALS", "expected": 108.0 },
    { "target": "status", "operator": "NOT_EMPTY" }
  ]
}
```

### Running a Workflow Test Case
```bash
POST /api/v1/tests/test_case_456/run
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "mode": "DRY_RUN",
  "environmentId": "env_dev_01"
}
```
