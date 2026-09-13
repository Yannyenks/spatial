import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/permissions";
import { toApiError } from "@/lib/api-errors";
import { db } from "@/lib/db";

/** Polled by the processing UI (§10) for real job status — never faked. */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    await requireProjectAccess(user.id, projectId, "MEMBER");
    const jobs = await db.aIJob.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 20 });
    return NextResponse.json({
      jobs: jobs.map((j) => ({ ...j, error: j.errorJson ? JSON.parse(j.errorJson) : null })),
    });
  } catch (error) {
    return await toApiError(error);
  }
}
