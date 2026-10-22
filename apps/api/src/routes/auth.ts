import { FastifyInstance } from "fastify";
import { prisma } from "@flowforge/database";
import { RegisterSchema, LoginSchema } from "@flowforge/shared";
import { hashPassword, verifyPassword } from "../utils/auth.js";
import { authenticateRequest } from "../plugins/auth.js";
import { config } from "../config.js";

export async function authRoutes(server: FastifyInstance) {
  // Register
  server.post("/auth/register", {
    config: {
      rateLimit: {
        max: config.nodeEnv === "development" ? 1000 : 15,
        timeWindow: "1 minute",
      },
    },
    schema: {
      tags: ["Authentication"],
      summary: "Register a new user account",
      body: RegisterSchema,
    },
    handler: async (request, reply) => {
      const { email, password, name, workspaceName } = RegisterSchema.parse(request.body);

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "An account with this email address already exists.",
          statusCode: 400,
        });
      }

      const passwordHash = hashPassword(password);

      // Create user and their initial workspace
      const user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
        },
      });

      const wsName = workspaceName || `${name.split(" ")[0]}'s Workspace`;
      const baseSlug = wsName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const uniqueSlug = `${baseSlug}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const workspace = await prisma.workspace.create({
        data: {
          name: wsName,
          slug: uniqueSlug,
          ownerId: user.id,
          memberships: {
            create: {
              userId: user.id,
              role: "OWNER",
            },
          },
        },
      });

      const token = server.jwt.sign(
        { userId: user.id, workspaceId: workspace.id, email: user.email },
        { expiresIn: "7d" }
      );

      reply.setCookie("flowforge_session", token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return reply.status(201).send({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          activeWorkspaceId: workspace.id,
          workspaceName: workspace.name,
          createdAt: user.createdAt,
        },
      });
    },
  });

  // Login
  server.post("/auth/login", {
    config: {
      rateLimit: {
        max: config.nodeEnv === "development" ? 1000 : 15,
        timeWindow: "1 minute",
      },
    },
    schema: {
      tags: ["Authentication"],
      summary: "Sign in with email and password",
      body: LoginSchema,
    },
    handler: async (request, reply) => {
      const { email, password } = LoginSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          memberships: {
            include: { workspace: true },
          },
        },
      });

      if (!user || !verifyPassword(password, user.passwordHash)) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Invalid email or password.",
          statusCode: 401,
        });
      }

      const primaryMembership = user.memberships[0];
      const workspaceId = primaryMembership?.workspaceId || "";
      const workspaceName = primaryMembership?.workspace?.name || "Default Workspace";

      const token = server.jwt.sign(
        { userId: user.id, workspaceId, email: user.email },
        { expiresIn: "7d" }
      );

      reply.setCookie("flowforge_session", token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
      });

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          activeWorkspaceId: workspaceId,
          workspaceName,
          createdAt: user.createdAt,
        },
      };
    },
  });

  // Logout
  server.post("/auth/logout", {
    schema: {
      tags: ["Authentication"],
      summary: "Sign out and clear session cookie",
    },
    handler: async (_request, reply) => {
      reply.clearCookie("flowforge_session", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
      return { success: true, message: "Logged out successfully" };
    },
  });

  // Get current user profile
  server.get("/auth/me", {
    schema: {
      tags: ["Authentication"],
      summary: "Get current authenticated user profile and active workspace",
    },
    preHandler: [authenticateRequest],
    handler: async (request, reply) => {
      const authUser = request.authUser!;

      const user = await prisma.user.findUnique({
        where: { id: authUser.id },
        include: {
          memberships: {
            include: { workspace: true },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({ error: "Not Found", message: "User not found" });
      }

      const activeMembership = user.memberships.find((m) => m.workspaceId === authUser.workspaceId) || user.memberships[0];

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          activeWorkspaceId: activeMembership?.workspaceId,
          workspaceName: activeMembership?.workspace?.name || "Workspace",
          role: activeMembership?.role,
          createdAt: user.createdAt,
        },
      };
    },
  });
}
