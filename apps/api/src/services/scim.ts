import * as crypto from "node:crypto";
import { prisma } from "@flowforge/database";
import { ScimUserInput, ScimUserResource, ScimListResponse } from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export class ScimService {
  /**
   * Generates a new cryptographically secure bearer token for SCIM 2.0 provisioning.
   */
  public async generateToken(
    workspaceId: string,
    name = "Primary SCIM Token",
    expiresInDays = 365
  ): Promise<{ id: string; name: string; secret: string; tokenPrefix: string; expiresAt: Date }> {
    const rawSecret = `ffscim_${crypto.randomBytes(32).toString("hex")}`;
    const tokenPrefix = rawSecret.substring(0, 14);
    const tokenHash = crypto.createHash("sha256").update(rawSecret).digest("hex");
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const tokenRecord = await prisma.scimProvisioningToken.create({
      data: {
        workspaceId,
        name,
        tokenPrefix,
        tokenHash,
        status: "ACTIVE",
        expiresAt,
      },
    });

    return {
      id: tokenRecord.id,
      name: tokenRecord.name,
      secret: rawSecret,
      tokenPrefix: tokenRecord.tokenPrefix,
      expiresAt,
    };
  }

  /**
   * Verifies incoming SCIM Bearer token and returns authenticated workspace.
   */
  public async authenticateScimRequest(authHeader?: string): Promise<{ workspaceId: string; tokenId: string } | null> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.substring(7).trim();
    if (!token.startsWith("ffscim_")) {
      return null;
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const tokenRecord = await prisma.scimProvisioningToken.findUnique({
      where: { tokenHash },
    });

    if (!tokenRecord || tokenRecord.status !== "ACTIVE") {
      return null;
    }

    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      return null;
    }

    // Update last used timestamp asynchronously
    prisma.scimProvisioningToken
      .update({
        where: { id: tokenRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return {
      workspaceId: tokenRecord.workspaceId,
      tokenId: tokenRecord.id,
    };
  }

  /**
   * Formats internal User & Membership into standard SCIM 2.0 User resource.
   */
  private formatScimUser(user: any, baseUrl = "https://api.flowforge.dev"): ScimUserResource {
    const nameParts = (user.name || "").split(" ");
    const givenName = nameParts[0] || "";
    const familyName = nameParts.slice(1).join(" ") || "";

    return {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: user.id,
      userName: user.email,
      name: {
        formatted: user.name || user.email,
        givenName,
        familyName,
      },
      displayName: user.name || user.email,
      active: true,
      emails: [
        {
          value: user.email,
          primary: true,
          type: "work",
        },
      ],
      roles: [
        {
          value: user.memberships?.[0]?.role || "MEMBER",
          primary: true,
        },
      ],
      meta: {
        resourceType: "User",
        created: user.createdAt.toISOString(),
        lastModified: user.updatedAt.toISOString(),
        location: `${baseUrl}/api/v1/scim/v2/Users/${user.id}`,
      },
    };
  }

  /**
   * Lists users in a workspace with bounded pagination and filtering.
   */
  public async listUsers(
    workspaceId: string,
    params: { startIndex?: number; count?: number; filter?: string }
  ): Promise<ScimListResponse<ScimUserResource>> {
    const startIndex = Math.max(1, params.startIndex || 1);
    const count = Math.min(100, Math.max(1, params.count || 20));
    const skip = startIndex - 1;

    let emailFilter: string | undefined;
    if (params.filter) {
      // Basic SCIM filter parsing: userName eq "user@example.com" or emails.value eq "user@example.com"
      const match = params.filter.match(/(?:userName|emails\.value)\s+eq\s+"([^"]+)"/i);
      if (match) {
        emailFilter = match[1].toLowerCase().trim();
      }
    }

    const whereClause: any = {
      workspaceId,
    };

    if (emailFilter) {
      whereClause.user = { email: emailFilter };
    }

    const [totalResults, memberships] = await Promise.all([
      prisma.workspaceMembership.count({ where: whereClause }),
      prisma.workspaceMembership.findMany({
        where: whereClause,
        include: { user: true },
        skip,
        take: count,
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const users = memberships.map((m) =>
      this.formatScimUser({
        ...m.user,
        memberships: [{ role: m.role }],
      })
    );

    return {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults,
      startIndex,
      itemsPerPage: users.length,
      Resources: users,
    };
  }

  /**
   * Retrieves a single provisioned user by ID.
   */
  public async getUser(workspaceId: string, userId: string): Promise<ScimUserResource | null> {
    const membership = await prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: { user: true },
    });

    if (!membership) return null;

    return this.formatScimUser({
      ...membership.user,
      memberships: [{ role: membership.role }],
    });
  }

  /**
   * Provisions a new user into the workspace via SCIM.
   * Strictly enforces 'MEMBER' role to prevent privilege escalation.
   */
  public async provisionUser(workspaceId: string, input: ScimUserInput): Promise<ScimUserResource> {
    const email = (input.userName || input.emails?.[0]?.value || "").toLowerCase().trim();
    if (!email) {
      throw new Error("userName or valid email is required for SCIM user provisioning.");
    }

    const name = input.displayName || input.name?.formatted || input.userName.split("@")[0];

    // Check if user already exists globally
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash: crypto.randomBytes(32).toString("hex"),
        },
      });
    }

    // Upsert membership strictly with 'MEMBER' role
    const membership = await prisma.workspaceMembership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: user.id,
        },
      },
      create: {
        workspaceId,
        userId: user.id,
        role: "MEMBER",
      },
      update: {},
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: user.id,
      action: "SCIM_USER_PROVISIONED",
      entityType: "User",
      entityId: user.id,
      metadata: { email, role: membership.role },
    });

    return this.formatScimUser({
      ...user,
      memberships: [{ role: membership.role }],
    });
  }

  /**
   * Updates attributes of a provisioned user.
   */
  public async updateUser(workspaceId: string, userId: string, input: Partial<ScimUserInput>): Promise<ScimUserResource> {
    const membership = await prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: { user: true },
    });

    if (!membership) {
      throw new Error("User not found in this workspace.");
    }

    const updatedName = input.displayName || input.name?.formatted || membership.user.name;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: updatedName },
    });

    // If deactivated, revoke all user sessions
    if (input.active === false) {
      await this.deactivateUser(workspaceId, userId);
    }

    return this.formatScimUser({
      ...user,
      memberships: [{ role: membership.role }],
    });
  }

  /**
   * Deactivates a provisioned user and instantly revokes all active sessions.
   */
  public async deactivateUser(workspaceId: string, userId: string): Promise<void> {
    // Revoke all active sessions for the user in the database
    await prisma.session.deleteMany({
      where: { userId },
    });

    // Delete workspace membership
    await prisma.workspaceMembership.deleteMany({
      where: {
        workspaceId,
        userId,
      },
    });

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: userId,
      action: "SCIM_USER_DEACTIVATED",
      entityType: "User",
      entityId: userId,
      metadata: { revokedSessions: true },
    });
  }

  /**
   * Lists SCIM tokens for a workspace.
   */
  public async listTokens(workspaceId: string) {
    return prisma.scimProvisioningToken.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        status: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Revokes a SCIM token.
   */
  public async revokeToken(workspaceId: string, tokenId: string) {
    return prisma.scimProvisioningToken.updateMany({
      where: { id: tokenId, workspaceId },
      data: { status: "REVOKED" },
    });
  }
}

export const scimService = new ScimService();
