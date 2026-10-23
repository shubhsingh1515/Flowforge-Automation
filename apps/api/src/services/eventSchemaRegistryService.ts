import crypto from "crypto";
import { prisma } from "@flowforge/database";
import {
  CreateEventSchemaDefinitionInput,
  CreateEventSchemaVersionInput,
  EventSchemaCompatibilityMode,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export function computeSchemaContentHash(jsonSchema: any, samplePayload?: any): string {
  const normalized = {
    schema: jsonSchema || {},
    sample: samplePayload || null,
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export class EventSchemaRegistryService {
  /**
   * Registers a new event schema definition with initial version (v1)
   */
  async createSchemaDefinition(
    workspaceId: string,
    userId: string,
    input: CreateEventSchemaDefinitionInput
  ) {
    const existing = await prisma.eventSchemaDefinition.findUnique({
      where: {
        workspaceId_eventType: {
          workspaceId,
          eventType: input.eventType,
        },
      },
    });

    if (existing) {
      throw new Error(`Event type '${input.eventType}' is already registered in this workspace.`);
    }

    const contentHash = computeSchemaContentHash(input.jsonSchema, input.samplePayload);

    const definition = await prisma.$transaction(async (tx) => {
      const def = await tx.eventSchemaDefinition.create({
        data: {
          workspaceId,
          eventType: input.eventType,
          description: input.description,
          businessDomain: input.businessDomain || "OPERATIONS",
          dataClassification: input.dataClassification || "INTERNAL",
          compatibilityMode: input.compatibilityMode || "BACKWARD",
          activeVersionNumber: 1,
          status: "ACTIVE",
          ownerUserId: userId,
        },
      });

      const ver = await tx.eventSchemaVersion.create({
        data: {
          schemaDefinitionId: def.id,
          versionNumber: 1,
          jsonSchema: input.jsonSchema as any,
          samplePayload: (input.samplePayload as any) || null,
          contentHash,
          status: "PUBLISHED",
          publishedAt: new Date(),
          createdById: userId,
          changeSummary: "Initial schema version",
        },
      });

      return { ...def, activeVersion: ver };
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "EVENT_SCHEMA_REGISTERED",
      targetType: "EVENT_SCHEMA",
      targetId: definition.id,
      metadata: { eventType: input.eventType, version: 1, contentHash },
    });

    return definition;
  }

  /**
   * Creates a new schema version, evaluating compatibility rules
   */
  async createSchemaVersion(
    workspaceId: string,
    eventType: string,
    userId: string,
    input: CreateEventSchemaVersionInput
  ) {
    const definition = await prisma.eventSchemaDefinition.findUnique({
      where: { workspaceId_eventType: { workspaceId, eventType } },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    });

    if (!definition) {
      throw new Error(`Event type '${eventType}' not found in workspace.`);
    }

    const latestVersion = definition.versions[0];
    const newVersionNumber = (latestVersion?.versionNumber || 0) + 1;

    // Check compatibility if there is a previous version
    let detectedBreaking = false;
    const compatibilityMode = definition.compatibilityMode as EventSchemaCompatibilityMode;

    if (latestVersion && latestVersion.jsonSchema && compatibilityMode !== "NONE") {
      const prevSchema = latestVersion.jsonSchema as any;
      const nextSchema = input.jsonSchema as any;

      const prevRequired = Array.isArray(prevSchema.required) ? prevSchema.required : [];
      const nextRequired = Array.isArray(nextSchema.required) ? nextSchema.required : [];

      // Check 1: In BACKWARD compatibility, new schema cannot add new required fields without default
      const newlyAddedRequired = nextRequired.filter((f: string) => !prevRequired.includes(f));
      if (newlyAddedRequired.length > 0) {
        detectedBreaking = true;
      }

      // Check 2: In FORWARD compatibility, new schema cannot remove fields that were required previously
      if (compatibilityMode === "FORWARD" || compatibilityMode === "FULL") {
        const removedRequired = prevRequired.filter((f: string) => !nextRequired.includes(f));
        if (removedRequired.length > 0) {
          detectedBreaking = true;
        }
      }

      // Check 3: Property type mutations
      if (prevSchema.properties && nextSchema.properties) {
        for (const [prop, prevDef] of Object.entries<any>(prevSchema.properties)) {
          const nextDef = nextSchema.properties[prop];
          if (nextDef && prevDef.type && nextDef.type && prevDef.type !== nextDef.type) {
            detectedBreaking = true;
          }
        }
      }
    }

    if (detectedBreaking && !input.isBreaking && compatibilityMode !== "NONE") {
      throw new Error(
        `Compatibility violation (${compatibilityMode}): Proposing breaking changes without administrative override flag 'isBreaking: true'.`
      );
    }

    const contentHash = computeSchemaContentHash(input.jsonSchema, input.samplePayload);

    const version = await prisma.eventSchemaVersion.create({
      data: {
        schemaDefinitionId: definition.id,
        versionNumber: newVersionNumber,
        jsonSchema: input.jsonSchema as any,
        samplePayload: (input.samplePayload as any) || null,
        contentHash,
        status: "DRAFT",
        changeSummary: input.changeSummary,
        isBreaking: detectedBreaking || input.isBreaking,
        createdById: userId,
      },
    });

    return {
      version,
      detectedBreaking,
      compatibilityMode,
    };
  }

  /**
   * Publishes an immutable schema version and advances the active version
   */
  async publishSchemaVersion(
    workspaceId: string,
    eventType: string,
    versionNumber: number,
    userId: string
  ) {
    const definition = await prisma.eventSchemaDefinition.findUnique({
      where: { workspaceId_eventType: { workspaceId, eventType } },
      include: {
        versions: { where: { versionNumber } },
      },
    });

    if (!definition || definition.versions.length === 0) {
      throw new Error(`Schema version ${versionNumber} for event type '${eventType}' not found.`);
    }

    const targetVersion = definition.versions[0];
    if (targetVersion.status === "PUBLISHED") {
      return { success: true, version: targetVersion, definition };
    }

    const result = await prisma.$transaction(async (tx) => {
      const ver = await tx.eventSchemaVersion.update({
        where: { id: targetVersion.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });

      const def = await tx.eventSchemaDefinition.update({
        where: { id: definition.id },
        data: {
          activeVersionNumber: versionNumber,
          updatedAt: new Date(),
        },
      });

      return { version: ver, definition: def };
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "EVENT_SCHEMA_VERSION_PUBLISHED",
      targetType: "EVENT_SCHEMA",
      targetId: definition.id,
      metadata: { eventType, versionNumber, contentHash: targetVersion.contentHash },
    });

    return result;
  }

  /**
   * Retrieves an event schema definition by eventType with its active published version
   */
  async getSchemaDefinition(workspaceId: string, eventType: string) {
    const definition = await prisma.eventSchemaDefinition.findUnique({
      where: { workspaceId_eventType: { workspaceId, eventType } },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
        },
        _count: {
          select: {
            events: true,
          },
        },
      },
    });

    if (!definition) {
      return null;
    }

    const activeVersion =
      definition.versions.find((v) => v.versionNumber === definition.activeVersionNumber) ||
      definition.versions.find((v) => v.status === "PUBLISHED") ||
      definition.versions[0] ||
      null;

    return {
      ...definition,
      activeVersion,
      eventCount: definition._count.events,
    };
  }

  /**
   * Lists event schema definitions in a workspace with optional filters
   */
  async listSchemaDefinitions(
    workspaceId: string,
    filter?: {
      businessDomain?: string;
      status?: string;
      search?: string;
    }
  ) {
    const definitions = await prisma.eventSchemaDefinition.findMany({
      where: {
        workspaceId,
        ...(filter?.businessDomain ? { businessDomain: filter.businessDomain } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.search
          ? {
              OR: [
                { eventType: { contains: filter.search, mode: "insensitive" } },
                { description: { contains: filter.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
        _count: {
          select: { events: true },
        },
      },
      orderBy: { eventType: "asc" },
    });

    return definitions.map((def) => ({
      ...def,
      activeVersion: def.versions[0] || null,
      eventCount: def._count.events,
    }));
  }

  /**
   * Validates an event payload against the schema definition's JSON Schema.
   * Safe, deterministic validator without dynamic code execution.
   */
  validatePayload(
    jsonSchema: any,
    payload: any
  ): { valid: boolean; errors: string[] } {
    if (!jsonSchema || typeof jsonSchema !== "object") {
      return { valid: true, errors: [] };
    }

    const errors: string[] = [];

    // 1. Required fields check
    if (Array.isArray(jsonSchema.required)) {
      for (const requiredField of jsonSchema.required) {
        if (payload === undefined || payload === null || payload[requiredField] === undefined) {
          errors.push(`Missing required field: '${requiredField}'`);
        }
      }
    }

    // 2. Properties type check
    if (jsonSchema.properties && typeof jsonSchema.properties === "object" && payload && typeof payload === "object") {
      for (const [propName, propSchema] of Object.entries<any>(jsonSchema.properties)) {
        const val = payload[propName];
        if (val !== undefined && val !== null && propSchema && propSchema.type) {
          const expectedType = propSchema.type;
          const actualType = Array.isArray(val) ? "array" : typeof val;

          if (expectedType === "integer") {
            if (!Number.isInteger(val)) {
              errors.push(`Field '${propName}' must be an integer (received ${actualType})`);
            }
          } else if (expectedType === "number") {
            if (typeof val !== "number" || isNaN(val)) {
              errors.push(`Field '${propName}' must be a number (received ${actualType})`);
            }
          } else if (expectedType !== actualType) {
            errors.push(`Field '${propName}' must be of type '${expectedType}' (received '${actualType}')`);
          }

          // Safe enum check
          if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(val)) {
            errors.push(`Field '${propName}' value '${val}' is not in allowed enum values`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const eventSchemaRegistryService = new EventSchemaRegistryService();
