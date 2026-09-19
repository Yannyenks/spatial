import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/permissions";
import { getStorageProvider } from "@/providers/storage";

// Real splat files from a genuine training run (free-tier plan step B2 —
// docs/free-tier-roadmap.md, docs/gaussian-splatting-guide.md) range from
// a few MB for a tiny test scene to several hundred MB for a dense one;
// no hosted free training API exists (verified — see the roadmap doc), so
// this is a manual upload of a file produced by a Colab/Kaggle notebook
// run outside the app, not a job this app itself triggers.
const MAX_SPLAT_BYTES = 500 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["ply", "splat", "ksplat"];

export class InvalidSplatUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSplatUploadError";
  }
}

function extensionOf(filename: string): string {
  return (filename.split(".").pop() ?? "").toLowerCase();
}

/**
 * Stores a real, already-trained Gaussian Splat file (`.ply`/`.splat`/
 * `.ksplat`) as a new reconstruction version for a space — the same
 * versioning/restore machinery every other reconstruction method already
 * uses (`Reconstruction.version`/`isCurrent`), so `RestoreVersionButton`
 * and the reconstruction history page work on this unchanged. Distinct
 * from `provider: "manual-upload"`: this is real 3D data a person
 * actually trained, not a placeholder or an engine this app ran itself.
 */
export async function uploadSplatFile(
  userId: string,
  projectId: string,
  spaceId: string,
  file: { buffer: Buffer; filename: string }
) {
  await requireProjectAccess(userId, projectId, "MEMBER");

  if (file.buffer.byteLength === 0) throw new InvalidSplatUploadError("The uploaded file is empty.");
  if (file.buffer.byteLength > MAX_SPLAT_BYTES) {
    throw new InvalidSplatUploadError(`File exceeds the ${MAX_SPLAT_BYTES / (1024 * 1024)}MB limit.`);
  }
  const ext = extensionOf(file.filename);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new InvalidSplatUploadError(`Unsupported file type ".${ext}" — expected .ply, .splat, or .ksplat.`);
  }

  const storage = getStorageProvider();
  const key = `${projectId}/${spaceId}/splat-${Date.now()}.${ext}`;
  const ref = await storage.putObject({
    bucket: "reconstruction",
    key,
    data: file.buffer,
    contentType: "application/octet-stream",
  });

  const previous = await db.reconstruction.findFirst({ where: { spaceId }, orderBy: { version: "desc" } });
  const nextVersion = (previous?.version ?? 0) + 1;
  await db.reconstruction.updateMany({ where: { spaceId }, data: { isCurrent: false } });

  const reconstruction = await db.reconstruction.create({
    data: {
      projectId,
      spaceId,
      version: nextVersion,
      method: "GAUSSIAN_SPLATTING",
      status: "COMPLETED",
      outputUri: ref.url,
      outputBucket: ref.bucket,
      outputKey: ref.key,
      isCurrent: true,
      provider: "manual-upload",
      model: "gaussian-splatting",
    },
  });

  return reconstruction;
}
