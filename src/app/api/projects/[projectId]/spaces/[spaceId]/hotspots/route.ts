import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { createHotspotSchema } from "@/lib/validation";
import { createHotspot } from "@/services/space.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; spaceId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId, spaceId } = await params;
    const body = createHotspotSchema.parse(await req.json());
    const hotspot = await createHotspot(user.id, projectId, spaceId, body);
    return NextResponse.json({ hotspot }, { status: 201 });
  } catch (error) {
    return await toApiError(error);
  }
}
