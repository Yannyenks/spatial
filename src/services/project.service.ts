import "server-only";
import { db } from "@/lib/db";
import { requireMembership, requireProjectAccess } from "@/lib/permissions";
import { assertCanCreateProject } from "@/lib/quotas";
import type { Project, ProjectType } from "@/types";

function toDomain(p: {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  status: string;
  coverImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Project {
  return {
    id: p.id,
    organizationId: p.organizationId,
    name: p.name,
    type: p.type as ProjectType,
    status: p.status as Project["status"],
    coverImageUrl: p.coverImageUrl,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function createProject(userId: string, organizationId: string, name: string, type: ProjectType): Promise<Project> {
  await requireMembership(userId, organizationId, "MEMBER");
  await assertCanCreateProject(organizationId);
  const project = await db.project.create({ data: { organizationId, name, type, status: "DRAFT" } });
  return toDomain(project);
}

export async function listProjects(userId: string, organizationId: string): Promise<Project[]> {
  await requireMembership(userId, organizationId, "MEMBER");
  const projects = await db.project.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" } });
  return projects.map(toDomain);
}

export async function getProject(userId: string, projectId: string): Promise<Project> {
  const project = await requireProjectAccess(userId, projectId, "MEMBER");
  return toDomain(project);
}

export async function getProjectOverview(userId: string, projectId: string) {
  const project = await requireProjectAccess(userId, projectId, "MEMBER");
  const [spaces, assetCount, jobCount, experience] = await Promise.all([
    db.space.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
    db.asset.count({ where: { projectId } }),
    db.aIJob.count({ where: { projectId } }),
    db.experience.findUnique({ where: { projectId } }),
  ]);
  return { project: toDomain(project), spaces, assetCount, jobCount, experience };
}
