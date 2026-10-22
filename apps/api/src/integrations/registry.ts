import { IntegrationProvider, IntegrationOperation } from "./types.js";
import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../engine/types.js";
import { tokenManager } from "./token-manager.js";
import { slackProvider } from "./providers/slack.js";
import { googleSheetsProvider } from "./providers/google-sheets.js";
import { gmailProvider } from "./providers/gmail.js";
import { googleDriveProvider } from "./providers/google-drive.js";

export class IntegrationRegistry {
  private providers = new Map<string, IntegrationProvider>();

  constructor() {
    this.registerProvider(slackProvider);
    this.registerProvider(googleSheetsProvider);
    this.registerProvider(gmailProvider);
    this.registerProvider(googleDriveProvider);
  }

  registerProvider(provider: IntegrationProvider) {
    this.providers.set(provider.key, provider);
  }

  getProvider(key: string): IntegrationProvider | undefined {
    return this.providers.get(key);
  }

  listProviders(): IntegrationProvider[] {
    return Array.from(this.providers.values());
  }

  getOperation(providerKey: string, operationId: string): IntegrationOperation | undefined {
    const provider = this.getProvider(providerKey);
    return provider?.operations.find((op) => op.id === operationId);
  }

  /**
   * Adapts an integration operation into an engine NodeHandler.
   * Resolves credentials via TokenManager before executing the operation.
   */
  createNodeHandler(providerKey: string, defaultOperationId?: string): NodeHandler {
    const provider = this.getProvider(providerKey);

    return {
      type: "ACTION",
      validateConfig(config) {
        const errors: string[] = [];
        const opId = config?.operationId || defaultOperationId;
        if (!opId) {
          errors.push(`Action requires an operationId for provider '${providerKey}'.`);
        }
        if (provider?.authType === "OAUTH2" && !config?.connectedAccountId) {
          errors.push(`Action requires a connectedAccountId.`);
        }
        return { isValid: errors.length === 0, errors };
      },
      async execute(stepContext: StepExecutionContext): Promise<NodeExecutionResult> {
        if (!provider) {
          return {
            status: "FAILED",
            errorCategory: "INVALID_CONFIG",
            errorMessage: `Unknown integration provider '${providerKey}'.`,
          };
        }

        const opId = stepContext.config?.operationId || defaultOperationId || provider.operations[0]?.id;
        const operation = provider.operations.find((o) => o.id === opId);

        if (!operation) {
          return {
            status: "FAILED",
            errorCategory: "INVALID_CONFIG",
            errorMessage: `Operation '${opId}' is not supported by provider '${providerKey}'.`,
          };
        }

        // Retrieve credentials if auth is required
        let credentials: any = undefined;
        const connectedAccountId = stepContext.config?.connectedAccountId;

        if (provider.authType === "OAUTH2" || provider.authType === "API_KEY") {
          if (!connectedAccountId) {
            return {
              status: "FAILED",
              errorCategory: "AUTH_FAILURE",
              errorMessage: `Missing required connected account for '${provider.name}'. Please select an authorized account in node configuration.`,
            };
          }

          try {
            credentials = await tokenManager.getValidCredentials(
              stepContext.workflowId ? await getWorkspaceIdForWorkflow(stepContext.workflowId) : "",
              connectedAccountId
            );
          } catch (err: any) {
            return {
              status: "FAILED",
              errorCategory: "AUTH_FAILURE",
              errorMessage: err.message,
            };
          }
        }

        // Execute operation
        return operation.execute({
          workspaceId: stepContext.workflowId ? await getWorkspaceIdForWorkflow(stepContext.workflowId) : "",
          connectedAccountId,
          credentials,
          parameters: stepContext.config?.parameters || stepContext.config || {},
          stepContext,
        });
      },
    };
  }
}

// Helper to look up workspaceId from workflowId with simple in-memory caching
const workflowWorkspaceCache = new Map<string, string>();
async function getWorkspaceIdForWorkflow(workflowId: string): Promise<string> {
  if (workflowWorkspaceCache.has(workflowId)) {
    return workflowWorkspaceCache.get(workflowId)!;
  }
  const { prisma } = await import("@flowforge/database");
  const wf = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { workspaceId: true },
  });
  if (wf) {
    workflowWorkspaceCache.set(workflowId, wf.workspaceId);
    return wf.workspaceId;
  }
  return "";
}

export const integrationRegistry = new IntegrationRegistry();
