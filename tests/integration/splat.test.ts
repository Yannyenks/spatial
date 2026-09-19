import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/services/auth.service";
import { createOrganizationForUser } from "@/services/organization.service";
import { createProject } from "@/services/project.service";
import { createSpace } from "@/services/space.service";
import { uploadSplatFile, InvalidSplatUploadError } from "@/services/splat.service";

async function seedSpace() {
  const user = await registerUser(`splat-${Date.now()}-${Math.random()}@example.com`, "password123");
  const org = await createOrganizationForUser(user.id, "Splat Org");
  const project = await createProject(user.id, org.id, "Splat Hotel", "HOTEL");
  const space = await createSpace(user.id, project.id, "Lobby", "LOBBY");
  return { user, project, space };
}

describe("splat.service (free-tier plan step B2)", () => {
  it("rejects an unsupported file extension", async () => {
    const { user, project, space } = await seedSpace();
    await expect(
      uploadSplatFile(user.id, project.id, space.id, { buffer: Buffer.from("not a splat"), filename: "scene.zip" })
    ).rejects.toBeInstanceOf(InvalidSplatUploadError);
  });

  it("rejects an empty file", async () => {
    const { user, project, space } = await seedSpace();
    await expect(
      uploadSplatFile(user.id, project.id, space.id, { buffer: Buffer.alloc(0), filename: "scene.ply" })
    ).rejects.toBeInstanceOf(InvalidSplatUploadError);
  });

  it("creates a real, current GAUSSIAN_SPLATTING reconstruction from a real upload", async () => {
    const { user, project, space } = await seedSpace();
    const buffer = Buffer.from("ply\nformat binary_little_endian 1.0\nelement vertex 0\nend_header\n");

    const reconstruction = await uploadSplatFile(user.id, project.id, space.id, { buffer, filename: "scene.ply" });

    expect(reconstruction.method).toBe("GAUSSIAN_SPLATTING");
    expect(reconstruction.provider).toBe("manual-upload");
    expect(reconstruction.isCurrent).toBe(true);
    expect(reconstruction.status).toBe("COMPLETED");
    expect(reconstruction.version).toBe(1);
    // Real bucket/key, not just a (possibly stale in a few hours) presigned
    // URL — see space.service.ts's getSpaceDetail, which re-derives a
    // fresh URL from these on every read.
    expect(reconstruction.outputBucket).toBe("reconstruction");
    expect(reconstruction.outputKey).toContain(space.id);
  });

  it("supersedes a previous reconstruction, incrementing the version and clearing the old isCurrent flag", async () => {
    const { user, project, space } = await seedSpace();
    const buffer = Buffer.from("ply\nformat binary_little_endian 1.0\nelement vertex 0\nend_header\n");

    const first = await uploadSplatFile(user.id, project.id, space.id, { buffer, filename: "scene.ply" });
    const second = await uploadSplatFile(user.id, project.id, space.id, { buffer, filename: "scene-v2.splat" });

    expect(second.version).toBe(first.version + 1);
    expect(second.isCurrent).toBe(true);

    const firstReloaded = await db.reconstruction.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstReloaded.isCurrent).toBe(false);
  });
});
