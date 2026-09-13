import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { connectSpacesSchema } from "@/lib/validation";
import { connectSpaces } from "@/services/space.service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const body = connectSpacesSchema.parse(await req.json());
    const connection = await connectSpaces(user.id, projectId, body.fromSpaceId, body.toSpaceId, body.label);
    return NextResponse.json({ connection }, { status: 201 });
  } catch (error) {
    return await toApiError(error);
  }
}
