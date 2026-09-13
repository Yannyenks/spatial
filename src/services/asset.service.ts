import "server-only";
import sharp from "sharp";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/permissions";
import { assertStorageBudget } from "@/lib/quotas";
import { getStorageProvider } from "@/providers/storage";
import { recordUsage } from "@/services/usage.service";
import type { AssetKind } from "@/types";

const THUMBNAIL_WIDTH = 480;

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB per file (§29 validation)

const KIND_BY_MIME: Record<string, AssetKind> = {
  "image/jpeg": "PHOTO",
  "image/png": "PHOTO",
  "image/webp": "PHOTO",
  "image/heic": "PHOTO",
  "video/mp4": "VIDEO",
  "video/quicktime": "VIDEO",
  "video/webm": "VIDEO",
};

export class InvalidUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUploadError";
  }
}

function detectKind(mimeType: string): AssetKind {
  const kind = KIND_BY_MIME[mimeType];
  if (!kind) throw new InvalidUploadError(`Unsupported file type: ${mimeType}.`);
  return kind;
}

export async function uploadAsset(
  userId: string,
  projectId: string,
  spaceId: string | null,
  file: { buffer: Buffer; filename: string; mimeType: string }
) {
  const project = await requireProjectAccess(userId, projectId, "MEMBER");

  if (file.buffer.byteLength === 0) throw new InvalidUploadError("The uploaded file is empty.");
  if (file.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new InvalidUploadError(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit.`);
  }
  const kind = detectKind(file.mimeType);
  await assertStorageBudget(project.organizationId, file.buffer.byteLength);

  const storage = getStorageProvider();
  const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${projectId}/${spaceId ?? "unassigned"}/${Date.now()}-${safeName}`;

  const ref = await storage.putObject({ bucket: "original", key, data: file.buffer, contentType: file.mimeType });

  // Real metadata extraction + a real thumbnail for photos (§9 Asset
  // System: original vs derived variants must never be conflated). Videos
  // don't get a thumbnail here — that needs a frame-extraction step
  // (ffmpeg) this project doesn't depend on yet; leaving thumbnailKey
  // null is honest, a fabricated placeholder would not be (§33).
  let width: number | null = null;
  let height: number | null = null;
  let thumbnailKey: string | null = null;
  if (kind === "PHOTO") {
    try {
      const image = sharp(file.buffer);
      const metadata = await image.metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;

      const thumbnailBuffer = await image
        .clone()
        .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 72 })
        .toBuffer();
      const thumbRef = await storage.putObject({
        bucket: "thumbnails",
        key,
        data: thumbnailBuffer,
        contentType: "image/jpeg",
      });
      thumbnailKey = thumbRef.key;
    } catch {
      // Corrupt/unsupported image bytes: keep the original upload but skip
      // the thumbnail rather than failing the whole upload.
    }
  }

  const asset = await db.asset.create({
    data: {
      projectId,
      spaceId,
      kind,
      bucket: "original",
      storageKey: key,
      thumbnailKey,
      sizeBytes: ref.sizeBytes,
      width,
      height,
    },
  });

  await recordUsage(project.organizationId, "storage_bytes", ref.sizeBytes, { projectId, assetId: asset.id });

  if (project.status === "DRAFT") {
    await db.project.update({ where: { id: projectId }, data: { status: "CAPTURING" } });
  }

  const thumbnailUrl = thumbnailKey ? await storage.getUrl("thumbnails", thumbnailKey) : null;
  return { ...asset, url: ref.url, thumbnailUrl };
}

export async function listAssets(userId: string, projectId: string, spaceId?: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  const storage = getStorageProvider();
  const assets = await db.asset.findMany({
    where: { projectId, ...(spaceId ? { spaceId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(
    assets.map(async (a) => ({
      ...a,
      url: await storage.getUrl(a.bucket as never, a.storageKey),
      thumbnailUrl: a.thumbnailKey ? await storage.getUrl("thumbnails", a.thumbnailKey) : null,
    }))
  );
}

export async function deleteAsset(userId: string, projectId: string, assetId: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.projectId !== projectId) throw new InvalidUploadError("Asset does not belong to this project.");
  const storage = getStorageProvider();
  await storage.deleteObject(asset.bucket as never, asset.storageKey);
  if (asset.thumbnailKey) await storage.deleteObject("thumbnails", asset.thumbnailKey);
  await db.asset.delete({ where: { id: assetId } });
}
