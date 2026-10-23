# CI/CD and Developer Automation Guide

FlowForge Automation SaaS exposes an end-to-end programmatic API and TypeScript SDK allowing engineering teams to automate workflow testing, artifact generation, and cross-environment deployment from GitHub Actions, GitLab CI, or custom pipelines.

---

## 1. API Scopes and Permissions

API Keys must be granted appropriate scopes for deployment automation:
- `environments:read` — Read environment status, variables, and bindings.
- `environments:write` — Configure environment variables and credential bindings.
- `releases:read` — Query release artifacts and content hashes.
- `releases:create` — Snapshot workflow versions into immutable release artifacts.
- `deployments:promote` — Request or trigger deployment promotion.
- `deployments:approve` — Sign off on pending promotion requests.
- `deployments:rollback` — Restore previous release artifacts.
- `tests:run` — Execute automated test cases against workflows.

---

## 2. GitHub Actions Workflow Example

Below is a complete GitHub Actions workflow that executes pre-flight tests, packages an immutable release artifact, and promotes it to Staging:

```yaml
name: FlowForge Workflow CI/CD

on:
  push:
    branches:
      - main
    paths:
      - 'workflows/**'

jobs:
  promote-workflow:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install FlowForge SDK
        run: npm install @flowforge/sdk

      - name: Package & Promote Release
        env:
          FLOWFORGE_API_KEY: ${{ secrets.FLOWFORGE_API_KEY }}
          WORKFLOW_ID: ${{ secrets.PROD_WORKFLOW_ID }}
        run: |
          node -e '
            const { FlowForgeClient } = require("@flowforge/sdk");
            const client = new FlowForgeClient({ apiKey: process.env.FLOWFORGE_API_KEY });

            async function run() {
              console.log("1. Creating immutable release artifact...");
              const release = await client.releases.create(process.env.WORKFLOW_ID, {
                summary: "Automated commit " + process.env.GITHUB_SHA.substring(0, 7)
              });
              console.log("Artifact created: Release #" + release.data.releaseNumber + " (Hash: " + release.data.contentHash + ")");

              console.log("2. Running pre-flight automated tests...");
              const tests = await client.tests.list(process.env.WORKFLOW_ID);
              for (const test of tests.data) {
                const res = await client.tests.run(test.id, { mode: "DRY_RUN" });
                if (res.data.summary.status !== "PASSED") {
                  throw new Error("Test failed: " + test.name);
                }
              }

              console.log("3. Promoting release to Staging...");
              const envs = await client.environments.list();
              const staging = envs.data.find(e => e.slug === "staging");
              
              const deploy = await client.deployments.promote({
                environmentId: staging.id,
                releaseArtifactId: release.data.id,
                summary: "Staging promotion from CI"
              });

              console.log("Promotion status:", deploy.data.status);
            }
            run().catch(err => { console.error(err); process.exit(1); });
          '
```

---

## 3. Outbound Webhook Integration

CI systems can register for outbound deployment events:
- `deployment.initiated`
- `deployment.promoted`
- `deployment.approved`
- `deployment.rejected`
- `deployment.failed`
- `deployment.rolled_back`

Webhooks provide real-time updates for chat alerts (Slack, Microsoft Teams) or external compliance loggers.
