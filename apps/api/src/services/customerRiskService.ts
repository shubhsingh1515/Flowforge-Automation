import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import { CreateCustomerRiskAssessmentInput } from "@flowforge/shared";

export class CustomerRiskService {
  /**
   * Creates or records a customer risk assessment.
   */
  public async recordRisk(workspaceId: string, input: CreateCustomerRiskAssessmentInput) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
    });
    if (!account) throw new HttpError(404, `Customer account '${input.customerAccountId}' not found.`);

    // Check if duplicate open risk exists in observation window
    const existing = await prisma.customerRiskAssessment.findFirst({
      where: {
        workspaceId,
        customerAccountId: account.id,
        riskCategory: input.riskCategory,
        status: { in: ["DETECTED", "INVESTIGATING", "MITIGATING"] },
      },
    });

    const now = new Date();
    if (existing) {
      // Update lastObservedAt and severity
      return prisma.customerRiskAssessment.update({
        where: { id: existing.id },
        data: {
          severity: input.severity,
          summary: input.summary,
          evidenceReferences: input.evidenceReferences,
          probability: input.probability,
          confidence: input.confidence,
          recommendedAction: input.recommendedAction,
          lastObservedAt: now,
        },
      });
    }

    return prisma.customerRiskAssessment.create({
      data: {
        workspaceId,
        customerAccountId: account.id,
        riskCategory: input.riskCategory,
        severity: input.severity,
        status: "DETECTED",
        summary: input.summary,
        evidenceReferences: input.evidenceReferences,
        probability: input.probability,
        confidence: input.confidence,
        recommendedAction: input.recommendedAction,
        journeyInstanceId: input.journeyInstanceId,
        firstDetectedAt: now,
        lastObservedAt: now,
      },
    });
  }

  /**
   * Resolves or dismisses a risk assessment.
   */
  public async resolveRisk(
    workspaceId: string,
    riskId: string,
    status: "RESOLVED" | "DISMISSED",
    resolutionNotes?: string
  ) {
    const risk = await prisma.customerRiskAssessment.findFirst({
      where: { id: riskId, workspaceId },
    });
    if (!risk) throw new HttpError(404, `Risk assessment '${riskId}' not found.`);

    return prisma.customerRiskAssessment.update({
      where: { id: risk.id },
      data: {
        status,
        resolvedAt: new Date(),
        resolutionNotes,
      },
    });
  }

  /**
   * Lists risk assessments with filters.
   */
  public async listRisks(
    workspaceId: string,
    filters?: { customerAccountId?: string; riskCategory?: string; severity?: string; status?: string }
  ) {
    const where: any = { workspaceId };
    if (filters?.customerAccountId) where.customerAccountId = filters.customerAccountId;
    if (filters?.riskCategory) where.riskCategory = filters.riskCategory;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.status) where.status = filters.status;

    return prisma.customerRiskAssessment.findMany({
      where,
      orderBy: { severity: "desc" },
      include: {
        customerAccount: { select: { id: true, name: true, slug: true, tier: true } },
      },
    });
  }
}

export const customerRiskService = new CustomerRiskService();
