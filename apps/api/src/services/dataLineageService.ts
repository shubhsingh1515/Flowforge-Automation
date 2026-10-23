import { prisma } from "@flowforge/database";
import {
  RegisterLineageNodeInput,
  RegisterLineageEdgeInput,
  DataLineageGraphDto,
  LineageNodeType,
  LineageRelationType,
} from "@flowforge/shared";

export class DataLineageService {
  /**
   * Registers or updates a node in the lineage catalog.
   */
  public async registerNode(
    workspaceId: string,
    input: RegisterLineageNodeInput
  ) {
    return prisma.dataLineageNode.upsert({
      where: {
        workspaceId_nodeKey: {
          workspaceId,
          nodeKey: input.nodeKey,
        },
      },
      update: {
        nodeType: input.nodeType,
        name: input.name,
        version: input.version,
        metadata: input.metadata || {},
      },
      create: {
        workspaceId,
        nodeKey: input.nodeKey,
        nodeType: input.nodeType,
        name: input.name,
        version: input.version,
        metadata: input.metadata || {},
      },
    });
  }

  /**
   * Registers a directional edge between two lineage nodes.
   */
  public async registerEdge(
    workspaceId: string,
    input: RegisterLineageEdgeInput
  ) {
    return prisma.dataLineageEdge.upsert({
      where: {
        workspaceId_sourceNodeKey_targetNodeKey_relationType: {
          workspaceId,
          sourceNodeKey: input.sourceNodeKey,
          targetNodeKey: input.targetNodeKey,
          relationType: input.relationType,
        },
      },
      update: {
        metadata: input.metadata || {},
      },
      create: {
        workspaceId,
        sourceNodeKey: input.sourceNodeKey,
        targetNodeKey: input.targetNodeKey,
        relationType: input.relationType,
        metadata: input.metadata || {},
      },
    });
  }

  /**
   * Traverses the lineage graph up to maxDepth starting from an optional root node,
   * enforcing cycle prevention and tenant isolation.
   */
  public async getLineageGraph(
    workspaceId: string,
    options?: {
      rootNodeKey?: string;
      direction?: "UPSTREAM" | "DOWNSTREAM" | "BOTH";
      maxDepth?: number;
    }
  ): Promise<DataLineageGraphDto> {
    const direction = options?.direction || "BOTH";
    const maxDepth = Math.min(options?.maxDepth || 5, 10);
    const rootKey = options?.rootNodeKey;

    if (!rootKey) {
      // Return workspace-wide lineage overview bounded to 100 nodes/edges
      const allNodes = await prisma.dataLineageNode.findMany({
        where: { workspaceId },
        take: 100,
      });
      const allEdges = await prisma.dataLineageEdge.findMany({
        where: { workspaceId },
        take: 200,
      });

      return {
        nodes: allNodes.map((n) => ({
          nodeKey: n.nodeKey,
          nodeType: n.nodeType as LineageNodeType,
          name: n.name,
          version: n.version,
          metadata: n.metadata as Record<string, any>,
        })),
        edges: allEdges.map((e) => ({
          sourceNodeKey: e.sourceNodeKey,
          targetNodeKey: e.targetNodeKey,
          relationType: e.relationType as LineageRelationType,
          metadata: e.metadata as Record<string, any>,
        })),
      };
    }

    // BFS Graph Traversal with Cycle Detection
    const visitedKeys = new Set<string>([rootKey]);
    const gatheredEdges: any[] = [];
    let currentLevel = new Set<string>([rootKey]);
    let depth = 0;

    while (currentLevel.size > 0 && depth < maxDepth) {
      const nextLevel = new Set<string>();
      const currentKeys = Array.from(currentLevel);

      // Gather upstream (where target is in currentKeys)
      if (direction === "UPSTREAM" || direction === "BOTH") {
        const upstreamEdges = await prisma.dataLineageEdge.findMany({
          where: {
            workspaceId,
            targetNodeKey: { in: currentKeys },
          },
        });

        for (const edge of upstreamEdges) {
          gatheredEdges.push(edge);
          if (!visitedKeys.has(edge.sourceNodeKey)) {
            visitedKeys.add(edge.sourceNodeKey);
            nextLevel.add(edge.sourceNodeKey);
          }
        }
      }

      // Gather downstream (where source is in currentKeys)
      if (direction === "DOWNSTREAM" || direction === "BOTH") {
        const downstreamEdges = await prisma.dataLineageEdge.findMany({
          where: {
            workspaceId,
            sourceNodeKey: { in: currentKeys },
          },
        });

        for (const edge of downstreamEdges) {
          gatheredEdges.push(edge);
          if (!visitedKeys.has(edge.targetNodeKey)) {
            visitedKeys.add(edge.targetNodeKey);
            nextLevel.add(edge.targetNodeKey);
          }
        }
      }

      currentLevel = nextLevel;
      depth++;
    }

    // Fetch details for all visited nodes
    const nodes = await prisma.dataLineageNode.findMany({
      where: {
        workspaceId,
        nodeKey: { in: Array.from(visitedKeys) },
      },
    });

    // Deduplicate edges
    const edgeMap = new Map<string, any>();
    for (const e of gatheredEdges) {
      const edgeId = `${e.sourceNodeKey}->${e.targetNodeKey}:${e.relationType}`;
      if (!edgeMap.has(edgeId)) {
        edgeMap.set(edgeId, e);
      }
    }

    return {
      nodes: nodes.map((n) => ({
        nodeKey: n.nodeKey,
        nodeType: n.nodeType as LineageNodeType,
        name: n.name,
        version: n.version,
        metadata: n.metadata as Record<string, any>,
      })),
      edges: Array.from(edgeMap.values()).map((e) => ({
        sourceNodeKey: e.sourceNodeKey,
        targetNodeKey: e.targetNodeKey,
        relationType: e.relationType as LineageRelationType,
        metadata: e.metadata as Record<string, any>,
      })),
    };
  }
}

export const dataLineageService = new DataLineageService();
