import { db } from "@/lib/db";
import type { Space, SpatialQueryFilter, SpatialQueryMatch, SpatialRelation } from "@/types";

/**
 * Structured Spatial Query Engine (blueprint §21: "never let the LLM
 * invent distances"; platform spec §13/§17). Every answer here is
 * computed from real database rows — filters, graph traversal, relation
 * lookups — never from a language model's guess. This is the "Spatial
 * Engine" tool layer an AI agent calls (blueprint §22); see
 * `src/providers/ai/mock-ai-provider.ts` for how a (non-LLM) intent
 * parser routes questions into calls against this file.
 */

function toDomainSpace(s: {
  id: string;
  projectId: string;
  name: string;
  kind: string;
  order: number;
  coverAssetId: string | null;
  parentSpaceId: string | null;
  createdAt: Date;
}): Space {
  return {
    id: s.id,
    projectId: s.projectId,
    name: s.name,
    kind: s.kind as Space["kind"],
    order: s.order,
    coverAssetId: s.coverAssetId,
    parentSpaceId: s.parentSpaceId,
    createdAt: s.createdAt.toISOString(),
  };
}

function toDomainRelation(r: {
  id: string;
  projectId: string;
  subjectType: string;
  subjectId: string;
  predicate: string;
  objectType: string;
  objectId: string | null;
  objectLabel: string | null;
  confidence: number;
  provenance: string;
  createdAt: Date;
}): SpatialRelation {
  return {
    id: r.id,
    projectId: r.projectId,
    subjectType: r.subjectType as SpatialRelation["subjectType"],
    subjectId: r.subjectId,
    predicate: r.predicate,
    objectType: r.objectType as SpatialRelation["objectType"],
    objectId: r.objectId,
    objectLabel: r.objectLabel,
    confidence: r.confidence,
    provenance: r.provenance as SpatialRelation["provenance"],
    createdAt: r.createdAt.toISOString(),
  };
}

/** BFS shortest-path hop count over the navigation graph (SpaceConnection), not a fabricated distance. */
export async function calculateHopDistance(
  projectId: string,
  fromSpaceId: string,
  toSpaceId: string
): Promise<number | null> {
  if (fromSpaceId === toSpaceId) return 0;

  const edges = await db.spaceConnection.findMany({
    where: { fromSpace: { projectId } },
    select: { fromSpaceId: true, toSpaceId: true },
  });
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.fromSpaceId)) adjacency.set(edge.fromSpaceId, []);
    adjacency.get(edge.fromSpaceId)!.push(edge.toSpaceId);
  }

  const visited = new Set([fromSpaceId]);
  let frontier = [fromSpaceId];
  let hops = 0;

  while (frontier.length > 0) {
    hops += 1;
    const next: string[] = [];
    for (const spaceId of frontier) {
      for (const neighbor of adjacency.get(spaceId) ?? []) {
        if (neighbor === toSpaceId) return hops;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
    if (hops > 50) return null; // guard against pathological graphs
  }
  return null; // unreachable
}

/** Structured search over a project's spaces (§13/§21). No free-text ranking, no invented results. */
export async function findSpaces(projectId: string, filter: SpatialQueryFilter): Promise<SpatialQueryMatch[]> {
  const where: Record<string, unknown> = { projectId };
  if (filter.kind) where.kind = filter.kind;
  if (filter.parentSpaceId) where.parentSpaceId = filter.parentSpaceId;

  let candidateSpaces = await db.space.findMany({ where });

  let matchedRelationsBySpace = new Map<string, SpatialRelation[]>();

  if (filter.hasRelation) {
    const relations = await db.spatialRelation.findMany({
      where: {
        projectId,
        subjectType: "SPACE",
        predicate: filter.hasRelation,
        ...(filter.relationTarget
          ? {
              OR: [
                { objectLabel: { contains: filter.relationTarget } },
                { objectId: filter.relationTarget },
              ],
            }
          : {}),
      },
    });
    const matchingSpaceIds = new Set(relations.map((r) => r.subjectId));
    candidateSpaces = candidateSpaces.filter((s) => matchingSpaceIds.has(s.id));
    matchedRelationsBySpace = new Map();
    for (const r of relations) {
      const domain = toDomainRelation(r);
      const list = matchedRelationsBySpace.get(r.subjectId) ?? [];
      list.push(domain);
      matchedRelationsBySpace.set(r.subjectId, list);
    }
  }

  let hopsBySpace: Map<string, number> | null = null;
  if (filter.nearSpaceId) {
    hopsBySpace = new Map();
    for (const space of candidateSpaces) {
      const hops = await calculateHopDistance(projectId, filter.nearSpaceId, space.id);
      if (hops !== null && (filter.maxHops === undefined || hops <= filter.maxHops)) {
        hopsBySpace.set(space.id, hops);
      }
    }
    candidateSpaces = candidateSpaces.filter((s) => hopsBySpace!.has(s.id));
  }

  return candidateSpaces
    .map((s) => ({
      space: toDomainSpace(s),
      distanceHops: hopsBySpace?.get(s.id),
      matchedRelations: matchedRelationsBySpace.get(s.id) ?? [],
    }))
    .sort((a, b) => (a.distanceHops ?? 0) - (b.distanceHops ?? 0));
}

export async function getRelationsForSpace(projectId: string, spaceId: string): Promise<SpatialRelation[]> {
  const relations = await db.spatialRelation.findMany({
    where: { projectId, subjectType: "SPACE", subjectId: spaceId },
    orderBy: { createdAt: "asc" },
  });
  return relations.map(toDomainRelation);
}

/**
 * Assembles the real-graph context an AIProvider needs to answer a
 * question honestly (spaces + relations + navigation edges) — shared by
 * the owner-facing and public concierge routes so both reason over the
 * exact same data.
 */
export async function getConciergeContext(projectId: string) {
  const [spaceRows, relationRows, connectionRows] = await Promise.all([
    db.space.findMany({ where: { projectId } }),
    db.spatialRelation.findMany({ where: { projectId } }),
    db.spaceConnection.findMany({ where: { fromSpace: { projectId } }, select: { fromSpaceId: true, toSpaceId: true } }),
  ]);

  return {
    spaces: spaceRows.map(toDomainSpace),
    relations: relationRows.map(toDomainRelation),
    connections: connectionRows,
  };
}
