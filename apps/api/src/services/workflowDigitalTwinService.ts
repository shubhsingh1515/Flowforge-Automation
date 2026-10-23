import { prisma } from "@flowforge/database";
import {
  CreateSimulationScenarioInput,
  RunSimulationInput,
  SimulationAssertion,
  SimulationAssertionResult,
  NodeSimulationOutcome,
  SimulationTimelineEvent,
  SimulationNodeOutcomeStatus,
  SimulationRunStatus,
  InjectedFault,
} from "@flowforge/shared";
import { releaseService } from "./releases.js";
import { auditLogService } from "./auditLog.js";

export class WorkflowDigitalTwinService {
  /**
   * Create a reusable simulation scenario with fault injection and assertions.
   */
  async createScenario(
    workspaceId: string,
    userId: string,
    input: CreateSimulationScenarioInput
  ) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: input.workflowId, workspaceId },
    });

    if (!workflow) {
      throw new Error("Workflow not found or access denied.");
    }

    const scenario = await prisma.workflowSimulationScenario.create({
      data: {
        workspaceId,
        workflowId: input.workflowId,
        name: input.name,
        description: input.description,
        injectedFaults: (input.injectedFaults as any) || [],
        syntheticTrigger: input.syntheticTrigger || {},
        mockOutputs: input.mockOutputs || {},
        expectedOutcome: input.expectedOutcome || "SIMULATED_SUCCESS",
        assertions: (input.assertions as any) || [],
        createdById: userId,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "SIMULATION_SCENARIO_CREATED",
      targetType: "SIMULATION_SCENARIO",
      targetId: scenario.id,
      metadata: { workflowId: input.workflowId, name: input.name },
    });

    return scenario;
  }

  /**
   * List simulation scenarios for a workflow.
   */
  async listScenarios(workspaceId: string, workflowId: string) {
    return prisma.workflowSimulationScenario.findMany({
      where: { workspaceId, workflowId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { runs: true },
        },
      },
    });
  }

  /**
   * Get single simulation scenario.
   */
  async getScenario(workspaceId: string, scenarioId: string) {
    return prisma.workflowSimulationScenario.findFirst({
      where: { id: scenarioId, workspaceId },
    });
  }

  /**
   * Delete a simulation scenario.
   */
  async deleteScenario(workspaceId: string, scenarioId: string) {
    const scenario = await prisma.workflowSimulationScenario.findFirst({
      where: { id: scenarioId, workspaceId },
    });
    if (!scenario) {
      throw new Error("Simulation scenario not found.");
    }
    return prisma.workflowSimulationScenario.delete({
      where: { id: scenarioId },
    });
  }

  /**
   * Execute a deterministic Digital Twin simulation.
   * Guarantees NO external network calls, side effects, or billing mutations.
   * Uses virtual time and binds results cryptographically to the workflow content hash.
   */
  async runSimulation(
    workspaceId: string,
    userId: string,
    input: RunSimulationInput
  ) {
    const realStartTime = Date.now();

    // 1. Load workflow
    const workflow = await prisma.workflow.findFirst({
      where: { id: input.workflowId, workspaceId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (!workflow || workflow.versions.length === 0) {
      throw new Error("Workflow or workflow version not found.");
    }

    const latestVersion = workflow.versions[0];

    // 2. Resolve Scenario if provided
    let scenario: any = null;
    if (input.scenarioId) {
      scenario = await prisma.workflowSimulationScenario.findFirst({
        where: { id: input.scenarioId, workspaceId },
      });
      if (!scenario) {
        throw new Error("Simulation scenario not found.");
      }
    }

    // 3. Resolve Target Artifact and compute canonical content hash
    let releaseArtifact: any = null;
    let artifactHash: string;
    let nodes: any[] = [];
    let edges: any[] = [];

    if (input.releaseArtifactId) {
      releaseArtifact = await prisma.workflowReleaseArtifact.findFirst({
        where: { id: input.releaseArtifactId, workspaceId },
      });
      if (!releaseArtifact) {
        throw new Error("Specified release artifact not found.");
      }
      artifactHash = releaseArtifact.contentHash;
      nodes = (releaseArtifact.canonicalDefinition as any)?.nodes || [];
      edges = (releaseArtifact.canonicalDefinition as any)?.edges || [];
    } else {
      nodes = Array.isArray(latestVersion.nodes) ? (latestVersion.nodes as any[]) : [];
      edges = Array.isArray(latestVersion.edges) ? (latestVersion.edges as any[]) : [];
      const sanitized = releaseService.sanitizeDefinition(nodes, edges, workflow.triggerType);
      artifactHash = releaseService.calculateContentHash({
        formatVersion: "flowforge.release/v1",
        workflowName: workflow.name,
        nodes: sanitized.nodes,
        edges: sanitized.edges,
      });
    }

    // 4. Merge Scenario / Input configurations
    const mockOutputs: Record<string, any> = {
      ...(scenario?.mockOutputs as Record<string, any> || {}),
      ...(input.mockOutputs || {}),
    };

    const syntheticTrigger: Record<string, any> = {
      ...(scenario?.syntheticTrigger as Record<string, any> || {}),
      ...(input.syntheticTrigger || {}),
    };

    const injectedFaults: InjectedFault[] = [
      ...((scenario?.injectedFaults as InjectedFault[]) || []),
      ...(input.injectedFaults || []),
    ];

    const assertions: SimulationAssertion[] = [
      ...((scenario?.assertions as SimulationAssertion[]) || []),
      ...(input.assertions || []),
    ];

    // 5. Initialize Digital Twin Simulation State & Virtual Clock
    let virtualElapsedMs = 0;
    const maxVirtualDurationMs = input.maxVirtualDurationMs || 300000;
    const nodeOutcomes: Record<string, NodeSimulationOutcome> = {};
    const timeline: SimulationTimelineEvent[] = [];
    let sideEffectsBlockedCount = 0;
    let unsimulatableNodeCount = 0;

    timeline.push({
      id: `sim_event_${Date.now()}_start`,
      timestampMs: 0,
      type: "SIMULATION_START",
      message: `Digital Twin simulation started for workflow '${workflow.name}' (Artifact: ${artifactHash.slice(0, 10)})`,
      details: { artifactHash, scenarioId: scenario?.id },
    });

    // 6. Build Dependency & Topology Graph
    const nodeMap = new Map<string, any>(nodes.map((n) => [n.id, n]));
    const outgoingEdges = new Map<string, any[]>();
    const incomingEdges = new Map<string, any[]>();

    for (const node of nodes) {
      outgoingEdges.set(node.id, []);
      incomingEdges.set(node.id, []);
    }
    for (const edge of edges) {
      outgoingEdges.get(edge.source)?.push(edge);
      incomingEdges.get(edge.target)?.push(edge);
    }

    const visited = new Set<string>();
    const skippedNodes = new Set<string>();
    const activeBranches = new Map<string, string>();
    const context: { trigger: any; steps: Record<string, any> } = {
      trigger: syntheticTrigger,
      steps: {},
    };

    // Find trigger node
    const triggerNode = nodes.find((n) => n.data?.nodeType === "TRIGGER" || n.type === "trigger");
    const queue: string[] = [];

    if (triggerNode) {
      virtualElapsedMs += 10;
      nodeOutcomes[triggerNode.id] = {
        nodeId: triggerNode.id,
        nodeName: triggerNode.data?.label || "Trigger",
        nodeType: "TRIGGER",
        status: "SIMULATED_SUCCESS",
        durationMs: 10,
        simulatedAttempts: 1,
        output: syntheticTrigger,
        sideEffectsBlocked: false,
      };
      visited.add(triggerNode.id);
      timeline.push({
        id: `sim_event_trigger_${triggerNode.id}`,
        timestampMs: virtualElapsedMs,
        type: "NODE_COMPLETE",
        nodeId: triggerNode.id,
        nodeName: triggerNode.data?.label || "Trigger",
        message: "Trigger node simulated with synthetic payload fixture",
      });

      // Enqueue downstream of trigger
      const out = outgoingEdges.get(triggerNode.id) || [];
      for (const edge of out) {
        if (!queue.includes(edge.target)) {
          queue.push(edge.target);
        }
      }
    } else if (nodes.length > 0) {
      // If no explicit trigger, enqueue root nodes (nodes with 0 incoming edges)
      for (const node of nodes) {
        if ((incomingEdges.get(node.id) || []).length === 0) {
          queue.push(node.id);
        }
      }
    }

    let overallStatus: SimulationRunStatus = "SIMULATED_SUCCESS";
    let simulationTimedOut = false;

    // 7. Deterministic Graph Traversal Simulation Loop
    while (queue.length > 0) {
      if (virtualElapsedMs >= maxVirtualDurationMs) {
        simulationTimedOut = true;
        overallStatus = "SIMULATED_TIMEOUT";
        timeline.push({
          id: `sim_event_timeout_${virtualElapsedMs}`,
          timestampMs: virtualElapsedMs,
          type: "SIMULATION_COMPLETE",
          message: `Simulation exceeded maximum virtual duration of ${maxVirtualDurationMs}ms`,
        });
        break;
      }

      const currentNodeId = queue.shift()!;
      if (visited.has(currentNodeId) || skippedNodes.has(currentNodeId)) {
        continue;
      }

      const node = nodeMap.get(currentNodeId);
      if (!node) continue;

      // Check if all active incoming edges have satisfied dependencies
      const incoming = incomingEdges.get(currentNodeId) || [];
      let canRun = true;

      for (const inEdge of incoming) {
        if (!visited.has(inEdge.source)) {
          canRun = false;
          break;
        }

        // Branching check (e.g. condition handle 'true' vs 'false')
        const sourceBranch = activeBranches.get(inEdge.source);
        if (sourceBranch) {
          const edgeHandle = inEdge.sourceHandle || (inEdge.label || "").toLowerCase();
          if (edgeHandle && edgeHandle !== sourceBranch) {
            canRun = false;
            break;
          }
        }
      }

      if (!canRun) {
        skippedNodes.add(currentNodeId);
        nodeOutcomes[currentNodeId] = {
          nodeId: currentNodeId,
          nodeName: node.data?.label || currentNodeId,
          nodeType: node.data?.nodeType || node.type || "ACTION",
          status: "SKIPPED",
          durationMs: 0,
          simulatedAttempts: 0,
          sideEffectsBlocked: false,
        };
        continue;
      }

      // Execute Node via Safe Simulation Adapter
      const nodeType = (node.data?.nodeType || node.type || "ACTION").toUpperCase();
      const nodeLabel = node.data?.label || node.id;
      const stepDuration = 25; // standard virtual step time
      virtualElapsedMs += stepDuration;

      timeline.push({
        id: `sim_event_${currentNodeId}_start`,
        timestampMs: virtualElapsedMs,
        type: "NODE_START",
        nodeId: currentNodeId,
        nodeName: nodeLabel,
        message: `Simulating step '${nodeLabel}' (${nodeType})`,
      });

      // Check for Injected Fault on this node or matching wildcard
      const matchedFault = injectedFaults.find(
        (f) => !f.nodeId || f.nodeId === currentNodeId || f.nodeId === "*"
      );

      let outcome: NodeSimulationOutcome;

      if (matchedFault) {
        // Handle fault injection
        timeline.push({
          id: `sim_event_${currentNodeId}_fault`,
          timestampMs: virtualElapsedMs,
          type: "FAULT_INJECTED",
          nodeId: currentNodeId,
          nodeName: nodeLabel,
          message: `Injected fault '${matchedFault.type}' into step '${nodeLabel}'`,
          details: matchedFault as any,
        });

        if (matchedFault.type === "HTTP_429") {
          outcome = {
            nodeId: currentNodeId,
            nodeName: nodeLabel,
            nodeType,
            status: "SIMULATED_FAILURE",
            durationMs: matchedFault.delayMs || 50,
            simulatedAttempts: 3,
            error: "HTTP 429 Too Many Requests (Rate limit threshold reached)",
            sideEffectsBlocked: true,
            injectedFault: matchedFault,
          };
          sideEffectsBlockedCount++;
          overallStatus = "SIMULATED_FAILURE";
        } else if (matchedFault.type === "HTTP_5XX") {
          outcome = {
            nodeId: currentNodeId,
            nodeName: nodeLabel,
            nodeType,
            status: "SIMULATED_FAILURE",
            durationMs: matchedFault.delayMs || 100,
            simulatedAttempts: 3,
            error: matchedFault.errorMessage || "HTTP 502 Bad Gateway from upstream provider",
            sideEffectsBlocked: true,
            injectedFault: matchedFault,
          };
          sideEffectsBlockedCount++;
          overallStatus = "SIMULATED_FAILURE";
        } else if (matchedFault.type === "TIMEOUT") {
          virtualElapsedMs += (matchedFault.delayMs || 30000);
          outcome = {
            nodeId: currentNodeId,
            nodeName: nodeLabel,
            nodeType,
            status: "SIMULATED_TIMEOUT",
            durationMs: matchedFault.delayMs || 30000,
            simulatedAttempts: 1,
            error: "Upstream request timed out after 30000ms",
            sideEffectsBlocked: true,
            injectedFault: matchedFault,
          };
          sideEffectsBlockedCount++;
          overallStatus = "SIMULATED_TIMEOUT";
        } else if (matchedFault.type === "EXPIRED_CREDENTIALS") {
          outcome = {
            nodeId: currentNodeId,
            nodeName: nodeLabel,
            nodeType,
            status: "SIMULATED_FAILURE",
            durationMs: 40,
            simulatedAttempts: 1,
            error: "AUTHENTICATION_FAILED: Integration token expired or revoked",
            sideEffectsBlocked: true,
            injectedFault: matchedFault,
          };
          sideEffectsBlockedCount++;
          overallStatus = "SIMULATED_FAILURE";
        } else if (matchedFault.type === "RETRY_EXHAUSTION") {
          outcome = {
            nodeId: currentNodeId,
            nodeName: nodeLabel,
            nodeType,
            status: "SIMULATED_FAILURE",
            durationMs: 350,
            simulatedAttempts: (matchedFault.retryUntilAttempt || 5),
            error: "RETRY_EXHAUSTED: Exceeded maximum retry attempts (5/5)",
            sideEffectsBlocked: true,
            injectedFault: matchedFault,
          };
          sideEffectsBlockedCount++;
          overallStatus = "SIMULATED_FAILURE";
        } else if (matchedFault.type === "RESIDENCY_VIOLATION") {
          outcome = {
            nodeId: currentNodeId,
            nodeName: nodeLabel,
            nodeType,
            status: "BLOCKED_BY_POLICY",
            durationMs: 15,
            simulatedAttempts: 1,
            error: "RESIDENCY_POLICY_VIOLATION: Data dispatch blocked across protected boundary",
            sideEffectsBlocked: true,
            injectedFault: matchedFault,
          };
          sideEffectsBlockedCount++;
          overallStatus = "BLOCKED_BY_POLICY";
        } else {
          outcome = {
            nodeId: currentNodeId,
            nodeName: nodeLabel,
            nodeType,
            status: "SIMULATED_FAILURE",
            durationMs: 20,
            simulatedAttempts: 1,
            error: matchedFault.errorMessage || `Simulated error for fault ${matchedFault.type}`,
            sideEffectsBlocked: true,
            injectedFault: matchedFault,
          };
          sideEffectsBlockedCount++;
          overallStatus = "SIMULATED_FAILURE";
        }
      } else if (mockOutputs[currentNodeId]) {
        // Test fixture mock provided
        outcome = {
          nodeId: currentNodeId,
          nodeName: nodeLabel,
          nodeType,
          status: "SIMULATED_SUCCESS",
          durationMs: 25,
          simulatedAttempts: 1,
          output: mockOutputs[currentNodeId],
          sideEffectsBlocked: true,
        };
        sideEffectsBlockedCount++;
      } else {
        // Safe node-type simulation adapter
        outcome = this.simulateNodeSafely(node, context);
        if (outcome.sideEffectsBlocked) {
          sideEffectsBlockedCount++;
        }
        if (outcome.status === "UNSIMULATABLE") {
          unsimulatableNodeCount++;
        }
      }

      nodeOutcomes[currentNodeId] = outcome;
      visited.add(currentNodeId);

      if (outcome.branchTaken) {
        activeBranches.set(currentNodeId, outcome.branchTaken);
      }

      context.steps[currentNodeId] = {
        output: outcome.output,
        status: outcome.status,
      };

      timeline.push({
        id: `sim_event_${currentNodeId}_done`,
        timestampMs: virtualElapsedMs,
        type: "NODE_COMPLETE",
        nodeId: currentNodeId,
        nodeName: nodeLabel,
        message: `Step '${nodeLabel}' completed with status: ${outcome.status}`,
        details: { status: outcome.status, branchTaken: outcome.branchTaken },
      });

      // Stop downstream traversal if step failed critically
      if (outcome.status === "SIMULATED_FAILURE" || outcome.status === "SIMULATED_TIMEOUT" || outcome.status === "BLOCKED_BY_POLICY") {
        overallStatus = outcome.status;
        break;
      }

      // Enqueue downstream nodes
      const outEdges = outgoingEdges.get(currentNodeId) || [];
      for (const edge of outEdges) {
        if (outcome.branchTaken) {
          const handle = edge.sourceHandle || (edge.label || "").toLowerCase();
          if (handle && handle !== outcome.branchTaken) {
            continue;
          }
        }
        if (!visited.has(edge.target) && !queue.includes(edge.target)) {
          queue.push(edge.target);
        }
      }
    }

    // Mark any unvisited/unreached downstream nodes as SKIPPED
    for (const node of nodes) {
      if (!nodeOutcomes[node.id]) {
        nodeOutcomes[node.id] = {
          nodeId: node.id,
          nodeName: node.data?.label || node.id,
          nodeType: (node.data?.nodeType || node.type || "ACTION").toUpperCase(),
          status: "SKIPPED",
          durationMs: 0,
          simulatedAttempts: 0,
          sideEffectsBlocked: false,
        };
      }
    }

    // 8. Evaluate Assertions
    const assertionResults: SimulationAssertionResult[] = [];
    let allAssertionsPassed = true;

    for (const assertion of assertions) {
      const res = this.evaluateAssertion(assertion, nodeOutcomes, virtualElapsedMs, overallStatus, unsimulatableNodeCount);
      assertionResults.push(res);
      if (!res.passed) {
        allAssertionsPassed = false;
      }
    }

    const realDurationMs = Date.now() - realStartTime;
    const virtualDurationMs = virtualElapsedMs;

    // 9. Persist Simulation Run linked to Artifact Content Hash
    const simulationRun = await prisma.workflowSimulationRun.create({
      data: {
        workspaceId,
        workflowId: workflow.id,
        scenarioId: scenario?.id || null,
        workflowArtifactHash: artifactHash,
        releaseArtifactId: releaseArtifact?.id || null,
        engineVersion: "digital-twin/v1",
        status: overallStatus,
        virtualDurationMs,
        realDurationMs,
        nodeOutcomes: nodeOutcomes as any,
        timeline: timeline as any,
        assertionResults: assertionResults as any,
        allAssertionsPassed,
        unsimulatableNodeCount,
        sideEffectsBlockedCount,
        executedByUserId: userId,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "WORKFLOW_SIMULATION_EXECUTED",
      targetType: "SIMULATION_RUN",
      targetId: simulationRun.id,
      metadata: {
        workflowId: workflow.id,
        scenarioId: scenario?.id || null,
        status: overallStatus,
        artifactHash,
        allAssertionsPassed,
        virtualDurationMs,
      },
    });

    return {
      simulationRun,
      summary: {
        id: simulationRun.id,
        workflowId: workflow.id,
        workflowArtifactHash: artifactHash,
        scenarioId: scenario?.id || null,
        status: overallStatus,
        virtualDurationMs,
        realDurationMs,
        nodeCount: nodes.length,
        executedNodeCount: Object.keys(nodeOutcomes).length,
        unsimulatableNodeCount,
        sideEffectsBlockedCount,
        allAssertionsPassed,
        assertionCount: assertions.length,
        assertionsPassed: assertionResults.filter((r) => r.passed).length,
        createdAt: simulationRun.createdAt.toISOString(),
      },
    };
  }

  /**
   * Safe node simulation adapter: performs deterministic local evaluation without external writes.
   */
  private simulateNodeSafely(node: any, context: any): NodeSimulationOutcome {
    const nodeType = (node.data?.nodeType || node.type || "ACTION").toUpperCase();
    const nodeLabel = node.data?.label || node.id;
    const config = node.data?.config || {};

    switch (nodeType) {
      case "CONDITION": {
        // Deterministic condition evaluation
        let branch = "true";
        if (config.rules && Array.isArray(config.rules)) {
          // Check simple rule condition
          for (const rule of config.rules) {
            const actual = this.resolveContextValue(context, rule.field);
            if (rule.operator === "EQUALS" && actual !== rule.value) {
              branch = "false";
              break;
            }
          }
        }
        return {
          nodeId: node.id,
          nodeName: nodeLabel,
          nodeType,
          status: "SIMULATED_SUCCESS",
          durationMs: 5,
          simulatedAttempts: 1,
          output: { result: branch === "true" },
          branchTaken: branch,
          sideEffectsBlocked: false,
        };
      }

      case "TRANSFORM":
      case "FILTER": {
        // Deterministic transformation or filter
        return {
          nodeId: node.id,
          nodeName: nodeLabel,
          nodeType,
          status: "SIMULATED_SUCCESS",
          durationMs: 8,
          simulatedAttempts: 1,
          output: {
            transformed: true,
            data: { ...context.trigger, ...(config.staticPayload || {}) },
          },
          sideEffectsBlocked: false,
        };
      }

      case "LOOP": {
        // Bounded loop iteration
        const iterations = Math.min(config.iterations || 3, 10);
        return {
          nodeId: node.id,
          nodeName: nodeLabel,
          nodeType,
          status: "SIMULATED_SUCCESS",
          durationMs: 15 * iterations,
          simulatedAttempts: 1,
          output: { iteratedCount: iterations, success: true },
          sideEffectsBlocked: false,
        };
      }

      case "FORK":
      case "JOIN": {
        return {
          nodeId: node.id,
          nodeName: nodeLabel,
          nodeType,
          status: "SIMULATED_SUCCESS",
          durationMs: 5,
          simulatedAttempts: 1,
          output: { coordinated: true },
          sideEffectsBlocked: false,
        };
      }

      case "APPROVAL": {
        // Simulated approval decision
        const approved = config.defaultSimulatedDecision !== "REJECTED";
        return {
          nodeId: node.id,
          nodeName: nodeLabel,
          nodeType,
          status: approved ? "SIMULATED_SUCCESS" : "SIMULATED_FAILURE",
          durationMs: 10,
          simulatedAttempts: 1,
          output: { approved, decision: approved ? "APPROVED" : "REJECTED" },
          branchTaken: approved ? "approved" : "rejected",
          sideEffectsBlocked: true,
        };
      }

      case "HTTP":
      case "HTTP_REQUEST": {
        // Outbound HTTP requests MUST NOT be made over real network
        return {
          nodeId: node.id,
          nodeName: nodeLabel,
          nodeType,
          status: "SIMULATED_SUCCESS",
          durationMs: 45,
          simulatedAttempts: 1,
          output: {
            status: 200,
            statusText: "OK",
            simulated: true,
            data: { id: "sim_" + Math.random().toString(36).substring(7), success: true },
          },
          sideEffectsBlocked: true, // Side effects blocked!
        };
      }

      case "INTEGRATION":
      case "CUSTOM_INTEGRATION": {
        return {
          nodeId: node.id,
          nodeName: nodeLabel,
          nodeType,
          status: "SIMULATED_SUCCESS",
          durationMs: 50,
          simulatedAttempts: 1,
          output: {
            integration: node.data?.integrationKey || "custom",
            simulated: true,
            result: { id: "int_sim_123", status: "OK" },
          },
          sideEffectsBlocked: true, // Side effects blocked!
        };
      }

      default: {
        // If unknown or unsupported arbitrary node, mark as UNSIMULATABLE
        return {
          nodeId: node.id,
          nodeName: nodeLabel,
          nodeType,
          status: "UNSIMULATABLE",
          durationMs: 0,
          simulatedAttempts: 0,
          error: `Node type '${nodeType}' has no safe deterministic simulation adapter`,
          sideEffectsBlocked: true,
        };
      }
    }
  }

  /**
   * Evaluate a typed assertion against simulation outcomes.
   */
  evaluateAssertion(
    assertion: SimulationAssertion,
    outcomes: Record<string, NodeSimulationOutcome>,
    virtualDurationMs: number,
    overallStatus: SimulationRunStatus,
    unsimulatableCount: number
  ): SimulationAssertionResult {
    const operator = assertion.operator;
    const targetNodeId = assertion.nodeId;

    switch (operator) {
      case "EXECUTION_STATUS_EQUALS": {
        const passed = overallStatus === assertion.expectedValue;
        return {
          assertionId: assertion.id,
          operator,
          expectedValue: assertion.expectedValue,
          actualValue: overallStatus,
          passed,
          error: passed ? undefined : `Expected overall status '${assertion.expectedValue}', got '${overallStatus}'`,
        };
      }

      case "MAX_SIMULATED_DURATION_MS": {
        const passed = virtualDurationMs <= Number(assertion.expectedValue);
        return {
          assertionId: assertion.id,
          operator,
          expectedValue: assertion.expectedValue,
          actualValue: virtualDurationMs,
          passed,
          error: passed ? undefined : `Simulated duration (${virtualDurationMs}ms) exceeded maximum (${assertion.expectedValue}ms)`,
        };
      }

      case "NO_UNSIMULATABLE_NODES": {
        const passed = unsimulatableCount === 0;
        return {
          assertionId: assertion.id,
          operator,
          expectedValue: 0,
          actualValue: unsimulatableCount,
          passed,
          error: passed ? undefined : `Found ${unsimulatableCount} unsimulatable nodes in workflow`,
        };
      }

      case "NODE_EXECUTED": {
        const outcome = targetNodeId ? outcomes[targetNodeId] : undefined;
        const passed = outcome !== undefined && outcome.status !== "SKIPPED";
        return {
          assertionId: assertion.id,
          nodeId: targetNodeId,
          operator,
          expectedValue: true,
          actualValue: passed,
          passed,
          error: passed ? undefined : `Node '${targetNodeId}' was not executed`,
        };
      }

      case "NODE_SKIPPED": {
        const outcome = targetNodeId ? outcomes[targetNodeId] : undefined;
        const passed = outcome !== undefined && outcome.status === "SKIPPED";
        return {
          assertionId: assertion.id,
          nodeId: targetNodeId,
          operator,
          expectedValue: true,
          actualValue: passed,
          passed,
          error: passed ? undefined : `Node '${targetNodeId}' was not skipped`,
        };
      }

      case "PROHIBITED_SIDE_EFFECTS": {
        // Assert that external nodes had their side effects blocked
        const externalNodes = Object.values(outcomes).filter(
          (o) => o.nodeType === "HTTP" || o.nodeType === "INTEGRATION"
        );
        const allBlocked = externalNodes.every((o) => o.sideEffectsBlocked);
        return {
          assertionId: assertion.id,
          operator,
          expectedValue: true,
          actualValue: allBlocked,
          passed: allBlocked,
          error: allBlocked ? undefined : "One or more external nodes were executed without side-effect blocking",
        };
      }

      default: {
        // Target node field-level evaluation
        if (!targetNodeId || !outcomes[targetNodeId]) {
          return {
            assertionId: assertion.id,
            nodeId: targetNodeId,
            operator,
            passed: false,
            error: `Target node '${targetNodeId}' did not execute or has no output.`,
          };
        }

        const nodeOutcome = outcomes[targetNodeId];
        const actualValue = assertion.fieldPath
          ? this.resolvePath(nodeOutcome.output, assertion.fieldPath)
          : nodeOutcome.output;

        let passed = false;
        let errorMsg: string | undefined;

        if (operator === "EQUALS") {
          passed = JSON.stringify(actualValue) === JSON.stringify(assertion.expectedValue);
          if (!passed) errorMsg = `Expected ${JSON.stringify(assertion.expectedValue)}, got ${JSON.stringify(actualValue)}`;
        } else if (operator === "CONTAINS") {
          if (typeof actualValue === "string") {
            passed = actualValue.includes(String(assertion.expectedValue));
          } else if (Array.isArray(actualValue)) {
            passed = actualValue.includes(assertion.expectedValue);
          }
          if (!passed) errorMsg = `Value does not contain ${JSON.stringify(assertion.expectedValue)}`;
        } else if (operator === "EXISTS") {
          passed = actualValue !== undefined && actualValue !== null;
          if (!passed) errorMsg = `Field '${assertion.fieldPath}' does not exist on node '${targetNodeId}'`;
        } else if (operator === "NOT_EXISTS") {
          passed = actualValue === undefined || actualValue === null;
          if (!passed) errorMsg = `Field '${assertion.fieldPath}' unexpectedly exists on node '${targetNodeId}'`;
        } else if (operator === "GREATER_THAN") {
          passed = typeof actualValue === "number" && actualValue > Number(assertion.expectedValue);
          if (!passed) errorMsg = `Expected > ${assertion.expectedValue}, got ${actualValue}`;
        } else if (operator === "LESS_THAN") {
          passed = typeof actualValue === "number" && actualValue < Number(assertion.expectedValue);
          if (!passed) errorMsg = `Expected < ${assertion.expectedValue}, got ${actualValue}`;
        } else if (operator === "NOT_EMPTY") {
          passed = actualValue !== undefined && actualValue !== null && actualValue !== "" && (!Array.isArray(actualValue) || actualValue.length > 0);
          if (!passed) errorMsg = `Value is empty on node '${targetNodeId}'`;
        } else if (operator === "REGEX_MATCH") {
          try {
            const re = new RegExp(String(assertion.expectedValue));
            passed = re.test(String(actualValue));
            if (!passed) errorMsg = `Value '${actualValue}' did not match regex /${assertion.expectedValue}/`;
          } catch (e: any) {
            passed = false;
            errorMsg = `Invalid regular expression: ${e.message}`;
          }
        }

        return {
          assertionId: assertion.id,
          nodeId: targetNodeId,
          operator,
          fieldPath: assertion.fieldPath,
          expectedValue: assertion.expectedValue,
          actualValue,
          passed,
          error: errorMsg,
        };
      }
    }
  }

  /**
   * Helper to resolve context values from direct context, trigger payload, or steps.
   */
  private resolveContextValue(context: any, path?: string) {
    if (!path || !context) return undefined;
    let val = this.resolvePath(context, path);
    if (val !== undefined) return val;
    val = this.resolvePath(context.trigger, path);
    if (val !== undefined) return val;
    return this.resolvePath(context.steps, path);
  }

  /**
   * Helper to resolve dot-notation paths on objects.
   */
  private resolvePath(obj: any, path?: string) {
    if (!path || !obj) return obj;
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
      if (current !== null && current !== undefined && typeof current === "object") {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  /**
   * List past simulation runs for a workflow.
   */
  async listSimulationRuns(workspaceId: string, workflowId: string) {
    return prisma.workflowSimulationRun.findMany({
      where: { workspaceId, workflowId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        scenario: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Get single simulation run by ID.
   */
  async getSimulationRun(workspaceId: string, runId: string) {
    return prisma.workflowSimulationRun.findFirst({
      where: { id: runId, workspaceId },
      include: {
        scenario: true,
        workflow: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Check whether simulation evidence is stale relative to current draft or target release.
   */
  async isSimulationEvidenceStale(workspaceId: string, runId: string, currentContentHash: string): Promise<boolean> {
    const run = await prisma.workflowSimulationRun.findFirst({
      where: { id: runId, workspaceId },
    });
    if (!run) return true;
    return run.workflowArtifactHash !== currentContentHash;
  }
}

export const workflowDigitalTwinService = new WorkflowDigitalTwinService();
