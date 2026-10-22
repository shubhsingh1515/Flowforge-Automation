# FlowForge Automation — Workflow Diagnostics, Debugging & Testing Guide

## 1. Overview
FlowForge provides integrated debugging and testing tools to inspect workflow graph health before deployment and diagnose runtime issues in real time.

---

## 2. Real-Time Canvas Graph Diagnostics

In the visual canvas, clicking **Diagnostics** opens the graph health analysis modal:
- **Missing Triggers**: Identifies if the workflow lacks a trigger node (`webhook` or `schedule`).
- **Orphan Nodes**: Identifies action nodes with no inbound connections.
- **Dead Ends**: Identifies nodes that produce outputs but have no downstream consumers (informational).
- **Missing Connections**: Scans third-party integration nodes (Slack, GitHub, Google Sheets) and highlights any nodes missing credentials (`needsConnection: true`).

---

## 3. Test Flow Execution (Dry Run)

From the canvas, clicking **Test Flow** triggers an immediate manual test run:
1. Opens a modal allowing custom mock JSON payload input (defaults to standard webhook body).
2. Sends the payload directly to the BullMQ workflow execution queue.
3. Provides live status polling with step-by-step diagnostic toasts.
4. Renders a direct link to the resulting execution in **Execution History**.

---

## 4. Execution Step Logs & Replay

Under `/executions`:
- **Step Level Durations**: Exact millisecond execution time per node.
- **Input & Output Payloads**: Full JSON payloads inspected at each step.
- **Error Traces**: Stack traces and upstream HTTP status codes for failed steps.
- **Retry Mechanism**: Idempotent re-execution of failed workflows without duplicating completed side-effects.
