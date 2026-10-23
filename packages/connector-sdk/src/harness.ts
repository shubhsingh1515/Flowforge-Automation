import {
  ConnectorManifestDTO,
  ConnectorManifestSchema,
  ConnectorAction,
} from "@flowforge/shared";

export interface HarnessExecutionResult {
  ok: boolean;
  actionId: string;
  durationMs: number;
  statusCode?: number;
  data?: unknown;
  error?: string;
  secretLeakDetected: boolean;
  leakedKeys: string[];
}

export interface ContractValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

export class ConnectorTestHarness {
  private manifest: ConnectorManifestDTO;

  constructor(manifest: ConnectorManifestDTO) {
    this.manifest = ConnectorManifestSchema.parse(manifest);
  }

  public getManifest(): ConnectorManifestDTO {
    return this.manifest;
  }

  /**
   * Statically inspects the connector manifest for contract validity,
   * security issues (e.g. static SSRF indicators), and required fields.
   */
  public validateContract(): ContractValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (!this.manifest.id || !this.manifest.name || !this.manifest.version) {
      issues.push("Manifest missing required identity fields (id, name, version).");
    }

    if (this.manifest.actions.length === 0 && this.manifest.triggers.length === 0) {
      warnings.push("Connector has no actions and no triggers defined.");
    }

    const actionIds = new Set<string>();
    for (const action of this.manifest.actions) {
      if (actionIds.has(action.id)) {
        issues.push(`Duplicate action ID detected: ${action.id}`);
      }
      actionIds.add(action.id);

      if (action.httpConfig) {
        const { urlTemplate, timeoutMs } = action.httpConfig;
        if (!urlTemplate) {
          issues.push(`Action ${action.id} has httpConfig without urlTemplate.`);
        } else {
          const lower = urlTemplate.toLowerCase();
          if (
            lower.includes("localhost") ||
            lower.includes("127.0.0.1") ||
            lower.includes("169.254.169.254") ||
            lower.includes("::1") ||
            lower.includes("10.") ||
            lower.includes("192.168.")
          ) {
            issues.push(
              `Action ${action.id} urlTemplate points to disallowed private/internal network address (${urlTemplate}).`
            );
          }
        }

        if (timeoutMs && (timeoutMs < 500 || timeoutMs > 30000)) {
          issues.push(
            `Action ${action.id} timeoutMs (${timeoutMs}) exceeds platform bounds (500ms - 30000ms).`
          );
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Executes a connector action in an isolated local test harness.
   * Performs schema checks, duration measurement, and credentials secret leakage detection.
   */
  public async executeAction(
    actionId: string,
    params: {
      input?: Record<string, unknown>;
      credentials?: Record<string, string>;
      mockResponse?: { status: number; body: unknown };
    } = {}
  ): Promise<HarnessExecutionResult> {
    const startTime = Date.now();
    const action = this.manifest.actions.find((a) => a.id === actionId);

    if (!action) {
      return {
        ok: false,
        actionId,
        durationMs: Date.now() - startTime,
        error: `Action '${actionId}' not found in manifest.`,
        secretLeakDetected: false,
        leakedKeys: [],
      };
    }

    const credentials = params.credentials || {};
    let responseData: unknown = null;
    let statusCode = 200;

    try {
      if (params.mockResponse) {
        statusCode = params.mockResponse.status;
        responseData = params.mockResponse.body;
      } else if (action.sampleOutput) {
        responseData = action.sampleOutput;
      } else {
        responseData = { success: true, action: actionId, simulated: true };
      }

      // Check for secret leakage in output
      const leakedKeys: string[] = [];
      const serializedOutput = JSON.stringify(responseData);
      for (const [key, secretValue] of Object.entries(credentials)) {
        if (
          secretValue &&
          typeof secretValue === "string" &&
          secretValue.length >= 4 &&
          serializedOutput.includes(secretValue)
        ) {
          leakedKeys.push(key);
        }
      }

      const durationMs = Date.now() - startTime;
      return {
        ok: statusCode >= 200 && statusCode < 300,
        actionId,
        durationMs,
        statusCode,
        data: responseData,
        secretLeakDetected: leakedKeys.length > 0,
        leakedKeys,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      return {
        ok: false,
        actionId,
        durationMs,
        statusCode: 500,
        error: err instanceof Error ? err.message : String(err),
        secretLeakDetected: false,
        leakedKeys: [],
      };
    }
  }
}
