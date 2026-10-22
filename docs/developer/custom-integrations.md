# Declarative Custom Integrations Framework

FlowForge provides a safe, declarative connector framework allowing teams to integrate proprietary APIs, internal microservices, and external web services without writing backend Node.js code or executing unsafe arbitrary scripts.

---

## 1. Declarative Connector Specification

Custom integrations are defined as structured JSON/YAML declarations including actions, URL templates, header maps, and typed schemas.

```json
{
  "key": "internal-crm",
  "name": "Internal Acme CRM",
  "description": "Enterprise customer directory and lead synchronization API",
  "category": "CRM",
  "definition": {
    "authConfig": {
      "type": "BEARER_TOKEN",
      "headerName": "Authorization",
      "tokenPrefix": "Bearer"
    },
    "actions": [
      {
        "id": "create_lead",
        "name": "Create Lead",
        "description": "Registers a prospective customer lead in Acme CRM",
        "method": "POST",
        "url": "https://crm.internal.corp/api/v2/leads",
        "headers": {
          "Content-Type": "application/json"
        },
        "bodyTemplate": "{\"email\": \"{{input.email}}\", \"company\": \"{{input.company}}\"}",
        "inputSchema": {
          "type": "object",
          "properties": {
            "email": { "type": "string" },
            "company": { "type": "string" }
          },
          "required": ["email"]
        }
      }
    ]
  }
}
```

---

## 2. Dynamic Template Interpolation

URL templates and body templates support mustache-style parameter interpolation:

- `{{input.field}}`: Injects values provided by preceding workflow nodes.
- URL templates automatically URL-encode interpolated values to prevent query string injection.
- Body templates interpolate typed strings or JSON object representations.

---

## 3. Sandbox Test Runner & SSRF Protection

Before publishing an integration version, developers can test individual actions in the live UI or via `POST /api/v1/custom-integrations/:id/test`.

### SSRF Safeguards
All outbound HTTP requests from custom integrations pass through FlowForge's strict SSRF validator (`validateUrlForSsrf`):
1. Resolves target hostnames against DNS.
2. Rejects private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
3. Rejects loopback addresses (`127.0.0.1`, `localhost`).
4. Rejects cloud metadata addresses (`169.254.169.254`).
5. Enforces HTTP/HTTPS protocol restrictions.
6. Enforces a 5,000ms execution timeout with abort controller.

---

## 4. Immutable Version Snapshots

- Editing an integration modifies the **draft** definition.
- Publishing creates an immutable `CustomIntegrationVersion` snapshot (e.g. `v1`, `v2`).
- Existing workflows reference immutable version snapshots, ensuring that updates to draft definitions cannot accidentally break active production automations.
