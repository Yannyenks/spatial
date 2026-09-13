import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/permissions";
import { slugify, withRandomSuffix } from "@/lib/slug";
import { dispatchWebhookEvent } from "@/services/webhook.service";
import type { BrandingConfig, ExperienceVisibility } from "@/types";

export class ExperienceNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExperienceNotReadyError";
  }
}

/** Publishes (or re-publishes) an experience (§24). */
export async function publishExperience(
  userId: string,
  projectId: string,
  input: {
    name: string;
    visibility: ExperienceVisibility;
    password?: string;
    branding?: Partial<BrandingConfig>;
  }
) {
  const project = await requireProjectAccess(userId, projectId, "ADMIN");

  const spaceCount = await db.space.count({ where: { projectId } });
  if (spaceCount === 0) {
    throw new ExperienceNotReadyError("Add at least one space before publishing.");
  }
  const reconstructedCount = await db.reconstruction.count({ where: { projectId, isCurrent: true } });
  if (reconstructedCount === 0) {
    throw new ExperienceNotReadyError("Process at least one space before publishing.");
  }

  const existing = await db.experience.findUnique({ where: { projectId } });
  let slug = existing?.slug;
  if (!slug || slug.startsWith("draft-")) {
    slug = slugify(input.name);
    const collision = await db.experience.findFirst({ where: { slug, NOT: { projectId } } });
    if (collision) slug = withRandomSuffix(slug);
  }

  const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : existing?.passwordHash ?? null;
  const branding: BrandingConfig = {
    logoUrl: input.branding?.logoUrl ?? null,
    accentColor: input.branding?.accentColor ?? null,
    customDomain: input.branding?.customDomain ?? null,
    hidePlatformBranding: input.branding?.hidePlatformBranding ?? false,
  };

  const experience = await db.experience.upsert({
    where: { projectId },
    create: {
      projectId,
      name: input.name,
      slug,
      visibility: input.visibility,
      passwordHash,
      brandingJson: JSON.stringify(branding),
      publishedAt: new Date(),
      currentVersion: 1,
    },
    update: {
      name: input.name,
      slug,
      visibility: input.visibility,
      passwordHash,
      brandingJson: JSON.stringify(branding),
      publishedAt: new Date(),
      currentVersion: { increment: 1 },
    },
  });

  await db.project.update({ where: { id: projectId }, data: { status: "PUBLISHED" } });

  void dispatchWebhookEvent(project.organizationId, "experience.published", {
    experienceId: experience.id,
    projectId,
    slug: experience.slug,
    visibility: experience.visibility,
    version: experience.currentVersion,
  });

  return experience;
}

/** Loads everything the public viewer needs for a slug (§13, §14, §15). */
export async function getPublicExperienceBySlug(slug: string) {
  const experience = await db.experience.findUnique({ where: { slug } });
  if (!experience || !experience.publishedAt) return null;

  const project = await db.project.findUniqueOrThrow({ where: { id: experience.projectId } });
  const spaces = await db.space.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } });
  const spaceIds = spaces.map((s) => s.id);

  const [hotspots, connections, assets, reconstructions] = await Promise.all([
    db.hotspot.findMany({ where: { spaceId: { in: spaceIds } }, orderBy: { order: "asc" } }),
    db.spaceConnection.findMany({ where: { fromSpaceId: { in: spaceIds } } }),
    db.asset.findMany({ where: { spaceId: { in: spaceIds } }, orderBy: { createdAt: "asc" } }),
    db.reconstruction.findMany({ where: { spaceId: { in: spaceIds }, isCurrent: true } }),
  ]);

  return { experience, project, spaces, hotspots, connections, assets, reconstructions };
}

export async function verifyExperiencePassword(experienceId: string, password: string): Promise<boolean> {
  const experience = await db.experience.findUniqueOrThrow({ where: { id: experienceId } });
  if (!experience.passwordHash) return true;
  return bcrypt.compare(password, experience.passwordHash);
}
