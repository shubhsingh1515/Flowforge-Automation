import { prisma } from "@flowforge/database";
import { SimulationGateEvaluation } from "@flowforge/shared";

export class SimulationGateService {
  /**
   * Evaluate simulation, testing, and chaos release gates for a release artifact
   * attempting promotion into a target environment.
   */
  async evaluateReleaseGates(
    workspaceId: string,
    releaseArtifactId: string,
    environmentId: string
  ): Promise<SimulationGateEvaluation> {
    const artifact = await prisma.workflowReleaseArtifact.findFirst({
      where: { id: releaseArtifactId, workspaceId },
    });

    if (!artifact) {
      throw new Error("Release artifact not found.");
    }

    const env = await prisma.workflowEnvironment.findFirst({
      where: { id: environmentId, workspaceId },
      include: { policy: true },
    });

    if (!env) {
      throw new Error("Target environment not found.");
    }

    const policy = env.policy;
    const reasons: string[] = [];
    let valid = true;

    // 1. Check Automated Test Suite (Phase 12 requirement bound to contentHash)
    let testRunPassed = true;
    const requirePassingTests = policy?.requirePassingTests ?? env.requirePassingTests;
    if (requirePassingTests) {
      const passingTest = await prisma.workflowTestRun.findFirst({
        where: {
          workspaceId,
          releaseContentHash: artifact.contentHash,
          status: "PASSED",
        },
      });

      if (!passingTest) {
        testRunPassed = false;
        valid = false;
        reasons.push(
          `Automated Test Gate Failed: Release artifact (${artifact.contentHash.slice(0, 8)}) must pass automated test suite before promotion to '${env.name}'.`
        );
      }
    }

    // 2. Check Digital Twin Simulation Coverage (Phase 20)
    let simulationPassed = true;
    let unsimulatableNodeCount = 0;
    let unsimulatableNodesBlocked = false;

    if (policy?.requireSimulationCoverage) {
      const passingSimulation = await prisma.workflowSimulationRun.findFirst({
        where: {
          workspaceId,
          workflowArtifactHash: artifact.contentHash,
          status: "SIMULATED_SUCCESS",
          allAssertionsPassed: true,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!passingSimulation) {
        simulationPassed = false;
        valid = false;
        reasons.push(
          `Simulation Gate Failed: Release artifact (${artifact.contentHash.slice(0, 8)}) requires passing Digital Twin simulation evidence bound to its exact content hash before deployment to '${env.name}'.`
        );
      } else {
        unsimulatableNodeCount = passingSimulation.unsimulatableNodeCount;
      }
    }

    // 3. Check Prohibit Unsimulatable Nodes
    if (policy?.prohibitUnsimulatableNodes) {
      // Find latest simulation run for this artifact
      const latestSim = await prisma.workflowSimulationRun.findFirst({
        where: {
          workspaceId,
          workflowArtifactHash: artifact.contentHash,
        },
        orderBy: { createdAt: "desc" },
      });

      if (latestSim && latestSim.unsimulatableNodeCount > 0) {
        unsimulatableNodesBlocked = true;
        valid = false;
        reasons.push(
          `Unsimulatable Node Policy Failed: Workflow contains ${latestSim.unsimulatableNodeCount} unsimulatable nodes, which is prohibited by policy in environment '${env.name}'.`
        );
      }
    }

    // 4. Check Chaos Experiment Evidence (for Staging / Pre-prod)
    let chaosEvidencePassed = true;
    if (policy?.requireChaosExperimentEvidence) {
      const passingChaos = await prisma.chaosExperiment.findFirst({
        where: {
          workspaceId,
          targetEnvironmentId: environmentId,
          status: "COMPLETED",
          cleanupStatus: "CLEANED_UP",
        },
      });

      if (!passingChaos) {
        chaosEvidencePassed = false;
        valid = false;
        reasons.push(
          `Chaos Engineering Gate Failed: Environment '${env.name}' requires verified chaos experiment recovery evidence before new releases can be promoted.`
        );
      }
    }

    return {
      valid,
      artifactHash: artifact.contentHash,
      testRunPassed,
      simulationPassed,
      chaosEvidencePassed,
      unsimulatableNodesBlocked,
      unsimulatableNodeCount,
      reasons,
    };
  }
}

export const simulationGateService = new SimulationGateService();
