import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { createRelation, listRelationsForProject } from "@/services/spatial-graph.service";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const relations = await listRelationsForProject(user.id, projectId);
    return NextResponse.json({ relations });
  } catch (error) {
    return await toApiError(error);
  }
}

const createRelationSchema = z.object({
  subjectType: z.enum(["SPACE", "OBJECT"]),
  subjectId: z.string().min(1),
  predicate: z.string().min(1).max(60),
  objectType: z.enum(["SPACE", "OBJECT", "CONCEPT"]),
  objectId: z.string().optional(),
  objectLabel: z.string().max(160).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const body = createRelationSchema.parse(await req.json());
    const relation = await createRelation(user.id, projectId, body);
    return NextResponse.json({ relation }, { status: 201 });
  } catch (error) {
    return await toApiError(error);
  }
}
