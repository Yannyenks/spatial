import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { completeCameraPoseJob } from "@/services/camera-pose.service";

const poseSchema = z.object({
  assetId: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  rotationX: z.number(),
  rotationY: z.number(),
  rotationZ: z.number(),
  order: z.number(),
});

const bodySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("COMPLETED"), poses: z.array(poseSchema) }),
  z.object({ status: z.literal("FAILED"), error: z.string() }),
]);

/**
 * Called only by the `estimate-camera-pose` GitHub Actions workflow to
 * report its result — real measured poses on success, or an honest
 * failure reason (e.g. COLMAP couldn't find enough matches) rather than
 * leaving the job stuck in RUNNING forever. Same shared-secret pattern as
 * the sibling /photos route.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const secret = process.env.CAMERA_POSE_SECRET;
  const provided = req.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid or missing camera-pose secret." } }, { status: 401 });
  }

  const { jobId } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 400 });
  }

  try {
    await completeCameraPoseJob(jobId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: error instanceof Error ? error.message : "Job not found." } },
      { status: 404 }
    );
  }
}
