# FlowForge Data Intelligence — Data Quality & Publication Gates

## 1. Supported Data Quality Rules

| Rule Type | Configuration Key | Validation Logic |
|:---|:---|:---|
| **`REQUIRED_FIELD`** | `field: string` | Verifies field is present, non-null, and non-empty. |
| **`NULL_RATE`** | `field, maxNullPercent` | Verifies percentage of null records does not exceed threshold. |
| **`ALLOWED_VALUES`** | `field, allowedValues` | Verifies field values fall within a predefined set. |
| **`NUMERIC_RANGE`** | `field, min?, max?` | Verifies numeric values fall within `[min, max]`. |
| **`REGEX_FORMAT`** | `field, pattern` | Matches string against regular expression. |
| **`UNIQUENESS`** | `field` | Checks all values for the field are distinct in the dataset. |
| **`MIN_RECORD_COUNT`** | `minCount` | Ensures dataset contains at least minimum rows. |

---

## 2. Publication Gate Enforcement

- If any enabled rule marked `isBlocking: true` fails or has `INSUFFICIENT_DATA`, version publication is rejected (`HTTP 400`).
- Administrative override requires `overrideQualityGate: true` and an explicit `overrideReason` recorded in the version review notes.
- Sensitive fields in failure samples are automatically redacted (`[REDACTED]` or masked email).
- High severity failures report operational incidents to Phase 18's `incidentService`.
