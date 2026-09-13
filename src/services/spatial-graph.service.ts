import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/permissions";
import type { Provenance, RelationEntityType } from "@/types";

/**
 * Spatial Knowledge Graph edges (§12 of the platform spec; §17/§20/§29 of
 * the R&D blueprint: "Scene Graph" / "Spatial Graph" / "Reality
 * Provenance"). A `SpatialRelation` is a typed, subject-predicate-object
 * edge — `Room 204 --overlooks--> Pool Deck`, `Room 204 --has--> "balcony"`
 * — which is what lets `spatial-query.service.ts` answer structured
 * questions ("which rooms have balconies?") without an LLM inventing the
 * answer (blueprint §21/§65: reality over hallucination).
 */
export async function createRelation(
  userId: string,
  projectId: string,
  input: {
    subjectType: Exclude<RelationEntityType, "CONCEPT">;
    subjectId: string;
    predicate: string;
    objectType: RelationEntityType;
    objectId?: string;
    objectLabel?: string;
    confidence?: number;
    provenance?: Provenance;
  }
) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  if (input.objectType === "CONCEPT" && !input.objectLabel) {
    throw new Error("objectLabel is required when objectType is CONCEPT.");
  }
  if (input.objectType !== "CONCEPT" && !input.objectId) {
    throw new Error("objectId is required when objectType is SPACE or OBJECT.");
  }

  return db.spatialRelation.create({
    data: {
      projectId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      predicate: input.predicate,
      objectType: input.objectType,
      objectId: input.objectId,
      objectLabel: input.objectLabel,
      confidence: input.confidence ?? 1,
      provenance: input.provenance ?? "REAL", // a human-authored relation is REAL by default
    },
  });
}

export async function listRelationsForProject(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  return db.spatialRelation.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
}

export async function deleteRelation(userId: string, projectId: string, relationId: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  const relation = await db.spatialRelation.findUnique({ where: { id: relationId } });
  if (!relation || relation.projectId !== projectId) throw new Error("Relation not found.");
  await db.spatialRelation.delete({ where: { id: relationId } });
}
