import { prisma } from "@flowforge/database";
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentCategory,
  RemediationActionKey,
} from "@flowforge/shared";

export interface ReportIncidentInput {
  workspaceId: string;
  title: string;
  severity: IncidentSeverity;
  category: IncidentCategory;
  sourceService: string;
  correlationKey: string;
  rootCauseSummary?: string;
  candidateCauses?: any;
  suggestedAction?: RemediationActionKey | string;
  affectedWorkflows?: string[];
  affectedRegions?: string[];
  metadata?: any;
}

export class IncidentService {
  /**
   * Reports an operational incident with deterministic correlation and deduplication.
   */
  public async reportIncident(input: ReportIncidentInput) {
    const existingActive = await prisma.operationalIncident.findFirst({
      where: {
        workspaceId: input.workspaceId,
        correlationKey: input.correlationKey,
        status: { in: ["OPEN", "ACKNOWLEDGED", "INVESTIGATING", "MITIGATING"] },
      },
    });

    if (existingActive) {
      // Deduplicate: append timeline event and update timestamp
      await prisma.operationalIncidentTimelineEvent.create({
        data: {
          incidentId: existingActive.id,
          eventType: "ALERT_TRIGGERED",
          actorType: "SYSTEM",
          details: {
            deduplicated: true,
            title: input.title,
            severity: input.severity,
            sourceService: input.sourceService,
          },
        },
      });

      return await prisma.operationalIncident.update({
        where: { id: existingActive.id },
        data: {
          updatedAt: new Date(),
          metadata: input.metadata ? (input.metadata as any) : (existingActive.metadata as any),
        },
      });
    }

    const incident = await prisma.operationalIncident.create({
      data: {
        workspaceId: input.workspaceId,
        title: input.title,
        severity: input.severity,
        status: "OPEN",
        category: input.category,
        sourceService: input.sourceService,
        correlationKey: input.correlationKey,
        rootCauseSummary: input.rootCauseSummary || null,
        candidateCauses: input.candidateCauses ? (input.candidateCauses as any) : null,
        suggestedAction: input.suggestedAction || null,
        affectedWorkflows: input.affectedWorkflows || [],
        affectedRegions: input.affectedRegions || [],
        metadata: input.metadata ? (input.metadata as any) : null,
      },
    });

    await prisma.operationalIncidentTimelineEvent.create({
      data: {
        incidentId: incident.id,
        eventType: "ALERT_TRIGGERED",
        actorType: "SYSTEM",
        details: {
          initialTitle: input.title,
          severity: input.severity,
          sourceService: input.sourceService,
          correlationKey: input.correlationKey,
        },
      },
    });

    return incident;
  }

