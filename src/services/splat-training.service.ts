import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/permissions";
import { getStorageProvider } from "@/providers/storage";
import { logger } from "@/lib/logger";
import { MARBLE_MAX_IMAGES, generateWorldFromPhotos, getOperation, type MarbleModel } from "@/providers/worldlabs";

// gsplat/splatfacto needs enough overlapping views to find real matches at
// all, same reasoning as COLMAP's own MIN_PHOTOS_FOR_SFM (camera-pose.service.ts).
const MIN_PHOTOS_FOR_TRAINING = 3;
// splatfacto's own default (nerfstudio/configs/method_configs.py) is
// 30,000 — tuned for larger/more complex scenes. For this app's actual
// use case (one room, not an outdoor scene) this default is deliberately
// much lower: a fast, cheap first pass (~$0.05-0.15 on a rented consumer
// GPU per the free-tier roadmap's cost research), not the paper's "quality
// ceiling" setting. Revisit once real usage data exists.
const DEFAULT_MAX_ITERATIONS = 7000;
const PENDING_STATUSES = ["QUEUED", "RUNNING"];

/**
 * The engines a space's 3D world can be built with. All of them end in the
 * same place - a Gaussian splat file in our own storage, registered as a
 * new Reconstruction version - so the viewer, experience page and version
 * history never care which one ran.
 *
 * - marble: World Labs' World API, generated on their infrastructure
 *   (~5 min, ~$1.20/world for marble-1.1). Up to 8 photos in
 *   reconstruction mode. Output: SPZ in OpenCV convention, plus metric
 *   scale and ground plane so the viewer can walk at real eye height.
 * - worldmirror: Tencent HY-World 2.0 WorldMirror 2.0 on our RunPod
 *   endpoint (docker/worldmirror-worker): feed-forward reconstruction, no
 *   COLMAP or per-scene training. Output: .splat in OpenCV convention plus
 *   an optional fly-through video. Its license excludes the EU, UK and
 *   South Korea.
 * - nerfstudio: COLMAP + splatfacto on RunPod (docker/splat-worker). The
 *   original pipeline; Z-up PLY output.
 *
 * GPU time / API credits (real money) scale with photo count, so each
 * engine caps it.
 */
export const SPLAT_ENGINES = {
  marble: {
    kind: "worldlabs",
    maxPhotos: MARBLE_MAX_IMAGES,
    outputExtension: "spz",
    renderVideo: false,
  },
  worldmirror: {
    kind: "runpod",
    endpointEnv: "RUNPOD_WORLDMIRROR_ENDPOINT_ID",
    maxPhotos: 32,
    outputExtension: "splat",
    model: "hy-worldmirror-2.0",
    renderVideo: true,
  },
  nerfstudio: {
    kind: "runpod",
    endpointEnv: "RUNPOD_ENDPOINT_ID",
    maxPhotos: 20,
    outputExtension: "ply",
    model: "nerfstudio-splatfacto",
    renderVideo: false,
  },
} as const;
export type SplatEngine = keyof typeof SPLAT_ENGINES;

export function isSplatEngine(value: unknown): value is SplatEngine {
  return typeof value === "string" && value in SPLAT_ENGINES;
}

/** The best engine that is actually configured on this deployment. */
export function defaultSplatEngine(): SplatEngine {
  if (process.env.WORLDLABS_API_KEY) return "marble";
  if (process.env.RUNPOD_WORLDMIRROR_ENDPOINT_ID) return "worldmirror";
  return "nerfstudio";
}

export interface SplatEngineOption {
  engine: SplatEngine;
  label: string;
  /** Shown before the user spends money: what it costs and how long it takes. */
  note: string;
}

