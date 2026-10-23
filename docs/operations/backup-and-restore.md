# Database Backup, Checksum Integrity, and Isolated Restore Drills

## 1. Backup Strategy Overview

FlowForge Automation SaaS persists state in PostgreSQL 16 Alpine (`postgres_prod_data` volume).

### Backup Types & Frequencies
- **Nightly Snapshot (`pg_dump`)**: Full schema and data snapshot compressed with gzip.
- **WAL Archiving**: Continuous archiving enabling Point-In-Time Recovery (PITR) up to the minute.
- **Durable Off-Site Copy**: Backups are copied to encrypted off-host secondary storage (`/backups/flowforge_daily_*.sql.gz`).

---

## 2. Automated Restore Verification Drills

Never test restores against a live production database! FlowForge implements non-destructive verification drills through `disasterRecoveryService`:

### Drill Steps:
1. **Archive Checksum Validation**: Computes SHA-256 hash of the target backup archive and matches it against metadata registry.
2. **Isolated Target Database**: Restores the dump into an ephemeral scratch database (e.g. `flowforge_dr_verify_<timestamp>`) or dedicated staging instance.
3. **Schema & Consistency Checks**:
   - Validates existence of all core tables (`users`, `workspaces`, `workflows`, `workflow_executions`, `transactional_outbox_events`, etc.).
   - Validates referential integrity constraints and foreign keys.
4. **Verification Report**: Automatically logs record into `BackupVerificationRecord` and `RecoveryAuditRecord` (scrubbing sensitive passwords).
5. **Clean Up**: Drops the ephemeral scratch database immediately upon drill completion.

---

## 3. Operational CLI Commands

### Manual Full Backup
```bash
docker exec -t flowforge-prod-postgres pg_dump -U flowforge -d flowforge_db -F c -b -v -f /var/lib/postgresql/data/backup_$(date +%Y%m%d_%H%M%S).dump
```

### Manual Non-Destructive Verification Drill
```bash
curl -X POST http://localhost:4000/api/v1/operations/backup/verify \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```
