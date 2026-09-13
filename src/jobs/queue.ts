import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { dispatchWebhookEvent } from "@/services/webhook.service";
import type { JobError, JobStage } from "@/types";

/**
 * Async job queue (§3): HTTP requests only ever enqueue a DB row here and
 * return immediately. The actual pipeline work happens out-of-band in
 * `runner.ts`, invoked either by the in-process poller (dev convenience,
 * started from `instrumentation.ts`) or by the standalone `npm run worker`
 * process (recommended for production so AI workloads don't share a
 * process with the web server).
 *
 * NOTE: intentionally does NOT import "server-only" — this module (and
 * jobs/pipeline.ts, jobs/runner.ts, services/quality-score.service.ts) is
 * loaded by scripts/worker.ts and prisma/seed.ts, plain Node entrypoints
 * outside Next's server bundler, and the "server-only" package throws
 * unconditionally in that context.
 */
export const PIPELINE_STAGES: JobStage[] = [
  "MEDIA_VALIDATION",
  "CAMERA_ANALYSIS",
  "FRAME_EXTRACTION",
  "SCENE_UNDERSTANDING",
  "SPATIAL_RECONSTRUCTION",
  "QUALITY_OPTIMIZATION",
  "EXPERIENCE_GENERATION",
];

export async function enqueueReconstructionJob(input: {
  projectId: string;
  spaceId: string;
  provider: string;
  model: string;
}) {
  return db.aIJob.create({
    data: {
      projectId: input.projectId,
      spaceId: input.spaceId,
      provider: input.provider,
      model: input.model,
      status: "QUEUED",
      stage: "QUEUED",
      progress: 0,
    },
  });
}

/** Atomically claims the oldest queued job, if any (single-worker safe). */
export async function claimNextQueuedJob() {
  const next = await db.aIJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!next) return null;

  // Optimistic claim: only succeeds if still QUEUED, guarding against a
  // second worker racing us.
  const claimed = await db.aIJob.updateMany({
    where: { id: next.id, status: "QUEUED" },
    data: { status: "PROCESSING", startedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  return db.aIJob.findUnique({ where: { id: next.id } });
}

export async function updateJobStage(jobId: string, stage: JobStage) {
  const stageIndex = PIPELINE_STAGES.indexOf(stage);
  const progress = stageIndex === -1 ? 0 : Math.round(((stageIndex + 1) / PIPELINE_STAGES.length) * 100);
  await db.aIJob.update({ where: { id: jobId }, data: { stage, progress } });
}

export async function completeJob(jobId: string) {
  const job = await db.aIJob.findUniqueOrThrow({ where: { id: jobId }, include: { project: true } });
  const durationMs = job.startedAt ? Date.now() - job.startedAt.getTime() : null;
  await db.aIJob.update({
    where: { id: jobId },
    data: { status: "COMPLETED", stage: "COMPLETED", progress: 100, completedAt: new Date(), durationMs },
  });
  // Structured log (execution-plan §57) — the exact shape given as an
  // example there: { level, event, jobId, durationMs }, plus enough
  // context (project/space/provider) to actually be useful.
  const eventPayload = {
    jobId,
    projectId: job.projectId,
    spaceId: job.spaceId,
    provider: job.provider,
    model: job.model,
    durationMs,
  };
  logger.info("reconstruction.completed", eventPayload);

  // Webhooks (execution-plan §58) — never let a broken customer endpoint
  // slow down or break the pipeline; dispatch is fire-and-forget from here.
  void dispatchWebhookEvent(job.project.organizationId, "reconstruction.completed", eventPayload);
  void dispatchWebhookEvent(job.project.organizationId, "ai.job.completed", eventPayload);
}

export async function failJob(jobId: string, error: JobError) {
  const job = await db.aIJob.findUniqueOrThrow({ where: { id: jobId }, include: { project: true } });
  const durationMs = job.startedAt ? Date.now() - job.startedAt.getTime() : null;
  await db.aIJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      stage: "FAILED",
      completedAt: new Date(),
      durationMs,
      errorJson: JSON.stringify(error),
    },
  });
  const eventPayload = {
    jobId,
    projectId: job.projectId,
    spaceId: job.spaceId,
    provider: job.provider,
    model: job.model,
    durationMs,
    errorCode: error.code,
    errorMessage: error.message,
  };
  logger.warn("reconstruction.failed", eventPayload);

  // "capture.quality_failed" specifically means insufficient/missing
  // media — a distinct signal from an unexpected internal failure, which
  // an Enterprise integration would want to route differently (e.g.
  // notify the property owner to recapture vs. page an engineer).
  if (error.code === "NO_MEDIA") {
    void dispatchWebhookEvent(job.project.organizationId, "capture.quality_failed", eventPayload);
  }
}
