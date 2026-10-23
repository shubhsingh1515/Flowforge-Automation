import { z } from "zod";

// ==========================================
// SIMULATION OUTCOMES & ENUMS
// ==========================================

export type SimulationNodeOutcomeStatus =
  | "SIMULATED_SUCCESS"
  | "SIMULATED_FAILURE"
  | "SIMULATED_TIMEOUT"
  | "SKIPPED"
  | "UNSIMULATABLE"
  | "BLOCKED_BY_POLICY";

export type SimulationRunStatus =
  | "SIMULATED_SUCCESS"
  | "SIMULATED_FAILURE"
  | "SIMULATED_TIMEOUT"
  | "BLOCKED_BY_POLICY";

export type InjectedFaultType =
  | "HTTP_429"
  | "HTTP_5XX"
  | "TIMEOUT"
  | "EXPIRED_CREDENTIALS"
  | "RETRY_EXHAUSTION"
  | "QUEUE_DELAY"
  | "STALE_CONNECTOR"
  | "RESIDENCY_VIOLATION"
  | "KMS_UNAVAILABLE";

export type SimulationAssertionOperator =
  | "EQUALS"
  | "CONTAINS"
  | "EXISTS"
  | "NOT_EXISTS"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "NOT_EMPTY"
  | "REGEX_MATCH"
  | "NODE_EXECUTED"
  | "NODE_SKIPPED"
  | "EXECUTION_STATUS_EQUALS"
  | "MAX_SIMULATED_DURATION_MS"
  | "NO_UNSIMULATABLE_NODES"
  | "PROHIBITED_SIDE_EFFECTS";

// ==========================================
// INTERFACES & SCHEMAS
// ==========================================

export interface InjectedFault {
  type: InjectedFaultType;
  nodeId?: string; // target node, or wildcard/all if omitted
  delayMs?: number;
  statusCode?: number;
  errorMessage?: string;
  retryUntilAttempt?: number;
}

export interface SimulationAssertion {
  id?: string;
  nodeId?: string; // Optional if asserting overall workflow properties
  fieldPath?: string;
  operator: SimulationAssertionOperator;
  expectedValue?: any;
  description?: string;
}

export interface SimulationAssertionResult {
  assertionId?: string;
  nodeId?: string;
  operator: SimulationAssertionOperator;
  fieldPath?: string;
  expectedValue?: any;
  actualValue?: any;
  passed: boolean;
  error?: string;
}

export interface NodeSimulationOutcome {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: SimulationNodeOutcomeStatus;
  durationMs: number;
  simulatedAttempts: number;
  output?: any;
  error?: string;
  sideEffectsBlocked: boolean;
  branchTaken?: string;
  injectedFault?: InjectedFault;
}

export interface SimulationTimelineEvent {
  id: string;
  timestampMs: number; // Virtual elapsed ms from start
  type: "SIMULATION_START" | "NODE_START" | "NODE_COMPLETE" | "FAULT_INJECTED" | "BRANCH_EVALUATED" | "SIMULATION_COMPLETE";
  nodeId?: string;
  nodeName?: string;
  message: string;
  details?: Record<string, any>;
}

export const CreateSimulationScenarioSchema = z.object({
  workflowId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  injectedFaults: z.array(z.any()).default([]),
  syntheticTrigger: z.record(z.any()).default({}),
  mockOutputs: z.record(z.any()).default({}),
  expectedOutcome: z.enum(["SIMULATED_SUCCESS", "SIMULATED_FAILURE", "SIMULATED_TIMEOUT"]).default("SIMULATED_SUCCESS"),
  assertions: z.array(z.any()).default([]),
});

export type CreateSimulationScenarioInput = z.infer<typeof CreateSimulationScenarioSchema>;

export const RunSimulationSchema = z.object({
  workflowId: z.string().uuid(),
  scenarioId: z.string().uuid().optional(),
  releaseArtifactId: z.string().uuid().optional(),
  syntheticTrigger: z.record(z.any()).optional(),
  mockOutputs: z.record(z.any()).optional(),
  injectedFaults: z.array(z.any()).optional(),
  assertions: z.array(z.any()).optional(),
  maxVirtualDurationMs: z.number().int().positive().default(300000), // 5 min virtual timeout
});

