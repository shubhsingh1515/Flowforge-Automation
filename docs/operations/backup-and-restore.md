# FlowForge Automation SaaS — Database & State Backup and Disaster Recovery Runbook

## 1. Overview & Strategy
This document establishes standard operating procedures for continuous backup, point-in-time recovery (PITR), retention lifecycle management, and disaster recovery for the FlowForge Automation persistence layer.

### Persistence Components
1. **PostgreSQL 16 (Relational Database)**:
   - Primary system of record: users, workspaces, workflows, version graph, executions, step audit records, connection credentials.
2. **Redis 7 (In-Memory Execution Broker & Cache)**:
   - Ephemeral and durable execution queues (BullMQ), scheduled trigger state, rate-limiting buckets.

---

## 2. PostgreSQL Backup Procedures

### Recovery Objectives
- **Recovery Point Objective (RPO)**: < 5 minutes (via Continuous WAL Archiving / pgBackRest).
- **Recovery Time Objective (RTO)**: < 30 minutes for complete restoration.

### Automated Nightly Logical Backups (`pg_dump`)
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/flowforge"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/flowforge_db_${TIMESTAMP}.dump"
ENCRYPTED_FILE="${BACKUP_FILE}.enc"

mkdir -p "${BACKUP_DIR}"

echo "Starting PostgreSQL logical backup..."
pg_dump -h "${DB_HOST:-localhost}" \
        -p "${DB_PORT:-5432}" \
        -U "${DB_USER:-flowforge}" \
        -d "${DB_NAME:-flowforge_db}" \
        -F c -b -v -f "${BACKUP_FILE}"

echo "Encrypting backup with AES-256..."
openssl enc -aes-256-cbc -salt -in "${BACKUP_FILE}" -out "${ENCRYPTED_FILE}" -pass env:BACKUP_PASSPHRASE
rm -f "${BACKUP_FILE}"

echo "Uploading encrypted backup to off-site object storage (AWS S3 / Cloudflare R2)..."
aws s3 cp "${ENCRYPTED_FILE}" "s3://${BACKUP_S3_BUCKET}/postgres/${TIMESTAMP}/"

echo "PostgreSQL backup completed successfully."
```

### PostgreSQL Restoration Procedure
1. Stop API backend and worker services to prevent database writes:
   ```bash
   docker compose -f docker-compose.prod.yml stop api worker
   ```
2. Fetch and decrypt the target backup file:
   ```bash
   aws s3 cp "s3://${BACKUP_S3_BUCKET}/postgres/${TARGET_TIMESTAMP}/flowforge_db_${TARGET_TIMESTAMP}.dump.enc" .
   openssl enc -d -aes-256-cbc -in "flowforge_db_${TARGET_TIMESTAMP}.dump.enc" -out restore.dump -pass env:BACKUP_PASSPHRASE
   ```
3. Drop and recreate the public schema (or target database):
   ```bash
   psql -U flowforge -d flowforge_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
   ```
4. Restore database dump using `pg_restore`:
   ```bash
   pg_restore -U flowforge -d flowforge_db --no-owner --role=flowforge -v restore.dump
   ```
5. Run Prisma migration status check:
   ```bash
   npm run --workspace=@flowforge/database migrate status
   ```
6. Restart application services:
   ```bash
   docker compose -f docker-compose.prod.yml start api worker
   ```

---

## 3. Redis Backup & AOF Persistence

FlowForge configures Redis with Append-Only File (AOF) persistence enabled (`--appendonly yes`) with `appendfsync everysec`.
- Snapshots (`dump.rdb`) are generated every 15 minutes.
- In disaster recovery scenarios, copy the latest `dump.rdb` or `appendonly.aof` file into the Redis container volume `/data`.

---

## 4. Disaster Recovery Testing Cadence
- **Automated Verification**: Daily automated restore drill in an isolated staging environment.
- **Manual Drill**: Quarterly failover simulation ensuring RTO and RPO metrics meet compliance requirements.
