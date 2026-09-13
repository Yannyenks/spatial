import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { restoreReconstructionVersion } from "@/services/reconstruction.service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; reconstructionId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId, reconstructionId } = await params;
    const reconstruction = await restoreReconstructionVersion(user.id, projectId, reconstructionId);
    return NextResponse.json({ reconstruction });
  } catch (error) {
    return await toApiError(error);
  }
}
