import { NodeType } from "@flowforge/shared";
import { ExecutionContext } from "./mapping/resolver.js";

export type ExecutionErrorCategory =
  | "INVALID_CONFIG"
  | "INVALID_INPUT"
  | "SSRF_VIOLATION"
  | "AUTH_FAILURE"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "EXTERNAL_API_ERROR"
  | "INTERNAL_ERROR";

export interface NodeExecutionResult<T = any> {
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  outputData?: T;
  errorCategory?: ExecutionErrorCategory;
  errorMessage?: string;
  selectedBranch?: "true" | "false" | string | null;
}

export interface StepExecutionContext<TConfig = any> {
  nodeId: string;
  nodeName: string;
  nodeType: NodeType;
  config: TConfig;
  context: ExecutionContext;
  executionId: string;
  workflowId: string;
  correlationId: string;
  attempt: number;
}

export interface NodeHandler<TConfig = any, TOutput = any> {
  type: NodeType;
  validateConfig(config: TConfig): { isValid: boolean; errors: string[] };
  execute(ctx: StepExecutionContext<TConfig>): Promise<NodeExecutionResult<TOutput>>;
}
