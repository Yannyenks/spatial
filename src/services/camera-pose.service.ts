import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/permissions";
import { getStorageProvider } from "@/providers/storage";
import { logger } from "@/lib/logger";

// COLMAP needs enough overlapping views to find matches at all; too few
// photos and the mapper simply fails to converge (a real, honest failure,
// not something to hide behind a lower threshold).
const MIN_PHOTOS_FOR_SFM = 3;
// Keeps one run finishing within a few minutes on a free, CPU-only GitHub
// Actions runner — COLMAP's cost grows fast with photo count (pairwise
// matching), not something to let scale unbounded per job.
const MAX_PHOTOS_FOR_SFM = 12;

export class CameraPoseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CameraPoseError";
  }
}

/**
 * Starts a real structure-from-motion run for a space (free-tier plan step
 * B1, docs/free-tier-roadmap.md): dispatches the `estimate-camera-pose`
 * GitHub Actions workflow, which runs COLMAP on a free CPU-only runner and
 * reports back to `completeCameraPoseJob`. Returns immediately — the job
 * can take several minutes, the same "enqueue and return" discipline as
 * the main AIJob pipeline uses for anything real (§3).
 */
export async function requestCameraPoseEstimation(userId: string, projectId: string, spaceId: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");

  const photoCount = await db.asset.count({ where: { spaceId, kind: "PHOTO" } });
  if (photoCount < MIN_PHOTOS_FOR_SFM) {
    throw new CameraPoseError(
      `Need at least ${MIN_PHOTOS_FOR_SFM} photos for real camera-pose estimation (this space has ${photoCount}).`
    );
  }

  const job = await db.cameraPoseJob.create({ data: { projectId, spaceId, status: "QUEUED" } });

  try {
    await dispatchWorkflow(job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.cameraPoseJob.update({ where: { id: job.id }, data: { status: "FAILED", error: message, completedAt: new Date() } });
    logger.warn("camera_pose.dispatch_failed", { jobId: job.id, spaceId, error: message });
    throw new CameraPoseError("Could not start camera-pose estimation. Check GITHUB_DISPATCH_TOKEN/GITHUB_REPO configuration.");
  }

  return job;
}

async function dispatchWorkflow(jobId: string) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO; // "owner/repo"
  if (!token || !repo) {
    throw new Error("GITHUB_DISPATCH_TOKEN or GITHUB_REPO is not set. Copy .env.example to .env and set real values.");
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/estimate-camera-pose.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: process.env.GITHUB_REPO_REF || "main", inputs: { job_id: jobId } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub workflow dispatch failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

export async function getCameraPoseJobStatus(userId: string, projectId: string, jobId: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  const job = await db.cameraPoseJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.projectId !== projectId) throw new CameraPoseError("Job does not belong to this project.");
  return job;
}

// --- Used only by the GitHub Actions workflow itself, via a shared-secret-authenticated route ---

export async function getPhotosForCameraPoseJob(jobId: string) {
  const job = await db.cameraPoseJob.findUniqueOrThrow({ where: { id: jobId } });
  await db.cameraPoseJob.update({ where: { id: jobId }, data: { status: "RUNNING" } });

  const assets = await db.asset.findMany({
    where: { spaceId: job.spaceId, kind: "PHOTO" },
    orderBy: { createdAt: "asc" },
    take: MAX_PHOTOS_FOR_SFM,
  });

  const storage = getStorageProvider();
  return Promise.all(
    assets.map(async (a) => ({
      assetId: a.id,
      url: await storage.getUrl(a.bucket as never, a.storageKey, { expiresInSeconds: 3600 }),
    }))
  );
}

export interface RealCameraPoseInput {
  assetId: string | null;
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  order: number;
}

export type CameraPoseJobResult =
  | { status: "COMPLETED"; poses: RealCameraPoseInput[] }
  | { status: "FAILED"; error: string };

export async function completeCameraPoseJob(jobId: string, result: CameraPoseJobResult): Promise<void> {
  const job = await db.cameraPoseJob.findUniqueOrThrow({ where: { id: jobId } });

  if (result.status === "FAILED") {
    await db.cameraPoseJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: result.error, completedAt: new Date() },
    });
    logger.warn("camera_pose.failed", { jobId, spaceId: job.spaceId, error: result.error });
    return;
  }

  const scene = await db.scene.findUnique({ where: { spaceId: job.spaceId } });
  if (!scene) {
    await db.cameraPoseJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: "No scene exists for this space yet — run Analyze first.", completedAt: new Date() },
    });
    return;
  }

  await db.$transaction([
    db.cameraPose.deleteMany({ where: { sceneId: scene.id } }),
    db.cameraPose.createMany({
      data: result.poses.map((p) => ({
        sceneId: scene.id,
        positionX: p.x,
        positionY: p.y,
        positionZ: p.z,
        rotationX: p.rotationX,
        rotationY: p.rotationY,
        rotationZ: p.rotationZ,
        sourceAssetId: p.assetId,
        order: p.order,
        confidence: 1,
      })),
    }),
  ]);

  const metadata = JSON.parse(scene.metadataJson || "{}") as Record<string, unknown>;
  metadata.cameraPoseSource = "colmap";
  metadata.realCameraPoseCount = result.poses.length;
  await db.scene.update({ where: { id: scene.id }, data: { metadataJson: JSON.stringify(metadata) } });

  await db.cameraPoseJob.update({ where: { id: jobId }, data: { status: "COMPLETED", completedAt: new Date() } });
  logger.info("camera_pose.completed", { jobId, spaceId: job.spaceId, poseCount: result.poses.length });
}