  /**
   * Lists operational incidents for a workspace with optional filters.
   */
  public async listIncidents(
    workspaceId: string,
    filters?: { status?: string; severity?: string; category?: string }
  ) {
    return await prisma.operationalIncident.findMany({
      where: {
        workspaceId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.severity ? { severity: filters.severity } : {}),
        ...(filters?.category ? { category: filters.category } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        timelineEvents: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        remediationOperations: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
  }

  /**
   * Retrieves single incident details including full timeline and remediations.
   */
  public async getIncident(workspaceId: string, incidentId: string) {
    const incident = await prisma.operationalIncident.findFirst({
      where: { id: incidentId, workspaceId },
      include: {
        timelineEvents: {
          orderBy: { createdAt: "asc" },
        },
        remediationOperations: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!incident) {
      throw new Error(`Incident '${incidentId}' not found in workspace '${workspaceId}'`);
    }

    return incident;
  }

  /**
   * Updates incident status along the incident management state machine.
   */
  public async updateStatus(
    workspaceId: string,
    incidentId: string,
    status: IncidentStatus,
    actorId?: string,
    note?: string
  ) {
    const incident = await this.getIncident(workspaceId, incidentId);

    if (incident.status === status) {
      return incident;
    }

    const updates: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === "ACKNOWLEDGED" && !incident.acknowledgedAt) {
      updates.acknowledgedAt = new Date();
    } else if (status === "RESOLVED") {
      updates.resolvedAt = new Date();
    } else if (status === "CLOSED") {
      updates.closedAt = new Date();
    }

    const updated = await prisma.operationalIncident.update({
      where: { id: incident.id },
      data: updates,
    });

    await prisma.operationalIncidentTimelineEvent.create({
      data: {
        incidentId: incident.id,
        eventType: "STATUS_CHANGED",
        actorId: actorId || null,
        actorType: actorId ? "USER" : "SYSTEM",
        details: {
          fromStatus: incident.status,
          toStatus: status,
          note: note || null,
        },
      },
    });

    return updated;
  }

  /**
   * Assigns an incident to a user.
   */
  public async assignIncident(
    workspaceId: string,
    incidentId: string,
    assignedToUserId: string | null,
    actorId?: string,
    note?: string
  ) {
    const incident = await this.getIncident(workspaceId, incidentId);

    const updated = await prisma.operationalIncident.update({
      where: { id: incident.id },
      data: {
        assignedToUserId,
        updatedAt: new Date(),
      },
    });

    await prisma.operationalIncidentTimelineEvent.create({
      data: {
        incidentId: incident.id,
        eventType: "STATUS_CHANGED",
        actorId: actorId || null,
        actorType: actorId ? "USER" : "SYSTEM",
        details: {
          action: "ASSIGNMENT",
          assignedToUserId,
          note: note || null,
        },
      },
    });

    return updated;
  }

  /**
   * Adds an operator or investigation note to the incident timeline.
   */
  public async addNote(
    workspaceId: string,
    incidentId: string,
    note: string,
    actorId?: string
  ) {
    const incident = await this.getIncident(workspaceId, incidentId);

    return await prisma.operationalIncidentTimelineEvent.create({
      data: {
        incidentId: incident.id,
        eventType: "NOTE_ADDED",
        actorId: actorId || null,
        actorType: actorId ? "USER" : "SYSTEM",
        details: {
          note,
        },
      },
    });
  }

  /**
   * Performs automated evidence-backed root cause analysis on an incident.
   */
  public async analyzeRootCause(workspaceId: string, incidentId: string) {
    const incident = await this.getIncident(workspaceId, incidentId);

    const candidateCauses: Array<{
      hypothesis: string;
      evidenceStrength: "HIGH" | "MEDIUM" | "LOW";
      supportingEvidence: string[];
    }> = [];

    let suggestedAction: RemediationActionKey = "RETRY_RETRYABLE_EXECUTION";
    let summary = `Automated analysis for incident '${incident.title}'`;

    // 1. Inspect recent failures for affected workflows
    if (incident.affectedWorkflows && incident.affectedWorkflows.length > 0) {
      const recentFailures = await prisma.workflowExecution.findMany({
        where: {
          workflowId: { in: incident.affectedWorkflows },
          status: "FAILED",
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          errorSummary: true,
          workflowId: true,
          createdAt: true,
        },
      });

      if (recentFailures.length > 0) {
        const errorSamples = recentFailures.map((f) => f.errorSummary || "Unknown execution failure");
        const hasRateLimit = errorSamples.some((e) => /rate limit|429|too many requests/i.test(e));
        const hasTimeout = errorSamples.some((e) => /timeout|timed out|deadline exceeded/i.test(e));

        if (hasRateLimit) {
          candidateCauses.push({
            hypothesis: "Upstream third-party integration rate limiting (HTTP 429)",
            evidenceStrength: "HIGH",
            supportingEvidence: errorSamples.slice(0, 3),
          });
          suggestedAction = "SCALE_CONCURRENCY_BACKPRESSURE";
          summary = `High frequency of rate limit errors detected across ${recentFailures.length} recent workflow executions.`;
        } else if (hasTimeout) {
          candidateCauses.push({
            hypothesis: "Integration partner network latency or step timeout",
            evidenceStrength: "HIGH",
            supportingEvidence: errorSamples.slice(0, 3),
          });
          suggestedAction = "RETRY_RETRYABLE_EXECUTION";
          summary = `Execution failures correlate with step timeout responses.`;
        } else {
          candidateCauses.push({
            hypothesis: "Transient execution failure or worker restart",
            evidenceStrength: "MEDIUM",
            supportingEvidence: errorSamples.slice(0, 3),
          });
          suggestedAction = "RETRY_RETRYABLE_EXECUTION";
          summary = `Detected ${recentFailures.length} execution failures in affected workflows.`;
        }
      }
    }

    // 2. Check transactional outbox dead-letters
    const deadLetters = await prisma.transactionalOutboxEvent.count({
      where: {
        workspaceId,
        status: "DEAD_LETTER",
      },
    });

    if (deadLetters > 0) {
      candidateCauses.push({
        hypothesis: `Outbox dead-letter delivery backlog (${deadLetters} events accumulated)`,
        evidenceStrength: "HIGH",
        supportingEvidence: [`${deadLetters} dead-letter events in transactional outbox`],
      });
      if (candidateCauses.length === 1) {
        suggestedAction = "REPLAY_FAILED_OUTBOX_EVENT";
        summary = `Outbox contains ${deadLetters} dead-letter events requiring replay.`;
      }
    }

    // 3. Fallback hypothesis if no specific evidence found
    if (candidateCauses.length === 0) {
      candidateCauses.push({
        hypothesis: "Elevated failure rate or latency variance exceeding configured SLO threshold",
        evidenceStrength: "MEDIUM",
        supportingEvidence: [`Category: ${incident.category}`, `Source: ${incident.sourceService}`],
      });
      summary = `Incident triggered by ${incident.sourceService} based on threshold breach.`;
    }

    const updated = await prisma.operationalIncident.update({
      where: { id: incident.id },
      data: {
        rootCauseSummary: summary,
        candidateCauses: candidateCauses as any,
        suggestedAction,
        updatedAt: new Date(),
      },
    });

    await prisma.operationalIncidentTimelineEvent.create({
      data: {
        incidentId: incident.id,
        eventType: "NOTE_ADDED",
        actorType: "SYSTEM",
        details: {
          action: "ROOT_CAUSE_ANALYSIS_PERFORMED",
          summary,
          suggestedAction,
          candidateCount: candidateCauses.length,
        },
      },
    });

    return updated;
  }
}

export const incidentService = new IncidentService();
