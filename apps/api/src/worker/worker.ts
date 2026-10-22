import { Worker, Job } from "bullmq";
import { QUEUE_NAME, redisConnection, WorkflowJobData } from "./queue.js";
import { runWorkflowExecution } from "../engine/runner.js";
import { prisma, ExecutionStatus } from "@flowforge/database";

let workerInstance: Worker<WorkflowJobData> | null = null;

export function createWorkflowWorker(concurrency = 5): Worker<WorkflowJobData> {
  const worker = new Worker<WorkflowJobData>(
    QUEUE_NAME,
    async (job: Job<WorkflowJobData>) => {
      let { executionId, workflowId, versionId, triggerPayload, correlationId, attempt } = job.data;

      // If scheduled repeatable job, create execution record if not present
      if (!executionId) {
        const workflow = await prisma.workflow.findUnique({
          where: { id: workflowId },
          include: { versions: { orderBy: { version: "desc" }, take: 1 } },
        });

        if (!workflow || workflow.status !== "ACTIVE") {
          console.log(`Skipping scheduled execution for inactive/deleted workflow: ${workflowId}`);
          return;
        }

        const execRecord = await prisma.workflowExecution.create({
          data: {
            workflowId,
            versionId: workflow.versions[0]?.id,
            status: ExecutionStatus.PENDING,
            triggerEvent: triggerPayload || {},
            correlationId: correlationId || `sched_${Date.now()}`,
            attempt: 1,
            maxAttempts: 3,
          },
        });
        executionId = execRecord.id;
        versionId = execRecord.versionId;
      }

      console.log(
        JSON.stringify({
          level: "info",
          msg: "Worker processing execution job",
          jobId: job.id,
          executionId,
          workflowId,
          correlationId,
          attempt: attempt || job.attemptsMade + 1,
          timestamp: new Date().toISOString(),
        })
      );

      const result = await runWorkflowExecution({
        executionId,
        workflowId,
        versionId,
        triggerPayload,
        correlationId,
        attempt: attempt || job.attemptsMade + 1,
      });

      if (result.status === "FAILED") {
        throw new Error(result.errorSummary || "Workflow execution failed");
      }

      return result;
    },
    {
      connection: redisConnection,
      concurrency,
    }
  );

  worker.on("completed", (job) => {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "Worker execution job succeeded",
        jobId: job.id,
        executionId: job.data.executionId,
        timestamp: new Date().toISOString(),
      })
    );
  });

  worker.on("failed", (job, err) => {
    console.log(
      JSON.stringify({
        level: "warn",
        msg: "Worker execution job failed",
        jobId: job?.id,
        executionId: job?.data.executionId,
        error: err.message,
        timestamp: new Date().toISOString(),
      })
    );
  });

  return worker;
}

export function startWorker(concurrency = 5) {
  if (!workerInstance) {
    workerInstance = createWorkflowWorker(concurrency);
    console.log(`⚡ Workflow execution worker started (concurrency: ${concurrency})`);
  }
  return workerInstance;
}

export async function stopWorker() {
  if (workerInstance) {
    console.log("Shutting down workflow worker...");
    await workerInstance.close();
    workerInstance = null;
  }
}
