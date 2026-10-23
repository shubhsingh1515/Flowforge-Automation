import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateCustomerSuccessTaskInput,
  UpdateCustomerSuccessTaskInput,
  CreateCustomerPlaybookDefinitionInput,
  CreateCustomerPlaybookVersionInput,
  TriggerCustomerPlaybookInput,
} from "@flowforge/shared";

export class CustomerPlaybookService {
  // ==========================================
  // 1. CUSTOMER SUCCESS TASKS
  // ==========================================

  /**
   * Creates a customer success task.
   */
  public async createTask(workspaceId: string, input: CreateCustomerSuccessTaskInput) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
    });
    if (!account) throw new HttpError(404, `Customer account '${input.customerAccountId}' not found.`);

    return prisma.customerSuccessTask.create({
      data: {
        workspaceId,
        customerAccountId: account.id,
        journeyInstanceId: input.journeyInstanceId,
        riskAssessmentId: input.riskAssessmentId,
        taskType: input.taskType,
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: "OPEN",
        assignedUserId: input.assignedUserId,
        assignedTeamId: input.assignedTeamId,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        evidence: input.evidence,
      },
    });
  }

  /**
   * Updates task status, assignment, or resolution notes.
   */
  public async updateTask(workspaceId: string, taskId: string, input: UpdateCustomerSuccessTaskInput) {
    const task = await prisma.customerSuccessTask.findFirst({
      where: { id: taskId, workspaceId },
    });
    if (!task) throw new HttpError(404, `Customer success task '${taskId}' not found.`);

    const data: any = {
      priority: input.priority,
      assignedUserId: input.assignedUserId,
      assignedTeamId: input.assignedTeamId,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      resolutionNotes: input.resolutionNotes,
    };

    if (input.status) {
      data.status = input.status;
      if (input.status === "RESOLVED" || input.status === "CANCELLED") {
        data.resolvedAt = new Date();
      }
    }

    return prisma.customerSuccessTask.update({
      where: { id: task.id },
      data,
    });
  }

  /**
   * Lists customer success tasks.
   */
  public async listTasks(
    workspaceId: string,
    filters?: { customerAccountId?: string; status?: string; taskType?: string; priority?: string }
  ) {
    const where: any = { workspaceId };
    if (filters?.customerAccountId) where.customerAccountId = filters.customerAccountId;
    if (filters?.status) where.status = filters.status;
    if (filters?.taskType) where.taskType = filters.taskType;
    if (filters?.priority) where.priority = filters.priority;

    return prisma.customerSuccessTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customerAccount: { select: { id: true, name: true, slug: true, tier: true } },
      },
    });
  }

  // ==========================================
  // 2. PLAYBOOKS & EXECUTION
  // ==========================================

  /**
   * Creates a playbook definition.
   */
  public async createPlaybookDefinition(workspaceId: string, input: CreateCustomerPlaybookDefinitionInput) {
    const existing = await prisma.customerPlaybookDefinition.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new HttpError(409, `Playbook with slug '${input.slug}' already exists.`);
    }

    return prisma.customerPlaybookDefinition.create({
      data: {
        workspaceId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        triggerType: input.triggerType,
      },
    });
  }

  /**
   * Creates a playbook version.
   */
  public async createPlaybookVersion(
    workspaceId: string,
    definitionId: string,
    input: CreateCustomerPlaybookVersionInput
  ) {
    const definition = await prisma.customerPlaybookDefinition.findFirst({
      where: { id: definitionId, workspaceId },
    });
    if (!definition) throw new HttpError(404, `Playbook definition '${definitionId}' not found.`);

    const highestVersion = await prisma.customerPlaybookVersion.findFirst({
      where: { playbookDefinitionId: definition.id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });

    const nextVersionNumber = (highestVersion?.versionNumber || 0) + 1;

    return prisma.customerPlaybookVersion.create({
      data: {
        playbookDefinitionId: definition.id,
        versionNumber: nextVersionNumber,
        isPublished: false,
        triggerCondition: input.triggerCondition,
        steps: input.steps,
        loopPreventionWindowHours: input.loopPreventionWindowHours,
        maxRunsPerDay: input.maxRunsPerDay,
      },
    });
  }

  /**
   * Publishes an immutable playbook version.
   */
  public async publishPlaybookVersion(workspaceId: string, definitionId: string, versionNumber: number) {
    const version = await prisma.customerPlaybookVersion.findFirst({
      where: {
        playbookDefinitionId: definitionId,
        versionNumber,
        playbookDefinition: { workspaceId },
      },
    });
    if (!version) throw new HttpError(404, `Playbook version ${versionNumber} not found.`);

    const updated = await prisma.customerPlaybookVersion.update({
      where: { id: version.id },
      data: { isPublished: true },
    });

    await prisma.customerPlaybookDefinition.update({
      where: { id: definitionId },
      data: { publishedVersionId: version.id },
    });

    return updated;
  }

  /**
   * Triggers a playbook run with loop prevention and bounded execution.
   */
  public async triggerPlaybook(workspaceId: string, playbookDefinitionId: string, input: TriggerCustomerPlaybookInput) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
    });
    if (!account) throw new HttpError(404, `Customer account '${input.customerAccountId}' not found.`);

    const definition = await prisma.customerPlaybookDefinition.findFirst({
      where: { id: playbookDefinitionId, workspaceId },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });
    if (!definition) throw new HttpError(404, `Playbook definition '${playbookDefinitionId}' not found.`);

    const targetVersion =
      definition.versions.find((v) => v.id === definition.publishedVersionId) ||
      definition.versions[0];

    if (!targetVersion) {
      throw new HttpError(400, "Playbook has no versions configured.");
    }

    // Loop prevention: check if this playbook ran for this account within loopPreventionWindowHours
    const windowStart = new Date(Date.now() - targetVersion.loopPreventionWindowHours * 3600 * 1000);
    const recentRun = await prisma.customerPlaybookRun.findFirst({
      where: {
        playbookDefinitionId: definition.id,
        customerAccountId: account.id,
        startedAt: { gte: windowStart },
      },
    });

    if (recentRun) {
      throw new HttpError(
        429,
        `Playbook execution throttled: Account '${account.slug}' ran playbook '${definition.slug}' within the last ${targetVersion.loopPreventionWindowHours} hours (Run ID: ${recentRun.id}).`
      );
    }

    // Initialize run record
    const run = await prisma.customerPlaybookRun.create({
      data: {
        workspaceId,
        playbookDefinitionId: definition.id,
        playbookVersionId: targetVersion.id,
        customerAccountId: account.id,
        triggerEventId: input.triggerEventId,
        status: "RUNNING",
        currentStepIndex: 0,
        stepResults: [],
      },
    });

    const steps = (targetVersion.steps as any[]) || [];
    const stepResults: any[] = [];

    // Execute steps deterministically
    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        let result: any = { stepId: step.stepId, type: step.type, executedAt: new Date().toISOString() };

        if (step.type === "CREATE_TASK") {
          const task = await prisma.customerSuccessTask.create({
            data: {
              workspaceId,
              customerAccountId: account.id,
              taskType: step.config?.taskType || "AT_RISK_REVIEW",
              title: step.config?.title || `Playbook Action: ${definition.name}`,
              description: step.config?.description || `Auto-created by playbook '${definition.name}'`,
              priority: step.config?.priority || "HIGH",
              status: "OPEN",
            },
          });
          result.taskId = task.id;
        } else if (step.type === "START_WORKFLOW") {
          // Verify workflow in workspace
          const wf = await prisma.workflow.findFirst({
            where: { id: step.config?.workflowId, workspaceId },
          });
          if (wf) {
            const execution = await prisma.workflowExecution.create({
              data: {
                workflowId: wf.id,
                status: "PENDING",
                triggerEvent: { playbookRunId: run.id, customerAccountId: account.id },
              },
            });
            result.executionId = execution.id;
          } else {
            result.skipped = true;
            result.reason = "Workflow not found in workspace";
          }
        } else if (step.type === "LOG_AUDIT") {
          result.logged = true;
          result.message = step.config?.message || "Audit checkpoint passed";
        }

        stepResults.push(result);
      }

      // Mark run as SUCCEEDED
      return prisma.customerPlaybookRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          currentStepIndex: steps.length,
          stepResults,
          completedAt: new Date(),
        },
      });
    } catch (err: any) {
      return prisma.customerPlaybookRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          executionError: err.message || "Playbook step execution failed",
          stepResults,
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Lists playbook runs.
   */
  public async listPlaybookRuns(workspaceId: string, playbookDefinitionId?: string) {
    const where: any = { workspaceId };
    if (playbookDefinitionId) where.playbookDefinitionId = playbookDefinitionId;

    const runs = await prisma.customerPlaybookRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      include: {
        playbookDefinition: { select: { name: true, slug: true } },
      },
    });

    const accountIds = Array.from(new Set(runs.map((r) => r.customerAccountId)));
    const accounts = await prisma.customerAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true, slug: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    return runs.map((r) => ({
      ...r,
      customerAccount: accountMap.get(r.customerAccountId) || null,
    }));
  }
}

export const customerPlaybookService = new CustomerPlaybookService();
