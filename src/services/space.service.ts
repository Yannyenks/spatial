import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/permissions";
import { assertCanCreateSpace } from "@/lib/quotas";
import type { HotspotType, SpaceKind } from "@/types";

export async function createSpace(
  userId: string,
  projectId: string,
  name: string,
  kind: SpaceKind,
  parentSpaceId?: string
) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  await assertCanCreateSpace(projectId);
  if (parentSpaceId) {
    const parent = await db.space.findUnique({ where: { id: parentSpaceId } });
    if (!parent || parent.projectId !== projectId) {
      throw new Error("Parent space does not exist in this project.");
    }
  }
  const count = await db.space.count({ where: { projectId } });
  return db.space.create({ data: { projectId, name, kind, order: count, parentSpaceId } });
}

export async function listSpaces(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  return db.space.findMany({ where: { projectId }, orderBy: { order: "asc" } });
}

export async function getSpaceDetail(userId: string, projectId: string, spaceId: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  const [space, assets, scene, reconstruction, hotspots, connectionsFrom, connectionsTo, jobs] = await Promise.all([
    db.space.findUniqueOrThrow({ where: { id: spaceId } }),
    db.asset.findMany({ where: { spaceId }, orderBy: { createdAt: "desc" } }),
    db.scene.findUnique({ where: { spaceId }, include: { objects: true } }),
    db.reconstruction.findFirst({ where: { spaceId, isCurrent: true } }),
    db.hotspot.findMany({ where: { spaceId }, orderBy: { order: "asc" } }),
    db.spaceConnection.findMany({ where: { fromSpaceId: spaceId }, include: { toSpace: true } }),
    db.spaceConnection.findMany({ where: { toSpaceId: spaceId }, include: { fromSpace: true } }),
    db.aIJob.findMany({ where: { spaceId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return { space, assets, scene, reconstruction, hotspots, connectionsFrom, connectionsTo, jobs };
}

export async function connectSpaces(userId: string, projectId: string, fromSpaceId: string, toSpaceId: string, label?: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  if (fromSpaceId === toSpaceId) throw new Error("A space cannot connect to itself.");
  return db.spaceConnection.create({ data: { fromSpaceId, toSpaceId, label } });
}

export async function createHotspot(
  userId: string,
  projectId: string,
  spaceId: string,
  input: {
    type: HotspotType;
    title: string;
    description?: string;
    position: { x: number; y: number; z: number };
    targetSpaceId?: string;
    externalUrl?: string;
    mediaAssetId?: string;
  }
) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  const count = await db.hotspot.count({ where: { spaceId } });
  return db.hotspot.create({
    data: {
      spaceId,
      type: input.type,
      title: input.title,
      description: input.description,
      positionX: input.position.x,
      positionY: input.position.y,
      positionZ: input.position.z,
      targetSpaceId: input.targetSpaceId,
      externalUrl: input.externalUrl,
      mediaAssetId: input.mediaAssetId,
      order: count,
    },
  });
}
