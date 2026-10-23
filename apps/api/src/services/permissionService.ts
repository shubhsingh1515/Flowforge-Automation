import { prisma } from "@flowforge/database";
import { GrantResourcePermissionInput, ResourceAction } from "@flowforge/shared";

export class PermissionService {
  /**
   * Grants fine-grained actions on a resource to a user or team.
   */
  async grantPermission(workspaceId: string, actorUserId: string, input: GrantResourcePermissionInput) {
    const actions: ResourceAction[] =
      input.actions && input.actions.length > 0
        ? input.actions
        : (input as any).accessLevel === "ADMIN"
        ? ["VIEW", "EDIT", "RUN", "APPROVE", "DEPLOY", "MANAGE_PERMISSIONS"]
        : (input as any).accessLevel === "EDIT"
        ? ["VIEW", "EDIT", "RUN"]
        : ["VIEW"];

    // Only users with MANAGE_PERMISSIONS or workspace Admin/Owner can grant permissions
    const canManage = await this.checkPermission(
      workspaceId,
      actorUserId,
      input.resourceType,
      input.resourceId,
      "MANAGE_PERMISSIONS"
    );

    if (!canManage.allowed) {
      const error: any = new Error("You do not have permission to manage access for this resource.");
      error.statusCode = 403;
      throw error;
    }

    // Upsert permission
    const existing = await prisma.resourcePermission.findFirst({
      where: {
        workspaceId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
      },
    });

    if (existing) {
      const mergedActions = Array.from(new Set([...existing.actions, ...actions]));
      const updated = await prisma.resourcePermission.update({
        where: { id: existing.id },
        data: {
          actions: mergedActions,
          grantedById: actorUserId,
        },
      });
      return updated;
    }

    const created = await prisma.resourcePermission.create({
      data: {
        workspaceId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        actions,
        grantedById: actorUserId,
      },
    });

    return created;
  }

  /**
   * Revokes a resource permission grant.
   */
  async revokePermission(workspaceId: string, actorUserId: string, permissionId: string) {
    const perm = await prisma.resourcePermission.findFirst({
      where: { id: permissionId, workspaceId },
    });
    if (!perm) {
      const error: any = new Error("Permission record not found.");
      error.statusCode = 404;
      throw error;
    }

    const canManage = await this.checkPermission(
      workspaceId,
      actorUserId,
      perm.resourceType as any,
      perm.resourceId,
      "MANAGE_PERMISSIONS"
    );
    if (!canManage.allowed) {
      const error: any = new Error("You do not have permission to revoke access for this resource.");
      error.statusCode = 403;
      throw error;
    }

    await prisma.resourcePermission.delete({
      where: { id: permissionId },
    });

    return { success: true, message: "Permission grant revoked." };
  }

  /**
   * Lists effective permission grants on a resource.
   */
  async listPermissions(workspaceId: string, resourceType: string, resourceId: string) {
    const grants = await prisma.resourcePermission.findMany({
      where: {
        workspaceId,
        resourceType,
        resourceId,
      },
      orderBy: { createdAt: "desc" },
    });

    // Hydrate subject metadata (user or team name)
    const hydrated = await Promise.all(
      grants.map(async (g) => {
        let subjectName = g.subjectId;
        if (g.subjectType === "USER") {
          const user = await prisma.user.findUnique({
            where: { id: g.subjectId },
            select: { name: true, email: true },
          });
          if (user) subjectName = `${user.name} (${user.email})`;
        } else if (g.subjectType === "TEAM") {
          const team = await prisma.team.findUnique({
            where: { id: g.subjectId },
            select: { name: true, status: true },
          });
          if (team) subjectName = `Team: ${team.name} [${team.status}]`;
        }
        return {
          ...g,
          subjectName,
        };
      })
    );

    return hydrated;
  }

  /**
   * Resolves whether a user has the required action on a resource.
   */
  async checkPermission(
    workspaceId: string,
    userId: string,
    resourceType: "WORKFLOW" | "ENVIRONMENT" | "FOLDER" | "GOVERNANCE",
    resourceId: string,
    requiredAction: ResourceAction
  ): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Workspace OWNER or ADMIN always allowed
    const wsMember = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (wsMember && (wsMember.role === "OWNER" || wsMember.role === "ADMIN")) {
      return { allowed: true, reason: "Workspace Admin/Owner privilege" };
    }

    // 2. Direct user grant
    const directGrant = await prisma.resourcePermission.findFirst({
      where: {
        workspaceId,
        resourceType,
        resourceId,
        subjectType: "USER",
        subjectId: userId,
      },
    });
    if (directGrant && directGrant.actions.includes(requiredAction)) {
      return { allowed: true, reason: "Explicit user permission grant" };
    }

    // 3. User's active teams grants
    const userTeams = await prisma.teamMember.findMany({
      where: {
        userId,
        team: { workspaceId, status: "ACTIVE" },
      },
      select: { teamId: true },
    });
    const activeTeamIds = userTeams.map((t) => t.teamId);

    if (activeTeamIds.length > 0) {
      const teamGrant = await prisma.resourcePermission.findFirst({
        where: {
          workspaceId,
          resourceType,
          resourceId,
          subjectType: "TEAM",
          subjectId: { in: activeTeamIds },
        },
      });
      if (teamGrant && teamGrant.actions.includes(requiredAction)) {
        return { allowed: true, reason: "Inherited team permission grant" };
      }
    }

    // 4. Workflow ownership / stewardship
    if (resourceType === "WORKFLOW") {
      const workflow = await prisma.workflow.findFirst({
        where: { id: resourceId, workspaceId },
        select: { ownerUserId: true, stewardUserId: true, owningTeamId: true },
      });

      if (workflow) {
        const isOwner = workflow.ownerUserId === userId;
        const isSteward = workflow.stewardUserId === userId;
        const isTeamOwner = workflow.owningTeamId && activeTeamIds.includes(workflow.owningTeamId);

        if (isOwner || isSteward || isTeamOwner) {
          // Owners and stewards can VIEW, EDIT, RUN, and MANAGE_PERMISSIONS on their workflow
          const allowedOwnershipActions: ResourceAction[] = [
            "VIEW",
            "EDIT",
            "RUN",
            "MANAGE_PERMISSIONS",
          ];
          if (allowedOwnershipActions.includes(requiredAction)) {
            return { allowed: true, reason: "Workflow owner or technical steward role" };
          }
        }
      }
    }

    // 5. Default workspace member read action
    if (requiredAction === "VIEW" && wsMember) {
      return { allowed: true, reason: "Default workspace member view access" };
    }

    return { allowed: false, reason: `Action '${requiredAction}' not authorized for principal.` };
  }
}

export const permissionService = new PermissionService();
