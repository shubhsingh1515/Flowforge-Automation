import { prisma } from "@flowforge/database";
import { HttpError } from "./dataIntelligenceErrors.js";
import {
  CreateCustomerContractInput,
  UpdateCustomerContractInput,
  ContractStatus,
  PERMITTED_CONTRACT_STATUS_TRANSITIONS,
} from "@flowforge/shared";
import { auditLogService } from "./auditLog.js";

export class CustomerContractService {
  /**
   * Creates a tenant-isolated customer contract.
   */
  public async createContract(
    workspaceId: string,
    input: CreateCustomerContractInput,
    actorId?: string
  ) {
    // 1. Verify customer account exists in this workspace
    const account = await prisma.customerAccount.findFirst({
      where: { id: input.customerAccountId, workspaceId },
    });
    if (!account) {
      throw new HttpError(404, `Customer account '${input.customerAccountId}' not found in workspace.`);
    }

    // 2. Validate dates
    const startDate = new Date(input.startDate);
    const termEndDate = new Date(input.termEndDate);
    const renewalDate = new Date(input.renewalDate);

    if (termEndDate < startDate) {
      throw new HttpError(400, "Contract term end date cannot be earlier than start date.");
    }
    if (renewalDate < startDate) {
      throw new HttpError(400, "Contract renewal date cannot be earlier than start date.");
    }

    // 3. Uniqueness check for contractNumber in workspace
    const existing = await prisma.customerContract.findUnique({
      where: {
        workspaceId_contractNumber: {
          workspaceId,
          contractNumber: input.contractNumber,
        },
      },
    });
    if (existing) {
      throw new HttpError(409, `Contract with number '${input.contractNumber}' already exists in this workspace.`);
    }

    // 4. Create contract
    const contract = await prisma.customerContract.create({
      data: {
        workspaceId,
        customerAccountId: input.customerAccountId,
        contractNumber: input.contractNumber,
        name: input.name,
        externalReference: input.externalReference,
        status: input.status,
        ownerUserId: input.ownerUserId || account.ownerUserId,
        startDate,
        termEndDate,
        renewalDate,
        renewalNoticeDeadline: input.renewalNoticeDeadline ? new Date(input.renewalNoticeDeadline) : null,
        contractValue: Math.round(input.contractValue * 100) / 100,
        annualRecurringValue: input.annualRecurringValue !== undefined
          ? Math.round(input.annualRecurringValue * 100) / 100
          : null,
        currency: input.currency.toUpperCase(),
        contractType: input.contractType,
        renewalType: input.renewalType,
        autoRenew: input.autoRenew,
        renewalTermsDays: input.renewalTermsDays,
        noticePeriodDays: input.noticePeriodDays,
        sourceSystem: input.sourceSystem || "MANUAL",
        externalContractId: input.externalContractId,
        dataClassification: input.dataClassification,
        previousContractId: input.previousContractId,
        createdById: actorId,
        updatedById: actorId,
      },
    });

    // 5. Record creation change
    await prisma.customerContractChange.create({
      data: {
        workspaceId,
        contractId: contract.id,
        changeType: "CREATED",
        newValue: JSON.stringify({
          contractNumber: contract.contractNumber,
          contractValue: contract.contractValue,
          currency: contract.currency,
          status: contract.status,
        }),
        actorId: actorId || "SYSTEM",
        source: actorId ? "USER" : "SYSTEM",
      },
    });

    // 6. Audit log
    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "customer.contract.created",
      targetType: "CustomerContract",
      targetId: contract.id,
      metadata: { contractNumber: contract.contractNumber, customerAccountId: contract.customerAccountId },
    });

    return contract;
  }

  /**
   * Retrieves a contract by ID or contractNumber.
   */
  public async getContract(workspaceId: string, contractIdOrNumber: string) {
    const contract = await prisma.customerContract.findFirst({
      where: {
        workspaceId,
        OR: [{ id: contractIdOrNumber }, { contractNumber: contractIdOrNumber }],
      },
      include: {
        customerAccount: {
          select: { id: true, name: true, slug: true, tier: true, healthStatus: true, healthScore: true },
        },
        changes: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        renewalOpportunities: {
          orderBy: { targetDate: "asc" },
        },
        previousContract: {
          select: { id: true, contractNumber: true, name: true, contractValue: true, status: true },
        },
        successorContracts: {
          select: { id: true, contractNumber: true, name: true, contractValue: true, status: true },
        },
      },
    });

    if (!contract) {
      throw new HttpError(404, `Contract '${contractIdOrNumber}' not found.`);
    }

    return contract;
  }

  /**
   * Lists contracts with tenant isolation, filters, and pagination.
   */
  public async listContracts(
    workspaceId: string,
    filters?: {
      customerAccountId?: string;
      status?: string;
      ownerUserId?: string;
      currency?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const where: any = { workspaceId };

    if (filters?.customerAccountId) where.customerAccountId = filters.customerAccountId;
    if (filters?.status) where.status = filters.status;
    if (filters?.ownerUserId) where.ownerUserId = filters.ownerUserId;
    if (filters?.currency) where.currency = filters.currency.toUpperCase();
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { contractNumber: { contains: filters.search, mode: "insensitive" } },
        { externalReference: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.customerContract.count({ where }),
      prisma.customerContract.findMany({
        where,
        include: {
          customerAccount: {
            select: { id: true, name: true, slug: true, healthStatus: true },
          },
        },
        orderBy: { renewalDate: "asc" },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      }),
    ]);

    return { total, items, limit: filters?.limit || 50, offset: filters?.offset || 0 };
  }

  /**
   * Updates an existing contract and records auditable changes.
   */
  public async updateContract(
    workspaceId: string,
    contractId: string,
    input: UpdateCustomerContractInput,
    actorId?: string
  ) {
    const existing = await prisma.customerContract.findFirst({
      where: { id: contractId, workspaceId },
    });
    if (!existing) {
      throw new HttpError(404, `Contract '${contractId}' not found.`);
    }

    // Validate status transition if changing
    if (input.status && input.status !== existing.status) {
      const allowed = PERMITTED_CONTRACT_STATUS_TRANSITIONS[existing.status as ContractStatus] || [];
      if (!allowed.includes(input.status as ContractStatus)) {
        throw new HttpError(
          400,
          `Invalid contract status transition from '${existing.status}' to '${input.status}'. Permitted: [${allowed.join(", ")}]`
        );
      }
    }

    const data: any = { updatedById: actorId };
    if (input.name !== undefined) data.name = input.name;
    if (input.externalReference !== undefined) data.externalReference = input.externalReference;
    if (input.status !== undefined) data.status = input.status;
    if (input.ownerUserId !== undefined) data.ownerUserId = input.ownerUserId;
    if (input.renewalDate !== undefined) data.renewalDate = new Date(input.renewalDate);
    if (input.renewalNoticeDeadline !== undefined) {
      data.renewalNoticeDeadline = input.renewalNoticeDeadline ? new Date(input.renewalNoticeDeadline) : null;
    }
    if (input.contractValue !== undefined) data.contractValue = Math.round(input.contractValue * 100) / 100;
    if (input.annualRecurringValue !== undefined) {
      data.annualRecurringValue = input.annualRecurringValue !== null
        ? Math.round(input.annualRecurringValue * 100) / 100
        : null;
    }
    if (input.renewalType !== undefined) data.renewalType = input.renewalType;
    if (input.autoRenew !== undefined) data.autoRenew = input.autoRenew;
    if (input.renewalTermsDays !== undefined) data.renewalTermsDays = input.renewalTermsDays;
    if (input.noticePeriodDays !== undefined) data.noticePeriodDays = input.noticePeriodDays;
    if (input.dataClassification !== undefined) data.dataClassification = input.dataClassification;

    const updated = await prisma.customerContract.update({
      where: { id: contractId },
      data,
    });

    // Record change history if value or status changed
    if (input.status && input.status !== existing.status) {
      await prisma.customerContractChange.create({
        data: {
          workspaceId,
          contractId,
          changeType: "STATUS_CHANGED",
          fieldName: "status",
          previousValue: existing.status,
          newValue: input.status,
          reason: input.changeReason || "Status updated",
          actorId: actorId || "SYSTEM",
          source: actorId ? "USER" : "SYSTEM",
        },
      });
    }

    if (input.contractValue !== undefined && input.contractValue !== existing.contractValue) {
      await prisma.customerContractChange.create({
        data: {
          workspaceId,
          contractId,
          changeType: "VALUE_ADJUSTED",
          fieldName: "contractValue",
          previousValue: String(existing.contractValue),
          newValue: String(input.contractValue),
          reason: input.changeReason || "Contract value updated",
          actorId: actorId || "SYSTEM",
          source: actorId ? "USER" : "SYSTEM",
        },
      });
    }

    await auditLogService.recordEvent({
      workspaceId,
      actorUserId: actorId,
      action: "customer.contract.updated",
      targetType: "CustomerContract",
      targetId: contractId,
      metadata: { contractNumber: updated.contractNumber, updates: Object.keys(data) },
    });

    return updated;
  }

  /**
   * Retrieves change history for a contract.
   */
  public async getContractChanges(workspaceId: string, contractId: string) {
    const contract = await prisma.customerContract.findFirst({
      where: { id: contractId, workspaceId },
    });
    if (!contract) {
      throw new HttpError(404, `Contract '${contractId}' not found.`);
    }

    return prisma.customerContractChange.findMany({
      where: { workspaceId, contractId },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const customerContractService = new CustomerContractService();
