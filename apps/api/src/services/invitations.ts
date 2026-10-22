import crypto from "node:crypto";
import { prisma, WorkspaceRole, InvitationStatus } from "@flowforge/database";
import { entitlementService } from "./entitlements.js";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class InvitationService {
  /**
   * Invites a new team member by email with role assignment, subject to plan member limits.
   */
  async createInvitation(params: {
    workspaceId: string;
    email: string;
    role: WorkspaceRole;
    invitedByUserId: string;
  }) {
    const { workspaceId, email, role, invitedByUserId } = params;
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Quota check: can the workspace add another member?
    const quota = await entitlementService.canAddWorkspaceMember(workspaceId);
    if (!quota.allowed) {
      throw new Error(quota.reason || "Workspace member limit reached. Please upgrade your plan.");
    }

    // 2. Check if user is already an active member of this workspace
    const existingMember = await prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        user: { email: normalizedEmail },
      },
    });

    if (existingMember) {
      throw new Error("This user is already a member of this workspace.");
    }

    // 3. Invalidate previous pending invitations for this email in this workspace
    await prisma.workspaceInvitation.updateMany({
      where: {
        workspaceId,
        email: normalizedEmail,
        status: InvitationStatus.PENDING,
      },
      data: { status: InvitationStatus.REVOKED },
    });

    // 4. Generate cryptographically secure token & SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email: normalizedEmail,
        role,
        tokenHash,
        status: InvitationStatus.PENDING,
        invitedByUserId,
        expiresAt,
      },
    });

    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
      rawToken,
    };
  }

  /**
   * Accepts a pending invitation and joins the user to the workspace.
   */
  async acceptInvitation(rawToken: string, userId: string) {
    const tokenHash = hashToken(rawToken);

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { tokenHash },
      include: { workspace: true },
    });

    if (!invitation) {
      throw new Error("Invalid or unknown invitation token.");
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new Error(`Invitation is no longer valid (status: ${invitation.status}).`);
    }

    if (new Date() > invitation.expiresAt) {
      await prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new Error("Invitation has expired. Please ask for a new invite.");
    }

    // Execute acceptance transaction
    await prisma.$transaction([
      prisma.workspaceMembership.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId,
          },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId,
          role: invitation.role,
        },
        update: {
          role: invitation.role,
        },
      }),
      prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      }),
    ]);

    return {
      success: true,
      workspace: {
        id: invitation.workspace.id,
        name: invitation.workspace.name,
        role: invitation.role,
      },
    };
  }

  /**
   * Revokes an existing invitation.
   */
  async revokeInvitation(invitationId: string, workspaceId: string) {
    const invitation = await prisma.workspaceInvitation.findFirst({
      where: { id: invitationId, workspaceId },
    });

    if (!invitation) {
      throw new Error("Invitation not found in this workspace.");
    }

    await prisma.workspaceInvitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.REVOKED },
    });

    return { success: true };
  }

  /**
   * Lists pending invitations for a workspace.
   */
  async listPendingInvitations(workspaceId: string) {
    return prisma.workspaceInvitation.findMany({
      where: {
        workspaceId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const invitationService = new InvitationService();
