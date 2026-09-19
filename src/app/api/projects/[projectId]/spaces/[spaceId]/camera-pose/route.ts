import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { requestCameraPoseEstimation } from "@/services/camera-pose.service";

/**
 * Starts a real, free structure-from-motion run for this space (free-tier
 * plan step B1 — docs/free-tier-roadmap.md), via a GitHub Actions workflow
 * running COLMAP. Returns immediately (§3): this can take several minutes,
 * far past what any HTTP request should block on.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; spaceId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId, spaceId } = await params;
    const job = await requestCameraPoseEstimation(user.id, projectId, spaceId);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return await toApiError(error);
  }
}
