import "server-only";
import { db } from "@/lib/db";
import type { MemberRole } from "@/types";

export class ForbiddenError extends Error {
  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "NOT_FOUND") {
    super(message);
    this.name = "NotFoundError";
  }
}

const ROLE_RANK: Record<MemberRole, number> = { MEMBER: 0, ADMIN: 1, OWNER: 2 };

/**
 * Tenant isolation + RBAC (§4, §29). Every service call that touches an
 * organization's data must go through this to get the caller's membership
 * — there is no code path that trusts an organizationId/projectId coming
 * from the client without checking the current user actually belongs to
 * that org.
 */
export async function requireMembership(
  userId: string,
  organizationId: string,
  minRole: MemberRole = "MEMBER"
) {
  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership) throw new ForbiddenError("You do not have access to this organization.");
  if (ROLE_RANK[membership.role as MemberRole] < ROLE_RANK[minRole]) {
    throw new ForbiddenError(`This action requires the ${minRole} role.`);
  }
  return membership;
}

/** Resolves a project and asserts the current user's org owns it. */
export async function requireProjectAccess(
  userId: string,
  projectId: string,
  minRole: MemberRole = "MEMBER"
) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError("Project not found.");
  await requireMembership(userId, project.organizationId, minRole);
  return project;
}
