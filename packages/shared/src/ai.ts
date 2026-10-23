import { z } from "zod";
import { WorkflowNode, WorkflowEdge, GraphValidationResult } from "./schemas/workflow.js";

// 1. Core Provider Enums and Status
export const AiProviderTypeEnum = z.enum(["mock", "openai", "anthropic", "custom"]);
export type AiProviderType = z.infer<typeof AiProviderTypeEnum>;

export interface AiSubsystemStatus {
  enabled: boolean;
  provider: string;
  model: string;
  isConfigured: boolean;
  quotaRemaining?: number;
  monthlyQuota?: number;
}

// 2. Test Case Proposal (compatible with Phase 12 WorkflowTestCase)
export const AiTestAssertionSchema = z.object({
  target: z.string(),
  operator: z.enum(["EQUALS", "CONTAINS", "EXISTS", "GREATER_THAN", "NOT_EMPTY"]),
  expected: z.any().optional(),
});
export type AiTestAssertion = z.infer<typeof AiTestAssertionSchema>;

export const AiTestCaseProposalSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500),
  mockPayload: z.record(z.any()).default({}),
  assertions: z.array(AiTestAssertionSchema).min(1),
  targetScenario: z.enum(["HAPPY_PATH", "EDGE_CASE", "ERROR_HANDLING", "BOUNDARY_CONDITION"]).default("HAPPY_PATH"),
});
export type AiTestCaseProposal = z.infer<typeof AiTestCaseProposalSchema>;

// 3. Workflow Proposal
export const GenerateWorkflowPromptSchema = z.object({
  prompt: z.string().min(5, "Prompt must be at least 5 characters").max(2000, "Prompt must not exceed 2000 characters"),
  workflowName: z.string().max(100).optional(),
});
export type GenerateWorkflowPromptInput = z.infer<typeof GenerateWorkflowPromptSchema>;

export interface AiWorkflowProposal {
  name: string;
  description: string;
  triggerType: "WEBHOOK" | "SCHEDULE" | "MANUAL";
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  requiredIntegrations: string[];
  requiredVariables: string[];
  assumptions: string[];
  suggestedTests: AiTestCaseProposal[];
  validation: GraphValidationResult;
  provider: string;
  model: string;
  isSimulated: boolean;
}

// 4. Refinement & Structural Diffs
export const RefineWorkflowPromptSchema = z.object({
  prompt: z.string().min(5).max(2000),
  workflowId: z.string().optional(),
  currentNodes: z.array(z.any()),
  currentEdges: z.array(z.any()),
});
export type RefineWorkflowPromptInput = z.infer<typeof RefineWorkflowPromptSchema>;

export interface AiStructuralDiff {
  addedNodes: Array<{ id: string; label: string; nodeType: string }>;
  removedNodes: Array<{ id: string; label: string }>;
  modifiedNodes: Array<{ id: string; label: string; changes: string[] }>;
  edgeChanges: {
    added: number;
    removed: number;
  };
}

export interface AiRefinementProposal {
  summary: string;
  explanation: string;
  diff: AiStructuralDiff;
  proposedNodes: WorkflowNode[];
  proposedEdges: WorkflowEdge[];
  validation: GraphValidationResult;
  provider: string;
  isSimulated: boolean;
}

// 5. Workflow Explanation
export const ExplainWorkflowSchema = z.object({
  workflowId: z.string().optional(),
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  name: z.string().optional(),
  triggerType: z.string().optional(),
});
export type ExplainWorkflowInput = z.infer<typeof ExplainWorkflowSchema>;

export interface AiWorkflowExplanation {
  summary: string;
  triggerDetails: string;
  mainExecutionPath: string[];
  branchingAndConditions: string[];
  loopsAndApprovals: string[];
  integrationDependencies: string[];
  dataFlowAndTransformations: string[];
  errorAndRetryBehavior: string;
  securityAndReliabilityNotes: string[];
  provider: string;
  isSimulated: boolean;
}

// 6. Intelligent Execution Debugging
export interface AiExecutionDebugReport {
  executionId: string;
  workflowId: string;
  workflowName: string;
  status: string;
  failingNodeId?: string;
  failingNodeName?: string;
  errorCategory: string;
  conciseSummary: string;
  probableCause: string;
  supportingEvidence: string[];
  uncertaintyLevel: "LOW" | "MEDIUM" | "HIGH";
  remediationSteps: string[];
  suggestedPatch?: {
    action: "UPDATE_CONFIG" | "ADD_VALIDATION" | "ADJUST_RETRY";
    nodeId?: string;
    patchDescription: string;
    modifiedConfig?: Record<string, any>;
  };
  provider: string;
  isSimulated: boolean;
}

// 7. Workflow Optimization Recommendations
export interface AiOptimizationRecommendation {
  id: string;
  type: "REPEATED_FAILURES" | "HIGH_LATENCY" | "MISSING_RETRY" | "PAYLOAD_OPTIMIZATION" | "BATCHING_OPPORTUNITY";
  title: string;
  targetNodeId?: string;
  targetNodeLabel?: string;
  evidence: string;
  analyzedPeriod: string;
  estimatedImpact: string;
  riskAssessment: string;
  suggestedFix: string;
  suggestedPatch?: {
    nodeId: string;
    configKey: string;
    proposedValue: any;
  };
}

export interface AiOptimizationReport {
  workflowId: string;
  workflowName: string;
  analyzedExecutionsCount: number;
  recommendations: AiOptimizationRecommendation[];
  provider: string;
  isSimulated: boolean;
}
