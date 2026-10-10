import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/services/auth.service";
import { createOrganizationForUser } from "@/services/organization.service";
import { createProject } from "@/services/project.service";
import { createSpace } from "@/services/space.service";
import { SplatTrainingError, requestSplatTraining } from "@/services/splat-training.service";

async function seedSpaceWithPhotos(photoCount: number) {
  const user = await registerUser(`marble-${Date.now()}-${Math.random()}@example.com`, "password123");
  const org = await createOrganizationForUser(user.id, "Marble Org");
  const project = await createProject(user.id, org.id, "Hotel Lumière", "HOTEL");
  const space = await createSpace(user.id, project.id, "Suite 204", "SUITE");
  for (let i = 0; i < photoCount; i++) {
    await db.asset.create({
      data: { projectId: project.id, spaceId: space.id, kind: "PHOTO", bucket: "raw", storageKey: `photo-${i}.jpg`, sizeBytes: 1 },
    });
  }
  await db.scene.create({
    data: {
      spaceId: space.id,
      objects: {
        create: [
          { type: "BED", label: "King bed", provenance: "REAL", positionX: 0, positionY: 0, positionZ: 0 },
          { type: "SOFA", label: "Sofa", provenance: "INFERRED", positionX: 0, positionY: 0, positionZ: 0 },
        ],
      },
    },
  });
  await db.spatialRelation.create({
    data: { projectId: project.id, subjectType: "SPACE", subjectId: space.id, predicate: "has", objectType: "CONCEPT", objectLabel: "balcony" },
  });
  return { user, project, space };
}

describe("World Labs Marble dispatch keeps the Spatial context", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.WORLDLABS_API_KEY = "test-key";
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ operation_id: "op-1", done: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.WORLDLABS_API_KEY;
    vi.unstubAllGlobals();
  });

  function sentBody() {
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.worldlabs.ai/marble/v1/worlds:generate");
    return JSON.parse(init.body);
  }

  it("sends the space's description and seen objects with a faithful reconstruction", async () => {
    const { user, project, space } = await seedSpaceWithPhotos(10);
    const job = await requestSplatTraining(user.id, project.id, space.id, { engine: "marble" });

    expect(job.providerJobId).toBe("op-1");
    expect(job.instruction).toBeNull();
    const body = sentBody();
    expect(body.world_prompt.reconstruct_images).toBe(true);
    expect(body.world_prompt.multi_image_prompt).toHaveLength(8);
    expect(body.world_prompt.text_prompt).toContain('The suite "Suite 204" of the hotel "Hotel Lumière".');
    expect(body.world_prompt.text_prompt).toContain("It contains: king bed, balcony.");
    expect(body.world_prompt.text_prompt).not.toContain("sofa");
    expect(body.tags).toEqual(["spatial", `s-${space.id}`, `p-${project.id}`, "suite"]);
  });

  it("restyles with an instruction: free mode, 4 photos, instruction kept on the job", async () => {
    const { user, project, space } = await seedSpaceWithPhotos(10);
    const job = await requestSplatTraining(user.id, project.id, space.id, {
      engine: "marble",
      instruction: "  Scandinavian decor, warm evening light ",
    });

    expect(job.instruction).toBe("Scandinavian decor, warm evening light");
    const body = sentBody();
    expect(body.world_prompt.reconstruct_images).toBe(false);
    expect(body.world_prompt.multi_image_prompt).toHaveLength(4);
    expect(body.world_prompt.text_prompt).toContain("apply this change: Scandinavian decor, warm evening light");
    expect(body.tags).toContain("restyled");
  });

  it("refuses an instruction for engines that cannot follow one", async () => {
    const { user, project, space } = await seedSpaceWithPhotos(5);
    await expect(
      requestSplatTraining(user.id, project.id, space.id, { engine: "worldmirror", instruction: "Add plants" })
    ).rejects.toBeInstanceOf(SplatTrainingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
