import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { createSpaceSchema } from "@/lib/validation";
import { createSpace, listSpaces } from "@/services/space.service";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const spaces = await listSpaces(user.id, projectId);
    return NextResponse.json({ spaces });
  } catch (error) {
    return await toApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const body = createSpaceSchema.parse(await req.json());
    const space = await createSpace(user.id, projectId, body.name, body.kind, body.parentSpaceId);
    return NextResponse.json({ space }, { status: 201 });
  } catch (error) {
    return await toApiError(error);
  }
}
