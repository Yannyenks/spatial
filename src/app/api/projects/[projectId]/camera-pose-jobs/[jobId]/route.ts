import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { getCameraPoseJobStatus } from "@/services/camera-pose.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; jobId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId, jobId } = await params;
    const job = await getCameraPoseJobStatus(user.id, projectId, jobId);
    return NextResponse.json({ job });
  } catch (error) {
    return await toApiError(error);
  }
}
