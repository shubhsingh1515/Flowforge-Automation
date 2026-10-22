import { NodeType } from "@flowforge/shared";
import { NodeHandler } from "./types.js";
import { webhookTriggerHandler } from "./nodes/trigger.js";
import { httpRequestHandler } from "./nodes/http.js";
import { conditionHandler } from "./nodes/condition.js";
import { transformHandler } from "./nodes/transform.js";
import { workflowEndHandler } from "./nodes/end.js";

export class NodeRegistry {
  private handlers = new Map<string, NodeHandler>();

  constructor() {
    this.register(webhookTriggerHandler);
    this.register(httpRequestHandler);
    this.register(conditionHandler);
    this.register(transformHandler);
    this.register(workflowEndHandler);
  }

  register(handler: NodeHandler) {
    this.handlers.set(handler.type, handler);
  }

  getHandler(nodeType: NodeType, integrationKey?: string): NodeHandler | undefined {
    if (integrationKey === "http-request") {
      return this.handlers.get("HTTP_REQUEST") || this.handlers.get(nodeType);
    }
    return this.handlers.get(nodeType);
  }
}

export const defaultRegistry = new NodeRegistry();
