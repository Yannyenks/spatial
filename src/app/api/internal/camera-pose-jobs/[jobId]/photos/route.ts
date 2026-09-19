import { NextRequest, NextResponse } from "next/server";
import { getPhotosForCameraPoseJob } from "@/services/camera-pose.service";

/**
 * Called only by the `estimate-camera-pose` GitHub Actions workflow (see
 * .github/workflows/estimate-camera-pose.yml) to fetch real, expiring
 * presigned photo URLs for the space it's about to run COLMAP against —
 * never by the browser. Same bearer-secret pattern as
 * /api/cron/process-jobs, with its own dedicated secret rather than
 * reusing CRON_SECRET, since this is a different caller with different
 * scope (read space photos, not drain the whole job queue).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const secret = process.env.CAMERA_POSE_SECRET;
  const provided = req.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid or missing camera-pose secret." } }, { status: 401 });
  }

  const { jobId } = await params;
  try {
    const photos = await getPhotosForCameraPoseJob(jobId);
    return NextResponse.json({ photos });
  } catch (error) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: error instanceof Error ? error.message : "Job not found." } },
      { status: 404 }
    );
  }
}
