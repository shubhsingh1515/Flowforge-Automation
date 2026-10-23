# FlowForge Automation — Natural-Language Workflow Builder

## 1. Overview

The Natural-Language Workflow Builder (`/workflows/ai-builder`) empowers technical and non-technical operators to translate operational intentions into production-ready FlowForge Directed Acyclic Graphs (DAGs).

Instead of starting from a blank canvas, operators describe automation goals in plain English (e.g., *"When a payment is received in Stripe, check if the amount exceeds $500, forward the transaction to Salesforce CRM, and alert the #enterprise-sales channel on Slack"*). FlowForge AI analyzes the intent, maps operations to registered node schemas, resolves connection handles, validates cycle-free topology, and displays a complete, interactive blueprint.

---

## 2. Generation Lifecycle & Guarantees

```
Operator Prompt
      │
      ▼
Tenancy & Quota Verification (EntitlementService)
      │
      ▼
System Prompt Dynamic Assembly (Registry-Grounded Knowledge)
      │
      ▼
Model Inference (OpenAI / Mock Provider)
      │
      ▼
Topological Validation & DAG Cycle Check
      │
      ▼
Interactive Proposal Inspection (UI Review)
      │
      ▼
Operator Action: [Save as Draft] or [Conversational Refinement]
      │
      ▼
Persistence: WorkflowStatus.DRAFT (Never Silently Activated)
```

### Safety Principles

1. **Registry Grounding**: The generator only emits node types registered in FlowForge:
   - Triggers: `WEBHOOK`, `SCHEDULE`, `APP_EVENT`
   - Actions: `HTTP_REQUEST`, `DATA_TRANSFORM`, `CONDITION`, `HUMAN_APPROVAL`, `WORKFLOW_END`
   - Integrations: `slack`, `github`, `stripe`, `salesforce`, `hubspot`, `resend`, `sendgrid`, `twilio`, `linear`
2. **Deterministic Fallbacks**: In offline or mock mode, heuristic prompt analyzers detect keywords (`payment`, `stripe`, `slack`, `lead`, `approval`) to generate realistic, fully-wired node and edge graphs with valid layout coordinates.
3. **No Automatic Activation**: Newly saved workflows are strictly assigned `status = "DRAFT"`. Operators must test or explicitly promote workflows before they process live traffic.

---

## 3. UI Features

Located at `/workflows/ai-builder`:
- **Real-Time Engine Status Pill**: Displays active AI provider, model identifier, and workspace monthly quota balance.
- **Starter Templates**: One-click quick prompts for popular SaaS automation patterns (e.g., *Webhook Lead Intake to Slack*, *Stripe Payment Alerts*, *GitHub PR Triage with Human Approval*).
- **Execution Pipeline Grid**: Cards displaying each generated step, node type, description, and bound integration.
- **Requirements & Secrets Drawer**: Identifies third-party connections and environment variables required for successful execution.
- **Direct Canvas Launch**: Once saved as draft, operators can immediately navigate to `/workflows/:id` for visual fine-tuning on the React Flow canvas.
