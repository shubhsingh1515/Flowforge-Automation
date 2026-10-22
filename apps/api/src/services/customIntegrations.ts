import { prisma } from "@flowforge/database";
import {
  CreateCustomIntegrationInput,
  CustomIntegrationDefinition,
  CustomIntegrationDefinitionSchema,
} from "@flowforge/shared";
import { entitlementService } from "./entitlements.js";
import { validateUrlForSsrf } from "../engine/security/ssrf.js";

export class CustomIntegrationService {
  /**
   * Creates a new custom integration for a workspace.
   */
  async createIntegration(workspaceId: string, createdById: string, input: CreateCustomIntegrationInput) {
    const quota = await entitlementService.checkCustomIntegrationQuota(workspaceId);
    if (!quota.allowed) {
      const error: any = new Error(quota.reason || "Custom integration quota reached for your plan.");
      error.statusCode = 403;
      throw error;
    }

    // Check unique key in workspace
    const existing = await prisma.customIntegration.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key: input.key,
        },
      },
    });

    if (existing) {
      const error: any = new Error(`An integration with key '${input.key}' already exists in this workspace.`);
      error.statusCode = 409;
      throw error;
    }

    // Default definition if not provided
    const defaultDefinition: CustomIntegrationDefinition = input.definition || {
      actions: [
        {
          id: "custom_request",
          name: "Execute Request",
          description: "Performs an HTTP request to the external API",
          method: "POST",
          url: "https://api.example.com/v1/action",
          headers: { "Content-Type": "application/json" },
          bodyTemplate: '{"data": "{{input.data}}"}',
          inputSchema: { data: { type: "string" } },
        },
      ],
    };

    CustomIntegrationDefinitionSchema.parse(defaultDefinition);

    const integration = await prisma.customIntegration.create({
      data: {
        workspaceId,
        createdById,
        key: input.key,
        name: input.name,
        description: input.description,
        category: input.category || "Custom",
        status: "DRAFT",
        currentVersion: 1,
        versions: {
          create: {
            version: 1,
            definition: defaultDefinition as any,
            status: "DRAFT",
          },
        },
      },
      include: {
        versions: true,
      },
    });

    return integration;
  }

  /**
   * Lists custom integrations for a workspace.
   */
  async listIntegrations(workspaceId: string) {
    return prisma.customIntegration.findMany({
      where: { workspaceId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a single custom integration by ID.
   */
  async getIntegration(id: string, workspaceId: string) {
    const integration = await prisma.customIntegration.findFirst({
      where: { id, workspaceId },
      include: {
        versions: {
          orderBy: { version: "desc" },
        },
      },
    });

    if (!integration) {
      const error: any = new Error("Custom integration not found.");
      error.statusCode = 404;
      throw error;
    }

    return integration;
  }

  /**
   * Updates the draft definition of a custom integration.
   */
  async updateDraft(id: string, workspaceId: string, definition: CustomIntegrationDefinition) {
    CustomIntegrationDefinitionSchema.parse(definition);

    const integration = await this.getIntegration(id, workspaceId);

    // Find latest draft or create new version
    let draftVersion = integration.versions.find((v) => v.status === "DRAFT");

    if (draftVersion) {
      await prisma.customIntegrationVersion.update({
        where: { id: draftVersion.id },
        data: { definition: definition as any },
      });
    } else {
      const nextVersion = (integration.versions[0]?.version || 0) + 1;
      draftVersion = await prisma.customIntegrationVersion.create({
        data: {
          integrationId: id,
          version: nextVersion,
          definition: definition as any,
          status: "DRAFT",
        },
      });
      await prisma.customIntegration.update({
        where: { id },
        data: { currentVersion: nextVersion, status: "DRAFT" },
      });
    }

    return this.getIntegration(id, workspaceId);
  }

  /**
   * Publishes the current draft into an immutable published version.
   */
  async publishVersion(id: string, workspaceId: string) {
    const integration = await this.getIntegration(id, workspaceId);
    const draft = integration.versions.find((v) => v.status === "DRAFT") || integration.versions[0];

    if (!draft) {
      const error: any = new Error("No version available to publish.");
      error.statusCode = 400;
      throw error;
    }

    // Mark version as published
    await prisma.customIntegrationVersion.update({
      where: { id: draft.id },
      data: { status: "PUBLISHED" },
    });

    // Update parent status
    await prisma.customIntegration.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        currentVersion: draft.version,
      },
    });

    return this.getIntegration(id, workspaceId);
  }

  /**
   * Executes a safe sample test for a configured action.
   */
  async testAction(
    id: string,
    workspaceId: string,
    options: { actionId: string; sampleInput?: Record<string, any> }
  ) {
    const integration = await this.getIntegration(id, workspaceId);
    const latestVersion = integration.versions[0];

    if (!latestVersion) {
      const error: any = new Error("Integration has no version defined.");
      error.statusCode = 400;
      throw error;
    }

    const definition = latestVersion.definition as any as CustomIntegrationDefinition;
    const action = definition.actions?.find((a) => a.id === options.actionId);

    if (!action) {
      const error: any = new Error(`Action '${options.actionId}' not found in integration definition.`);
      error.statusCode = 404;
      throw error;
    }

    const startTime = Date.now();
    const input = options.sampleInput || {};

    // 1. Interpolate URL and Body with sampleInput
    let resolvedUrl = action.url;
    let resolvedBody: string | undefined = action.bodyTemplate;

    for (const [k, v] of Object.entries(input)) {
      const valStr = typeof v === "object" ? JSON.stringify(v) : String(v);
      resolvedUrl = resolvedUrl.replaceAll(`{{input.${k}}}`, encodeURIComponent(valStr));
      if (resolvedBody) {
        resolvedBody = resolvedBody.replaceAll(`{{input.${k}}}`, valStr);
      }
    }

    // 2. Dispatch HTTP request with timeout and SSRF check
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const allowLocal = process.env.NODE_ENV === "test" || process.env.ALLOW_LOCAL_TEST_REQUESTS === "true";
      await validateUrlForSsrf(resolvedUrl, { allowLocalhostForTesting: allowLocal });

      const headers: Record<string, string> = {
        "User-Agent": "FlowForge-Custom-Integration-Runner/1.0",
        ...(action.headers || {}),
      };

      const res = await fetch(resolvedUrl, {
        method: action.method,
        headers,
        body: ["POST", "PUT", "PATCH"].includes(action.method) ? resolvedBody : undefined,
        signal: controller.signal,
        redirect: "error",
      });

      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;
      const responseData = await res.json().catch(async () => ({ text: await res.text().catch(() => "") }));

      return {
        success: res.ok,
        statusCode: res.status,
        durationMs,
        responseData,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        success: false,
        statusCode: 500,
        durationMs: Date.now() - startTime,
        errorMessage: err.name === "AbortError" ? "Request timed out after 5000ms" : err.message,
      };
    }
  }
}

export const customIntegrationService = new CustomIntegrationService();
