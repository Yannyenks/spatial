import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { completeSplatTrainingJob } from "@/services/splat-training.service";

const bodySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("COMPLETED"), sizeBytes: z.number() }),
  z.object({ status: z.literal("FAILED"), error: z.string() }),
]);

/**
 * Called only by the RunPod splat-training worker to report its result —
 * it has already uploaded the trained .ply directly to a presigned URL by
 * the time it calls this, so this just records success/failure. Same
 * shared-secret pattern as /api/internal/camera-pose-jobs, with its own
 * dedicated secret (different caller, different scope).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const secret = process.env.SPLAT_TRAINING_SECRET;
  const provided = req.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid or missing splat-training secret." } }, { status: 401 });
  }

  const { jobId } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 400 });
  }

  try {
    await completeSplatTrainingJob(jobId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: error instanceof Error ? error.message : "Job not found." } },
      { status: 404 }
    );
  }
}
