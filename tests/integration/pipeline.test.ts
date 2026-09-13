import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/services/auth.service";
import { createOrganizationForUser } from "@/services/organization.service";
import { createProject } from "@/services/project.service";
import { createSpace } from "@/services/space.service";
import { enqueueReconstructionJob, claimNextQueuedJob } from "@/jobs/queue";
import { runPipelineJob } from "@/jobs/pipeline";
import { getUsageSummary } from "@/services/usage.service";

describe("processing pipeline (execution-plan §5/§21/§63)", () => {
  it("persists real camera poses, links a ModelVersion, and records real usage — never fake numbers", async () => {
    const user = await registerUser(`pipeline1-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Pipeline Org");
    const project = await createProject(user.id, org.id, "Pipeline Hotel", "HOTEL");
    const space = await createSpace(user.id, project.id, "Lobby", "LOBBY");

    // Seed enough media for the pipeline to accept the job.
    for (let i = 0; i < 8; i++) {
      await db.asset.create({
        data: {
          projectId: project.id,
          spaceId: space.id,
          kind: "PHOTO",
          bucket: "original",
          storageKey: `${project.id}/${space.id}/frame-${i}.jpg`,
          sizeBytes: 1024,
        },
      });
    }

    await enqueueReconstructionJob({
      projectId: project.id,
      spaceId: space.id,
      provider: "mock",
      model: "spatial-reconstruction-v0",
    });

    const claimed = await claimNextQueuedJob();
    expect(claimed).not.toBeNull();
    await runPipelineJob(claimed!);

    const finishedJob = await db.aIJob.findUniqueOrThrow({ where: { id: claimed!.id } });
    expect(finishedJob.status).toBe("COMPLETED");
    expect(finishedJob.modelVersionId).not.toBeNull();

    const modelVersion = await db.modelVersion.findUnique({
      where: { provider_model_version: { provider: "mock", model: "spatial-reconstruction-v0", version: "v0" } },
    });
    expect(modelVersion).not.toBeNull();

    const reconstruction = await db.reconstruction.findFirstOrThrow({ where: { spaceId: space.id, isCurrent: true } });
    expect(reconstruction.modelVersionId).toBe(modelVersion!.id);
    expect(reconstruction.sourceJobId).toBe(claimed!.id);

    const scene = await db.scene.findUniqueOrThrow({ where: { spaceId: space.id }, include: { cameraPoses: true } });
    expect(scene.cameraPoses.length).toBe(8); // one real pose per uploaded frame, not an arbitrary count
    expect(scene.cameraPoses[0]!.sourceAssetId).not.toBeNull();

    const usage = await getUsageSummary(org.id, 1);
    expect(usage.ai_jobs).toBe(1);
    expect(usage.processed_seconds).toBeGreaterThanOrEqual(0);
  });

  it("fails cleanly (no partial reconstruction) when a space has no media", async () => {
    const user = await registerUser(`pipeline2-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Pipeline Org 2");
    const project = await createProject(user.id, org.id, "Empty Pipeline Hotel", "HOTEL");
    const space = await createSpace(user.id, project.id, "Lobby", "LOBBY");

    await enqueueReconstructionJob({ projectId: project.id, spaceId: space.id, provider: "mock", model: "v0" });
    const claimed = await claimNextQueuedJob();
    await runPipelineJob(claimed!);

    const finishedJob = await db.aIJob.findUniqueOrThrow({ where: { id: claimed!.id } });
    expect(finishedJob.status).toBe("FAILED");
    expect(JSON.parse(finishedJob.errorJson!).code).toBe("NO_MEDIA");

    const reconstruction = await db.reconstruction.findFirst({ where: { spaceId: space.id } });
    expect(reconstruction).toBeNull();
  });
});
