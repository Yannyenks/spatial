import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { getSpaceDetail } from "@/services/space.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; spaceId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId, spaceId } = await params;
    const detail = await getSpaceDetail(user.id, projectId, spaceId);
    return NextResponse.json(detail);
  } catch (error) {
    return await toApiError(error);
  }
}
