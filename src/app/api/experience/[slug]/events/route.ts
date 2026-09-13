import { NextRequest, NextResponse } from "next/server";
import { toApiError } from "@/lib/api-errors";
import { analyticsEventSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { recordAnalyticsEvent } from "@/services/analytics.service";
import { recordUsage } from "@/services/usage.service";

/** Public, unauthenticated event ingestion for the analytics pipeline (§26). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = analyticsEventSchema.parse(await req.json());
    const experience = await db.experience.findUnique({ where: { slug }, include: { project: true } });
    if (!experience) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Experience not found." } }, { status: 404 });
    }

    const device = /mobile/i.test(req.headers.get("user-agent") ?? "") ? "mobile" : "desktop";

    await recordAnalyticsEvent({
      experienceId: experience.id,
      name: body.name,
      sessionId: body.sessionId,
      spaceId: body.spaceId,
      hotspotId: body.hotspotId,
      metadata: body.metadata,
      device,
    });

    if (body.name === "experience_opened") {
      await recordUsage(experience.project.organizationId, "experience_views", 1, { experienceId: experience.id });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return await toApiError(error);
  }
}
