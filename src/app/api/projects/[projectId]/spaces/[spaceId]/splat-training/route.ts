import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { requestSplatTraining } from "@/services/splat-training.service";

/**
 * Starts a real Gaussian Splat training run for this space on a RunPod
 * GPU worker (free-tier plan step B2, GPU path). Returns immediately —
 * this can take several minutes, far past what any HTTP request should
 * block on.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; spaceId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId, spaceId } = await params;
    const job = await requestSplatTraining(user.id, projectId, spaceId);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return await toApiError(error);
  }
}
