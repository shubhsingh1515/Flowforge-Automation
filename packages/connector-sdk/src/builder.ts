import {
  ConnectorAction,
  ConnectorActionSchema,
  ConnectorTrigger,
  ConnectorTriggerSchema,
  ConnectorManifestDTO,
  ConnectorManifestSchema,
} from "@flowforge/shared";

/**
 * Type-safe builder for defining a connector action.
 */
export function defineAction(action: ConnectorAction): ConnectorAction {
  return ConnectorActionSchema.parse(action);
}

/**
 * Type-safe builder for defining a connector trigger.
 */
export function defineTrigger(trigger: ConnectorTrigger): ConnectorTrigger {
  return ConnectorTriggerSchema.parse(trigger);
}

/**
 * Type-safe builder for defining a complete FlowForge Connector Manifest.
 * Enforces all schema invariants at compile/call time.
 */
export function defineConnector(manifest: ConnectorManifestDTO): ConnectorManifestDTO {
  return ConnectorManifestSchema.parse(manifest);
}