export type RunSimulationInput = z.infer<typeof RunSimulationSchema>;

export interface SimulationRunSummary {
  id: string;
  workflowId: string;
  workflowArtifactHash: string;
  scenarioId?: string | null;
  status: SimulationRunStatus;
  virtualDurationMs: number;
  realDurationMs: number;
  nodeCount: number;
  executedNodeCount: number;
  unsimulatableNodeCount: number;
  sideEffectsBlockedCount: number;
  allAssertionsPassed: boolean;
  assertionCount: number;
  assertionsPassed: number;
  createdAt: string;
}

// ==========================================
// CHAOS ENGINEERING
// ==========================================

export type ChaosFaultType =
  | "WORKER_LOSS"
  | "QUEUE_BACKPRESSURE"
  | "TRANSIENT_5XX"
  | "RATE_LIMITING"
  | "DATABASE_LATENCY"
  | "OUTBOX_DELIVERY_FAILURE"
  | "WORKER_HEARTBEAT_EXPIRY";

export type ChaosExperimentStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "RUNNING"
  | "COMPLETED"
  | "ABORTED"
  | "CLEANED_UP";

export interface ChaosRecoveryMetrics {
  detectionLatencyMs: number;
  recoveryLatencyMs: number;
  failedExecutionCount: number;
  duplicateSideEffectsPrevented: number;
  queueDrainTimeMs: number;
  outboxRecovered: boolean;
  sloImpactPercent: number;
}

export const CreateChaosExperimentSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  targetEnvironmentId: z.string().uuid(),
  faultType: z.enum([
    "WORKER_LOSS",
    "QUEUE_BACKPRESSURE",
    "TRANSIENT_5XX",
    "RATE_LIMITING",
    "DATABASE_LATENCY",
    "OUTBOX_DELIVERY_FAILURE",
    "WORKER_HEARTBEAT_EXPIRY",
  ]),
  targetScope: z.object({
    workflowId: z.string().uuid().optional(),
    durationSeconds: z.number().int().min(5).max(300).default(60),
    faultIntensity: z.number().min(0.1).max(1.0).default(0.5),
  }).default({ durationSeconds: 60, faultIntensity: 0.5 }),
  maxDurationSeconds: z.number().int().min(5).max(300).default(60),
});

export type CreateChaosExperimentInput = z.infer<typeof CreateChaosExperimentSchema>;

// ==========================================
// OPTIMIZATION CANDIDATE & COMPARISON
// ==========================================

export type OptimizationRecommendationType =
  | "REMOVE_REDUNDANT_TRANSFORM"
  | "AVOID_REPEATED_CALLS"
  | "ADD_CONDITION_BEFORE_ACTION"
  | "TUNE_RETRY_POLICY"
  | "ADD_TIMEOUT_OR_ERROR_BRANCH"
  | "REDUCE_LOOP_WORKLOAD"
  | "ADD_INPUT_VALIDATION"
  | "REPLACE_DEPRECATED_CONNECTOR";

export interface OptimizationRecommendation {
  id: string;
  type: OptimizationRecommendationType;
  title: string;
  targetNodeId?: string;
  targetNodeLabel?: string;
  evidence: string;
  proposedAction: string;
  expectedBenefit: string;
  riskAssessment: string;
  confidence: number; // 0.0 - 1.0
  safeToApply: boolean;
}

export interface WorkflowMetricsSnapshot {
  nodeCount: number;
  estimatedDurationMs: number;
  externalCallCount: number;
  redundantNodeCount: number;
  complexityScore: number;
}

export const CreateOptimizationCandidateSchema = z.object({
  workflowId: z.string().uuid(),
  title: z.string().min(1).max(150),
  summary: z.string().max(1000),
  candidateNodes: z.array(z.any()),
  candidateEdges: z.array(z.any()),
});

export type CreateOptimizationCandidateInput = z.infer<typeof CreateOptimizationCandidateSchema>;

// ==========================================
// RELEASE SIMULATION GATE
// ==========================================

export interface SimulationGateEvaluation {
  valid: boolean;
  artifactHash: string;
  testRunPassed: boolean;
  simulationPassed: boolean;
  chaosEvidencePassed: boolean;
  unsimulatableNodesBlocked: boolean;
  unsimulatableNodeCount: number;
  reasons: string[];
}
