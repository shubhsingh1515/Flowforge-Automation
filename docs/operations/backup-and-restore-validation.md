# Backup and Restore Validation Runbook

## 1. Backup Strategy

FlowForge utilizes dual-layer backup procedures for stateful stores:

### 1.1 PostgreSQL Database
- **Continuous Archiving**: WAL (Write-Ahead Log) archiving for point-in-time recovery (PITR).
- **Daily Snapshots**: Automated `pg_dump` compressed backups stored in encrypted, immutable cloud storage:
  ```bash
  pg_dump -Fc -h $PGHOST -U $PGUSER -d $PGDATABASE -f /backup/flowforge_$(date +%Y%m%d_%H%M%S).dump
  ```

### 1.2 Redis Queues & Cache
- **RDB Snapshots**: Captured hourly to preserve delayed BullMQ jobs.
- **AOF (Append Only File)**: `appendfsync everysec` for durable transaction logs.

---

## 2. Restore Procedure & Dry-Run Validation

1. Provision an isolated PostgreSQL test instance.
2. Restore latest snapshot:
   ```bash
   pg_restore --clean --if-exists -d flowforge_test /backup/latest.dump
   ```
3. Run automated readiness probe:
   ```bash
   DATABASE_URL=postgres://...:5432/flowforge_test npm test
   ```
4. Verify workspace data integrity and user authentication hashes.
