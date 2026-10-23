import crypto from "crypto";
import { prisma } from "@flowforge/database";
import { CreateWorkflowReviewInput, DecideWorkflowReviewInput, AddReviewCommentInput } from "@flowforge/shared";
import { notificationService } from "./notifications.js";

export function computeGraphHash(nodes: any, edges: any): string {
  const canonical = JSON.stringify({
    nodes: Array.isArray(nodes) ? nodes : [],
    edges: Array.isArray(edges) ? edges : [],
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export class ReviewService {
  /**
   * Submits a workflow version for collaborative change review.
   */
  async createReview(workspaceId: string, actorUserId: string, input: CreateWorkflowReviewInput) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: input.workflowId, workspaceId },
      include: {
        versions: {
          where: { version: input.workflowVersionNumber },
        },
      },
    });

    if (!workflow) {
      const error: any = new Error("Workflow not found in this workspace.");
      error.statusCode = 404;
      throw error;
    }

    const version = workflow.versions[0];
    if (!version) {
      const error: any = new Error(`Workflow version ${input.workflowVersionNumber} not found.`);
      error.statusCode = 404;
      throw error;
    }

    const contentHash = computeGraphHash(version.nodes, version.edges);

    // Create review bound to exact content hash
    const review = await prisma.workflowReview.create({
      data: {
        workspaceId,
        workflowId: input.workflowId,
        workflowVersionNumber: input.workflowVersionNumber,
        contentHash,
        title: input.title,
        changeSummary: input.changeSummary,
        authorUserId: actorUserId,
        status: "SUBMITTED",
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        workflow: { select: { id: true, name: true, criticality: true } },
      },
    });

    // Update workflow lifecycle status to UNDER_REVIEW
    await prisma.workflow.update({
      where: { id: input.workflowId },
      data: { lifecycleStatus: "UNDER_REVIEW" },
    });

    // Notify workspace admins & owners
    const admins = await prisma.workspaceMembership.findMany({
      where: {
        workspaceId,
        role: { in: ["OWNER", "ADMIN"] },
        userId: { not: actorUserId },
      },
    });

    for (const adm of admins) {
      await notificationService.createNotification({
        workspaceId,
        userId: adm.userId,
        type: "DEPLOYMENT_NEEDS_APPROVAL",
        title: `Workflow Review Requested: ${workflow.name}`,
        message: `Review submitted by ${review.author.name}: "${review.title}" (v${input.workflowVersionNumber})`,
        link: `/governance?tab=reviews&reviewId=${review.id}`,
        category: "info",
      });
    }

    return review;
  }

  /**
   * Lists reviews in the workspace.
   */
  async listReviews(workspaceId: string, query?: { status?: string; workflowId?: string }) {
    const where: any = { workspaceId };
    if (query?.status && query.status !== "ALL") {
      where.status = query.status;
    }
    if (query?.workflowId) {
      where.workflowId = query.workflowId;
    }

    const reviews = await prisma.workflowReview.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reviewer: { select: { id: true, name: true, email: true } },
        workflow: { select: { id: true, name: true, criticality: true, status: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return reviews;
  }

  /**
   * Retrieves single review with comments and hash integrity check.
   */
  async getReview(workspaceId: string, reviewId: string) {
    const review = await prisma.workflowReview.findFirst({
      where: { id: reviewId, workspaceId },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reviewer: { select: { id: true, name: true, email: true } },
        workflow: {
          include: {
            versions: {
              orderBy: { version: "desc" },
              take: 1,
            },
          },
        },
        comments: {
          include: {
            author: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!review) {
      const error: any = new Error("Review not found.");
      error.statusCode = 404;
      throw error;
    }

    // Check if the underlying draft has diverged from the reviewed hash
    const latestVersion = review.workflow.versions[0];
    const currentHash = latestVersion ? computeGraphHash(latestVersion.nodes, latestVersion.edges) : "";
    const isHashMatched = review.contentHash === currentHash;

    return {
      ...review,
      currentHash,
      isHashMatched,
    };
  }

  /**
   * Decides a review (APPROVED, CHANGES_REQUESTED, REJECTED).
   */
  async decideReview(
    workspaceId: string,
    actorUserId: string,
    reviewId: string,
    input: DecideWorkflowReviewInput
  ) {
    const review = await prisma.workflowReview.findFirst({
      where: { id: reviewId, workspaceId },
      include: {
        workflow: {
          include: {
            versions: {
              where: { version: reviewId ? undefined : 1 },
              orderBy: { version: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!review) {
      const error: any = new Error("Review not found.");
      error.statusCode = 404;
      throw error;
    }

    // Self-approval protection
    if (review.authorUserId === actorUserId && input.decision === "APPROVED") {
      const error: any = new Error("Self-approval is prohibited: The review author cannot approve their own changes.");
      error.statusCode = 403;
      throw error;
    }

    // Check user role in workspace
    const membership = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
    });
    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      const error: any = new Error("Only workspace Administrators or Owners can decide collaborative reviews.");
      error.statusCode = 403;
      throw error;
    }

    // Hash check: if underlying workflow draft was modified since submission, approval is invalidated!
    const latestVersion = review.workflow.versions[0];
    const currentHash = latestVersion ? computeGraphHash(latestVersion.nodes, latestVersion.edges) : "";

    if (currentHash !== review.contentHash) {
      await prisma.workflowReview.update({
        where: { id: review.id },
        data: {
          status: "SUPERSEDED",
          decisionReason: "Draft was modified after review submission. Approval invalidated.",
        },
      });
      const error: any = new Error(
        "Stale review detected: The underlying workflow draft was modified after submission. Review marked SUPERSEDED. A fresh review must be submitted."
      );
      error.statusCode = 409;
      throw error;
    }

    const updated = await prisma.workflowReview.update({
      where: { id: review.id },
      data: {
        status: input.decision,
        reviewerUserId: actorUserId,
        decisionReason: input.reason,
        decidedAt: new Date(),
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
    });

    // If APPROVED, transition workflow lifecycleStatus to ACTIVE
    if (input.decision === "APPROVED") {
      await prisma.workflow.update({
        where: { id: review.workflowId },
        data: { lifecycleStatus: "ACTIVE" },
      });
    } else if (input.decision === "CHANGES_REQUESTED" || input.decision === "REJECTED") {
      await prisma.workflow.update({
        where: { id: review.workflowId },
        data: { lifecycleStatus: "DRAFT" },
      });
    }

    // Notify review author
    await notificationService.createNotification({
      workspaceId,
      userId: review.authorUserId,
      type: input.decision === "APPROVED" ? "EXECUTION_SUCCEEDED" : "EXECUTION_FAILED",
      title: `Workflow Review ${input.decision}: ${review.title}`,
      message: `Your review for '${review.workflow.name}' was ${input.decision.toLowerCase().replace("_", " ")} by ${updated.reviewer?.name}.`,
      link: `/governance?tab=reviews&reviewId=${review.id}`,
      category: input.decision === "APPROVED" ? "success" : "warning",
    });

    return updated;
  }

  /**
   * Appends an auditable comment to a review.
   */
  async addComment(
    workspaceId: string,
    actorUserId: string,
    reviewId: string,
    input: AddReviewCommentInput
  ) {
    const review = await prisma.workflowReview.findFirst({
      where: { id: reviewId, workspaceId },
    });
    if (!review) {
      const error: any = new Error("Review not found.");
      error.statusCode = 404;
      throw error;
    }

    const comment = await prisma.workflowReviewComment.create({
      data: {
        reviewId,
        authorUserId: actorUserId,
        nodeId: input.nodeId,
        comment: input.comment,
      },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    return comment;
  }

  /**
   * Invalidates any submitted or approved reviews if the workflow draft graph is modified.
   */
  async invalidatePendingReviewsOnGraphChange(workflowId: string, newHash: string) {
    const activeReviews = await prisma.workflowReview.findMany({
      where: {
        workflowId,
        status: { in: ["SUBMITTED", "APPROVED"] },
      },
    });

    for (const r of activeReviews) {
      if (r.contentHash !== newHash) {
        await prisma.workflowReview.update({
          where: { id: r.id },
          data: {
            status: "SUPERSEDED",
            decisionReason: "Draft was modified after review. Status marked SUPERSEDED.",
          },
        });
      }
    }
  }
}

export const reviewService = new ReviewService();
