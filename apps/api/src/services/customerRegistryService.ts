import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateCustomerAccountInput,
  UpdateCustomerAccountInput,
  CreateCustomerContactInput,
  LinkExternalIdentityInput,
} from "@flowforge/shared";

export class CustomerRegistryService {
  /**
   * Creates a tenant-isolated customer account.
   */
  public async createAccount(workspaceId: string, input: CreateCustomerAccountInput) {
    const existing = await prisma.customerAccount.findUnique({
      where: {
        workspaceId_slug: {
          workspaceId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new HttpError(409, `Customer account with slug '${input.slug}' already exists in this workspace.`);
    }

    return prisma.customerAccount.create({
      data: {
        workspaceId,
        slug: input.slug,
        name: input.name,
        domain: input.domain,
        tier: input.tier,
        lifecycleState: input.lifecycleState,
        ownerUserId: input.ownerUserId,
        ownerTeamId: input.ownerTeamId,
        annualContractValue: input.annualContractValue,
        dataClassification: input.dataClassification,
        consentMetadata: input.consentMetadata,
        customAttributes: input.customAttributes,
      },
    });
  }

  /**
   * Retrieves a customer account by ID or slug.
   */
  public async getAccount(workspaceId: string, accountIdOrSlug: string) {
    const account = await prisma.customerAccount.findFirst({
      where: {
        workspaceId,
        OR: [{ id: accountIdOrSlug }, { slug: accountIdOrSlug }],
      },
      include: {
        contacts: true,
        externalIdentities: true,
      },
    });

    if (!account) {
      throw new HttpError(404, `Customer account '${accountIdOrSlug}' not found.`);
    }

    return account;
  }

  /**
   * Lists customer accounts with filtering and pagination.
   */
  public async listAccounts(
    workspaceId: string,
    filters?: {
      lifecycleState?: string;
      healthStatus?: string;
      tier?: string;
      ownerUserId?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const where: any = { workspaceId };
    if (filters?.lifecycleState) where.lifecycleState = filters.lifecycleState;
    if (filters?.healthStatus) where.healthStatus = filters.healthStatus;
    if (filters?.tier) where.tier = filters.tier;
    if (filters?.ownerUserId) where.ownerUserId = filters.ownerUserId;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { slug: { contains: filters.search, mode: "insensitive" } },
        { domain: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [total, accounts] = await Promise.all([
      prisma.customerAccount.count({ where }),
      prisma.customerAccount.findMany({
        where,
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
        orderBy: { updatedAt: "desc" },
        include: {
          _count: {
            select: {
              contacts: true,
              journeys: true,
              tasks: true,
              riskAssessments: true,
            },
          },
        },
      }),
    ]);

    return { total, accounts };
  }

  /**
   * Updates a customer account.
   */
  public async updateAccount(workspaceId: string, accountId: string, input: UpdateCustomerAccountInput) {
    const account = await this.getAccount(workspaceId, accountId);

    return prisma.customerAccount.update({
      where: { id: account.id },
      data: {
        name: input.name,
        domain: input.domain,
        tier: input.tier,
        lifecycleState: input.lifecycleState,
        ownerUserId: input.ownerUserId,
        ownerTeamId: input.ownerTeamId,
        annualContractValue: input.annualContractValue,
        dataClassification: input.dataClassification,
        consentMetadata: input.consentMetadata,
        customAttributes: input.customAttributes,
      },
    });
  }

  /**
   * Adds an authorized contact to a customer account.
   */
  public async addContact(workspaceId: string, accountId: string, input: CreateCustomerContactInput) {
    const account = await this.getAccount(workspaceId, accountId);

    const existing = await prisma.customerContact.findUnique({
      where: {
        customerAccountId_email: {
          customerAccountId: account.id,
          email: input.email.toLowerCase(),
        },
      },
    });

    if (existing) {
      throw new HttpError(409, `Contact with email '${input.email}' already exists for this account.`);
    }

    if (input.isPrimary) {
      // Clear previous primary
      await prisma.customerContact.updateMany({
        where: { customerAccountId: account.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return prisma.customerContact.create({
      data: {
        workspaceId,
        customerAccountId: account.id,
        name: input.name,
        email: input.email.toLowerCase(),
        role: input.role,
        phone: input.phone,
        isPrimary: input.isPrimary,
        consentStatus: input.consentStatus,
        consentMetadata: input.consentMetadata,
      },
    });
  }

  /**
   * Links an external system identity (CRM, Billing, Support) with provenance.
   */
  public async linkExternalIdentity(
    workspaceId: string,
    accountId: string,
    input: LinkExternalIdentityInput
  ) {
    const account = await this.getAccount(workspaceId, accountId);

    // Verify whether external ID is already mapped to another account in this workspace
    const existing = await prisma.customerExternalIdentity.findUnique({
      where: {
        workspaceId_externalSystem_externalId: {
          workspaceId,
          externalSystem: input.externalSystem.toLowerCase(),
          externalId: input.externalId,
        },
      },
    });

    if (existing && existing.customerAccountId !== account.id) {
      throw new HttpError(
        409,
        `External ID '${input.externalId}' in system '${input.externalSystem}' is already linked to another account (${existing.customerAccountId}).`
      );
    }

    const provenance = {
      ...input.provenance,
      linkedAt: new Date().toISOString(),
      verifiedBy: "flowforge_resolver",
    };

    if (existing) {
      return prisma.customerExternalIdentity.update({
        where: { id: existing.id },
        data: {
          systemType: input.systemType,
          connectorId: input.connectorId,
          externalData: input.externalData,
          confidence: input.confidence,
          isPrimary: input.isPrimary,
          provenance,
        },
      });
    }

    return prisma.customerExternalIdentity.create({
      data: {
        workspaceId,
        customerAccountId: account.id,
        systemType: input.systemType,
        connectorId: input.connectorId,
        externalSystem: input.externalSystem.toLowerCase(),
        externalId: input.externalId,
        externalData: input.externalData,
        confidence: input.confidence,
        isPrimary: input.isPrimary,
        verified: input.verified,
        provenance,
      },
    });
  }

  /**
   * Unlinks an external identity while preserving audit provenance.
   */
  public async unlinkExternalIdentity(workspaceId: string, identityId: string) {
    const identity = await prisma.customerExternalIdentity.findFirst({
      where: { id: identityId, workspaceId },
    });

    if (!identity) {
      throw new HttpError(404, `External identity '${identityId}' not found.`);
    }

    return prisma.customerExternalIdentity.delete({
      where: { id: identity.id },
    });
  }

  /**
   * Aggregates a comprehensive Customer 360 profile from authorized FlowForge sources.
   */
  public async getCustomer360Profile(workspaceId: string, accountIdOrSlug: string) {
    const account = await this.getAccount(workspaceId, accountIdOrSlug);

    const [
      activeJourneys,
      latestHealth,
      openRisks,
      activeTasks,
      recentEvents,
      recentApprovals,
    ] = await Promise.all([
      // Active Journeys
      prisma.customerJourneyInstance.findMany({
        where: { customerAccountId: account.id },
        orderBy: { startedAt: "desc" },
        take: 5,
        include: {
          journeyDefinition: { select: { name: true, journeyType: true } },
        },
      }),

      // Latest Health Evaluation
      prisma.customerHealthEvaluation.findFirst({
        where: { customerAccountId: account.id },
        orderBy: { evaluatedAt: "desc" },
      }),

      // Open Risks
      prisma.customerRiskAssessment.findMany({
        where: { customerAccountId: account.id, status: { in: ["DETECTED", "INVESTIGATING", "MITIGATING"] } },
        orderBy: { severity: "desc" },
        take: 10,
      }),

      // Active Tasks
      prisma.customerSuccessTask.findMany({
        where: { customerAccountId: account.id, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } },
        orderBy: { priority: "desc" },
        take: 10,
      }),

      // Recent Platform Events correlated with this account
      prisma.platformEvent.findMany({
        where: {
          workspaceId,
        },
        orderBy: { recordedAt: "desc" },
        take: 10,
        select: {
          id: true,
          eventId: true,
          eventType: true,
          source: true,
          recordedAt: true,
        },
      }),

      // Pending Communication Approvals
      prisma.customerCommunicationApproval.findMany({
        where: { customerAccountId: account.id, status: "PENDING_APPROVAL" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          template: { select: { name: true, category: true } },
        },
      }),
    ]);

    // Data Provenance Summary
    const provenanceSummary = {
      externalSystemsLinked: account.externalIdentities.map((ei) => ({
        system: ei.externalSystem,
        systemType: ei.systemType,
        verified: ei.verified,
        confidence: ei.confidence,
      })),
      dataFreshness: {
        lastActivityAt: account.lastActivityAt || account.updatedAt,
        lastHealthEvaluatedAt: account.lastHealthEvaluatedAt,
      },
      dataClassification: account.dataClassification,
    };

    return {
      account,
      contacts: account.contacts,
      externalIdentities: account.externalIdentities,
      activeJourneys,
      health: {
        status: account.healthStatus,
        score: account.healthScore,
        latestEvaluation: latestHealth,
      },
      openRisks,
      activeTasks,
      recentEvents,
      recentApprovals,
      provenanceSummary,
    };
  }
}

export const customerRegistryService = new CustomerRegistryService();
