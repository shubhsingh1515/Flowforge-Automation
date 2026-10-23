import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import {
  UpdateIncidentStatusSchema,
  AssignIncidentSchema,
  AddIncidentNoteSchema,
} from "@flowforge/shared";
import { incidentService } from "../services/incidentService.js";
import { z } from "zod";

export async function incidentRoutes(server: FastifyInstance) {
  // 1. List operational incidents
  server.get("/incidents", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Incidents"],
      summary: "List operational incidents for the workspace",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const query = request.query as {
        status?: string;
        severity?: string;
        category?: string;
      };
      const incidents = await incidentService.listIncidents(workspaceId, query);
      return { data: incidents };
    },
  });

  server.get("/workspaces/:workspaceId/incidents", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Incidents"],
      summary: "List operational incidents for specific workspace",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const query = request.query as {
        status?: string;
        severity?: string;
        category?: string;
      };
      const incidents = await incidentService.listIncidents(workspaceId, query);
      return { data: incidents };
    },
  });

  // 2. Get incident details
  server.get("/incidents/:id", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Incidents"],
      summary: "Get incident details including timeline and remediations",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const { id } = request.params as { id: string };
      const incident = await incidentService.getIncident(workspaceId, id);
      return { data: incident };
    },
  });

  server.get("/workspaces/:workspaceId/incidents/:id", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Incidents"],
      summary: "Get incident details including timeline and remediations",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const { id } = request.params as { id: string };
      const incident = await incidentService.getIncident(workspaceId, id);
      return { data: incident };
    },
  });

  // 3. Update incident status
  server.post("/incidents/:id/status", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Incidents"],
      summary: "Transition incident status along state machine",
      body: UpdateIncidentStatusSchema,
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const userId = request.authUser?.id;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof UpdateIncidentStatusSchema>;

      const updated = await incidentService.updateStatus(
        workspaceId,
        id,
        body.status,
        userId,
        body.note
      );
      return { data: updated };
    },
  });

  server.post("/workspaces/:workspaceId/incidents/:id/status", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Incidents"],
      summary: "Transition incident status along state machine",
      body: UpdateIncidentStatusSchema,
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const userId = request.authUser?.id;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof UpdateIncidentStatusSchema>;

      const updated = await incidentService.updateStatus(
        workspaceId,
        id,
        body.status,
        userId,
        body.note
      );
      return { data: updated };
    },
  });

  // 4. Assign incident
  server.post("/incidents/:id/assign", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Incidents"],
      summary: "Assign incident to user or unassign",
      body: AssignIncidentSchema,
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const actorId = request.authUser?.id;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof AssignIncidentSchema>;

      const updated = await incidentService.assignIncident(
        workspaceId,
        id,
        body.assignedToUserId,
        actorId,
        body.note
      );
      return { data: updated };
    },
  });

  // 5. Add timeline note
  server.post("/incidents/:id/notes", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Incidents"],
      summary: "Add investigation or resolution note to timeline",
      body: AddIncidentNoteSchema,
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const actorId = request.authUser?.id;
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof AddIncidentNoteSchema>;

      const noteEvent = await incidentService.addNote(
        workspaceId,
        id,
        body.note,
        actorId
      );
      return { data: noteEvent };
    },
  });

  // 6. Perform root cause analysis
  server.post("/incidents/:id/root-cause", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Incidents"],
      summary: "Run automated evidence-backed root cause analysis",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const { id } = request.params as { id: string };

      const analyzed = await incidentService.analyzeRootCause(workspaceId, id);
      return { data: analyzed };
    },
  });

  // 7. Simulate / trigger incident (for drills and integration tests)
  server.post("/incidents/simulate", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Incidents"],
      summary: "Simulate or report an incident for drills and testing",
      body: z.object({
        title: z.string().min(1),
        severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("HIGH"),
        category: z.enum([
          "SLO_BREACH",
          "WORKER_FAILURE",
          "QUEUE_SATURATION",
          "INTEGRATION_ERROR",
          "OUTBOX_BACKLOG",
          "REGIONAL_DEGRADATION",
        ]).default("INTEGRATION_ERROR"),
        sourceService: z.string().default("MANUAL_SIMULATION"),
        correlationKey: z.string().optional(),
        affectedWorkflows: z.array(z.string()).optional(),
        affectedRegions: z.array(z.string()).optional(),
        metadata: z.record(z.any()).optional(),
      }),
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const body = request.body as any;

      const correlationKey =
        body.correlationKey ||
        `sim_${workspaceId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const incident = await incidentService.reportIncident({
        workspaceId,
        title: body.title,
        severity: body.severity,
        category: body.category,
        sourceService: body.sourceService,
        correlationKey,
        affectedWorkflows: body.affectedWorkflows || [],
        affectedRegions: body.affectedRegions || [],
        metadata: body.metadata,
      });

      return { data: incident };
    },
  });
}
