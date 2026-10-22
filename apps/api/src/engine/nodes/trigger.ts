import { NodeHandler, StepExecutionContext, NodeExecutionResult } from "../types.js";

export const webhookTriggerHandler: NodeHandler = {
  type: "TRIGGER",
  validateConfig(_config) {
    return { isValid: true, errors: [] };
  },
  async execute(ctx: StepExecutionContext): Promise<NodeExecutionResult> {
    // Return structured payload received from the webhook ingestion handler
    const triggerData = ctx.context.trigger || {};
    return {
      status: "SUCCESS",
      outputData: {
        body: triggerData.body || {},
        headers: triggerData.headers || {},
        query: triggerData.query || {},
        method: triggerData.method || "POST",
        eventId: triggerData.eventId,
        receivedAt: triggerData.receivedAt || new Date().toISOString(),
      },
    };
  },
};
