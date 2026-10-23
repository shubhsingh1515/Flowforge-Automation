# FlowForge Customer Operations & Journey Intelligence (Phase 25)

## 1. Architectural Mission & Principles

Phase 25 establishes an enterprise-grade customer success, adoption intelligence, and governed operations layer natively inside FlowForge Automation SaaS.

### Core Architectural Axiom
> **"Customer accounts managed by SaaS tenants must never be confused with FlowForge's own tenant workspaces."**

- SaaS Tenants (workspaces) are FlowForge's paying customers.
- Customer Accounts within Phase 25 are the end customers, client accounts, or enterprise organizations managed *by* that tenant.
- All customer entities (`CustomerAccount`, `CustomerContact`, `CustomerExternalIdentity`, `CustomerJourneyInstance`, `CustomerHealthEvaluation`, `CustomerRiskAssessment`, `CustomerSuccessTask`, `CustomerPlaybookRun`, `CustomerCommunicationApproval`) are strictly isolated to their parent `workspaceId`.

---

## 2. Key Capabilities

### A. Customer Registry & Identity Management
- **Canonical Customer Account**: Stores account lifecycle state (`PROSPECT`, `ONBOARDING`, `ACTIVE`, `AT_RISK`, `RENEWAL_PENDING`, `CHURNED`, `ARCHIVED`), annual contract value (ACV), tiering (`ENTERPRISE`, `GROWTH`, `STANDARD`, `FREE`), and data classification (`INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`).
- **Authorized Contact Registry**: Maintains authorized contacts with explicit consent states (`OPTED_IN`, `OPTED_OUT`, `PENDING`), preventing unauthorized outbound communications.
- **External Identity Mapping**: Links upstream systems across `CRM` (e.g. Salesforce, HubSpot), `BILLING` (e.g. Stripe, Chargebee), and `SUPPORT` (e.g. Zendesk) with confidence scores, resolution provenance, and uniqueness conflict detection.

### B. Customer 360 Profile Aggregation
- Assembles a unified Customer 360 profile combining:
  - Account core metadata and custom attributes
  - Primary and authorized contacts with consent status
  - Linked external identities and upstream system mapping
  - Active and historical customer journey milestones
  - Deterministic health score and latest evaluation factors
  - Open risk assessments and mitigation plans
  - CSM success tasks and assignments
  - Correlated platform events and pending communication approvals
  - Complete data provenance summary

### C. Governed Customer Journeys
- **Immutable Versioning**: Journey definitions (`CustomerJourneyDefinition`) have immutable versions (`CustomerJourneyVersion`) specifying target milestones, SLA policies, and completion criteria.
- **Idempotent Instance Progression**: Journey instances enforce idempotency keys, avoiding accidental duplicate onboarding tracks or repeated milestone completions.
- **Milestone Engine**: Automatically transitions to the next milestone and records start/completion timestamps and SLA performance.

### D. Deterministic Customer Health Scoring
- Multi-dimensional weighted scoring combining:
  1. Product Adoption (telemetry event frequency & feature adoption)
  2. Onboarding Velocity & Milestone Progression
  3. SLA Adherence & Reliability
  4. Support & Incident Friction
- **Explicit Missing Data Handling**: Avoids false alarms by flagging dimensions as `FLAG_INSUFFICIENT` rather than penalizing accounts with zero scores when data has not yet been ingested.
- **Traceable Explainability**: Every evaluation outputs `dimensionScores`, `influentialFactors`, and `missingDataDimensions`.

### E. Risk Assessment & Governed Success Playbooks
- **Risk Categorization**: Detects and tracks `ONBOARDING_STALL`, `ADOPTION_DROP`, `SLA_BREACH_SPIKE`, `SUPPORT_ESCALATION`, and `CHURN_INDICATOR`.
- **Governed Playbooks**: Automated sequences that create targeted CSM tasks, trigger diagnostic workflows, or request human approval.
- **Loop Prevention**: Rate limits playbook triggering per account (e.g. 24-hour execution window) to prevent cascading execution loops or notification spam.

### F. Customer Communications Governance
- **Approved Communication Templates**: Variable-interpolated templates (`{{accountName}}`, `{{tier}}`) with strict category boundaries (`ONBOARDING`, `RISK_CHECKIN`, `RENEWAL`, `INCIDENT_NOTICE`).
- **Consent Pre-Check**: Blocks approval requests when recipient has explicitly opted out.
- **Role-Gated Approvals**: Workspace `ADMIN` or `OWNER` authorization required before customer-facing communications are released.
