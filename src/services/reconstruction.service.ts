import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/permissions";
import { NotFoundError } from "@/lib/permissions";

/** Lists every reconstruction version for every space in a project (§21). */
export async function listReconstructionsByProject(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  const spaces = await db.space.findMany({ where: { projectId }, orderBy: { order: "asc" } });
  const reconstructions = await db.reconstruction.findMany({
    where: { projectId },
    orderBy: [{ spaceId: "asc" }, { version: "desc" }],
  });
  return spaces.map((space) => ({
    space,
    versions: reconstructions.filter((r) => r.spaceId === space.id),
  }));
}

/** Restores a previous reconstruction version as current (§21: never overwrite originals). */
export async function restoreReconstructionVersion(userId: string, projectId: string, reconstructionId: string) {
  await requireProjectAccess(userId, projectId, "ADMIN");
  const target = await db.reconstruction.findUnique({ where: { id: reconstructionId } });
  if (!target || target.projectId !== projectId) throw new NotFoundError("Reconstruction not found.");

  await db.reconstruction.updateMany({ where: { spaceId: target.spaceId }, data: { isCurrent: false } });
  return db.reconstruction.update({ where: { id: reconstructionId }, data: { isCurrent: true } });
}
