import { prisma } from "@flowforge/database";
import { CreateOrganizationInput, UpdateOrganizationInput, AddOrganizationMemberInput } from "@flowforge/shared";

export class OrganizationService {
  /**
   * Creates an organization and assigns the creator as OWNER.
   */
  async createOrganization(userId: string, input: CreateOrganizationInput) {
    const existing = await prisma.organization.findUnique({
      where: { slug: input.slug },
    });
    if (existing) {
      const error: any = new Error(`Organization slug '${input.slug}' is already taken.`);
      error.statusCode = 409;
      throw error;
    }

    const org = await prisma.organization.create({
      data: {
        name: input.name,
        slug: input.slug,
        ownerId: userId,
        status: "ACTIVE",
        metadata: input.metadata || {},
        memberships: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
      include: {
        memberships: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
    });

    return org;
  }

  /**
   * Retrieves an organization by ID or slug, verifying membership.
   */
  async getOrganization(orgIdOrSlug: string, userId: string) {
    const org = await prisma.organization.findFirst({
      where: {
        OR: [{ id: orgIdOrSlug }, { slug: orgIdOrSlug }],
        memberships: { some: { userId } },
      },
      include: {
        workspaces: {
          select: { id: true, name: true, slug: true, createdAt: true },
        },
        memberships: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
        teams: {
          select: { id: true, name: true, slug: true, status: true, _count: { select: { members: true } } },
        },
      },
    });

    if (!org) {
      const error: any = new Error("Organization not found or you are not an authorized member.");
      error.statusCode = 404;
      throw error;
    }

    return org;
  }

  /**
   * Lists organizations the user belongs to.
   */
  async listUserOrganizations(userId: string) {
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId },
      include: {
        organization: {
          include: {
            _count: {
              select: { workspaces: true, memberships: true, teams: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return memberships.map((m) => ({
      ...m.organization,
      role: m.role,
    }));
  }

  /**
   * Updates organization metadata. Requires OWNER or ADMIN role.
   */
  async updateOrganization(orgId: string, actorUserId: string, input: UpdateOrganizationInput) {
    await this.requireRole(orgId, actorUserId, ["OWNER", "ADMIN"]);

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        name: input.name,
        metadata: input.metadata,
      },
    });

    return updated;
  }

  /**
   * Adds a member by email to the organization.
   */
  async addMember(orgId: string, actorUserId: string, input: AddOrganizationMemberInput) {
    await this.requireRole(orgId, actorUserId, ["OWNER", "ADMIN"]);

    const targetUser = input.userId
      ? await prisma.user.findUnique({ where: { id: input.userId } })
      : input.email
      ? await prisma.user.findUnique({ where: { email: input.email } })
      : null;

    if (!targetUser) {
      const identifier = input.email || input.userId;
      const error: any = new Error(`User '${identifier}' not found. They must register first.`);
      error.statusCode = 404;
      throw error;
    }

    const existingMember = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: targetUser.id,
        },
      },
    });
    if (existingMember) {
      const error: any = new Error("User is already a member of this organization.");
      error.statusCode = 409;
      throw error;
    }

    const membership = await prisma.organizationMembership.create({
      data: {
        organizationId: orgId,
        userId: targetUser.id,
        role: input.role || "MEMBER",
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    return membership;
  }

  /**
   * Removes or demotes a member, enforcing last-owner protection.
   */
  async removeMember(orgId: string, actorUserId: string, targetUserIdOrMembershipId: string) {
    await this.requireRole(orgId, actorUserId, ["OWNER", "ADMIN"]);

    let targetMembership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: targetUserIdOrMembershipId,
        },
      },
    });

    if (!targetMembership) {
      targetMembership = await prisma.organizationMembership.findFirst({
        where: {
          id: targetUserIdOrMembershipId,
          organizationId: orgId,
        },
      });
    }

    if (!targetMembership) {
      const error: any = new Error("Membership not found in this organization.");
      error.statusCode = 404;
      throw error;
    }

    // Last-owner protection
    if (targetMembership.role === "OWNER") {
      const totalOwners = await prisma.organizationMembership.count({
        where: { organizationId: orgId, role: "OWNER" },
      });
      if (totalOwners <= 1) {
        const error: any = new Error("Cannot remove the last active Owner of the organization.");
        error.statusCode = 400;
        throw error;
      }
    }

    await prisma.organizationMembership.delete({
      where: { id: targetMembership.id },
    });

    return { success: true, message: "Member removed from organization." };
  }

  /**
   * Lists all members of an organization.
   */
  async listMembers(orgId: string, actorUserId: string) {
    await this.requireRole(orgId, actorUserId, ["OWNER", "ADMIN", "MEMBER"]);

    const members = await prisma.organizationMembership.findMany({
      where: { organizationId: orgId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return members;
  }

  /**
   * Groups an existing workspace under an organization.
   */
  async assignWorkspace(orgId: string, actorUserId: string, workspaceId: string) {
    await this.requireRole(orgId, actorUserId, ["OWNER", "ADMIN"]);

    // Verify actor has admin/owner rights in the workspace as well
    const wsMember = await prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId: actorUserId,
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!wsMember) {
      const error: any = new Error("You must be an Owner or Admin of the target workspace to link it.");
      error.statusCode = 403;
      throw error;
    }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { organizationId: orgId },
    });

    return updated;
  }

  private async requireRole(orgId: string, userId: string, allowedRoles: string[]) {
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId,
        },
      },
    });

    if (!membership || !allowedRoles.includes(membership.role)) {
      const error: any = new Error("Insufficient organization permissions.");
      error.statusCode = 403;
      throw error;
    }

    return membership;
  }
}

export const organizationService = new OrganizationService();
