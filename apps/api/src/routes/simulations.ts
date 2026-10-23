import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateSimulationScenarioSchema,
  RunSimulationSchema,
} from "@flowforge/shared";
import { authenticateRequest } from "../plugins/auth.js";
import { workflowDigitalTwinService } from "../services/workflowDigitalTwinService.js";
import { simulationGateService } from "../services/simulationGateService.js";
import { prisma } from "@flowforge/database";

export async function simulationRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // 1. Create reusable simulation scenario
  app.post(
    "/workflows/:id/simulations/scenarios",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Simulations"],
        summary: "Create simulation scenario with fault injection rules",
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          name: z.string().min(1).max(120),
          description: z.string().max(500).optional(),
          injectedFaults: z.array(z.any()).default([]),
          syntheticTrigger: z.record(z.any()).default({}),
          mockOutputs: z.record(z.any()).default({}),
          expectedOutcome: z.enum(["SIMULATED_SUCCESS", "SIMULATED_FAILURE", "SIMULATED_TIMEOUT"]).default("SIMULATED_SUCCESS"),
          assertions: z.array(z.any()).default([]),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params;
      const input = CreateSimulationScenarioSchema.parse({
        workflowId: id,
        ...request.body,
      });

      const scenario = await workflowDigitalTwinService.createScenario(workspaceId, userId, input);
      return reply.status(201).send({ data: scenario });
    }
  );

  // 2. List simulation scenarios for workflow
  app.get(
    "/workflows/:id/simulations/scenarios",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Simulations"],
        summary: "List simulation scenarios for workflow",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params;
      const scenarios = await workflowDigitalTwinService.listScenarios(workspaceId, id);
      return { data: scenarios };
    }
  );

  // 3. Get single simulation scenario
  app.get(
    "/simulations/scenarios/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Simulations"],
        summary: "Get single simulation scenario",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params;
      const scenario = await workflowDigitalTwinService.getScenario(workspaceId, id);
      if (!scenario) {
        return reply.status(404).send({ error: "Not Found", message: "Scenario not found" });
      }
      return { data: scenario };
    }
  );

  // 4. Delete simulation scenario
  app.delete(
    "/simulations/scenarios/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Simulations"],
        summary: "Delete simulation scenario",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params;
      await workflowDigitalTwinService.deleteScenario(workspaceId, id);
      return reply.send({ success: true, message: "Scenario deleted" });
    }
  );

  // 5. Execute Digital Twin Simulation
  app.post(
    "/workflows/:id/simulations/run",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Simulations"],
        summary: "Execute deterministic workflow simulation in isolated digital twin",
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          scenarioId: z.string().uuid().optional(),
          releaseArtifactId: z.string().uuid().optional(),
          syntheticTrigger: z.record(z.any()).optional(),
          mockOutputs: z.record(z.any()).optional(),
          injectedFaults: z.array(z.any()).optional(),
          assertions: z.array(z.any()).optional(),
          maxVirtualDurationMs: z.number().int().positive().default(300000),
        }),
      },
    },
    async (request, reply) => {
      const { workspaceId, id: userId } = request.authUser!;
      const { id } = request.params;
      const input = RunSimulationSchema.parse({
        workflowId: id,
        ...request.body,
      });

      const result = await workflowDigitalTwinService.runSimulation(workspaceId, userId, input);
      return reply.status(200).send({ data: result });
    }
  );

  // 6. List past simulation runs for workflow
  app.get(
    "/workflows/:id/simulations/runs",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Simulations"],
        summary: "List past simulation runs for workflow",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params;
      const runs = await workflowDigitalTwinService.listSimulationRuns(workspaceId, id);
      return { data: runs };
    }
  );

  // 7. Get single simulation run details
  app.get(
    "/simulations/runs/:id",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Simulations"],
        summary: "Get single simulation run details and node outcomes",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params;
      const run = await workflowDigitalTwinService.getSimulationRun(workspaceId, id);
      if (!run) {
        return reply.status(404).send({ error: "Not Found", message: "Simulation run not found" });
      }
      return { data: run };
    }
  );

  // 8. Stale evidence check
  app.get(
    "/simulations/runs/:id/stale-check",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Simulations"],
        summary: "Check if simulation run evidence is stale relative to current draft hash",
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          contentHash: z.string(),
        }),
      },
    },
    async (request) => {
      const { workspaceId } = request.authUser!;
      const { id } = request.params;
      const { contentHash } = request.query;
      const isStale = await workflowDigitalTwinService.isSimulationEvidenceStale(workspaceId, id, contentHash);
      return { isStale };
    }
  );

  // 9. Release simulation gates evaluation
  app.get(
    "/releases/:id/simulation-gates/:environmentId",
    {
      preHandler: [authenticateRequest],
      schema: {
        tags: ["Simulations"],
        summary: "Evaluate release simulation gates for promotion to target environment",
        params: z.object({
          id: z.string().uuid(),
          environmentId: z.string().uuid(),
        }),
      },
    },
    async (request) => {
      const { workspaceId } = request.authUser!;
      const { id: releaseArtifactId, environmentId } = request.params;
      const gateEvaluation = await simulationGateService.evaluateReleaseGates(
        workspaceId,
        releaseArtifactId,
        environmentId
      );
      return { data: gateEvaluation };
    }
  );
}
