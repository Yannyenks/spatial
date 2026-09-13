import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/services/auth.service";
import { createOrganizationForUser } from "@/services/organization.service";
import { createProject } from "@/services/project.service";
import { createSpace } from "@/services/space.service";
import { publishExperience, ExperienceNotReadyError, getPublicExperienceBySlug } from "@/services/experience.service";

describe("publish flow (§24)", () => {
  it("refuses to publish before any space is reconstructed", async () => {
    const user = await registerUser(`pub1-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Publish Org 1");
    const project = await createProject(user.id, org.id, "Empty Hotel", "HOTEL");

    await expect(
      publishExperience(user.id, project.id, { name: "Empty Hotel Experience", visibility: "PUBLIC" })
    ).rejects.toBeInstanceOf(ExperienceNotReadyError);
  });

  it("publishes once a space has a current reconstruction, and the slug is publicly readable", async () => {
    const user = await registerUser(`pub2-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Publish Org 2");
    const project = await createProject(user.id, org.id, "Ready Hotel", "HOTEL");
    const space = await createSpace(user.id, project.id, "Lobby", "LOBBY");

    await db.reconstruction.create({
      data: { projectId: project.id, spaceId: space.id, version: 1, method: "MOCK", status: "COMPLETED", isCurrent: true },
    });

    const experience = await publishExperience(user.id, project.id, {
      name: "Ready Hotel Experience",
      visibility: "PUBLIC",
    });
    expect(experience.publishedAt).not.toBeNull();

    const publicData = await getPublicExperienceBySlug(experience.slug);
    expect(publicData?.project.id).toBe(project.id);
    expect(publicData?.spaces.map((s) => s.id)).toContain(space.id);
  });

  it("does not expose an unpublished (draft) experience publicly", async () => {
    const user = await registerUser(`pub3-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Publish Org 3");
    const project = await createProject(user.id, org.id, "Draft Hotel", "HOTEL");
    await db.experience.create({ data: { projectId: project.id, name: "Draft", slug: `draft-${project.id}` } });

    const publicData = await getPublicExperienceBySlug(`draft-${project.id}`);
    expect(publicData).toBeNull();
  });
});
