import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/permissions";
import type { AnalyticsEventName } from "@/types";

/** Records a public visitor event (§26). No auth required — the caller is a visitor. */
export async function recordAnalyticsEvent(input: {
  experienceId: string;
  name: AnalyticsEventName;
  sessionId: string;
  spaceId?: string;
  hotspotId?: string;
  metadata?: Record<string, unknown>;
  country?: string;
  device?: string;
}) {
  return db.analyticsEvent.create({
    data: {
      experienceId: input.experienceId,
      name: input.name,
      sessionId: input.sessionId,
      spaceId: input.spaceId,
      hotspotId: input.hotspotId,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
      country: input.country,
      device: input.device,
    },
  });
}

export async function getAnalyticsSummary(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId, "MEMBER");
  const experience = await db.experience.findUnique({ where: { projectId } });
  if (!experience) {
    return { totalVisits: 0, uniqueVisitors: 0, eventCounts: {}, topSpaces: [], deviceBreakdown: {} };
  }

  const events = await db.analyticsEvent.findMany({ where: { experienceId: experience.id } });
  const eventCounts: Record<string, number> = {};
  const spaceCounts: Record<string, number> = {};
  const deviceBreakdown: Record<string, number> = {};
  const sessions = new Set<string>();

  for (const e of events) {
    eventCounts[e.name] = (eventCounts[e.name] ?? 0) + 1;
    sessions.add(e.sessionId);
    if (e.spaceId) spaceCounts[e.spaceId] = (spaceCounts[e.spaceId] ?? 0) + 1;
    if (e.device) deviceBreakdown[e.device] = (deviceBreakdown[e.device] ?? 0) + 1;
  }

  const topSpaceIds = Object.entries(spaceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
  const spaces = await db.space.findMany({ where: { id: { in: topSpaceIds } } });
  const topSpaces = topSpaceIds.map((id) => ({
    space: spaces.find((s) => s.id === id) ?? null,
    views: spaceCounts[id] ?? 0,
  }));

  return {
    totalVisits: eventCounts["experience_opened"] ?? 0,
    uniqueVisitors: sessions.size,
    eventCounts,
    topSpaces,
    deviceBreakdown,
  };
}
