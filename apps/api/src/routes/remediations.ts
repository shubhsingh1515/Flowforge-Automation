import { FastifyInstance } from "fastify";
import { authenticateRequest } from "../plugins/auth.js";
import {
  UpdateRemediationPolicySchema,
  CreateRemediationSchema,
  ApproveRemediationSchema,
} from "@flowforge/shared";
import { remediationEngine } from "../services/remediationEngine.js";
import { z } from "zod";

export async function remediationRoutes(server: FastifyInstance) {
  // 1. Get workspace remediation policy
  server.get("/remediation/policy", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "Get self-healing remediation policy for workspace",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const policy = await remediationEngine.getOrCreatePolicy(workspaceId);
      return { data: policy };
    },
  });

  server.get("/workspaces/:workspaceId/remediation/policy", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "Get self-healing remediation policy for specific workspace",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const policy = await remediationEngine.getOrCreatePolicy(workspaceId);
      return { data: policy };
    },
  });

  // 2. Update workspace remediation policy
  server.put("/remediation/policy", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "Update self-healing remediation policy for workspace",
      body: UpdateRemediationPolicySchema,
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const body = request.body as z.infer<typeof UpdateRemediationPolicySchema>;
      const updated = await remediationEngine.updatePolicy(workspaceId, body);
      return { data: updated };
    },
  });

  server.put("/workspaces/:workspaceId/remediation/policy", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "Update self-healing remediation policy for specific workspace",
      body: UpdateRemediationPolicySchema,
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const body = request.body as z.infer<typeof UpdateRemediationPolicySchema>;
      const updated = await remediationEngine.updatePolicy(workspaceId, body);
      return { data: updated };
    },
  });

  // 3. List remediation operations
  server.get("/remediation/operations", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "List remediation operations",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const query = request.query as { status?: string; incidentId?: string };
      const operations = await remediationEngine.listOperations(workspaceId, query);
      return { data: operations };
    },
  });

  server.get("/workspaces/:workspaceId/remediation/operations", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "List remediation operations for specific workspace",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const query = request.query as { status?: string; incidentId?: string };
      const operations = await remediationEngine.listOperations(workspaceId, query);
      return { data: operations };
    },
  });

  // 4. Get remediation operation by ID
  server.get("/remediation/operations/:id", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "Get remediation operation details",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const { id } = request.params as { id: string };
      const operation = await remediationEngine.getOperation(workspaceId, id);
      return { data: operation };
    },
  });

  // 5. Request a remediation operation
  server.post("/remediation/operations", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "Request a self-healing remediation operation",
      body: CreateRemediationSchema,
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const userId = request.authUser?.id;
      const body = request.body as z.infer<typeof CreateRemediationSchema>;

      const operation = await remediationEngine.requestRemediation(
        workspaceId,
        body,
        userId
      );
      return { data: operation };
    },
  });

  server.post("/workspaces/:workspaceId/remediation/operations", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "Request a self-healing remediation operation for specific workspace",
      body: CreateRemediationSchema,
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const userId = request.authUser?.id;
      const body = request.body as z.infer<typeof CreateRemediationSchema>;

      const operation = await remediationEngine.requestRemediation(
        workspaceId,
        body,
        userId
      );
      return { data: operation };
    },
  });

  // 6. Approve or Reject a pending remediation operation
  server.post("/remediation/operations/:id/approve", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "Approve or reject a pending remediation operation",
      body: ApproveRemediationSchema,
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const userId = request.authUser?.id || "OPERATOR";
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof ApproveRemediationSchema>;

      const operation = await remediationEngine.approveRemediation(
        workspaceId,
        id,
        body.approved,
        userId,
        body.reason
      );
      return { data: operation };
    },
  });

  // 7. Verify remediation outcome
  server.post("/remediation/operations/:id/verify", {
    preHandler: [authenticateRequest],
    schema: {
      tags: ["Observability 2.0 - Remediation"],
      summary: "Verify real physical outcome of a completed remediation operation",
    },
    handler: async (request) => {
      const workspaceId =
        (request.params as any)?.workspaceId || request.authUser!.workspaceId;
      const { id } = request.params as { id: string };

      const verified = await remediationEngine.verifyOutcome(workspaceId, id);
      return { data: verified };
    },
  });
}
