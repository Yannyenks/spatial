import { db } from "@/lib/db";
import { getReconstructionEngine } from "@/providers/reconstruction";
import { getAIProvider } from "@/providers/ai";
import { getStorageProvider } from "@/providers/storage";
import { computeQualityScore } from "@/services/quality-score.service";
import { recordUsage } from "@/services/usage.service";
import { updateJobStage, completeJob, failJob } from "@/jobs/queue";
import type { Asset, JobError } from "@/types";
import type { AIJob as AIJobRecord } from "@prisma/client";

// Kept small and separate from NvidiaAIProvider's own cap (which sees only
// as many URLs as this generates) — free-tier rate limits and per-photo
// vision latency make "analyze everything" the wrong default.
const MAX_SCENE_SAMPLE_PHOTOS = 3;

/**
 * Resolves (creating if needed) the ModelVersion row for a provider/model
 * pair, so every AIJob/Reconstruction links to a real registry entry
 * instead of only carrying free-text strings (execution-plan doc §21).
 */
async function resolveModelVersion(provider: string, model: string) {
  return db.modelVersion.upsert({
    where: { provider_model_version: { provider, model, version: "v0" } },
    update: {},
    create: { provider, model, version: "v0", status: "ACTIVE" },
  });
}

function toDomainAsset(a: {
  id: string;
  projectId: string;
  spaceId: string | null;
  kind: string;
  bucket: string;
  storageKey: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: Date;
}): Asset {
  return {
    id: a.id,
    projectId: a.projectId,
    spaceId: a.spaceId,
    kind: a.kind as Asset["kind"],
    bucket: a.bucket as Asset["bucket"],
    storageKey: a.storageKey,
    url: "", // not needed by the reconstruction engine; resolved by asset.service for the UI
    thumbnailUrl: null,
    sizeBytes: a.sizeBytes,
    width: a.width,
    height: a.height,
    durationSeconds: a.durationSeconds,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * Runs the full processing pipeline for one AIJob (§3, §10, §31):
 *
 *   MEDIA_VALIDATION -> CAMERA_ANALYSIS -> FRAME_EXTRACTION ->
 *   SCENE_UNDERSTANDING -> SPATIAL_RECONSTRUCTION -> QUALITY_OPTIMIZATION ->
 *   EXPERIENCE_GENERATION -> COMPLETED
 *
 * Every stage transition is persisted to the AIJob row so the UI can poll
 * real status (never a fabricated progress bar, §33).
 */
export async function runPipelineJob(job: AIJobRecord): Promise<void> {
  try {
    if (!job.spaceId) throw new PipelineError("NO_SPACE", "Job has no target space.", false);

    // --- MEDIA_VALIDATION ---------------------------------------------
    await updateJobStage(job.id, "MEDIA_VALIDATION");
    const assetRows = await db.asset.findMany({ where: { spaceId: job.spaceId } });
    if (assetRows.length === 0) {
      throw new PipelineError(
        "NO_MEDIA",
        "No media has been captured for this space yet.",
        true,
        "Upload photos or a walkthrough video, then process again."
      );
    }
    const assets = assetRows.map(toDomainAsset);

    // --- CAMERA_ANALYSIS / FRAME_EXTRACTION ----------------------------
    await updateJobStage(job.id, "CAMERA_ANALYSIS");
    await updateJobStage(job.id, "FRAME_EXTRACTION");

    // --- SCENE_UNDERSTANDING --------------------------------------------
    await updateJobStage(job.id, "SCENE_UNDERSTANDING");
    const aiProvider = getAIProvider();
    // Real, publicly resolvable URLs for a small photo sample — only a
    // vision-capable provider (NvidiaAIProvider) uses this; a text-only
    // implementation ignores it. Generating a signed URL is cheap (local
    // crypto, no network call), so this costs nothing when unused.
    const storage = getStorageProvider();
    const photoAssetsForVision = assetRows.filter((a) => a.kind === "PHOTO").slice(0, MAX_SCENE_SAMPLE_PHOTOS);
    const sampleImageUrls = await Promise.all(
      photoAssetsForVision.map((a) => storage.getUrl(a.bucket as never, a.storageKey))
    );
    const sceneAnalysis = await aiProvider.analyzeScene({
      spaceId: job.spaceId,
      frameUrls: assets.map((a) => a.storageKey),
      sampleImageUrls,
    });

    // --- SPATIAL_RECONSTRUCTION ------------------------------------------
    await updateJobStage(job.id, "SPATIAL_RECONSTRUCTION");
    const engine = getReconstructionEngine();
    const result = await engine.reconstruct({ projectId: job.projectId, spaceId: job.spaceId, assets });

    const previousVersion = await db.reconstruction.findFirst({
      where: { spaceId: job.spaceId },
      orderBy: { version: "desc" },
    });
    const nextVersion = (previousVersion?.version ?? 0) + 1;
    const modelVersion = await resolveModelVersion(job.provider, job.model);
    await db.aIJob.update({ where: { id: job.id }, data: { modelVersionId: modelVersion.id } });

    await db.reconstruction.updateMany({ where: { spaceId: job.spaceId }, data: { isCurrent: false } });

    const reconstruction = await db.reconstruction.create({
      data: {
        projectId: job.projectId,
        spaceId: job.spaceId,
        version: nextVersion,
        method: result.method,
        status: "COMPLETED",
        outputUri: result.outputUri,
        isCurrent: true,
        // Model registry (§27/§61 blueprint): record exactly which
        // provider/model/job produced this version.
        provider: job.provider,
        model: job.model,
        modelVersionId: modelVersion.id,
        sourceJobId: job.id,
      },
    });

    await db.scene.deleteMany({ where: { spaceId: job.spaceId } });
    await db.scene.create({
      data: {
        spaceId: job.spaceId,
        metadataJson: JSON.stringify({ ...result.scene.metadata, warnings: sceneAnalysis.warnings }),
        navigationPoints: JSON.stringify(result.scene.navigationPoints),
        // Real rows, not an opaque JSON blob (§29 reality provenance):
        // each pose traces back to the asset/frame it was estimated from.
        cameraPoses: {
          create: result.scene.cameraPositions.map((pos, i) => ({
            positionX: pos.x,
            positionY: pos.y,
            positionZ: pos.z,
            timestamp: i,
            order: i,
            sourceAssetId: assets[i]?.id,
          })),
        },
        objects: {
          create: result.scene.objects.map((o) => ({
            type: o.type,
            label: o.label,
            positionX: o.position.x,
            positionY: o.position.y,
            positionZ: o.position.z,
            rotationX: o.rotation.x,
            rotationY: o.rotation.y,
            rotationZ: o.rotation.z,
            scaleX: o.scale.x,
            scaleY: o.scale.y,
            scaleZ: o.scale.z,
            confidence: o.confidence,
            provenance: o.provenance,
            metadataJson: JSON.stringify(o.metadata ?? {}),
          })),
        },
      },
    });

    // --- QUALITY_OPTIMIZATION --------------------------------------------
    await updateJobStage(job.id, "QUALITY_OPTIMIZATION");
    const hotspotCount = await db.hotspot.count({ where: { spaceId: job.spaceId } });
    const connectionCount = await db.spaceConnection.count({
      where: { OR: [{ fromSpaceId: job.spaceId }, { toSpaceId: job.spaceId }] },
    });
    const depthMetadata = result.scene.metadata as {
      depthAverageStdDev?: number | null;
      depthSampledCount?: number;
    } | null;
    // Real per-photo flags plus real per-frame video sample counts, pooled
    // into one clean-fraction signal for visualQuality (quality-score.service.ts) —
    // the same real-signal-over-heuristic pattern already used for geometry/depth.
    const analyzedPhotos = assetRows.filter((a) => a.kind === "PHOTO" && a.isBlurry !== null);
    const flaggedPhotos = analyzedPhotos.filter((a) => a.isBlurry || a.isUnderexposed || a.isOverexposed);
    const analyzedVideos = assetRows.filter((a) => a.kind === "VIDEO" && a.qualitySampledFrames !== null);
    const visualQualitySampledCount =
      analyzedPhotos.length + analyzedVideos.reduce((sum, a) => sum + (a.qualitySampledFrames ?? 0), 0);
    const visualQualityFlaggedCount =
      flaggedPhotos.length + analyzedVideos.reduce((sum, a) => sum + (a.qualityFlaggedFrames ?? 0), 0);
    const qualityScore = computeQualityScore({
      assetCount: assets.length,
      hasReconstructionOutput: true,
      hotspotCount,
      connectionCount,
      depthAverageStdDev: depthMetadata?.depthAverageStdDev,
      depthSampledCount: depthMetadata?.depthSampledCount,
      visualQualityFlaggedCount,
      visualQualitySampledCount,
    });
    // Real scene-understanding findings (a vision-capable AIProvider's
    // per-photo observations, or the plain frame-count check otherwise)
    // surface through the same recommendations list the space detail page
    // already renders — no separate UI needed, and no risk of a real
    // signal being computed but never actually shown to anyone.
    qualityScore.recommendations = [...qualityScore.recommendations, ...sceneAnalysis.warnings];
    await db.reconstruction.update({
      where: { id: reconstruction.id },
      data: { qualityJson: JSON.stringify(qualityScore) },
    });

    // --- EXPERIENCE_GENERATION --------------------------------------------
    await updateJobStage(job.id, "EXPERIENCE_GENERATION");
    await db.experience.upsert({
      where: { projectId: job.projectId },
      create: {
        projectId: job.projectId,
        name: "Untitled Experience",
        slug: `draft-${job.projectId.slice(0, 8)}`,
        visibility: "PRIVATE",
      },
      update: {},
    });

    const project = await db.project.update({
      where: { id: job.projectId },
      data: { status: "READY" },
    });

    // Real usage metering (execution-plan doc §63/§64), not an estimate:
    // one AI job, and the wall-clock seconds it actually took.
    const processedSeconds = job.startedAt ? (Date.now() - job.startedAt.getTime()) / 1000 : 0;
    await recordUsage(project.organizationId, "ai_jobs", 1, { jobId: job.id, spaceId: job.spaceId });
    await recordUsage(project.organizationId, "processed_seconds", processedSeconds, { jobId: job.id });

    await completeJob(job.id);
  } catch (error) {
    const jobError: JobError =
      error instanceof PipelineError
        ? { code: error.code, message: error.message, recoverable: error.recoverable, suggestedAction: error.suggestedAction }
        : { code: "UNKNOWN", message: error instanceof Error ? error.message : "Unknown error.", recoverable: true };
    await failJob(job.id, jobError);
  }
}

class PipelineError extends Error {
  constructor(
    public code: string,
    message: string,
    public recoverable: boolean,
    public suggestedAction?: string
  ) {
    super(message);
    this.name = "PipelineError";
  }
}