/** Engines actually configured on this deployment, best first. */
export function availableSplatEngines(): SplatEngineOption[] {
  const options: SplatEngineOption[] = [];
  if (process.env.WORLDLABS_API_KEY) {
    const plus = marbleModel() === "marble-1.1-plus";
    options.push({
      engine: "marble",
      label: "World Labs Marble",
      note: `Best quality · about 5 min · ${plus ? "up to ~$2.50" : "~$1.20"} per world`,
    });
  }
  if (process.env.RUNPOD_API_KEY && process.env.RUNPOD_WORLDMIRROR_ENDPOINT_ID) {
    options.push({
      engine: "worldmirror",
      label: "Tencent HY WorldMirror",
      note: "Faithful reconstruction · a few minutes of rented GPU · not licensed for the EU, UK or South Korea",
    });
  }
  if (process.env.RUNPOD_API_KEY && process.env.RUNPOD_ENDPOINT_ID) {
    options.push({ engine: "nerfstudio", label: "Nerfstudio (legacy)", note: "Per-scene training · several minutes of rented GPU" });
  }
  return options;
}

function marbleModel(): MarbleModel {
  return (process.env.MARBLE_MODEL as MarbleModel | undefined) ?? "marble-1.1";
}

export class SplatTrainingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplatTrainingError";
  }
}

/**
 * Starts building a 3D world for a space with the given engine (the
 * deployment's best configured one by default). Returns immediately - every
 * engine takes minutes - and the job is advanced either by its RunPod
 * worker's callback (`completeSplatTrainingJob`) or, for World Labs, by
 * polling its operation (`advanceMarbleJob`).
 */
export async function requestSplatTraining(
  userId: string,
  projectId: string,
  spaceId: string,
  opts?: { maxIterations?: number; engine?: SplatEngine }
) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  const engine = opts?.engine ?? defaultSplatEngine();

  const photoCount = await db.asset.count({ where: { spaceId, kind: "PHOTO" } });
  if (photoCount < MIN_PHOTOS_FOR_TRAINING) {
    throw new SplatTrainingError(
      `Need at least ${MIN_PHOTOS_FOR_TRAINING} photos to build a 3D world (this space has ${photoCount}).`
    );
  }

  const job = await db.splatTrainingJob.create({ data: { projectId, spaceId, status: "QUEUED", engine } });

  try {
    const providerJobId =
      engine === "marble"
        ? await dispatchMarbleJob(job.id, projectId, spaceId)
        : await dispatchRunpodJob(job.id, projectId, spaceId, engine, opts?.maxIterations ?? DEFAULT_MAX_ITERATIONS);
    return await db.splatTrainingJob.update({ where: { id: job.id }, data: { providerJobId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.splatTrainingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: message, completedAt: new Date() },
    });
    logger.warn("splat_training.dispatch_failed", { jobId: job.id, spaceId, engine, error: message });
    const config = SPLAT_ENGINES[engine];
    const setting = "endpointEnv" in config ? `RUNPOD_API_KEY/${config.endpointEnv}` : "WORLDLABS_API_KEY";
    throw new SplatTrainingError(`Could not start 3D world generation. Check ${setting} configuration.`);
  }
}

/** `count` photos spread evenly across the whole capture, not just its first few shots. */
async function samplePhotos(spaceId: string, count: number) {
  const assets = await db.asset.findMany({ where: { spaceId, kind: "PHOTO" }, orderBy: { createdAt: "asc" } });
  if (assets.length <= count) return assets;
  return Array.from({ length: count }, (_, i) => assets[Math.round((i * (assets.length - 1)) / (count - 1))]!);
}

async function photoUrlsFor(spaceId: string, count: number) {
  const storage = getStorageProvider();
  const assets = await samplePhotos(spaceId, count);
  // Generous expiry: the worker or World Labs may fetch them minutes later.
  return Promise.all(assets.map((a) => storage.getUrl(a.bucket as never, a.storageKey, { expiresInSeconds: 6 * 60 * 60 })));
}

async function dispatchMarbleJob(jobId: string, projectId: string, spaceId: string): Promise<string> {
  const space = await db.space.findUniqueOrThrow({ where: { id: spaceId }, select: { name: true } });
  const photoUrls = await photoUrlsFor(spaceId, SPLAT_ENGINES.marble.maxPhotos);
  const operation = await generateWorldFromPhotos({ displayName: space.name, photoUrls, model: marbleModel() });
  const outputKey = `${projectId}/${spaceId}/splat-training-${jobId}.${SPLAT_ENGINES.marble.outputExtension}`;
  await db.splatTrainingJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", outputBucket: "reconstruction", outputKey },
  });
  return operation.operation_id;
}

