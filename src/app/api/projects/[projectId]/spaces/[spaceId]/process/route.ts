import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/permissions";
import { toApiError } from "@/lib/api-errors";
import { enqueueReconstructionJob } from "@/jobs/queue";
import { getReconstructionEngine } from "@/providers/reconstruction";
import { db } from "@/lib/db";

/**
 * Enqueues reconstruction for a space and returns immediately (§3): the
 * actual work happens in the background job runner, never on this request.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; spaceId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId, spaceId } = await params;
    await requireProjectAccess(user.id, projectId, "MEMBER");

    const assetCount = await db.asset.count({ where: { spaceId } });
    if (assetCount === 0) {
      return NextResponse.json(
        {
          error: {
            code: "NO_MEDIA",
            message: "Upload photos or a walkthrough video for this space before processing.",
          },
        },
        { status: 422 }
      );
    }

    const engine = getReconstructionEngine();
    const job = await enqueueReconstructionJob({
      projectId,
      spaceId,
      provider: engine.id,
      model: "spatial-reconstruction-v0",
    });
    await db.project.update({ where: { id: projectId }, data: { status: "PROCESSING" } });

    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return await toApiError(error);
  }
}
