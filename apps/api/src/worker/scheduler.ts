import { prisma, ExecutionStatus } from "@flowforge/database";
import { workflowQueue } from "./queue.js";

export interface ScheduleOptions {
  workflowId: string;
  cronExpression: string;
  timezone?: string;
}

export class WorkflowScheduler {
  /**
   * Registers or updates a scheduled trigger for a workflow in both Redis (BullMQ repeatable job) and PostgreSQL.
   */
  async registerSchedule(options: ScheduleOptions) {
    const tz = options.timezone || "UTC";
    const schedulerKey = `sched_wf_${options.workflowId}`;

    // 1. Register or update Job Scheduler in BullMQ
    try {
      await workflowQueue.upsertJobScheduler(
        schedulerKey,
        {
          pattern: options.cronExpression,
          tz,
        },
        {
          name: `scheduled_trigger_${options.workflowId}`,
          data: {
            executionId: "", // Will be dynamically assigned on job execution
            workflowId: options.workflowId,
            triggerPayload: {
              triggerType: "SCHEDULE",
              cronExpression: options.cronExpression,
              timezone: tz,
              scheduledTime: new Date().toISOString(),
            },
            correlationId: `sched_${Date.now()}`,
          },
        }
      );
    } catch (err: any) {
      console.warn(`Could not upsert BullMQ job scheduler for ${options.workflowId}:`, err.message);
    }

    // 2. Persist record in PostgreSQL ScheduledTrigger
    const record = await prisma.scheduledTrigger.upsert({
      where: { id: schedulerKey },
      update: {
        cronExpression: options.cronExpression,
        timezone: tz,
        status: "ACTIVE",
        jobId: schedulerKey,
      },
      create: {
        id: schedulerKey,
        workflowId: options.workflowId,
        cronExpression: options.cronExpression,
        timezone: tz,
        status: "ACTIVE",
        jobId: schedulerKey,
      },
    });

    return record;
  }

  /**
   * Removes scheduled trigger from BullMQ and updates PostgreSQL status to PAUSED.
   */
  async removeSchedule(workflowId: string) {
    const schedulerKey = `sched_wf_${workflowId}`;

    try {
      await workflowQueue.removeJobScheduler(schedulerKey);
    } catch (err: any) {
      console.warn(`Could not remove BullMQ job scheduler for ${workflowId}:`, err.message);
    }

    await prisma.scheduledTrigger.updateMany({
      where: { workflowId },
      data: { status: "PAUSED" },
    });
  }

  /**
   * Synchronizes all active schedules from PostgreSQL into BullMQ upon worker / server startup.
   */
  async syncSchedulesOnStartup() {
    const activeSchedules = await prisma.scheduledTrigger.findMany({
      where: {
        status: "ACTIVE",
        workflow: {
          status: "ACTIVE",
        },
      },
    });

    console.log(`Syncing ${activeSchedules.length} active scheduled triggers to BullMQ...`);
    for (const sched of activeSchedules) {
      try {
        await this.registerSchedule({
          workflowId: sched.workflowId,
          cronExpression: sched.cronExpression,
          timezone: sched.timezone,
        });
      } catch (err: any) {
        console.error(`Failed to register schedule for workflow ${sched.workflowId}:`, err.message);
      }
    }
  }
}

export const scheduler = new WorkflowScheduler();
export const workflowScheduler = scheduler;
