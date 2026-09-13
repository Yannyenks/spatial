import "server-only";
import { db } from "@/lib/db";
import type { PlanId, PlanLimits } from "@/types";

/**
 * Plan limits (§30). Deliberately centralized and server-only: quotas are
 * never encoded in frontend components, only enforced here and read by the
 * UI for display purposes via the organization/billing API.
 */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  STARTER: {
    maxProjects: 1,
    maxSpacesPerProject: 10,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    maxAiJobsPerMonth: 20,
    maxVideoGenerationsPerMonth: 3,
    maxMonthlyVisitors: 1000,
    customDomain: false,
    whiteLabel: false,
  },
  PRO: {
    maxProjects: 5,
    maxSpacesPerProject: 40,
    maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
    maxAiJobsPerMonth: 200,
    maxVideoGenerationsPerMonth: 30,
    maxMonthlyVisitors: 20000,
    customDomain: true,
    whiteLabel: false,
  },
  BUSINESS: {
    maxProjects: 25,
    maxSpacesPerProject: 150,
    maxStorageBytes: 500 * 1024 * 1024 * 1024, // 500 GB
    maxAiJobsPerMonth: 2000,
    maxVideoGenerationsPerMonth: 200,
    maxMonthlyVisitors: 250000,
    customDomain: true,
    whiteLabel: true,
  },
  ENTERPRISE: {
    maxProjects: Number.POSITIVE_INFINITY,
    maxSpacesPerProject: Number.POSITIVE_INFINITY,
    maxStorageBytes: Number.POSITIVE_INFINITY,
    maxAiJobsPerMonth: Number.POSITIVE_INFINITY,
    maxVideoGenerationsPerMonth: Number.POSITIVE_INFINITY,
    maxMonthlyVisitors: Number.POSITIVE_INFINITY,
    customDomain: true,
    whiteLabel: true,
  },
};

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export async function assertCanCreateProject(organizationId: string): Promise<void> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const limits = PLAN_LIMITS[org.plan as PlanId];
  const count = await db.project.count({ where: { organizationId } });
  if (count >= limits.maxProjects) {
    throw new QuotaExceededError(
      `Your ${org.plan} plan allows up to ${limits.maxProjects} project(s). Upgrade to add more.`
    );
  }
}

export async function assertCanCreateSpace(projectId: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: project.organizationId } });
  const limits = PLAN_LIMITS[org.plan as PlanId];
  const count = await db.space.count({ where: { projectId } });
  if (count >= limits.maxSpacesPerProject) {
    throw new QuotaExceededError(
      `Your ${org.plan} plan allows up to ${limits.maxSpacesPerProject} spaces per project. Upgrade to add more.`
    );
  }
}

export async function assertStorageBudget(organizationId: string, incomingBytes: number): Promise<void> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const limits = PLAN_LIMITS[org.plan as PlanId];
  const usage = await db.asset.aggregate({
    where: { project: { organizationId } },
    _sum: { sizeBytes: true },
  });
  const used = usage._sum.sizeBytes ?? 0;
  if (used + incomingBytes > limits.maxStorageBytes) {
    throw new QuotaExceededError(`This upload would exceed your ${org.plan} plan's storage limit.`);
  }
}
