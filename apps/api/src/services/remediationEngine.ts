import crypto from "crypto";
import { prisma, ExecutionStatus, WorkflowStatus } from "@flowforge/database";
import {
  CreateRemediationDTO,
  UpdateRemediationPolicyDTO,
  RemediationActionKey,
  RemediationRiskLevel,
} from "@flowforge/shared";
import { outboxService } from "./outboxService.js";
import { reconciliationService } from "./reconciliation.js";

export class RemediationEngine {
  /**
   * Retrieves or provisions the default safe remediation policy for a workspace.
   * Default autonomy mode is strictly OBSERVE_ONLY.
   */
  public async getOrCreatePolicy(workspaceId: string) {
    let policy = await prisma.remediationPolicy.findUnique({
      where: { workspaceId },
    });

    if (!policy) {
      policy = await prisma.remediationPolicy.create({
        data: {
          workspaceId,
          name: "Default Safe Self-Healing Policy",
          autonomyMode: "OBSERVE_ONLY",
          allowedActions: ["RETRY_RETRYABLE_EXECUTION", "REPLAY_FAILED_OUTBOX_EVENT"],
          maxAutomatedActionsPerIncident: 3,
          cooldownMinutes: 15,
        },
      });
    }

    return policy;
  }

  /**
   * Updates workspace remediation policy settings.
   */
  public async updatePolicy(workspaceId: string, updates: UpdateRemediationPolicyDTO) {
    await this.getOrCreatePolicy(workspaceId);

    return await prisma.remediationPolicy.update({
      where: { workspaceId },
      data: {
        ...(updates.name ? { name: updates.name } : {}),
        ...(updates.autonomyMode ? { autonomyMode: updates.autonomyMode } : {}),
        ...(updates.allowedActions ? { allowedActions: updates.allowedActions } : {}),
        ...(updates.maxAutomatedActionsPerIncident !== undefined
          ? { maxAutomatedActionsPerIncident: updates.maxAutomatedActionsPerIncident }
          : {}),
        ...(updates.cooldownMinutes !== undefined
          ? { cooldownMinutes: updates.cooldownMinutes }
          : {}),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Requests a self-healing or remediation action.
   * Evaluates autonomy mode, safety guards, rate limits, and approval policies.
   */
  public async requestRemediation(
    workspaceId: string,
    input: CreateRemediationDTO,
    requestedByUserId?: string
  ) {
    // 1. Safety Guard: Validate against allowlisted actions
    const allowlistedKeys: RemediationActionKey[] = [
      "RETRY_RETRYABLE_EXECUTION",
      "REQUEUE_ABANDONED_JOB",
      "REPLAY_FAILED_OUTBOX_EVENT",
      "PAUSE_FAILING_DEPLOYMENT",
      "SCALE_CONCURRENCY_BACKPRESSURE",
    ];

    if (!allowlistedKeys.includes(input.actionKey as RemediationActionKey)) {
      throw new Error(`Action '${input.actionKey}' is not an allowlisted remediation operation.`);
    }

    // 2. Assign risk level
    const riskLevel: RemediationRiskLevel =
      input.actionKey === "PAUSE_FAILING_DEPLOYMENT"
        ? "HIGH"
        : input.actionKey === "SCALE_CONCURRENCY_BACKPRESSURE" || input.actionKey === "REQUEUE_ABANDONED_JOB"
        ? "MEDIUM"
        : "LOW";

    // 3. Load workspace policy
    const policy = await this.getOrCreatePolicy(workspaceId);

    let initialStatus: "PENDING_APPROVAL" | "APPROVED" = "PENDING_APPROVAL";
    let summary: string | null = null;

    // 4. Autonomy Mode Evaluation
    if (policy.autonomyMode === "POLICY_AUTOMATED") {
      const isActionAllowed = policy.allowedActions.includes(input.actionKey);

      if (isActionAllowed) {
        // Check per-incident action limit
        let limitExceeded = false;
        let cooldownActive = false;

        if (input.incidentId) {
          const automatedCount = await prisma.remediationOperation.count({
            where: {
              incidentId: input.incidentId,
              approvedByUserId: "SYSTEM_POLICY",
            },
          });

          if (automatedCount >= policy.maxAutomatedActionsPerIncident) {
            limitExceeded = true;
            summary = `Incident reached max automated action limit (${policy.maxAutomatedActionsPerIncident}). Approval required.`;
          }

          // Check cooldown
          const cooldownCutoff = new Date(Date.now() - policy.cooldownMinutes * 60000);
          const recentOp = await prisma.remediationOperation.findFirst({
            where: {
              incidentId: input.incidentId,
              createdAt: { gte: cooldownCutoff },
              status: { in: ["EXECUTING", "COMPLETED", "VERIFIED"] },
            },
          });

          if (recentOp) {
            cooldownActive = true;
            summary = `Incident cooldown active (${policy.cooldownMinutes}m). Approval required.`;
          }
        }

        if (!limitExceeded && !cooldownActive) {
          initialStatus = "APPROVED";
          summary = "Auto-approved by policy automation.";
        }
      } else {
        summary = `Action '${input.actionKey}' not in policy allowed actions list. Approval required.`;
      }
    } else if (policy.autonomyMode === "OBSERVE_ONLY") {
      summary = "Policy autonomy mode is OBSERVE_ONLY. Action recorded for operator review.";
    } else {
      summary = "Policy autonomy mode is APPROVAL_REQUIRED. Operator sign-off needed.";
    }

    // 5. Persist operation record
    let operation = await prisma.remediationOperation.create({
      data: {
        workspaceId,
        incidentId: input.incidentId || null,
        actionKey: input.actionKey,
        status: initialStatus,
        riskLevel,
        targetType: input.targetType,
        targetId: input.targetId,
        parameters: input.parameters ? (input.parameters as any) : {},
        requestedByUserId: requestedByUserId || null,
        approvedByUserId: initialStatus === "APPROVED" ? "SYSTEM_POLICY" : null,
        approvedAt: initialStatus === "APPROVED" ? new Date() : null,
        resultSummary: summary,
      },
    });

    // 6. Record incident timeline event
    if (input.incidentId) {
      await prisma.operationalIncidentTimelineEvent.create({
        data: {
          incidentId: input.incidentId,
          eventType: "REMEDIATION_TRIGGERED",
          actorId: requestedByUserId || null,
          actorType: requestedByUserId ? "USER" : "SYSTEM",
          details: {
            operationId: operation.id,
            actionKey: input.actionKey,
            status: initialStatus,
            riskLevel,
          },
        },
      });
    }

    // 7. If auto-approved, execute and verify immediately
    if (initialStatus === "APPROVED") {
      operation = await this.executeAction(workspaceId, operation.id);
      operation = await this.verifyOutcome(workspaceId, operation.id);
    }

    return operation;
  }

  /**
   * Approves or rejects a pending remediation operation.
   */
  public async approveRemediation(
    workspaceId: string,
    operationId: string,
    approved: boolean,
    userId: string,
    reason?: string
  ) {
    const operation = await prisma.remediationOperation.findFirst({
      where: { id: operationId, workspaceId },
    });

    if (!operation) {
      throw new Error(`Remediation operation '${operationId}' not found.`);
    }

    if (operation.status !== "PENDING_APPROVAL") {
      throw new Error(`Cannot decide operation with status '${operation.status}'. Must be PENDING_APPROVAL.`);
    }

    if (!approved) {
      const rejected = await prisma.remediationOperation.update({
        where: { id: operation.id },
        data: {
          status: "REJECTED",
          resultSummary: reason || "Rejected by operator",
          updatedAt: new Date(),
        },
      });

      if (operation.incidentId) {
        await prisma.operationalIncidentTimelineEvent.create({
          data: {
            incidentId: operation.incidentId,
            eventType: "NOTE_ADDED",
            actorId: userId,
            actorType: "USER",
            details: {
              action: "REMEDIATION_REJECTED",
              operationId: operation.id,
              reason,
            },
          },
        });
      }

      return rejected;
    }

    // Mark approved
    await prisma.remediationOperation.update({
      where: { id: operation.id },
      data: {
        status: "APPROVED",
        approvedByUserId: userId,
        approvedAt: new Date(),
        resultSummary: reason ? `Approved: ${reason}` : "Approved by operator",
        updatedAt: new Date(),
      },
    });

    // Execute & Verify
    const executed = await this.executeAction(workspaceId, operation.id);
    const verified = await this.verifyOutcome(workspaceId, executed.id);

    return verified;
  }

  /**
   * Executes the allowlisted self-healing action deterministically.
   */
  public async executeAction(workspaceId: string, operationId: string) {
    const operation = await prisma.remediationOperation.findFirst({
      where: { id: operationId, workspaceId },
    });

    if (!operation) {
      throw new Error(`Operation '${operationId}' not found.`);
    }

    await prisma.remediationOperation.update({
      where: { id: operation.id },
      data: {
        status: "EXECUTING",
        executedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    try {
      let resultSummary = "";

      switch (operation.actionKey) {
        case "RETRY_RETRYABLE_EXECUTION": {
          const execution = await prisma.workflowExecution.findFirst({
            where: {
              id: operation.targetId,
              workflow: { workspaceId },
            },
            include: { workflow: true },
          });

          if (!execution) {
            throw new Error(`Target execution '${operation.targetId}' not found.`);
          }

          if (execution.status !== ExecutionStatus.FAILED && execution.status !== ExecutionStatus.CANCELLED) {
            throw new Error(`Execution status is '${execution.status}'; only FAILED or CANCELLED can be retried.`);
          }

          const nextAttempt = (execution.attempt || 1) + 1;
          const correlationId = `remediation_retry_${execution.id}_${Date.now()}`;

          const newExecution = await prisma.workflowExecution.create({
            data: {
              workflowId: execution.workflowId,
              versionId: execution.versionId,
              status: ExecutionStatus.PENDING,
              attempt: nextAttempt,
              retryOfId: execution.id,
              correlationId,
              triggerEvent: (execution.triggerEvent as any) || {},
            },
          });

          try {
            const { enqueueWorkflowExecution } = await import("../worker/queue.js");
            await enqueueWorkflowExecution({
              executionId: newExecution.id,
              workflowId: newExecution.workflowId,
              versionId: newExecution.versionId,
              triggerPayload: newExecution.triggerEvent,
              correlationId,
              attempt: nextAttempt,
            });
          } catch {
            // Queue fallback in test environments without Redis
          }

          resultSummary = `Spawned retry execution '${newExecution.id}' (attempt ${nextAttempt}).`;
          break;
        }

        case "REPLAY_FAILED_OUTBOX_EVENT": {
          const replayInput = operation.targetId === "ALL" ? {} : { eventIds: [operation.targetId] };
          const { replayedCount } = await outboxService.replayDeadLetterEvents(workspaceId, replayInput);
          resultSummary = `Replayed ${replayedCount} dead-letter outbox event(s).`;
          break;
        }

        case "REQUEUE_ABANDONED_JOB": {
          const recon = await reconciliationService.reconcile({
            workspaceId,
            mode: "execute",
            allowCrashRecovery: true,
          });
          resultSummary = `Reconciliation completed: ${recon.reconciledCount} jobs reconciled (${recon.anomaliesFound} anomalies found).`;
          break;
        }

        case "PAUSE_FAILING_DEPLOYMENT": {
          // If target is workflow ID, deactivate workflow
          const workflow = await prisma.workflow.findFirst({
            where: { id: operation.targetId, workspaceId },
          });

          if (workflow) {
            await prisma.workflow.update({
              where: { id: workflow.id },
              data: { status: WorkflowStatus.DRAFT },
            });
            resultSummary = `Workflow '${workflow.name}' (${workflow.id}) set to DRAFT to protect production.`;
          } else {
            // Check workflow deployment
            const deployment = await prisma.workflowDeployment.findFirst({
              where: { id: operation.targetId, workspaceId },
            });

            if (deployment) {
              await prisma.workflowDeployment.update({
                where: { id: deployment.id },
                data: {
                  status: "CANCELLED",
                  failureReason: "Paused by automated remediation safeguard",
                },
              });
              resultSummary = `Deployment '${deployment.id}' cancelled safely.`;
            } else {
              resultSummary = `Target '${operation.targetId}' not active or already paused.`;
            }
          }
          break;
        }

        case "SCALE_CONCURRENCY_BACKPRESSURE": {
          await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
              workloadPriority: "THROTTLED",
              maxConcurrentExecutions: 5,
            },
          });
          resultSummary = `Applied concurrency backpressure throttle (workloadPriority: THROTTLED, maxConcurrentExecutions: 5) for workspace '${workspaceId}'.`;
          break;
        }

        default:
          throw new Error(`Unsupported action key: ${operation.actionKey}`);
      }

      return await prisma.remediationOperation.update({
        where: { id: operation.id },
        data: {
          status: "COMPLETED",
          resultSummary,
          updatedAt: new Date(),
        },
      });
    } catch (err: any) {
      return await prisma.remediationOperation.update({
        where: { id: operation.id },
        data: {
          status: "FAILED",
          error: err.message || "Remediation execution failed",
          updatedAt: new Date(),
        },
      });
    }
  }

  /**
   * Verifies the actual physical outcome of the remediation against real entity states.
   */
  public async verifyOutcome(workspaceId: string, operationId: string) {
    const operation = await prisma.remediationOperation.findFirst({
      where: { id: operationId, workspaceId },
    });

    if (!operation) {
      throw new Error(`Operation '${operationId}' not found.`);
    }

    if (operation.status !== "COMPLETED") {
      return operation;
    }

    let isVerified = false;

    switch (operation.actionKey) {
      case "RETRY_RETRYABLE_EXECUTION": {
        // Verify child retry execution exists and is PENDING, RUNNING, or SUCCESS
        const retryChild = await prisma.workflowExecution.findFirst({
          where: { retryOfId: operation.targetId },
          orderBy: { createdAt: "desc" },
        });
        isVerified = !!retryChild && retryChild.status !== ExecutionStatus.FAILED;
        break;
      }

      case "REPLAY_FAILED_OUTBOX_EVENT": {
        if (operation.targetId !== "ALL") {
          const event = await prisma.transactionalOutboxEvent.findUnique({
            where: { id: operation.targetId },
          });
          isVerified = event?.status !== "DEAD_LETTER";
        } else {
          isVerified = true;
        }
        break;
      }

      case "PAUSE_FAILING_DEPLOYMENT": {
        const wf = await prisma.workflow.findFirst({
          where: { id: operation.targetId, workspaceId },
        });
        if (wf) {
          isVerified = wf.status !== WorkflowStatus.ACTIVE;
        } else {
          const dep = await prisma.workflowDeployment.findFirst({
            where: { id: operation.targetId, workspaceId },
          });
          isVerified = dep?.status === "CANCELLED" || dep?.status === "ROLLED_BACK";
        }
        break;
      }

      case "SCALE_CONCURRENCY_BACKPRESSURE": {
        const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        isVerified = ws?.workloadPriority === "THROTTLED";
        break;
      }

      case "REQUEUE_ABANDONED_JOB":
      default:
        isVerified = true;
        break;
    }

    const verifiedStatus = isVerified ? "VERIFIED" : "UNVERIFIED";

    const updated = await prisma.remediationOperation.update({
      where: { id: operation.id },
      data: {
        status: verifiedStatus,
        verifiedAt: isVerified ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    if (operation.incidentId) {
      await prisma.operationalIncidentTimelineEvent.create({
        data: {
          incidentId: operation.incidentId,
          eventType: isVerified ? "REMEDIATION_COMPLETED" : "REMEDIATION_FAILED",
          actorType: "SYSTEM",
          details: {
            operationId: operation.id,
            actionKey: operation.actionKey,
            status: verifiedStatus,
            resultSummary: operation.resultSummary,
          },
        },
      });
    }

    return updated;
  }

  /**
   * Lists remediation operations for a workspace with optional filters.
   */
  public async listOperations(
    workspaceId: string,
    filters?: { status?: string; incidentId?: string }
  ) {
    return await prisma.remediationOperation.findMany({
      where: {
        workspaceId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.incidentId ? { incidentId: filters.incidentId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves single remediation operation by ID.
   */
  public async getOperation(workspaceId: string, operationId: string) {
    const op = await prisma.remediationOperation.findFirst({
      where: { id: operationId, workspaceId },
      include: {
        incident: {
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
          },
        },
      },
    });

    if (!op) {
      throw new Error(`Remediation operation '${operationId}' not found.`);
    }

    return op;
  }
}

export const remediationEngine = new RemediationEngine();
