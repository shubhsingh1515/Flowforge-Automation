import { HttpError } from "./dataIntelligenceErrors.js";
import { prisma } from "@flowforge/database";
import { QueryDataProductInput } from "@flowforge/shared";

export class DataQueryService {
  /**
   * Safe, bounded, read-only query API for materialized data products.
   */
  public async queryProduct(
    workspaceId: string,
    productId: string,
    input: QueryDataProductInput
  ) {
    const product = await prisma.dataProductDefinition.findFirst({
      where: {
        workspaceId,
        OR: [{ id: productId }, { slug: productId }],
      },
    });

    if (!product) {
      throw new HttpError(404, `Data Product '${productId}' not found.`);
    }

    if (product.lifecycleStatus === "RETIRED") {
      throw new HttpError(400, `Data Product '${product.slug}' is RETIRED and no longer queryable.`);
    }

    // Fetch latest materialized snapshot
    const snapshot = await prisma.dataProductSnapshot.findFirst({
      where: {
        workspaceId,
        dataProductId: product.id,
        status: "MATERIALIZED",
      },
      orderBy: { materializedAt: "desc" },
    });

    if (!snapshot) {
      return {
        product: {
          id: product.id,
          slug: product.slug,
          name: product.name,
          version: product.currentVersion,
          status: product.lifecycleStatus,
        },
        records: [],
        total: 0,
        nextCursor: null,
        snapshot: null,
      };
    }

    let records = (snapshot.records as any[]) || [];

    // 1. Apply filter if present
    if (input.filter) {
      const { field, operator, value } = input.filter;
      records = records.filter((row) => {
        const rowVal = row?.[field];
        switch (operator) {
          case "EQUALS":
            return rowVal === value;
          case "NOT_EQUALS":
            return rowVal !== value;
          case "GREATER_THAN":
            return Number(rowVal) > Number(value);
          case "LESS_THAN":
            return Number(rowVal) < Number(value);
          case "CONTAINS":
            return String(rowVal ?? "").includes(String(value ?? ""));
          case "IN":
            return Array.isArray(value) && value.includes(rowVal);
          default:
            return true;
        }
      });
    }

    // 2. Apply sorting if specified
    if (input.sortBy) {
      const sortField = input.sortBy;
      const asc = input.sortDirection === "asc";
      records.sort((a, b) => {
        const va = a?.[sortField];
        const vb = b?.[sortField];
        if (va < vb) return asc ? -1 : 1;
        if (va > vb) return asc ? 1 : -1;
        return 0;
      });
    }

    const total = records.length;
    const limit = Math.min(input.limit || 50, 500);
    const cursor = Math.max(input.cursor || 0, 0);

    // 3. Paginate
    const paginated = records.slice(cursor, cursor + limit);
    const nextCursor = cursor + limit < total ? cursor + limit : null;

    // 4. Project fields if requested
    let resultRows = paginated;
    if (input.fields && input.fields.length > 0) {
      const requestedFields = new Set(input.fields);
      resultRows = paginated.map((row) => {
        const projected: Record<string, any> = {};
        for (const k of requestedFields) {
          if (row && row[k] !== undefined) {
            projected[k] = row[k];
          }
        }
        return projected;
      });
    }

    return {
      product: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        version: product.currentVersion,
        status: product.lifecycleStatus,
        classification: product.dataClassification,
      },
      records: resultRows,
      total,
      limit,
      cursor,
      nextCursor,
      snapshot: {
        id: snapshot.id,
        materializedAt: snapshot.materializedAt.toISOString(),
        schemaVersion: snapshot.schemaVersion,
        recordCount: snapshot.recordCount,
        byteSize: snapshot.byteSize,
      },
    };
  }
}

export const dataQueryService = new DataQueryService();
