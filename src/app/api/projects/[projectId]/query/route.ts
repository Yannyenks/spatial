import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/permissions";
import { toApiError } from "@/lib/api-errors";
import { findSpaces, calculateHopDistance } from "@/services/spatial-query.service";
import { spaceKindSchema } from "@/lib/validation";

/**
 * Structured Spatial Query Engine endpoint (blueprint §21/§57: `POST
 * /ai/query`). Distinct from the AI concierge routes — this is the raw,
 * typed tool a real LLM (or this app's own UI) calls; it never touches a
 * language model itself.
 */
const querySchema = z.object({
  kind: spaceKindSchema.optional(),
  parentSpaceId: z.string().optional(),
  hasRelation: z.string().optional(),
  relationTarget: z.string().optional(),
  nearSpaceId: z.string().optional(),
  maxHops: z.number().int().min(1).max(50).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    await requireProjectAccess(user.id, projectId, "MEMBER");
    const filter = querySchema.parse(await req.json());
    const matches = await findSpaces(projectId, filter);
    return NextResponse.json({ matches });
  } catch (error) {
    return await toApiError(error);
  }
}

const distanceSchema = z.object({ fromSpaceId: z.string().min(1), toSpaceId: z.string().min(1) });

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    await requireProjectAccess(user.id, projectId, "MEMBER");
    const { fromSpaceId, toSpaceId } = distanceSchema.parse({
      fromSpaceId: req.nextUrl.searchParams.get("fromSpaceId"),
      toSpaceId: req.nextUrl.searchParams.get("toSpaceId"),
    });
    const hops = await calculateHopDistance(projectId, fromSpaceId, toSpaceId);
    return NextResponse.json({ hops });
  } catch (error) {
    return await toApiError(error);
  }
}
