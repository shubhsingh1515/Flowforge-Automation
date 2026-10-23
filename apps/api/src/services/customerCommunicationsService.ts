import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import { CreateCommunicationTemplateInput, RequestCommunicationApprovalInput } from "@flowforge/shared";

export class CustomerCommunicationsService {
  /**
   * Creates an approved communication template.
   */
  public async createTemplate(workspaceId: string, input: CreateCommunicationTemplateInput) {
    const existing = await prisma.customerCommunicationTemplate.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new HttpError(409, `Template with slug '${input.slug}' already exists.`);
    }

    return prisma.customerCommunicationTemplate.create({
      data: {
        workspaceId,
        name: input.name,
        slug: input.slug,
        category: input.category,
        subject: input.subject,
        bodyTemplate: input.bodyTemplate,
        requiredVariables: input.requiredVariables,
        requiresApproval: input.requiresApproval,
      },
    });
  }

  /**
   * Lists communication templates.
   */
  public async listTemplates(workspaceId: string) {
    return prisma.customerCommunicationTemplate.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Requests approval for a drafted customer communication, enforcing consent and variable validation.
   */
  public async requestApproval(workspaceId: string, input: RequestCommunicationApprovalInput) {
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
      include: { contacts: true },
    });
    if (!account) throw new HttpError(404, `Customer account '${input.customerAccountId}' not found.`);

    const template = await prisma.customerCommunicationTemplate.findFirst({
      where: { id: input.templateId, workspaceId },
    });
    if (!template) throw new HttpError(404, `Template '${input.templateId}' not found.`);

    // Check contact consent if contact specified or email matches
    const contact = account.contacts.find((c) => c.email.toLowerCase() === input.recipientEmail.toLowerCase());
    if (contact && contact.consentStatus === "OPTED_OUT") {
      throw new HttpError(400, `Cannot send communication: Recipient '${input.recipientEmail}' has explicitly opted out.`);
    }

    // Verify required template variables
    const vars = input.templateVariables || {};
    for (const reqVar of template.requiredVariables) {
      if (!vars[reqVar]) {
        throw new HttpError(400, `Missing required template variable '${reqVar}'.`);
      }
    }

    // Render variables
    let renderedSubject = template.subject;
    let renderedBody = template.bodyTemplate;

    const allVars: Record<string, any> = {
      accountName: account.name,
      accountSlug: account.slug,
      tier: account.tier,
      ...vars,
    };

    for (const [key, val] of Object.entries(allVars)) {
      const token = `{{${key}}}`;
      renderedSubject = renderedSubject.replaceAll(token, String(val));
      renderedBody = renderedBody.replaceAll(token, String(val));
    }

    return prisma.customerCommunicationApproval.create({
      data: {
        workspaceId,
        templateId: template.id,
        customerAccountId: account.id,
        contactId: contact?.id || input.contactId,
        recipientEmail: input.recipientEmail.toLowerCase(),
        renderedSubject,
        renderedBody,
        status: template.requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
      },
    });
  }

  /**
   * Approves and authorizes a drafted customer communication.
   */
  public async approveCommunication(workspaceId: string, approvalId: string, userId: string, role: string) {
    const approval = await prisma.customerCommunicationApproval.findFirst({
      where: { id: approvalId, workspaceId },
    });
    if (!approval) throw new HttpError(404, `Communication approval '${approvalId}' not found.`);

    if (role !== "ADMIN" && role !== "OWNER") {
      throw new HttpError(403, "Only workspace ADMIN or OWNER roles may approve customer-facing communications.");
    }

    return prisma.customerCommunicationApproval.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        approvedById: userId,
        approvedAt: new Date(),
        sentAt: new Date(),
        deliveryStatus: "DELIVERED",
      },
    });
  }

  /**
   * Rejects a communication approval.
   */
  public async rejectCommunication(workspaceId: string, approvalId: string) {
    const approval = await prisma.customerCommunicationApproval.findFirst({
      where: { id: approvalId, workspaceId },
    });
    if (!approval) throw new HttpError(404, `Communication approval '${approvalId}' not found.`);

    return prisma.customerCommunicationApproval.update({
      where: { id: approval.id },
      data: {
        status: "REJECTED",
      },
    });
  }
}

export const customerCommunicationsService = new CustomerCommunicationsService();
