import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  AssignStakeholderRoleInput,
  UpdateStakeholderRoleInput,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";
import { strategicAccountService } from "./strategicAccountService.js";

export class StakeholderService {
  /**
   * Assigns a strategic stakeholder role to an authorized customer contact.
   */
  public async assignRole(
    workspaceId: string,
    customerAccountId: string,
    input: AssignStakeholderRoleInput,
    actorId?: string
  ) {
    // 1. Verify account exists
    const account = await prisma.customerAccount.findFirst({
      where: { id: customerAccountId, workspaceId },
    });
    if (!account) {
      throw new HttpError(404, `Customer account '${customerAccountId}' not found in workspace.`);
    }

    // 2. Verify contact exists and belongs to this account
    const contact = await prisma.customerContact.findFirst({
      where: {
        id: input.contactId,
        customerAccountId,
        workspaceId,
      },
    });
    if (!contact) {
      throw new HttpError(404, `Customer contact '${input.contactId}' not found for this account.`);
    }

    // 3. Check for existing identical role
    const existing = await prisma.customerStakeholderRelationship.findUnique({
      where: {
        customerAccountId_contactId_role: {
          customerAccountId,
          contactId: input.contactId,
          role: input.role,
        },
      },
    });

    if (existing) {
      if (existing.status === "ACTIVE") {
        throw new HttpError(409, `Contact '${contact.name}' already has role '${input.role}' on this account.`);
      }
      // Re-activate if was inactive
      const reactivated = await prisma.customerStakeholderRelationship.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          department: input.department !== undefined ? input.department : existing.department,
          relationshipOwnerId: input.relationshipOwnerId !== undefined ? input.relationshipOwnerId : existing.relationshipOwnerId,
          verificationSource: input.verificationSource || existing.verificationSource,
          verifiedAt: new Date(),
          notes: input.notes !== undefined ? input.notes : existing.notes,
        },
        include: {
          contact: true,
        },
      });

      await prisma.customerStakeholderRoleHistory.create({
        data: {
          workspaceId,
          relationshipId: existing.id,
          previousRole: existing.role,
          newRole: input.role,
          previousStatus: existing.status,
          newStatus: "ACTIVE",
          actorId: actorId || null,
          changeReason: "REACTIVATED",
        },
      });

      await strategicAccountService.calculateCoverage(workspaceId, customerAccountId);
      await strategicAccountService.calculatePortfolioPriority(workspaceId, customerAccountId);
      return reactivated;
    }

    // 4. Create relationship
    const relationship = await prisma.customerStakeholderRelationship.create({
      data: {
        workspaceId,
        customerAccountId,
        contactId: input.contactId,
        role: input.role,
        department: input.department || null,
        relationshipOwnerId: input.relationshipOwnerId || null,
        status: input.status || "ACTIVE",
        verificationSource: input.verificationSource || "MANUAL",
        verifiedAt: new Date(),
        notes: input.notes || null,
      },
      include: {
        contact: true,
      },
    });

    // 5. Record initial role history
    await prisma.customerStakeholderRoleHistory.create({
      data: {
        workspaceId,
        relationshipId: relationship.id,
        previousRole: null,
        newRole: input.role,
        previousStatus: null,
        newStatus: input.status || "ACTIVE",
        actorId: actorId || null,
        changeReason: "INITIAL_ASSIGNMENT",
      },
    });

    // 6. Recalculate priority & coverage
    await strategicAccountService.calculateCoverage(workspaceId, customerAccountId);
    await strategicAccountService.calculatePortfolioPriority(workspaceId, customerAccountId);

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_STAKEHOLDER_ROLE_ASSIGNED",
      entityType: "CustomerStakeholderRelationship",
      entityId: relationship.id,
      metadata: {
        customerAccountId,
        contactId: input.contactId,
        role: input.role,
      },
    });

    return relationship;
  }

  /**
   * Updates an existing stakeholder relationship.
   */
  public async updateRole(
    workspaceId: string,
    relationshipId: string,
    input: UpdateStakeholderRoleInput,
    actorId?: string
  ) {
    const relationship = await prisma.customerStakeholderRelationship.findFirst({
      where: { id: relationshipId, workspaceId },
    });
    if (!relationship) {
      throw new HttpError(404, `Stakeholder relationship '${relationshipId}' not found in workspace.`);
    }

    const previousRole = relationship.role;
    const previousStatus = relationship.status;
    const newRole = input.role || previousRole;
    const newStatus = input.status || previousStatus;

    const updated = await prisma.customerStakeholderRelationship.update({
      where: { id: relationshipId },
      data: {
        role: newRole,
        department: input.department !== undefined ? input.department : relationship.department,
        relationshipOwnerId: input.relationshipOwnerId !== undefined ? input.relationshipOwnerId : relationship.relationshipOwnerId,
        status: newStatus,
        verificationSource: input.verificationSource !== undefined ? input.verificationSource : relationship.verificationSource,
        verifiedAt: input.verificationSource ? new Date() : relationship.verifiedAt,
        notes: input.notes !== undefined ? input.notes : relationship.notes,
      },
      include: {
        contact: true,
      },
    });

    if (newRole !== previousRole || newStatus !== previousStatus) {
      await prisma.customerStakeholderRoleHistory.create({
        data: {
          workspaceId,
          relationshipId: relationship.id,
          previousRole,
          newRole,
          previousStatus,
          newStatus,
          actorId: actorId || null,
          changeReason: input.changeReason || "ROLE_OR_STATUS_UPDATE",
        },
      });
    }

    await strategicAccountService.calculateCoverage(workspaceId, relationship.customerAccountId);
    await strategicAccountService.calculatePortfolioPriority(workspaceId, relationship.customerAccountId);

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_STAKEHOLDER_ROLE_UPDATED",
      entityType: "CustomerStakeholderRelationship",
      entityId: relationshipId,
      metadata: { previousRole, newRole, previousStatus, newStatus },
    });

    return updated;
  }

  /**
   * Deactivates a stakeholder relationship.
   */
  public async removeRole(
    workspaceId: string,
    relationshipId: string,
    actorId?: string
  ) {
    const relationship = await prisma.customerStakeholderRelationship.findFirst({
      where: { id: relationshipId, workspaceId },
    });
    if (!relationship) {
      throw new HttpError(404, `Stakeholder relationship '${relationshipId}' not found in workspace.`);
    }

    const deactivated = await prisma.customerStakeholderRelationship.update({
      where: { id: relationshipId },
      data: { status: "INACTIVE" },
    });

    await prisma.customerStakeholderRoleHistory.create({
      data: {
        workspaceId,
        relationshipId: relationship.id,
        previousRole: relationship.role,
        newRole: relationship.role,
        previousStatus: relationship.status,
        newStatus: "INACTIVE",
        actorId: actorId || null,
        changeReason: "ROLE_DEACTIVATED",
      },
    });

    await strategicAccountService.calculateCoverage(workspaceId, relationship.customerAccountId);
    await strategicAccountService.calculatePortfolioPriority(workspaceId, relationship.customerAccountId);

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "CUSTOMER_STAKEHOLDER_ROLE_DEACTIVATED",
      entityType: "CustomerStakeholderRelationship",
      entityId: relationshipId,
      metadata: { customerAccountId: relationship.customerAccountId },
    });

    return deactivated;
  }

  /**
   * Lists stakeholders for a customer account.
   */
  public async listStakeholders(
    workspaceId: string,
    customerAccountId: string,
    options?: { includeInactive?: boolean }
  ) {
    return prisma.customerStakeholderRelationship.findMany({
      where: {
        workspaceId,
        customerAccountId,
        ...(options?.includeInactive ? {} : { status: "ACTIVE" }),
      },
      include: {
        contact: true,
        history: {
          orderBy: { changedAt: "desc" },
          take: 5,
        },
      },
      orderBy: [
        { role: "asc" },
        { createdAt: "desc" },
      ],
    });
  }

  /**
   * Retrieves role audit history for a stakeholder relationship.
   */
  public async getHistory(workspaceId: string, relationshipId: string) {
    const relationship = await prisma.customerStakeholderRelationship.findFirst({
      where: { id: relationshipId, workspaceId },
    });
    if (!relationship) {
      throw new HttpError(404, `Stakeholder relationship '${relationshipId}' not found in workspace.`);
    }

    return prisma.customerStakeholderRoleHistory.findMany({
      where: { relationshipId, workspaceId },
      orderBy: { changedAt: "desc" },
    });
  }
}

export const stakeholderService = new StakeholderService();
