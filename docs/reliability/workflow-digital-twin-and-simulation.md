# FlowForge Automation — Workflow Digital Twin, Deterministic Simulation, Chaos Engineering & Optimization

## 1. Architectural Overview

Phase 20 introduces an Enterprise Workflow Digital Twin platform to FlowForge Automation SaaS. The system enables platform operators and developers to simulate, verify, optimize, and test workflow behavior and resilience prior to production promotion.

### Core Architecture Principles:
1. **Deterministic Digital Twin Simulation**: Simulates the real workflow graph topology without executing real external side effects (zero external HTTP writes, emails, billing mutations, or credential changes).
2. **Virtual Time Clock**: Steps, timeouts, and delays progress on a virtual clock (e.g. 30s timeout evaluates in milliseconds of wall-clock time) without real-time sleep.
3. **Cryptographic Artifact Hash Binding**: Every simulation run is cryptographically bound to the canonical SHA-256 hash of the workflow definition or immutable release artifact. If the draft or release definition changes, prior evidence is flagged as `stale`.
4. **Controlled Non-Production Chaos Engineering**: Controlled synthetic fault injection bounded by authorization (`PENDING_APPROVAL` -> `APPROVED`), maximum duration caps, and automatic resource cleanup (`CLEANED_UP`). Prohibits execution against `PRODUCTION` environments.
5. **Evidence-Backed Workflow Optimization**: Candidate-vs-baseline structural diffs and empirical metrics (node count, execution duration, external call count, complexity score). AI proposes; deterministic validators verify.
6. **Simulation Release Gates**: Release promotions can enforce mandatory simulation coverage, absence of unsimulatable nodes, and passing chaos drill recovery evidence.

---

## 2. Simulation Nodes & Safe Adapters

Simulations evaluate nodes through dedicated simulation adapters:

| Node Type | Simulation Behavior | Side Effects Blocked | Outcome Status |
| :--- | :--- | :--- | :--- |
| **TRIGGER** | Evaluates synthetic fixture trigger payload | No (synthetic) | `SIMULATED_SUCCESS` |
| **CONDITION** | Evaluates rules deterministically across context and trigger payload | No (local) | `SIMULATED_SUCCESS` (takes branch `true`/`false`) |
| **TRANSFORM / FILTER** | Evaluates mapping expressions or mock outputs | No (local) | `SIMULATED_SUCCESS` |
| **LOOP** | Simulates bounded iterations (capped at max 10 iterations) | No (local) | `SIMULATED_SUCCESS` |
| **APPROVAL** | Simulates approval decision based on scenario configuration | Yes (mocked decision) | `SIMULATED_SUCCESS` / `SIMULATED_FAILURE` |
| **HTTP / WEBHOOK** | Prevents real outbound network requests; returns mock or synthesized response | **Yes (100% Guaranteed)** | `SIMULATED_SUCCESS` / `SIMULATED_FAILURE` |
| **INTEGRATION** | Prevents real connector calls; executes through sandbox simulation adapter | **Yes (100% Guaranteed)** | `SIMULATED_SUCCESS` / `SIMULATED_FAILURE` |
| **UNSUPPORTED** | Flagged explicitly when safe deterministic adapter is unavailable | Yes | `UNSIMULATABLE` |

---

## 3. Controlled Fault Injection

Replay scenarios support deterministic fault injection on designated target nodes or wildcards:

- `HTTP_429`: Simulates rate limiting with retry thresholds.
- `HTTP_5XX`: Simulates upstream provider outages and 502/503 errors.
- `TIMEOUT`: Advances virtual clock by simulated timeout duration (e.g. 30,000ms) without wall-clock sleep.
- `EXPIRED_CREDENTIALS`: Simulates 401 unauthorized / revoked token failures.
- `RETRY_EXHAUSTION`: Simulates repeated failures until retry exhaustion.
- `RESIDENCY_VIOLATION`: Simulates cross-region dispatch boundary violations (`BLOCKED_BY_POLICY`).
- `KMS_UNAVAILABLE`: Simulates CMEK key unavailability.

---

## 4. Assertion Engine

Typed assertions evaluate node outputs, overall workflow terminal status, and policy constraints:

- `EQUALS`, `CONTAINS`, `EXISTS`, `NOT_EXISTS`
- `GREATER_THAN`, `LESS_THAN`, `NOT_EMPTY`, `REGEX_MATCH`
- `NODE_EXECUTED`, `NODE_SKIPPED`
- `EXECUTION_STATUS_EQUALS` (`SIMULATED_SUCCESS`, `SIMULATED_FAILURE`, `SIMULATED_TIMEOUT`, `BLOCKED_BY_POLICY`)
- `MAX_SIMULATED_DURATION_MS`
- `NO_UNSIMULATABLE_NODES`
- `PROHIBITED_SIDE_EFFECTS` (verifies external network side effects were 100% blocked)

---

## 5. Controlled Chaos Safety Boundaries

Chaos drills are designed with hard safety boundaries:
1. **Production Prohibition**: Attempts to target an environment with `type === 'PRODUCTION'` are rejected with HTTP 403 `CHAOS_SAFETY_VIOLATION`.
2. **Explicit Two-Step Authorization**: Experiments are created in `PENDING_APPROVAL` status and require explicit authorization by an authorized workspace admin before execution.
3. **Bounded Duration**: Hard ceiling of 300 seconds maximum duration.
4. **Guaranteed Automatic Cleanup**: When an experiment finishes, fails, or is aborted, cleanup runs immediately and transitions status to `CLEANED_UP`.
5. **Recovery Telemetry**: Computes detection latency, recovery latency, duplicate side effects prevented (100%), queue drain time, and outbox recovery.

---

## 6. Release Gate Governance

The deployment policy model (`DeploymentPolicy`) includes Phase 20 release gate criteria:
- `requireSimulationCoverage`: Requires a passing digital twin simulation run matching the exact immutable `contentHash` of the release artifact.
- `prohibitUnsimulatableNodes`: Blocks promotion if the workflow contains unsimulatable nodes.
- `requireChaosExperimentEvidence`: Staging environments require passing chaos recovery drill evidence.
- Stale detection: If a release artifact's content hash does not match the simulation run's `workflowArtifactHash`, evidence is marked stale and blocked.
