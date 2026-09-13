import "server-only";
import { db } from "@/lib/db";
import { slugify, withRandomSuffix } from "@/lib/slug";
import type { Organization } from "@/types";

function toDomain(org: { id: string; name: string; slug: string; plan: string; createdAt: Date }): Organization {
  return { id: org.id, name: org.name, slug: org.slug, plan: org.plan as Organization["plan"], createdAt: org.createdAt.toISOString() };
}

/** Creates an organization and makes `userId` its OWNER (§4). */
export async function createOrganizationForUser(userId: string, name: string): Promise<Organization> {
  let slug = slugify(name);
  const existing = await db.organization.findUnique({ where: { slug } });
  if (existing) slug = withRandomSuffix(slug);

  const org = await db.organization.create({
    data: {
      name,
      slug,
      plan: "STARTER",
      memberships: { create: { userId, role: "OWNER" } },
      subscription: { create: { plan: "STARTER", status: "ACTIVE" } },
    },
  });
  return toDomain(org);
}

export async function listOrganizationsForUser(userId: string): Promise<Organization[]> {
  const memberships = await db.membership.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => toDomain(m.organization));
}

export async function getOrganizationMembers(organizationId: string) {
  return db.membership.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}
