import { NodeType } from "@flowforge/shared";
import { NodeHandler } from "./types.js";
import { webhookTriggerHandler } from "./nodes/trigger.js";
import { httpRequestHandler } from "./nodes/http.js";
import { conditionHandler } from "./nodes/condition.js";
import { filterHandler } from "./nodes/filter.js";
import { transformHandler } from "./nodes/transform.js";
import { loopHandler } from "./nodes/loop.js";
import { forkHandler } from "./nodes/fork.js";
import { joinHandler } from "./nodes/join.js";
import { approvalHandler } from "./nodes/approval.js";
import { workflowEndHandler } from "./nodes/end.js";
import { integrationRegistry } from "../integrations/registry.js";
import { createCustomIntegrationNodeHandler } from "./nodes/customIntegration.js";

export class NodeRegistry {
  private handlers = new Map<string, NodeHandler>();

  constructor() {
    this.register(webhookTriggerHandler);
    this.register(httpRequestHandler);
    this.register(conditionHandler);
    this.register(filterHandler);
    this.register(transformHandler);
    this.handlers.set("ACTION", transformHandler);
    this.register(loopHandler);
    this.register(forkHandler);
    this.register(joinHandler);
    this.register(approvalHandler);
    this.register(workflowEndHandler);
  }

  register(handler: NodeHandler) {
    this.handlers.set(handler.type, handler);
  }

  getHandler(nodeType: NodeType, integrationKey?: string): NodeHandler | undefined {
    if (integrationKey) {
      if (integrationKey === "http-request") {
        return this.handlers.get("HTTP_REQUEST") || this.handlers.get(nodeType);
      }
      if (integrationKey.startsWith("custom:")) {
        const customKey = integrationKey.replace("custom:", "");
        return createCustomIntegrationNodeHandler(customKey);
      }
      const provider = integrationRegistry.getProvider(integrationKey);
      if (provider) {
        return integrationRegistry.createNodeHandler(integrationKey);
      }
    }
    return this.handlers.get(nodeType) || (nodeType === "ACTION" ? this.handlers.get("TRANSFORM") : undefined);
  }
}

export const defaultRegistry = new NodeRegistry();