async function dispatchRunpodJob(
  jobId: string,
  projectId: string,
  spaceId: string,
  engine: Exclude<SplatEngine, "marble">,
  maxIterations: number
): Promise<string | null> {
  const config = SPLAT_ENGINES[engine];
  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env[config.endpointEnv];
  const secret = process.env.SPLAT_TRAINING_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !endpointId || !secret || !appUrl) {
    throw new Error(`RUNPOD_API_KEY, ${config.endpointEnv}, SPLAT_TRAINING_SECRET or NEXT_PUBLIC_APP_URL is not set.`);
  }

  const storage = getStorageProvider();
  const photoUrls = await photoUrlsFor(spaceId, config.maxPhotos);

  const outputKey = `${projectId}/${spaceId}/splat-training-${jobId}.${config.outputExtension}`;
  const uploadUrl = await storage.getUploadUrl("reconstruction", outputKey, {
    expiresInSeconds: 6 * 60 * 60,
    contentType: "application/octet-stream",
  });
  const videoKey = config.renderVideo ? `${projectId}/${spaceId}/splat-training-${jobId}.mp4` : null;
  const videoUploadUrl = videoKey
    ? await storage.getUploadUrl("reconstruction", videoKey, { expiresInSeconds: 6 * 60 * 60, contentType: "video/mp4" })
    : undefined;
  await db.splatTrainingJob.update({ where: { id: jobId }, data: { outputBucket: "reconstruction", outputKey, videoKey } });

  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: {
        job_id: jobId,
        photo_urls: photoUrls,
        upload_url: uploadUrl,
        video_upload_url: videoUploadUrl,
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
  let job = await db.splatTrainingJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.projectId !== projectId) throw new SplatTrainingError("Job does not belong to this project.");
  // World Labs has no callback: whoever is watching the job advances it.
  if (job.engine === "marble" && PENDING_STATUSES.includes(job.status)) {
    job = await advanceMarbleJob(job.id);
  }
  return job;
}

