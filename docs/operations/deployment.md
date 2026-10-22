# FlowForge Automation SaaS — Production Deployment Runbook

## 1. Overview & Architecture
FlowForge Automation is a distributed, multi-tenant workflow automation platform architected for high availability, fault tolerance, and horizontal scalability.

### System Topology
```
                          [ Internet / Users / Webhooks ]
                                       │
                                       ▼
                       [ Cloudflare / Reverse Proxy (HTTPS) ]
                                       │
                     ┌─────────────────┴─────────────────┐
                     ▼                                   ▼
          [ Web Frontend Service ]            [ API Backend Service ]
          - Next.js 14 App Router             - Fastify 4 REST API
          - Port 3000                         - Port 4000
          - Multi-instance stateless          - Helmet CSP & Rate Limits
                     │                                   │
                     └─────────────────┬─────────────────┘
                                       │
             ┌─────────────────────────┼─────────────────────────┐
             ▼                         ▼                         ▼
    [ PostgreSQL 16 ]            [ Redis 7 ]            [ Dedicated Worker ]
    - Multi-tenant data          - BullMQ execution      - Async runner
    - Prisma connection pool     - AOF persistence       - 10+ concurrency
    - Automated WAL PITR         - Memory cap: 512MB     - Signal traps
```

---

## 2. Environment Configuration Matrix

All configuration is managed strictly via environment variables. In production, default secrets are actively rejected on startup.

| Variable Name | Required | Default / Format | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Runtime mode. Enforces strict secret validation. |
| `PORT` | No | `4000` | Fastify API HTTP listening port. |
| `HOST` | No | `0.0.0.0` | Network binding interface. |
| `API_PREFIX` | No | `/api/v1` | Root routing prefix for all API endpoints. |
| `DATABASE_URL` | Yes | `postgresql://...` | Connection string for PostgreSQL database. |
| `REDIS_URL` | Yes | `redis://...` | Connection URI for Redis broker. |
| `JWT_SECRET` | Yes | Min 32 chars | Secret key for signing user session tokens. |
| `COOKIE_SECRET` | Yes | Min 32 chars | Secret key for signing session cookies. |
| `CREDENTIAL_ENCRYPTION_KEY` | Yes | 64-char Hex (32B) | AES-256-GCM key for encrypting OAuth tokens. |
| `FRONTEND_URL` | Yes | `https://flowforge.example.com` | Allowed origin for browser requests. |
| `CORS_ORIGIN` | Yes | `https://flowforge.example.com` | Strict CORS origin verification. |
| `MAX_WORKFLOW_STEPS` | No | `500` | Hard cap on steps executed per workflow run. |
| `MAX_EXECUTION_DURATION_SECONDS` | No | `300` | Maximum workflow runtime before TIMEOUT. |

---

## 3. Container Deployment (Docker Compose)

### Prerequisites
- Docker Engine 24+ and Docker Compose v2.20+
- At least 4 CPU cores and 8GB RAM recommended for production workloads.
- Dedicated block storage for PostgreSQL and Redis data volumes.

### Deployment Procedure
1. Clone the production release repository:
   ```bash
   git clone https://github.com/flowforge/flowforge-automation.git
   cd flowforge-automation
   ```
2. Configure production secrets in `.env`:
   ```bash
   cp .env.example .env
   # Securely generate 64-hex key: openssl rand -hex 32
   ```
3. Build and launch container stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
4. Verify container health status:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```

---

## 4. Kubernetes Architecture & Deployment Strategy

For elastic enterprise deployments, FlowForge is packaged for Kubernetes with isolated deployments:

### Recommended Pod Allocations
1. **API Deployment**: 3+ replicas, Horizontal Pod Autoscaler (HPA) targeting 70% CPU.
2. **Worker Deployment**: 4+ replicas, KEDA autoscaling based on BullMQ queue depth (`workflowQueue.getWaitingCount()`).
3. **Web Deployment**: 2+ replicas behind an Ingress Controller (Nginx / Traefik / AWS ALB).

### Rolling Zero-Downtime Updates
FlowForge handles zero-downtime updates via:
- Container readiness probes (`/api/v1/health/ready`) preventing traffic routing until database migrations and connections complete.
- Worker graceful shutdown (`SIGTERM`), allowing running workflow steps up to 30 seconds to persist checkpoint state before container exit.
