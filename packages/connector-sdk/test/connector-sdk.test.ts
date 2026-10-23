import { describe, it, expect } from "vitest";
import {
  defineConnector,
  defineAction,
  ConnectorTestHarness,
  computeArtifactHashSha256,
  verifyArtifactHash,
} from "../src";

describe("Connector Developer SDK & Testing Harness", () => {
  const sampleManifest = defineConnector({
    id: "acme-crm",
    name: "Acme CRM",
    version: "1.0.0",
    description: "Enterprise CRM connector for Acme Cloud",
    category: "CRM & Sales",
    author: {
      name: "Acme Dev Team",
      email: "dev@acme.com",
    },
    auth: {
      type: "API_KEY",
      fields: [
        {
          name: "apiKey",
          label: "API Key",
          type: "password",
          required: true,
        },
      ],
    },
    actions: [
      defineAction({
        id: "get-contact",
        name: "Get Contact",
        description: "Retrieves contact details by ID",
        inputSchema: {
          contactId: { type: "string", required: true },
        },
        outputSchema: {
          id: { type: "string" },
          email: { type: "string" },
        },
        sampleOutput: {
          id: "cnt_123",
          email: "alice@acme.com",
        },
        httpConfig: {
          method: "GET",
          urlTemplate: "https://api.acme.com/v1/contacts/{contactId}",
          timeoutMs: 5000,
          headers: {},
          queryParams: {},
        },
      }),
    ],
    triggers: [],
    permissions: ["network:egress"],
    residencyConstraint: "GLOBAL",
    metadata: {},
  });

  it("computes deterministic SHA-256 artifact hash regardless of key order", () => {
    const hash1 = computeArtifactHashSha256(sampleManifest);
    expect(hash1).toBeDefined();
    expect(hash1).toHaveLength(64);

    // Verify verification helper
    expect(verifyArtifactHash(sampleManifest, hash1)).toBe(true);
    expect(verifyArtifactHash(sampleManifest, "invalid-hash")).toBe(false);
  });

  it("validates contracts and flags private SSRF targets", () => {
    const validHarness = new ConnectorTestHarness(sampleManifest);
    const validResult = validHarness.validateContract();
    expect(validResult.valid).toBe(true);
    expect(validResult.issues).toHaveLength(0);

    const insecureManifest = {
      ...sampleManifest,
      actions: [
        {
          ...sampleManifest.actions[0],
          httpConfig: {
            ...sampleManifest.actions[0].httpConfig!,
            urlTemplate: "http://127.0.0.1:8080/internal/keys",
          },
        },
      ],
    };
    const insecureHarness = new ConnectorTestHarness(insecureManifest);
    const insecureResult = insecureHarness.validateContract();
    expect(insecureResult.valid).toBe(false);
    expect(insecureResult.issues.some((i) => i.includes("private/internal network"))).toBe(true);
  });

  it("executes action in harness and detects secret leaks", async () => {
    const harness = new ConnectorTestHarness(sampleManifest);

    // Normal safe execution
    const safeRes = await harness.executeAction("get-contact", {
      input: { contactId: "cnt_123" },
      credentials: { apiKey: "super-secret-key-12345" },
    });
    expect(safeRes.ok).toBe(true);
    expect(safeRes.secretLeakDetected).toBe(false);
    expect(safeRes.durationMs).toBeGreaterThanOrEqual(0);

    // Execution with simulated leak
    const leakyRes = await harness.executeAction("get-contact", {
      input: { contactId: "cnt_123" },
      credentials: { apiKey: "super-secret-key-12345" },
      mockResponse: {
        status: 200,
        body: { error: "Failed with key: super-secret-key-12345" },
      },
    });
    expect(leakyRes.ok).toBe(true);
    expect(leakyRes.secretLeakDetected).toBe(true);
    expect(leakyRes.leakedKeys).toContain("apiKey");
  });
});
