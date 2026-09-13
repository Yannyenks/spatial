import { NextRequest, NextResponse } from "next/server";
import { toApiError } from "@/lib/api-errors";
import { conciergeQuestionSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { getAIProvider } from "@/providers/ai";
import { recordAnalyticsEvent } from "@/services/analytics.service";
import { getConciergeContext } from "@/services/spatial-query.service";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

/** Public AI concierge for visitors (§16-§17). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (isRateLimited(`ai:${clientIp(req)}`, 20, 60_000)) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } },
        { status: 429 }
      );
    }
    const { slug } = await params;
    const experience = await db.experience.findUnique({ where: { slug } });
    if (!experience || !experience.publishedAt) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Experience not found." } }, { status: 404 });
    }

    const url = new URL(req.url);
    const sessionId = req.headers.get("x-session-id") ?? url.searchParams.get("sessionId") ?? "anonymous";
    const body = conciergeQuestionSchema.parse(await req.json());

    const context = await getConciergeContext(experience.projectId);
    const provider = getAIProvider();
    const turn = await provider.answerConciergeQuestion({ question: body.question, ...context });

    await recordAnalyticsEvent({
      experienceId: experience.id,
      name: "ai_question",
      sessionId,
      metadata: { question: body.question },
    });

    return NextResponse.json(turn);
  } catch (error) {
    return await toApiError(error);
  }
}
