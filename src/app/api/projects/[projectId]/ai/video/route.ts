import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/permissions";
import { toApiError } from "@/lib/api-errors";
import { videoGenerationSchema } from "@/lib/validation";
import { getVideoProvider } from "@/providers/video";
import { recordUsage } from "@/services/usage.service";
import { db } from "@/lib/db";

/** AI Studio: cinematic video generation (§18-§19), conditioned on the project's own spaces. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const project = await requireProjectAccess(user.id, projectId, "MEMBER");
    const body = videoGenerationSchema.parse(await req.json());

    const provider = getVideoProvider();
    const job = await provider.generate({ projectId, ...body });

    await db.videoGenerationJob.create({
      data: {
        id: job.id,
        projectId,
        provider: provider.id,
        status: job.status,
        inputJson: JSON.stringify(body),
      },
    });
    await recordUsage(project.organizationId, "video_generations", 1, { jobId: job.id });

    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return await toApiError(error);
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    await requireProjectAccess(user.id, projectId, "MEMBER");
    const jobs = await db.videoGenerationJob.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ jobs });
  } catch (error) {
    return await toApiError(error);
  }
}
