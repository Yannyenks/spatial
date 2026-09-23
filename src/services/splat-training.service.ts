import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/permissions";
import { getStorageProvider } from "@/providers/storage";
import { logger } from "@/lib/logger";

// gsplat/splatfacto needs enough overlapping views to find real matches at
// all, same reasoning as COLMAP's own MIN_PHOTOS_FOR_SFM (camera-pose.service.ts).
const MIN_PHOTOS_FOR_TRAINING = 3;
// GPU time (and therefore real money) scales with photo count — capped so
// one run stays cheap and predictable rather than scaling unbounded with
// however many photos a space has.
const MAX_PHOTOS_FOR_TRAINING = 20;
// splatfacto's own default (nerfstudio/configs/method_configs.py) is
// 30,000 — tuned for larger/more complex scenes. For this app's actual
// use case (one room, not an outdoor scene) this default is deliberately
// much lower: a fast, cheap first pass (~$0.05-0.15 on a rented consumer
// GPU per the free-tier roadmap's cost research), not the paper's "quality
// ceiling" setting. Revisit once real usage data exists.
const DEFAULT_MAX_ITERATIONS = 7000;

export class SplatTrainingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplatTrainingError";
  }
}

/**
 * Starts a real Gaussian Splat training run for a space (free-tier plan
 * step B2, GPU path): dispatches a job to a RunPod Serverless endpoint
 * running nerfstudio (COLMAP -> splatfacto -> export) on a rented GPU,
 * which reports back to `completeSplatTrainingJob`. Returns immediately —
 * training takes minutes on a GPU, the same "enqueue and return"
 * discipline as requestCameraPoseEstimation.
 *
 * Back on RunPod (a brief Modal migration was tried and reverted): RunPod
 * initially had an account-level restriction where no worker ever
 * reached RUNNING across every GPU type/region tried, even after fixing
 * two real config bugs (an endpoint pointing at a deleted template, then
 * an oversubscribed GPU type) - that restriction resolved on its own
 * after enough time passed. Verified live end-to-end afterward: a real
 * job with real photos completed in 55s and produced a real 114,926-byte
 * splat.ply. Modal remains blocked on a card decline on the user's end,
 * unrelated to this app.
 */
export async function requestSplatTraining(
  userId: string,
  projectId: string,
  spaceId: string,
  opts?: { maxIterations?: number }
) {
  await requireProjectAccess(userId, projectId, "MEMBER");

  const photoCount = await db.asset.count({ where: { spaceId, kind: "PHOTO" } });
  if (photoCount < MIN_PHOTOS_FOR_TRAINING) {
    throw new SplatTrainingError(
      `Need at least ${MIN_PHOTOS_FOR_TRAINING} photos for real splat training (this space has ${photoCount}).`
    );
  }

  const job = await db.splatTrainingJob.create({ data: { projectId, spaceId, status: "QUEUED" } });

  try {
    const providerJobId = await dispatchTrainingJob(job.id, projectId, spaceId, opts?.maxIterations ?? DEFAULT_MAX_ITERATIONS);
    const updated = await db.splatTrainingJob.update({ where: { id: job.id }, data: { providerJobId } });
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.splatTrainingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: message, completedAt: new Date() },
    });
    logger.warn("splat_training.dispatch_failed", { jobId: job.id, spaceId, error: message });
    throw new SplatTrainingError("Could not start splat training. Check RUNPOD_API_KEY/RUNPOD_ENDPOINT_ID configuration.");
  }
}

async function dispatchTrainingJob(jobId: string, projectId: string, spaceId: string, maxIterations: number): Promise<string | null> {
  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  const secret = process.env.SPLAT_TRAINING_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !endpointId || !secret || !appUrl) {
    throw new Error("RUNPOD_API_KEY, RUNPOD_ENDPOINT_ID, SPLAT_TRAINING_SECRET or NEXT_PUBLIC_APP_URL is not set.");
  }

  const storage = getStorageProvider();
  const assets = await db.asset.findMany({
    where: { spaceId, kind: "PHOTO" },
    orderBy: { createdAt: "asc" },
    take: MAX_PHOTOS_FOR_TRAINING,
  });

  // Generous expiry: training itself can take a while, and the worker
  // downloads every photo up front before COLMAP/training even starts.
  const photoUrls = await Promise.all(assets.map((a) => storage.getUrl(a.bucket as never, a.storageKey, { expiresInSeconds: 6 * 60 * 60 })));

  const outputKey = `${projectId}/${spaceId}/splat-training-${jobId}.ply`;
  const uploadUrl = await storage.getUploadUrl("reconstruction", outputKey, {
    expiresInSeconds: 6 * 60 * 60,
    contentType: "application/octet-stream",
  });
  await db.splatTrainingJob.update({ where: { id: jobId }, data: { outputBucket: "reconstruction", outputKey } });

  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: {
        job_id: jobId,
        photo_urls: photoUrls,
        upload_url: uploadUrl,
        callback_url: `${appUrl}/api/internal/splat-training-jobs/${jobId}/complete`,
        callback_secret: secret,
        max_iterations: maxIterations,
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`RunPod job dispatch failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return (body.id as string) ?? null;
}

export async function getSplatTrainingJobStatus(userId: string, projectId: string, jobId: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  const job = await db.splatTrainingJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.projectId !== projectId) throw new SplatTrainingError("Job does not belong to this project.");
  return job;
}

export type SplatTrainingJobResult =
  | { status: "COMPLETED"; sizeBytes: number }
  | { status: "FAILED"; error: string };

/**
 * Called only by the RunPod worker (via a shared-secret-authenticated
 * route) once it has already uploaded the trained .ply directly to the
 * presigned URL generated in `dispatchTrainingJob` — this just records the
 * result and creates the new Reconstruction version, the same
 * versioning/restore machinery every other reconstruction method uses
 * (mirrors splat.service.ts#uploadSplatFile).
 */
export async function completeSplatTrainingJob(jobId: string, result: SplatTrainingJobResult): Promise<void> {
  const job = await db.splatTrainingJob.findUniqueOrThrow({ where: { id: jobId } });

  if (result.status === "FAILED") {
    await db.splatTrainingJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: result.error, completedAt: new Date() },
    });
    logger.warn("splat_training.failed", { jobId, spaceId: job.spaceId, error: result.error });
    return;
  }

  if (!job.outputBucket || !job.outputKey) {
    await db.splatTrainingJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: "Job has no output location recorded — cannot register the trained splat.", completedAt: new Date() },
    });
    return;
  }

  const storage = getStorageProvider();
  const url = await storage.getUrl(job.outputBucket as never, job.outputKey);

  const previous = await db.reconstruction.findFirst({ where: { spaceId: job.spaceId }, orderBy: { version: "desc" } });
  const nextVersion = (previous?.version ?? 0) + 1;
  await db.reconstruction.updateMany({ where: { spaceId: job.spaceId }, data: { isCurrent: false } });

  await db.reconstruction.create({
    data: {
      projectId: job.projectId,
      spaceId: job.spaceId,
      version: nextVersion,
      method: "GAUSSIAN_SPLATTING",
      status: "COMPLETED",
      outputUri: url,
      outputBucket: job.outputBucket,
      outputKey: job.outputKey,
      isCurrent: true,
      provider: "runpod",
      model: "nerfstudio-splatfacto",
    },
  });

  await db.splatTrainingJob.update({ where: { id: jobId }, data: { status: "COMPLETED", completedAt: new Date() } });
  logger.info("splat_training.completed", { jobId, spaceId: job.spaceId, sizeBytes: result.sizeBytes });
}
