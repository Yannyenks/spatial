import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/permissions";
import { toApiError } from "@/lib/api-errors";
import { conciergeQuestionSchema } from "@/lib/validation";
import { getAIProvider } from "@/providers/ai";
import { getConciergeContext } from "@/services/spatial-query.service";

/**
 * AI concierge for the project owner's preview (§16, R&D blueprint §22).
 * The public visitor concierge lives under /api/experience/[slug]/ai and
 * is unauthenticated; this authenticated variant lets the owner test the
 * concierge while building the experience, against the exact same
 * spatial graph (spaces + relations + navigation edges) the public one
 * uses.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    await requireProjectAccess(user.id, projectId, "MEMBER");
    const body = conciergeQuestionSchema.parse(await req.json());

    const context = await getConciergeContext(projectId);
    const provider = getAIProvider();
    const turn = await provider.answerConciergeQuestion({ question: body.question, ...context });
    return NextResponse.json(turn);
  } catch (error) {
    return await toApiError(error);
  }
}
