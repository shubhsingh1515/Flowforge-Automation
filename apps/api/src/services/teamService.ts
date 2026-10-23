import { prisma } from "@flowforge/database";
import { CreateTeamInput, UpdateTeamInput, AddTeamMemberInput } from "@flowforge/shared";

export class TeamService {
  /**
   * Creates a team in the workspace, adding the creator as LEAD.
   */
  async createTeam(workspaceId: string, actorUserId: string, input: CreateTeamInput) {
    const slug =
      input.slug ||
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const existing = await prisma.team.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug,
        },
      },
    });

    if (existing) {
      const error: any = new Error(`Team with slug '${slug}' already exists in this workspace.`);
      error.statusCode = 409;
      throw error;
    }

    // Look up workspace's organization if any
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { organizationId: true },
    });

    const team = await prisma.team.create({
      data: {
        workspaceId,
        organizationId: workspace?.organizationId,
        name: input.name,
        slug,
        description: input.description,
        status: "ACTIVE",
        members: {
          create: {
            userId: actorUserId,
            role: "LEAD",
          },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
    });

    return team;
  }

  /**
   * Lists active and archived teams in the workspace.
   */
  async listTeams(workspaceId: string) {
    const teams = await prisma.team.findMany({
      where: { workspaceId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
        _count: {
          select: {
            workflows: true,
            members: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return teams;
  }

  /**
   * Retrieves single team details.
   */
  async getTeam(workspaceId: string, teamId: string) {
    const team = await prisma.team.findFirst({
      where: { id: teamId, workspaceId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
        workflows: {
          select: { id: true, name: true, status: true, criticality: true, lifecycleStatus: true },
        },
      },
    });

    if (!team) {
      const error: any = new Error("Team not found.");
      error.statusCode = 404;
      throw error;
    }

    return team;
  }

  /**
   * Updates team metadata or archives it.
   */
  async updateTeam(workspaceId: string, teamId: string, actorUserId: string, input: UpdateTeamInput) {
    await this.requireTeamLeadOrWorkspaceAdmin(workspaceId, teamId, actorUserId);

    const updated = await prisma.team.update({
      where: { id: teamId },
      data: {
        name: input.name,
        description: input.description,
        status: input.status,
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return updated;
  }

  /**
   * Adds a member to the team.
   */
  async addMember(workspaceId: string, teamId: string, actorUserId: string, input: AddTeamMemberInput) {
    await this.requireTeamLeadOrWorkspaceAdmin(workspaceId, teamId, actorUserId);

    // Verify user belongs to workspace
    const wsMember = await prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: input.userId,
        },
      },
    });
    if (!wsMember) {
      const error: any = new Error("User must be a member of the workspace before being added to a team.");
      error.statusCode = 400;
      throw error;
    }

    const existing = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: input.userId,
        },
      },
    });
    if (existing) {
      const error: any = new Error("User is already a member of this team.");
      error.statusCode = 409;
      throw error;
    }

    const member = await prisma.teamMember.create({
      data: {
        teamId,
        userId: input.userId,
        role: input.role || "MEMBER",
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    return member;
  }

  /**
   * Removes a member from the team.
   */
  async removeMember(workspaceId: string, teamId: string, actorUserId: string, targetUserId: string) {
    await this.requireTeamLeadOrWorkspaceAdmin(workspaceId, teamId, actorUserId);

    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: targetUserId,
        },
      },
    });
    if (!member) {
      const error: any = new Error("Team member not found.");
      error.statusCode = 404;
      throw error;
    }

    await prisma.teamMember.delete({
      where: { id: member.id },
    });

    return { success: true, message: "Member removed from team." };
  }

  private async requireTeamLeadOrWorkspaceAdmin(workspaceId: string, teamId: string, userId: string) {
    // Check if user is Workspace OWNER or ADMIN
    const wsMember = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (wsMember && (wsMember.role === "OWNER" || wsMember.role === "ADMIN")) {
      return;
    }

    // Otherwise check if user is LEAD of this team
    const teamMember = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!teamMember || teamMember.role !== "LEAD") {
      const error: any = new Error("Only team Leads or Workspace Admins can modify team settings and members.");
      error.statusCode = 403;
      throw error;
    }
  }
}

export const teamService = new TeamService();
