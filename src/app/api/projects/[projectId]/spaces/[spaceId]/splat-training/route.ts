import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { isSplatEngine, requestSplatTraining } from "@/services/splat-training.service";

/**
 * Starts a real Gaussian Splat training run for this space on a RunPod
 * GPU worker (free-tier plan step B2, GPU path). Returns immediately —
 * this can take several minutes, far past what any HTTP request should
 * block on.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; spaceId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId, spaceId } = await params;
    // Optional {"engine": "marble" | "worldmirror" | "nerfstudio"}; the
    // deployment's best configured engine applies when absent or unknown.
    const body = await req.json().catch(() => null);
    const engine = isSplatEngine(body?.engine) ? body.engine : undefined;
    const job = await requestSplatTraining(user.id, projectId, spaceId, { engine });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return await toApiError(error);
  }
}
