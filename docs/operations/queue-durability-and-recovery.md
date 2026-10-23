# Queue Durability, Redis Persistence, and Recovery

## 1. Redis Persistence Settings

FlowForge leverages Redis 7 Alpine configured specifically for queue durability:
```yaml
command: ["redis-server", "--appendonly", "yes", "--maxmemory", "512mb", "--maxmemory-policy", "noeviction"]
```

### Guarantees:
- **Append-Only File (`appendonly yes`)**: Writes every queue mutation to disk before acknowledging job persistence.
- **No Eviction (`noeviction`)**: Prevents Redis from silently discarding pending or delayed jobs when memory reaches the 512MB ceiling. If memory is exhausted, Redis returns an out-of-memory error rather than dropping jobs, triggering API backpressure.

---

## 2. Queue Recovery & Idempotent Resumption

When a worker node or Redis daemon restarts:
1. **Unacknowledged Active Jobs**: BullMQ detects orphaned active jobs via lock timeout and re-queues them.
2. **Deduplication Keying**:
   ```ts
   const jobKey = data.resumeNodeId
     ? `job_${data.executionId}_resume_${Date.now()}`
     : `job_${data.executionId}_att_${data.attempt || 1}`;
   ```
3. **Poison Job Defense**: Retries are capped at 3 attempts with exponential backoff (2000ms delay, doubling each retry). Unrecoverable permanent errors (e.g. `INVALID_CONFIG`, `SSRF_VIOLATION`, `AUTH_FAILURE`) bypass retries immediately and transition directly to `FAILED`.
