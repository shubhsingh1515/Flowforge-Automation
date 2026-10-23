import { prisma } from "@flowforge/database";
import {
  CreateProcessSlaPolicyInput,
  ProcessSlaEvaluationResult,
  ProcessSlaStatus,
} from "@flowforge/shared";
import { incidentService } from "./incidentService.js";

export class ProcessSlaService {
  /**
   * Creates or updates the SLA policy for a business process definition
   */
  async createOrUpdatePolicy(workspaceId: string, input: CreateProcessSlaPolicyInput) {
    const processDef = await prisma.businessProcessDefinition.findFirst({
      where: { id: input.processDefinitionId, workspaceId },
    });

    if (!processDef) {
      throw new Error("Business process definition not found.");
    }

    const existingPolicy = await prisma.processSlaPolicy.findFirst({
      where: { processDefinitionId: input.processDefinitionId, workspaceId },
    });

    if (existingPolicy) {
      return await prisma.processSlaPolicy.update({
        where: { id: existingPolicy.id },
        data: {
          name: input.name,
          targetDurationMs: input.targetDurationMs,
          warningThresholdMs: input.warningThresholdMs,
          maxApprovalWaitMs: input.maxApprovalWaitMs,
          status: "ACTIVE",
          updatedAt: new Date(),
        },
      });
    }

    return await prisma.processSlaPolicy.create({
      data: {
        workspaceId,
        processDefinitionId: input.processDefinitionId,
        name: input.name,
        targetDurationMs: input.targetDurationMs,
        warningThresholdMs: input.warningThresholdMs,
        maxApprovalWaitMs: input.maxApprovalWaitMs,
        status: "ACTIVE",
      },
    });
  }

  /**
   * Retrieves active SLA policy for a business process
   */
  async getPolicy(workspaceId: string, processDefinitionId: string) {
    return await prisma.processSlaPolicy.findFirst({
      where: {
        workspaceId,
        processDefinitionId,
        status: "ACTIVE",
      },
    });
  }

  /**
   * Evaluates end-to-end SLA for a process instance
   */
  async evaluateInstance(instanceId: string): Promise<ProcessSlaEvaluationResult> {
    const instance = await prisma.businessProcessInstance.findUnique({
      where: { id: instanceId },
      include: {
        processDefinition: {
          include: {
            slaPolicies: {
              where: { status: "ACTIVE" },
              take: 1,
            },
          },
        },
      },
    });

    if (!instance) {
      throw new Error(`Process instance ${instanceId} not found.`);
    }

    const policy = instance.processDefinition.slaPolicies[0];
    const now = new Date();
    const endTime = instance.completedAt ? new Date(instance.completedAt) : now;
    const elapsedMs = Math.max(0, endTime.getTime() - new Date(instance.startedAt).getTime());

    if (!policy) {
      return {
        instanceId: instance.id,
        correlationKey: instance.correlationKey,
        processDefinitionId: instance.processDefinitionId,
        processName: instance.processDefinition.name,
        status: "INSUFFICIENT_DATA",
        elapsedMs,
        targetMs: 0,
        isBreached: false,
        isAtRisk: false,
      };
    }

    let status: ProcessSlaStatus = "MET";
    let isBreached = false;
    let isAtRisk = false;

    if (elapsedMs > policy.targetDurationMs) {
      status = "BREACHED";
      isBreached = true;
    } else if (elapsedMs > policy.warningThresholdMs) {
      status = "AT_RISK";
      isAtRisk = true;
    }

    // If instance is in progress or waiting, update status if at risk
    if (["IN_PROGRESS", "WAITING", "CREATED"].includes(instance.status)) {
      if (isBreached || isAtRisk) {
        await prisma.businessProcessInstance.update({
          where: { id: instance.id },
          data: { status: "AT_RISK" },
        });
      }
    }

    let incidentCreated = false;

    // Report incident if breached and not in cooldown
    if (isBreached) {
      const cooldownActive = policy.cooldownUntil && new Date(policy.cooldownUntil) > now;
      if (!cooldownActive) {
        try {
          await incidentService.reportIncident({
            workspaceId: instance.workspaceId,
            title: `SLA Breached: ${instance.processDefinition.name} [${instance.correlationKey}]`,
            severity: "HIGH",
            category: "SLO_BREACH",
            sourceService: "ProcessSlaService",
            correlationKey: `sla_breach_${instance.processDefinitionId}_${instance.correlationKey}`,
            rootCauseSummary: `Instance elapsed time ${elapsedMs}ms exceeded target SLA of ${policy.targetDurationMs}ms`,
            candidateCauses: [
              "Approval stage delay",
              "Slow downstream integration",
              "Execution retry storm",
            ],
            suggestedAction: "DRAIN_UNHEALTHY_WORKERS",
            metadata: {
              instanceId: instance.id,
              correlationKey: instance.correlationKey,
              elapsedMs,
              targetDurationMs: policy.targetDurationMs,
            },
          });
          incidentCreated = true;

          // Set 15-minute cooldown on the policy to prevent alert storms
          await prisma.processSlaPolicy.update({
            where: { id: policy.id },
            data: { cooldownUntil: new Date(Date.now() + 15 * 60 * 1000) },
          });
        } catch (_err) {
          // Non-blocking incident logging
        }
      }
    }

    // Persist SLA evaluation log
    await prisma.processSlaEvaluation.create({
      data: {
        instanceId: instance.id,
        workspaceId: instance.workspaceId,
        policyId: policy.id,
        status,
        elapsedMs,
        targetMs: policy.targetDurationMs,
        details: {
          warningThresholdMs: policy.warningThresholdMs,
          isBreached,
          isAtRisk,
          incidentCreated,
        },
      },
    });

    return {
      instanceId: instance.id,
      correlationKey: instance.correlationKey,
      processDefinitionId: instance.processDefinitionId,
      processName: instance.processDefinition.name,
      status,
      elapsedMs,
      targetMs: policy.targetDurationMs,
      isBreached,
      isAtRisk,
      incidentCreated,
    };
  }
}

export const processSlaService = new ProcessSlaService();
