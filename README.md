# FlowForge Automation — Phase 1: Foundation, UI & Backend Scaffolding

FlowForge Automation is a visual workflow automation SaaS platform inspired by IFTTT, n8n, Make, and Zapier. This repository contains the Phase 1 foundation: Next.js visual node canvas, Fastify REST API, PostgreSQL database models, multi-tenant workspace isolation, and automated testing suites.

---

## 1. Required Software
- **Node.js**: `v20.0.0` or higher (Tested with `v22.23.3`)
- **npm**: `v10.0.0` or higher
- **Docker & Docker Compose**: For local PostgreSQL 16 and Redis containers
- **Google Chrome / Chromium**: For Playwright browser tests

---

## 2. Environment Variables
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```

Key environment configurations:
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | `FlowForge Automation` | Central product branding name |
| `DATABASE_URL` | `postgresql://flowforge:flowforge_dev_password@localhost:5432/flowforge_db?schema=public` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Local Redis service |
| `PORT` | `4000` | Backend REST API port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | Frontend API client base URL |
| `JWT_SECRET` | *(Random 32+ character key)* | Cryptographic JWT signing secret |
| `COOKIE_SECRET` | *(Random 32+ character key)* | HttpOnly cookie session secret |

---

## 3. How to Start Infrastructure
Start PostgreSQL 16 and Redis via Docker Compose:
```bash
docker compose -f infra/docker-compose.yml up -d
```
Verify containers are healthy:
```bash
docker ps
```

---

## 4. How to Install Dependencies
Install all monorepo workspace dependencies:
```bash
npm install
```

---

## 5. How to Run Migrations
Synchronize the Prisma schema and apply database migrations to PostgreSQL:
```bash
npm run db:push
```
To view the database GUI studio:
```bash
npm run --workspace=@flowforge/database studio
```

---

## 6. How to Seed Development Data
Seed default integration definitions, the demo user account, and an initial active workflow:
```bash
npm run db:seed
```

### Pre-seeded Demo Account Credentials:
- **Email**: `demo@flowforge.dev`
- **Password**: `Password123!`
- **Workspace**: `Acme Automations`

---

## 7. How to Start the Frontend and Backend

### Option A: Start API and Web Individually
In terminal 1 (Fastify API on port 4000):
```bash
npm run dev:api
```

In terminal 2 (Next.js Web on port 3000):
```bash
npm run dev:web
```

### Service Access:
- **Frontend Web UI**: [http://localhost:3000](http://localhost:3000)
- **Backend REST API**: [http://localhost:4000/api/v1](http://localhost:4000/api/v1)
- **Interactive OpenAPI (Swagger UI)**: [http://localhost:4000/api/v1/docs](http://localhost:4000/api/v1/docs)
- **API Health Liveness**: [http://localhost:4000/api/v1/health/live](http://localhost:4000/api/v1/health/live)
- **API Health Readiness**: [http://localhost:4000/api/v1/health/ready](http://localhost:4000/api/v1/health/ready)

---

## 8. How to Run Tests

### Unit & Integration Test Suite (Vitest)
Executes 17 backend unit and integration tests (DAG cycle detection, auth flows, tenant isolation, CRUD operations):
```bash
npm test
```

### Browser Smoke Tests (Playwright)
Executes 14 end-to-end browser tests across Desktop Chrome and Mobile Chrome viewports:
```bash
npx playwright test
```

---

## 9. How to Build the Application
Compile the shared libraries, backend API, and Next.js frontend for production:
```bash
npm run build
```

---

## 10. Summary of Implemented Features in Phase 1
- **Visual Workflow Canvas**: React Flow (`@xyflow/react`) editor with custom Trigger, Action, Condition, HTTP Request, and Workflow End nodes, node config sidebar, real-time cycle detection, and PostgreSQL graph persistence.
- **Backend REST API (`/api/v1`)**: Versioned endpoints for Auth, Dashboard metrics, Workflows CRUD & Duplication, Integrations, Connections, Executions, Templates, and Workspace settings with OpenAPI documentation.
- **Tenant Isolation**: Strict workspace-level security ensuring users can never access or modify another tenant's workflows or credentials.
- **Dashboard**: Real database-derived metric counts (workflows, active count, executions) with zero-state onboarding.
- **Integrations Catalog**: Searchable catalog distinguishing built-in primitives from planned Phase 2 connectors with detailed setup panels.
- **Templates Gallery**: Pre-built workflow DAGs that instantiate directly into the canvas.
- **Quality Assurance**: 100% passing tests (17 Vitest + 14 Playwright) with responsive desktop and mobile support.