/** For the job cron: finishes World Labs jobs nobody is watching. */
export async function advancePendingMarbleJobs(limit = 5) {
  const jobs = await db.splatTrainingJob.findMany({
    where: { engine: "marble", status: { in: PENDING_STATUSES } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  for (const job of jobs) await advanceMarbleJob(job.id);
  return jobs.length;
}

/**
 * Checks a World Labs job's operation and, once its world exists, copies
 * the splat into our storage (World Labs' asset URLs aren't ours to rely
 * on long-term) and registers it as a new Reconstruction version.
 */
export async function advanceMarbleJob(jobId: string) {
  const job = await db.splatTrainingJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.engine !== "marble" || !PENDING_STATUSES.includes(job.status) || !job.providerJobId) return job;

  let operation;
  try {
    operation = await getOperation(job.providerJobId);
  } catch (error) {
    // Transient API trouble: leave the job pending for the next check.
    logger.warn("splat_training.marble_poll_failed", { jobId, error: error instanceof Error ? error.message : String(error) });
    return job;
  }
  if (!operation.done) return job;

  // Several viewers (and the cron) may poll at once; only one finalizes.
  const claimed = await db.splatTrainingJob.updateMany({
    where: { id: jobId, status: { in: PENDING_STATUSES } },
    data: { status: "FINALIZING" },
  });
  if (claimed.count === 0) return db.splatTrainingJob.findUniqueOrThrow({ where: { id: jobId } });

  const world = operation.response;
  const splatUrls = world?.assets?.splats?.spz_urls ?? {};
  const resolution = process.env.MARBLE_SPLAT_RESOLUTION ?? "500k";
  const splatUrl = splatUrls[resolution] ?? splatUrls.full_res ?? Object.values(splatUrls)[0];
  if (operation.error || !world || !splatUrl || !job.outputKey) {
    const error = operation.error?.message ?? "World Labs finished without a splat to download.";
    await completeSplatTrainingJob(jobId, { status: "FAILED", error });
    return db.splatTrainingJob.findUniqueOrThrow({ where: { id: jobId } });
  }

  try {
    const res = await fetch(splatUrl);
    if (!res.ok) throw new Error(`Downloading the World Labs splat failed (${res.status}).`);
    const data = Buffer.from(await res.arrayBuffer());
    await getStorageProvider().putObject({
      bucket: "reconstruction",
      key: job.outputKey,
      data,
      contentType: "application/octet-stream",
    });

    const semantics = world.assets?.splats?.semantics_metadata;
    await registerReconstruction(job, {
      model: world.model ?? marbleModel(),
      provider: "worldlabs",
      sceneMeta: {
        engine: "marble",
        worldId: world.id,
        marbleUrl: world.world_marble_url,
        metricScale: semantics?.metric_scale_factor,
        groundOffset: semantics?.ground_plane_offset,
        caption: world.assets?.caption,
        thumbnailUrl: world.assets?.thumbnail_url,
        splatResolution: resolution,
      },
    });
    await db.splatTrainingJob.update({ where: { id: jobId }, data: { status: "COMPLETED", completedAt: new Date() } });
    logger.info("splat_training.completed", { jobId, spaceId: job.spaceId, engine: "marble", sizeBytes: data.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeSplatTrainingJob(jobId, { status: "FAILED", error: message });
  }
  return db.splatTrainingJob.findUniqueOrThrow({ where: { id: jobId } });
}

export type SplatTrainingJobResult =
  | { status: "COMPLETED"; sizeBytes: number; videoBytes?: number | null }
  | { status: "FAILED"; error: string };

/**
 * Called by RunPod workers (via a shared-secret-authenticated route) once
 * they have uploaded their output to the presigned URL generated in
 * `dispatchRunpodJob`, and internally to record World Labs failures.
 */
export async function completeSplatTrainingJob(jobId: string, result: SplatTrainingJobResult): Promise<void> {
  const job = await db.splatTrainingJob.findUniqueOrThrow({ where: { id: jobId } });

  if (result.status === "FAILED") {
    await db.splatTrainingJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: result.error, completedAt: new Date() },
    });
    logger.warn("splat_training.failed", { jobId, spaceId: job.spaceId, engine: job.engine, error: result.error });
    return;
  }

  if (!job.outputBucket || !job.outputKey) {
    await db.splatTrainingJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: "Job has no output location recorded — cannot register the result.", completedAt: new Date() },
    });
    return;
  }

  const config = isSplatEngine(job.engine) ? SPLAT_ENGINES[job.engine] : null;
  await registerReconstruction(job, {
    model: config && "model" in config ? config.model : job.engine,
    provider: "runpod",
    previewVideoKey: result.videoBytes ? job.videoKey : null,
    sceneMeta: { engine: job.engine },
  });

  await db.splatTrainingJob.update({ where: { id: jobId }, data: { status: "COMPLETED", completedAt: new Date() } });
  logger.info("splat_training.completed", { jobId, spaceId: job.spaceId, engine: job.engine, sizeBytes: result.sizeBytes });
}

/** New current Reconstruction version for a finished job (same versioning/restore machinery as splat.service.ts#uploadSplatFile). */
async function registerReconstruction(
  job: { projectId: string; spaceId: string; outputBucket: string | null; outputKey: string | null },
  opts: { model: string; provider: string; previewVideoKey?: string | null; sceneMeta: Record<string, unknown> }
) {
  const storage = getStorageProvider();
  const url = await storage.getUrl(job.outputBucket as never, job.outputKey!);

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
      previewVideoKey: opts.previewVideoKey ?? null,
      sceneMetaJson: JSON.stringify(opts.sceneMeta),
      isCurrent: true,
      provider: opts.provider,
      model: opts.model,
    },
  });
}
