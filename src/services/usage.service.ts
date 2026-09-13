import { db } from "@/lib/db";

/**
 * Usage metering (execution-plan doc §63/§64: "cost control", "usage
 * records"). Intentionally does NOT import "server-only" — it's called
 * from `src/jobs/pipeline.ts`, which also runs in the standalone worker
 * process (see `docs/ai-pipeline.md`).
 */
export type UsageMetric =
  | "storage_bytes"
  | "ai_jobs"
  | "processed_seconds"
  | "video_generations"
  | "experience_views";

export async function recordUsage(
  organizationId: string,
  metric: UsageMetric,
  quantity: number,
  metadata?: Record<string, unknown>
) {
  return db.usageRecord.create({
    data: {
      organizationId,
      metric,
      quantity,
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
    },
  });
}

export async function getUsageSummary(organizationId: string, sinceDays = 30): Promise<Record<string, number>> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const grouped = await db.usageRecord.groupBy({
    by: ["metric"],
    where: { organizationId, createdAt: { gte: since } },
    _sum: { quantity: true },
  });

  const summary: Record<string, number> = {};
  for (const row of grouped) {
    summary[row.metric] = row._sum.quantity ?? 0;
  }
  return summary;
}
