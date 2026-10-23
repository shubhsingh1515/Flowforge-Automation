# Production Launch Readiness Checklist

## 1. Automated Readiness Probe

FlowForge features an automated launch readiness endpoint:
```http
GET /api/v1/health/readiness-check
```

### Probed Components
1. **Primary Relational Database**: Validates PostgreSQL connection pool, read/write latency, and schema migrations.
2. **Redis In-Memory Broker**: Probes ping response and connection health.
3. **BullMQ Background Workers**: Validates workflow execution and outbound webhook background job queues.
4. **Security & Cryptography Configuration**: Confirms production `JWT_SECRET`, `SESSION_SECRET`, and `ENCRYPTION_KEY` are not set to default development values.
5. **Secret Redaction**: Probes output zero secrets, credentials, or private connection strings.

---

## 2. Pre-Launch Verification Matrix

| Area | Checkpoint | Automated Verification | Status |
|---|---|---|---|
| **Database** | PostgreSQL schema push & migration integrity | `npm run db:push` | VERIFIED |
| **Backend API** | Fastify REST API, auth plugins, rate limits | `npm test` (189 passing) | VERIFIED |
| **Worker Engine** | BullMQ distributed workflow execution | Vitest phase2/phase4 suites | VERIFIED |
| **Frontend UI** | Next.js App Router 17 production routes | `npm run build:web` | VERIFIED |
| **End-to-End** | 24 browser scenarios across Desktop & Mobile | `npm run test:e2e` (48 passing) | VERIFIED |
| **Security** | SSRF prevention, credentials encryption, RBAC | Security test suites | VERIFIED |
| **Data Rights** | Automated retention cleanup & GDPR exports | Phase 9 test suite | VERIFIED |
