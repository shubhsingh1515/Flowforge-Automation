# FlowForge Data Intelligence — Pipeline Execution & Transformation Engine

## 1. Declarative Transformation Model

To avoid arbitrary remote code execution risks and SQL injection vectors, data pipeline operations are strictly declarative JSON ASTs evaluated in memory:

| Operation | Arguments | Behavior |
|:---|:---|:---|
| **`select`** | `fields: string[]` | Projects only allowlisted keys from each record. |
| **`rename`** | `mappings: Record<string, string>` | Renames record keys according to dictionary. |
| **`filter`** | `field, operator, value` | Filters rows (`EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `IN`, `CONTAINS`, `EXISTS`). |
| **`map`** | `field, transform, args?` | Applies standard transformations (`UPPERCASE`, `LOWERCASE`, `TRIM`, `TO_NUMBER`, `TO_BOOLEAN`, `TO_ISO_DATE`, `COALESCE`). |
| **`aggregate`** | `groupBy: string[], aggregations` | Groups rows and computes `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`. |
| **`deduplicate`** | `keys: string[]` | Eliminates duplicate records across key combinations. |
| **`redact`** | `fields: string[], maskStrategy` | Masks sensitive values using `HASH`, `MASK_ALL`, or `PARTIAL_EMAIL`. |
| **`validate`** | `schema: Json` | Validates records against JSON schema constraints. |

---

## 2. Execution Runtime & Safety Controls

1. **Memory & Record Limits**: Pipelines enforce configurable maximum record ceilings (default 50,000, capped at 100,000).
2. **Timeouts**: Hard execution timeouts (default 300s, max 3,600s) prevent runaway transformations.
3. **Dry-Run / Preview Mode**: Returns up to 20 transformed sample records directly to the client without committing database snapshots.
4. **Idempotent Materialization**: Persists snapshots with schema version references, byte size metrics, and record counts.
