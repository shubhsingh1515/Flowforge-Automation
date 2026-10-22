import { z } from "zod";

export const WorkflowStatusEnum = z.enum(["DRAFT", "ACTIVE", "PAUSED"]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusEnum>;

export const NodeTypeEnum = z.enum([
  "TRIGGER",
  "ACTION",
  "CONDITION",
  "FILTER",
  "TRANSFORM",
  "LOOP",
  "FORK",
  "JOIN",
  "APPROVAL",
  "HTTP_REQUEST",
  "WORKFLOW_END",
]);
export type NodeType = z.infer<typeof NodeTypeEnum>;

export const WorkflowNodeDataSchema = z.object({
  label: z.string().min(1, "Node label is required"),
  description: z.string().optional(),
  nodeType: NodeTypeEnum,
  integrationKey: z.string().optional(),
  config: z.record(z.any()).default({}),
  isValid: z.boolean().default(true),
  status: z.enum(["idle", "configured", "error"]).default("configured"),
});

export type WorkflowNodeData = z.infer<typeof WorkflowNodeDataSchema>;

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.string().default("custom"),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: WorkflowNodeDataSchema,
});

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  label: z.string().optional(),
  animated: z.boolean().optional(),
});

export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const ViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

export type Viewport = z.infer<typeof ViewportSchema>;

export const CreateWorkflowSchema = z.object({
  name: z.string().min(2, "Workflow name must be at least 2 characters").max(100),
  description: z.string().max(500).optional().default(""),
  nodes: z.array(WorkflowNodeSchema).default([]),
  edges: z.array(WorkflowEdgeSchema).default([]),
  viewport: ViewportSchema.optional(),
  status: WorkflowStatusEnum.default("DRAFT"),
});

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;

export const UpdateWorkflowSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  status: WorkflowStatusEnum.optional(),
  nodes: z.array(WorkflowNodeSchema).optional(),
  edges: z.array(WorkflowEdgeSchema).optional(),
  viewport: ViewportSchema.optional(),
  expectedVersion: z.number().int().positive().optional(),
  changeSummary: z.string().max(255).optional(),
  createVersion: z.boolean().optional(),
});

export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;

export interface GraphValidationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
  type: "CYCLE_DETECTED" | "MISSING_TRIGGER" | "MULTIPLE_TRIGGERS" | "DISCONNECTED_NODE" | "INVALID_CONNECTION" | "CONFIGURATION_ERROR";
}

export interface GraphValidationResult {
  isValid: boolean;
  errors: GraphValidationError[];
  warnings: string[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    triggerCount: number;
    actionCount: number;
    conditionCount: number;
  };
}

/**
 * Validates a workflow graph:
 * 1. Must have at least one TRIGGER node (or warning if empty/draft).
 * 2. Cannot have cycles (Directed Acyclic Graph enforcement).
 * 3. Cannot connect to self.
 * 4. Checks for disconnected components.
 */
export function validateWorkflowGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): GraphValidationResult {
  const errors: GraphValidationError[] = [];
  const warnings: string[] = [];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const triggers = nodes.filter((n) => n.data.nodeType === "TRIGGER");
  const actions = nodes.filter((n) => n.data.nodeType === "ACTION" || n.data.nodeType === "HTTP_REQUEST");
  const conditions = nodes.filter((n) => n.data.nodeType === "CONDITION");

  if (nodes.length > 0 && triggers.length === 0) {
    errors.push({
      message: "A workflow must start with at least one Trigger node",
      type: "MISSING_TRIGGER",
    });
  }

  if (triggers.length > 1) {
    warnings.push("Multiple trigger nodes detected. Phase 1 workflows typically execute from a single trigger.");
  }

  // Edge validations
  const adjacencyList = new Map<string, string[]>();
  for (const node of nodes) {
    adjacencyList.set(node.id, []);
  }

  for (const edge of edges) {
    if (edge.source === edge.target) {
      errors.push({
        edgeId: edge.id,
        nodeId: edge.source,
        message: `Node cannot connect to itself (node ID: ${edge.source})`,
        type: "INVALID_CONNECTION",
      });
      continue;
    }

    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      errors.push({
        edgeId: edge.id,
        message: `Edge connects to a non-existent node: ${edge.source} -> ${edge.target}`,
        type: "INVALID_CONNECTION",
      });
      continue;
    }

    const sourceNeighbors = adjacencyList.get(edge.source) || [];
    sourceNeighbors.push(edge.target);
    adjacencyList.set(edge.source, sourceNeighbors);
  }

  // Cycle detection via Depth-First Search with recursion stack
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(nodeId: string, path: string[]): boolean {
    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor, [...path])) {
          return true;
        }
      } else if (inStack.has(neighbor)) {
        errors.push({
          nodeId: neighbor,
          message: `Cycle detected in workflow graph involving node '${nodeMap.get(neighbor)?.data.label || neighbor}' (Loop: ${[...path, neighbor].join(" -> ")})`,
          type: "CYCLE_DETECTED",
        });
        return true;
      }
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      hasCycle(node.id, []);
    }
  }

  // Check for disconnected nodes (if nodes > 1 and edges exist)
  if (nodes.length > 1) {
    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }

    for (const node of nodes) {
      if (!connectedNodeIds.has(node.id)) {
        warnings.push(`Node '${node.data.label}' is disconnected from the workflow graph.`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      triggerCount: triggers.length,
      actionCount: actions.length,
      conditionCount: conditions.length,
    },
  };
}
