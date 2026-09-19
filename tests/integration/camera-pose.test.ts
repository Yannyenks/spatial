import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/services/auth.service";
import { createOrganizationForUser } from "@/services/organization.service";
import { createProject } from "@/services/project.service";
import { createSpace } from "@/services/space.service";
import { enqueueReconstructionJob, claimNextQueuedJob } from "@/jobs/queue";
import { runPipelineJob } from "@/jobs/pipeline";
import {
  requestCameraPoseEstimation,
  completeCameraPoseJob,
  getPhotosForCameraPoseJob,
  CameraPoseError,
} from "@/services/camera-pose.service";

async function seedSpaceWithPhotos(photoCount: number) {
  const user = await registerUser(`camerapose-${Date.now()}-${Math.random()}@example.com`, "password123");
  const org = await createOrganizationForUser(user.id, "Camera Pose Org");
  const project = await createProject(user.id, org.id, "Camera Pose Hotel", "HOTEL");
  const space = await createSpace(user.id, project.id, "Lobby", "LOBBY");

  for (let i = 0; i < photoCount; i++) {
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

  return { user, org, project, space };
}

async function runMockReconstruction(projectId: string, spaceId: string) {
  await enqueueReconstructionJob({ projectId, spaceId, provider: "mock", model: "spatial-reconstruction-v0" });
  const claimed = await claimNextQueuedJob();
  await runPipelineJob(claimed!);
}

describe("camera-pose.service (free-tier plan step B1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses to start estimation with too few photos, without ever calling GitHub", async () => {
    const { user, project, space } = await seedSpaceWithPhotos(1);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(requestCameraPoseEstimation(user.id, project.id, space.id)).rejects.toBeInstanceOf(CameraPoseError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates a QUEUED job and dispatches the GitHub Actions workflow with the job id", async () => {
    const { user, project, space } = await seedSpaceWithPhotos(3);
    process.env.GITHUB_DISPATCH_TOKEN = "fake-token";
    process.env.GITHUB_REPO = "acme/spatial";

    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: init.body as string });
        return new Response(null, { status: 204 });
      })
    );

    const job = await requestCameraPoseEstimation(user.id, project.id, space.id);
    expect(job.status).toBe("QUEUED");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("acme/spatial/actions/workflows/estimate-camera-pose.yml/dispatches");
    expect(JSON.parse(calls[0]!.body).inputs.job_id).toBe(job.id);
  });

  it("marks the job FAILED (not stuck) when the GitHub dispatch call fails", async () => {
    const { user, project, space } = await seedSpaceWithPhotos(3);
    process.env.GITHUB_DISPATCH_TOKEN = "fake-token";
    process.env.GITHUB_REPO = "acme/spatial";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad token", { status: 401 })));

    await expect(requestCameraPoseEstimation(user.id, project.id, space.id)).rejects.toBeInstanceOf(CameraPoseError);

    const jobs = await db.cameraPoseJob.findMany({ where: { spaceId: space.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe("FAILED");
  });

  it("returns real presigned photo URLs and marks the job RUNNING (used by the workflow itself)", async () => {
    const { project, space } = await seedSpaceWithPhotos(4);
    const job = await db.cameraPoseJob.create({ data: { projectId: project.id, spaceId: space.id, status: "QUEUED" } });

    const photos = await getPhotosForCameraPoseJob(job.id);
    expect(photos).toHaveLength(4);
    expect(photos.every((p) => typeof p.url === "string" && p.url.length > 0)).toBe(true);

    const updated = await db.cameraPoseJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("RUNNING");
  });

  it("replaces the scene's camera poses with real ones on COMPLETED and marks the source", async () => {
    const { project, space } = await seedSpaceWithPhotos(4);
    await runMockReconstruction(project.id, space.id);

    const job = await db.cameraPoseJob.create({ data: { projectId: project.id, spaceId: space.id, status: "RUNNING" } });
    await completeCameraPoseJob(job.id, {
      status: "COMPLETED",
      poses: [
        { assetId: "a1", x: 1, y: 2, z: 3, rotationX: 0.1, rotationY: 0.2, rotationZ: 0.3, order: 0 },
        { assetId: "a2", x: 4, y: 5, z: 6, rotationX: 0, rotationY: 0, rotationZ: 0, order: 1 },
      ],
    });

    const scene = await db.scene.findUniqueOrThrow({ where: { spaceId: space.id }, include: { cameraPoses: true } });
    expect(scene.cameraPoses).toHaveLength(2);
    expect(scene.cameraPoses.map((p) => p.positionX).sort()).toEqual([1, 4]);
    const metadata = JSON.parse(scene.metadataJson);
    expect(metadata.cameraPoseSource).toBe("colmap");

    const finishedJob = await db.cameraPoseJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finishedJob.status).toBe("COMPLETED");
  });

  it("marks the job FAILED with the real error and leaves the scene untouched when COLMAP couldn't converge", async () => {
    const { project, space } = await seedSpaceWithPhotos(4);
    await runMockReconstruction(project.id, space.id);
    const sceneBefore = await db.scene.findUniqueOrThrow({ where: { spaceId: space.id }, include: { cameraPoses: true } });

    const job = await db.cameraPoseJob.create({ data: { projectId: project.id, spaceId: space.id, status: "RUNNING" } });
    await completeCameraPoseJob(job.id, { status: "FAILED", error: "Not enough matched features between photos." });

    const finishedJob = await db.cameraPoseJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(finishedJob.status).toBe("FAILED");
    expect(finishedJob.error).toBe("Not enough matched features between photos.");

    const sceneAfter = await db.scene.findUniqueOrThrow({ where: { spaceId: space.id }, include: { cameraPoses: true } });
    expect(sceneAfter.cameraPoses.length).toBe(sceneBefore.cameraPoses.length);
  });
});
